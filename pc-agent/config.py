from dotenv import load_dotenv
import os
import re
from pathlib import Path

import logger

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

# Every value below is supposed to be plain ASCII (a URL, a JWT, a UUID, a
# short code) -- none of them are ever meant to contain accented letters,
# smart quotes, or other non-ASCII characters. Copy-pasting a long value
# like the anon key through chat apps or some terminals can silently pick
# up an invisible character (a non-breaking space, a zero-width character)
# that looks identical on screen but breaks every outbound HTTP request
# with "'ascii' codec can't encode characters..." -- reproduced live on a
# real install. Stripping anything outside printable ASCII is always safe
# here; it can only ever remove accidental copy-paste corruption, never a
# legitimate character these fields are supposed to have.
_NON_ASCII_RE = re.compile(r'[^\x20-\x7E]')


def _clean(raw, name):
    if not raw:
        return raw
    cleaned = _NON_ASCII_RE.sub('', raw)
    if cleaned != raw:
        logger.error(
            f"[CONFIG] {name} contained non-ASCII character(s) -- stripped "
            f"them (likely picked up from a copy-paste). If the agent still "
            f"misbehaves, re-copy this value directly from the source."
        )
    return cleaned


SUPABASE_URL = _clean(os.getenv("SUPABASE_URL"), "SUPABASE_URL")
SUPABASE_ANON_KEY = _clean(os.getenv("SUPABASE_ANON_KEY"), "SUPABASE_ANON_KEY")
ORGANIZATION_ID = _clean(os.getenv("ORGANIZATION_ID"), "ORGANIZATION_ID")

COMPUTER_CODE = _clean(os.getenv("COMPUTER_CODE", "PC-01"), "COMPUTER_CODE")
HEARTBEAT_INTERVAL = int(
    os.getenv("HEARTBEAT_INTERVAL", "30")
)

AGENT_SECRET = _clean(os.getenv("AGENT_SECRET", ""), "AGENT_SECRET")

CACHE_FILE = BASE_DIR / "session.json"
LOG_FILE = BASE_DIR / "agent.log"

APP_VERSION = "2.0.0"

if not SUPABASE_URL:
    raise ValueError(
        "SUPABASE_URL is missing in .env"
    )

if not SUPABASE_ANON_KEY:
    raise ValueError(
        "SUPABASE_ANON_KEY is missing in .env"
    )

if not ORGANIZATION_ID:
    raise ValueError(
        "ORGANIZATION_ID is missing in .env"
    )
