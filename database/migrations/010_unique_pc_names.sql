-- ============================================================================
-- MIGRATION 010: UNIQUE PC NAMES ON PROVISIONING
-- computers.computer_code/computer_name were already globally UNIQUE at the
-- DB level (migration 001), but create_pc_provisioning_code() defaulted a
-- blank name to the same literal 'PC-NEW' every time -- a real collision
-- waiting to happen the second admin generated a code without typing a
-- custom name, since the actual UNIQUE-constraint failure wouldn't surface
-- until someone was physically at that second PC running the installer.
--
-- Now: leaving the name blank auto-suggests the next free "PC-NN" instead
-- of a shared placeholder, and providing a name that's already taken (by a
-- registered computer OR another still-pending code) is rejected
-- immediately, at code-generation time, not hours later at install time.
--
-- Apply AFTER migration 009_pc_provisioning_codes.sql.
-- Safe to re-run.
-- ============================================================================

create or replace function public.create_pc_provisioning_code(p_computer_code text default null)
returns table (code text, computer_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_code text;
    v_computer_code text := nullif(trim(p_computer_code), '');
    v_n int;
begin
    if not public.is_role(array['ADMIN']::public.user_role[]) then
        raise exception 'Only an organization admin can generate a PC provisioning code';
    end if;

    select org_id into v_org_id from public.user_organization_memberships where user_id = auth.uid() limit 1;
    if v_org_id is null then
        raise exception 'You are not a member of any organization';
    end if;

    -- Table columns are qualified with their table name throughout this
    -- block (public.computers.computer_code, not just computer_code) --
    -- the RETURNS TABLE clause implicitly declares a "computer_code"
    -- output variable in scope for the whole function body, which an
    -- unqualified reference would bind to instead of the table column.
    if v_computer_code is not null then
        -- computer_code/computer_name are unique across the whole
        -- multi-tenant database, not just this org -- checked here so a
        -- taken name fails fast for the admin instead of failing silently
        -- for whoever is physically at the PC later.
        if exists (select 1 from public.computers c where c.computer_code = v_computer_code or c.computer_name = v_computer_code)
           or exists (
               select 1 from public.computer_provisioning_codes pc
               where pc.computer_code = v_computer_code
                 and pc.used_at is null
                 and pc.expires_at > timezone('utc'::text, now())
           )
        then
            raise exception 'A PC named "%" already exists or has a pending install code. Choose a different name.', v_computer_code;
        end if;
    else
        -- Auto-suggest the next free "PC-NN" -- checked against both
        -- already-registered computers and any other still-valid pending
        -- code, so two codes generated back-to-back never collide even
        -- before either has actually been redeemed.
        select 'PC-' || lpad(n::text, 2, '0') into v_computer_code
        from generate_series(1, 999) n
        where not exists (select 1 from public.computers c where c.computer_code = 'PC-' || lpad(n::text, 2, '0'))
          and not exists (
              select 1 from public.computer_provisioning_codes pc
              where pc.computer_code = 'PC-' || lpad(n::text, 2, '0')
                and pc.used_at is null
                and pc.expires_at > timezone('utc'::text, now())
          )
        order by n
        limit 1;

        if v_computer_code is null then
            raise exception 'Could not find a free PC-NN name (999 in use) -- provide one explicitly.';
        end if;
    end if;

    v_code := (
        select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', ceil(random() * 31)::int, 1), '')
        from generate_series(1, 8)
    );

    return query
    insert into public.computer_provisioning_codes (org_id, code, computer_code, created_by)
    values (v_org_id, v_code, v_computer_code, auth.uid())
    returning computer_provisioning_codes.code, computer_provisioning_codes.computer_code, computer_provisioning_codes.expires_at;
end;
$$;

comment on function public.create_pc_provisioning_code(text) is 'Admin-only: generates a short single-use code for a new PC install in the caller''s own organization. Auto-suggests the next free PC-NN name when none is given, and rejects a given name that''s already taken (by a registered computer or another pending code) instead of deferring the failure to install time.';
