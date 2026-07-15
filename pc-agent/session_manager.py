import threading
import time

from config import (
    COMPUTER_CODE
)

from database import (
    get_active_session,
    update_session_time,
    complete_session
)

from cache import (
    save_session,
    load_session,
    clear_session
)

from lockscreen import (
    lock_pc
)

import logger


class SessionManager:

    def __init__(self):
        self.current_session = None
        self._lock = threading.Lock()

    def restore_session(self):
        cached = load_session()
        if not cached:
            return

        # The cache is only a local memory of "what was I doing" across a
        # restart — the server is the source of truth for whether it's still
        # valid (an operator may have ended the session while the agent was
        # down, or a new session may have started on this same PC).
        live = get_active_session(COMPUTER_CODE)
        if not live:
            logger.info("[SESSION] Cached session is no longer active on the server — discarding.")
            clear_session()
            return

        if live.get("id") == cached.get("id"):
            # Same session: keep the locally-tracked countdown since it's
            # more precise than the server's last-written value.
            live["seconds_remaining"] = cached.get(
                "seconds_remaining", live.get("seconds_remaining", 0)
            )

        self.current_session = live
        save_session(self.current_session)
        logger.info("[SESSION] Restored session from cache.")

    def start(self):
        self.restore_session()

        while True:
            try:
                if not self.current_session:
                    self.current_session = (
                        get_active_session(
                            COMPUTER_CODE
                        )
                    )

                    if self.current_session:
                        logger.info("[SESSION STARTED]")

                        save_session(
                            self.current_session
                        )

                if self.current_session:
                    self.tick()

            except Exception as e:
                logger.error(f"[SESSION ERROR] {e}")

            time.sleep(1)

    def tick(self):

        with self._lock:
            session_id = self.current_session["id"]
            remaining = self.current_session.get(
                "seconds_remaining", 0
            )

        if remaining <= 0:

            logger.info("[SESSION EXPIRED]")

            lock_pc()

            complete_session(
                session_id
            )

            clear_session()

            with self._lock:
                self.current_session = None

            return

        remaining -= 1

        with self._lock:
            if self.current_session:
                self.current_session["seconds_remaining"] = remaining
            save_session(
                self.current_session
            )

        update_session_time(
            session_id,
            remaining
        )

    def extend(self, extra_seconds):
        """Called by CommandManager when an EXTEND_SESSION command arrives.

        Applied to the in-memory session directly (not just the DB) because
        this loop overwrites cafe_sessions.seconds_remaining every second —
        a DB-only update would be clobbered by the very next tick.
        """
        with self._lock:
            if not self.current_session:
                logger.error("[SESSION] EXTEND_SESSION received but no active session.")
                return
            self.current_session["seconds_remaining"] = (
                self.current_session.get("seconds_remaining", 0) + extra_seconds
            )
            save_session(self.current_session)
            logger.info(f"[SESSION] Extended by {extra_seconds}s")
