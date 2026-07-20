from datetime import datetime, timezone

from supabase import create_client
from config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ORGANIZATION_ID
)

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
)


# ==========================
# COMPUTER FUNCTIONS
# ==========================

def get_computer(computer_code):
    result = (
        supabase.table("computers")
        .select("*")
        .eq("computer_code", computer_code)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None

def get_pending_commands(
    computer_code
):
    result = (
        supabase.table(
            "computer_commands"
        )
        .select("*")
        .eq(
            "computer_code",
            computer_code
        )
        .eq(
            "status",
            "PENDING"
        )
        .execute()
    )

    return result.data


def complete_command(
    command_id
):
    return (
        supabase.table(
            "computer_commands"
        )
        .update(
            {
                "status":
                "COMPLETED"
            }
        )
        .eq(
            "id",
            command_id
        )
        .execute()
    )
def register_computer(computer_code):
    computer = get_computer(computer_code)

    if computer:
        print(
            f"[INFO] {computer_code} already registered."
        )
        return computer

    # organization_id must be set explicitly here: the column's DB-side
    # default silently falls back to whichever organization was created
    # first *in the entire system*, not the tenant this agent belongs to
    # (the anon role has no authenticated session for it to infer from).
    result = (
        supabase.table("computers")
        .insert(
            {
                "computer_code": computer_code,
                "computer_name": computer_code,
                "status": "Available",
                "organization_id": ORGANIZATION_ID
            }
        )
        .execute()
    )

    return result.data[0]


def update_heartbeat(
    computer_code,
    metrics
):
    return (
        supabase.table("computers")
        .update(
            {
                "cpu_usage": metrics["cpu"],
                "ram_usage": metrics["ram"],
                "disk_usage": metrics["disk"],
                "hostname": metrics["hostname"],
                "ip_address": metrics["ip_address"],
                "last_seen": datetime.now(timezone.utc).isoformat()
            }
        )
        .eq("computer_code", computer_code)
        .execute()
    )


# ==========================
# SESSION FUNCTIONS
# ==========================

def get_active_session(
    computer_code
):
    computer = get_computer(
        computer_code
    )

    if not computer:
        return None

    result = (
        supabase.table("cafe_sessions")
        .select("*")
        .eq(
            "computer_id",
            computer["id"]
        )
        .eq(
            "status",
            "ACTIVE"
        )
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None


def update_session_time(
    session_id,
    seconds_remaining
):
    return (
        supabase.table(
            "cafe_sessions"
        )
        .update(
            {
                "seconds_remaining":
                seconds_remaining
            }
        )
        .eq(
            "id",
            session_id
        )
        .execute()
    )


def complete_session(
    session_id
):
    return (
        supabase.table(
            "cafe_sessions"
        )
        .update(
            {
                "status":
                "COMPLETED"
            }
        )
        .eq(
            "id",
            session_id
        )
        .execute()
    )