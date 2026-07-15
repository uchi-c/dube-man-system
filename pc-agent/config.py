from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

COMPUTER_CODE = os.getenv("COMPUTER_CODE", "PC-01")
HEARTBEAT_INTERVAL = int(
    os.getenv("HEARTBEAT_INTERVAL", "30")
)

AGENT_SECRET = os.getenv("AGENT_SECRET", "")

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