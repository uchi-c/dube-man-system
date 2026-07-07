"""
Print Monitor — pc-agent/print_monitor.py
================================================
Monitors the Windows print queue and syncs completed / failed / cancelled
jobs to Supabase.  Runs as a daemon thread alongside the existing heartbeat
and session threads inside agent.py.

Architecture decisions
-----------------------
* Uses the win32print API (pywin32) to enumerate the local print spooler.
* Keeps a rolling ``seen_jobs`` dict in memory keyed by (printer, job_id).
* When a job disappears from the queue its final status is inferred from
  the job's StatusString flags captured while it was still visible.
* An offline cache (JSON file) holds jobs that could not be synced.  The
  sync loop retries cached jobs before pushing new ones.
* All Supabase calls reuse the shared ``supabase`` client from database.py.

Windows JOB_STATUS flags used
-------------------------------
JOB_STATUS_PRINTED    = 0x00000080   → Completed
JOB_STATUS_DELETING   = 0x00000004   
JOB_STATUS_DELETED    = 0x00000100   → Cancelled
JOB_STATUS_ERROR      = 0x00000002   → Failed
JOB_STATUS_PAUSED     = 0x00000001   
JOB_STATUS_PRINTING   = 0x00000010   (still active)
JOB_STATUS_SPOOLING   = 0x00000008   (still active)
"""

from __future__ import annotations

import json
import os
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Optional win32 import — graceful degradation on non-Windows dev machines.
# ---------------------------------------------------------------------------
try:
    import win32print  # type: ignore
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    print("[PRINT_MONITOR] pywin32 not available — print monitoring disabled.")

from config import (
    COMPUTER_CODE,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    BASE_DIR,
)
from database import supabase

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_INTERVAL: int = int(os.getenv("PRINT_POLL_INTERVAL", "5"))   # seconds
CACHE_FILE: Path = BASE_DIR / "print_cache.json"

# Win32 status bit masks
JOB_STATUS_PRINTED  = 0x00000080
JOB_STATUS_DELETING = 0x00000004
JOB_STATUS_DELETED  = 0x00000100
JOB_STATUS_ERROR    = 0x00000002
JOB_STATUS_PAUSED   = 0x00000001
JOB_STATUS_PRINTING = 0x00000010
JOB_STATUS_SPOOLING = 0x00000008

ACTIVE_FLAGS = JOB_STATUS_PRINTING | JOB_STATUS_SPOOLING | JOB_STATUS_PAUSED

# ---------------------------------------------------------------------------
# Offline cache helpers
# ---------------------------------------------------------------------------

def _load_cache() -> List[Dict]:
    if not CACHE_FILE.exists():
        return []
    try:
        with CACHE_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_cache(jobs: List[Dict]) -> None:
    try:
        with CACHE_FILE.open("w", encoding="utf-8") as f:
            json.dump(jobs, f, indent=2, default=str)
    except Exception as e:
        print(f"[PRINT_CACHE] Failed saving cache: {e}")


def _append_to_cache(job: Dict) -> None:
    cached = _load_cache()
    cached.append(job)
    _save_cache(cached)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _get_computer_id() -> Optional[str]:
    """Look up this machine's UUID in the computers table."""
    try:
        result = (
            supabase.table("computers")
            .select("id")
            .eq("computer_code", COMPUTER_CODE)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["id"]
    except Exception as e:
        print(f"[PRINT_MONITOR] Could not resolve computer id: {e}")
    return None


def _get_printer_id(windows_printer_name: str) -> Optional[str]:
    """Resolve the printer UUID from the printers table."""
    try:
        result = (
            supabase.table("printers")
            .select("id")
            .eq("windows_printer_name", windows_printer_name)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["id"]
    except Exception as e:
        print(f"[PRINT_MONITOR] Could not resolve printer id for '{windows_printer_name}': {e}")
    return None


def _update_printer_status(printer_id: str, status: str) -> None:
    """Push online/offline status updates to the printers table."""
    try:
        supabase.table("printers").update({"status": status}).eq("id", printer_id).execute()
    except Exception:
        pass  # non-critical path


def _push_job(job: Dict) -> bool:
    """Insert a single print job row into Supabase. Returns True on success."""
    try:
        supabase.table("print_jobs").insert([job]).execute()
        return True
    except Exception as e:
        print(f"[PRINT_MONITOR] Push failed: {e}")
        return False


def _flush_cache(computer_id: Optional[str]) -> None:
    """Attempt to push all cached jobs to Supabase."""
    cached = _load_cache()
    if not cached:
        return

    remaining: List[Dict] = []
    for job in cached:
        # Ensure required foreign keys are resolved
        if not job.get("printer_id"):
            pid = _get_printer_id(job.get("_windows_printer_name", ""))
            if pid:
                job["printer_id"] = pid
            else:
                remaining.append(job)
                continue

        if not job.get("computer_id") and computer_id:
            job["computer_id"] = computer_id

        # Strip internal metadata keys before inserting
        clean = {k: v for k, v in job.items() if not k.startswith("_")}
        if _push_job(clean):
            print(f"[PRINT_MONITOR] Flushed cached job: {clean.get('document_name','?')}")
        else:
            remaining.append(job)

    _save_cache(remaining)


# ---------------------------------------------------------------------------
# Win32 helpers
# ---------------------------------------------------------------------------

def _detect_paper_size(devmode: Any) -> str:
    """Map DEVMODE paper size code to our PaperSize enum."""
    if devmode is None:
        return "A4"
    try:
        code = devmode.PaperSize
    except AttributeError:
        return "A4"

    # Common DMPAPER_* constants
    mapping = {
        1:  "Letter",
        5:  "Legal",
        8:  "A3",
        9:  "A4",
        11: "A5",
    }
    return mapping.get(code, "A4")


def _infer_status(status_bits: int) -> Optional[str]:
    """
    Return Supabase status string from Win32 status bits.
    Returns None if the job is still actively printing.
    """
    if status_bits & ACTIVE_FLAGS:
        return None  # still in progress
    if status_bits & JOB_STATUS_PRINTED:
        return "Completed"
    if status_bits & (JOB_STATUS_DELETING | JOB_STATUS_DELETED):
        return "Cancelled"
    if status_bits & JOB_STATUS_ERROR:
        return "Failed"
    # Job has disappeared without a clear status — treat as completed
    return "Completed"


def _is_colour_job(job_info: Dict) -> str:
    """Heuristic: try to read colour intent from DEVMODE. Defaults to BW."""
    try:
        devmode = job_info.get("pDevMode")
        if devmode and hasattr(devmode, "Color") and devmode.Color == 2:
            return "Colour"
    except Exception:
        pass
    return "BW"


# ---------------------------------------------------------------------------
# Core monitor class
# ---------------------------------------------------------------------------

class PrintMonitor:
    """
    Polls each local printer's job queue every POLL_INTERVAL seconds.
    Tracks in-progress jobs and submits finalized jobs to Supabase.
    """

    def __init__(self) -> None:
        # {(printer_name, job_id): job_snapshot_dict}
        self.seen_jobs: Dict[tuple, Dict] = {}
        self.computer_id: Optional[str] = None
        self._printer_id_cache: Dict[str, Optional[str]] = {}

    # ------------------------------------------------------------------
    def start(self) -> None:
        if not WIN32_AVAILABLE:
            print("[PRINT_MONITOR] Halted — pywin32 not installed.")
            return

        print(f"[PRINT_MONITOR] Started on {COMPUTER_CODE} (poll={POLL_INTERVAL}s)")

        # Resolve once at startup; retry if unavailable
        self._resolve_context()

        while True:
            try:
                self._tick()
            except Exception as e:
                print(f"[PRINT_MONITOR] Tick error: {e}")
                traceback.print_exc()
            time.sleep(POLL_INTERVAL)

    # ------------------------------------------------------------------
    def _resolve_context(self) -> None:
        """Retry until we have the computer id."""
        for attempt in range(10):
            try:
                self.computer_id = _get_computer_id()
                if self.computer_id:
                    print(f"[PRINT_MONITOR] Resolved context — computer={self.computer_id[:8]}…")
                    return
            except Exception:
                pass
            time.sleep(3 + attempt * 2)

        print("[PRINT_MONITOR] Could not resolve computer context — operating offline only.")

    # ------------------------------------------------------------------
    def _get_printer_id(self, windows_name: str) -> Optional[str]:
        if windows_name not in self._printer_id_cache:
            self._printer_id_cache[windows_name] = _get_printer_id(windows_name)
        return self._printer_id_cache[windows_name]

    # ------------------------------------------------------------------
    def _tick(self) -> None:
        """One poll cycle across all printers."""
        # Flush any cached jobs first
        if self.computer_id:
            _flush_cache(self.computer_id)

        current_keys: set = set()

        try:
            printers = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS,
                None, 2
            )
        except Exception as e:
            print(f"[PRINT_MONITOR] EnumPrinters failed: {e}")
            return

        for printer_info in printers:
            printer_name: str = printer_info["pPrinterName"]
            try:
                self._poll_printer(printer_name, current_keys)
            except Exception as e:
                print(f"[PRINT_MONITOR] Error polling '{printer_name}': {e}")

        # Jobs that were in seen_jobs but not in current_keys have left the queue
        gone_keys = set(self.seen_jobs.keys()) - current_keys
        for key in gone_keys:
            self._finalize_job(key, status="Completed")

    # ------------------------------------------------------------------
    def _poll_printer(self, printer_name: str, current_keys: set) -> None:
        handle = None
        try:
            handle = win32print.OpenPrinter(printer_name)
            jobs = win32print.EnumJobs(handle, 0, -1, 2)
        except Exception:
            return
        finally:
            if handle:
                try:
                    win32print.ClosePrinter(handle)
                except Exception:
                    pass

        for job in jobs:
            job_id: int = job["JobId"]
            key = (printer_name, job_id)
            current_keys.add(key)

            status_bits: int = job.get("Status", 0)

            # Build a snapshot of what we know about this job
            snapshot: Dict = {
                "printer_name": printer_name,
                "job_id": job_id,
                "document_name": job.get("pDocument") or None,
                "page_count": job.get("TotalPages") or job.get("PagesPrinted") or 1,
                "status_bits": status_bits,
                "color_mode": _is_colour_job(job),
                "paper_size": _detect_paper_size(job.get("pDevMode")),
                "print_time": datetime.now(timezone.utc).isoformat(),
            }

            if key not in self.seen_jobs:
                self.seen_jobs[key] = snapshot
                print(
                    f"[PRINT_MONITOR] Queued: '{snapshot['document_name']}' "
                    f"on {printer_name} ({snapshot['color_mode']}, "
                    f"{snapshot['page_count']}p)"
                )

            # Update live snapshot
            else:
                self.seen_jobs[key].update({
                    "page_count": snapshot["page_count"],
                    "status_bits": status_bits,
                })

            # If job has a terminal status while still visible, finalize now
            final_status = _infer_status(status_bits)
            if final_status and final_status != "Completed":
                # Cancelled / Failed — finalize immediately
                current_keys.discard(key)
                self._finalize_job(key, status=final_status)

    # ------------------------------------------------------------------
    def _finalize_job(self, key: tuple, status: str) -> None:
        snapshot = self.seen_jobs.pop(key, None)
        if not snapshot:
            return

        printer_name: str = snapshot["printer_name"]
        page_count: int   = max(1, snapshot["page_count"])

        print(
            f"[PRINT_MONITOR] Finalizing: '{snapshot.get('document_name','?')}' "
            f"on {printer_name} → {status} ({page_count}p)"
        )

        printer_id = self._get_printer_id(printer_name)

        record: Dict = {
            "printer_id": printer_id,
            "computer_id": self.computer_id,
            "employee_id": None,     # enriched by the dashboard from session context
            "customer_id": None,
            "session_id": None,
            "document_name": snapshot.get("document_name"),
            "page_count": page_count,
            "color_mode": snapshot.get("color_mode", "BW"),
            "paper_size": snapshot.get("paper_size", "A4"),
            "cost": 0,      # calculated by DB trigger
            "revenue": 0,   # calculated by DB trigger
            "status": status,
            "print_time": snapshot.get("print_time"),
        }

        # Remove nulls that would violate NOT NULL on optional FKs
        if not record["printer_id"]:
            # No printer registered in Supabase yet — cache with metadata
            record["_windows_printer_name"] = printer_name
            _append_to_cache(record)
            print(
                f"[PRINT_MONITOR] Cached (printer not registered): {printer_name}"
            )
            return

        if not self.computer_id:
            _append_to_cache(record)
            return

        if not _push_job(record):
            _append_to_cache(record)


# ---------------------------------------------------------------------------
# Module entry-point (daemon thread target)
# ---------------------------------------------------------------------------

def start_print_monitor() -> None:
    """
    Public entry point.  Call from agent.py like:

        threading.Thread(target=start_print_monitor, daemon=True, name="PrintMonitor").start()
    """
    PrintMonitor().start()


if __name__ == "__main__":
    start_print_monitor()
