-- ============================================================================
-- URUU OS — PC AGENT SCHEMA
-- Adds live usage metrics, the session countdown, a remote-command queue, and
-- the access policies the café PC agent needs.
-- Run in the Supabase SQL editor AFTER schema.sql and print_schema.sql.
-- Safe to re-run.
-- ============================================================================

-- 1. Live usage metrics on computers (written by the agent heartbeat) ---------
alter table public.computers add column if not exists cpu_usage  numeric(5,2);
alter table public.computers add column if not exists ram_usage  numeric(5,2);
alter table public.computers add column if not exists disk_usage numeric(5,2);
alter table public.computers add column if not exists hostname   text;
alter table public.computers add column if not exists ip_address text;

-- 2. Session countdown the agent decrements each second -----------------------
alter table public.cafe_sessions add column if not exists seconds_remaining integer;

-- 3. Remote command queue (LOCK / UNLOCK / RESTART / …) -----------------------
create table if not exists public.computer_commands (
    id            uuid default uuid_generate_v4() primary key,
    computer_code text not null,
    command       text not null check (command in ('LOCK','UNLOCK','RESTART','SHUTDOWN','REFRESH','EXTEND_SESSION')),
    payload       jsonb,
    status        text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED')),
    created_at    timestamptz default timezone('utc', now()) not null,
    completed_at  timestamptz
);
alter table public.computer_commands enable row level security;
create index if not exists computer_commands_code_status_idx on public.computer_commands (computer_code, status);

-- Console (admins / café operators) issues and reads commands
drop policy if exists "Staff manage computer commands" on public.computer_commands;
create policy "Staff manage computer commands" on public.computer_commands for all
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

-- ============================================================================
-- PC AGENT ACCESS (anon / publishable key)
-- The café agents authenticate with the project's public anon/publishable key
-- (agent .env: SUPABASE_ANON_KEY). These policies grant the `anon` role ONLY
-- the narrow operations the agent performs.
--
-- ⚠ SECURITY: the anon key is public (it ships in the web bundle). This is an
-- MVP posture appropriate for trusted café LAN machines. For production, move
-- agent writes behind an Edge Function using the service_role key, or issue
-- each device a signed token, and drop these anon policies.
-- ============================================================================

grant select, insert, update on public.computers        to anon;
grant select, update          on public.cafe_sessions    to anon;
grant select, update          on public.printers         to anon;
grant select, insert          on public.print_jobs       to anon;
grant select, update          on public.computer_commands to anon;

-- computers: read, register, heartbeat metrics
drop policy if exists "Agent reads computers"    on public.computers;
drop policy if exists "Agent registers computer" on public.computers;
drop policy if exists "Agent updates computer"   on public.computers;
create policy "Agent reads computers"    on public.computers for select to anon using (true);
create policy "Agent registers computer" on public.computers for insert to anon with check (true);
create policy "Agent updates computer"   on public.computers for update to anon using (true) with check (true);

-- cafe_sessions: read active + decrement countdown / complete
drop policy if exists "Agent reads cafe sessions"   on public.cafe_sessions;
drop policy if exists "Agent updates cafe sessions" on public.cafe_sessions;
create policy "Agent reads cafe sessions"   on public.cafe_sessions for select to anon using (true);
create policy "Agent updates cafe sessions" on public.cafe_sessions for update to anon using (true) with check (true);

-- computer_commands: read pending + mark complete
drop policy if exists "Agent reads commands"     on public.computer_commands;
drop policy if exists "Agent completes commands" on public.computer_commands;
create policy "Agent reads commands"     on public.computer_commands for select to anon using (true);
create policy "Agent completes commands" on public.computer_commands for update to anon using (true) with check (true);

-- printers: resolve id + push online/offline status
drop policy if exists "Agent reads printers"   on public.printers;
drop policy if exists "Agent updates printers" on public.printers;
create policy "Agent reads printers"   on public.printers for select to anon using (true);
create policy "Agent updates printers" on public.printers for update to anon using (true) with check (true);

-- print_jobs: insert scanned spooler jobs (+ read back the inserted row)
drop policy if exists "Agent inserts print jobs" on public.print_jobs;
drop policy if exists "Agent reads print jobs"   on public.print_jobs;
create policy "Agent inserts print jobs" on public.print_jobs for insert to anon with check (true);
create policy "Agent reads print jobs"   on public.print_jobs for select to anon using (true);

-- realtime for the command queue
do $$ begin
  alter publication supabase_realtime add table public.computer_commands;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- DEMO metrics so the café station cards show live usage before a real agent
-- connects. Harmless to keep; a running agent immediately overwrites these.
-- ---------------------------------------------------------------------------
update public.computers set cpu_usage = 41, ram_usage = 63, disk_usage = 72, hostname = 'CAFE-PC-01', ip_address = '192.168.1.11' where computer_code = 'PC-01';
update public.computers set cpu_usage = 12, ram_usage = 38, disk_usage = 55, hostname = 'CAFE-PC-02', ip_address = '192.168.1.12' where computer_code = 'PC-02';
update public.computers set cpu_usage =  8, ram_usage = 33, disk_usage = 61, hostname = 'CAFE-PC-03', ip_address = '192.168.1.13' where computer_code = 'PC-03';
update public.computers set cpu_usage = 57, ram_usage = 71, disk_usage = 68, hostname = 'CAFE-PC-04', ip_address = '192.168.1.14' where computer_code = 'PC-04';
update public.computers set cpu_usage = 15, ram_usage = 40, disk_usage = 59, hostname = 'CAFE-PC-05', ip_address = '192.168.1.15' where computer_code = 'PC-05';
update public.computers set cpu_usage = 19, ram_usage = 44, disk_usage = 63, hostname = 'CAFE-PC-06', ip_address = '192.168.1.16' where computer_code = 'PC-06';
