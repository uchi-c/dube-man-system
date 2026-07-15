import time
import os

from config import (
    COMPUTER_CODE
)

from database import (
    get_pending_commands,
    complete_command
)

from lockscreen import (
    lock_pc
)

import logger


class CommandManager:

    def __init__(self, session_manager=None):
        # Shared with agent.py's SessionManager so EXTEND_SESSION can update
        # the live in-memory countdown, not just the DB (see session_manager.extend).
        self.session_manager = session_manager

    def start(self):
        logger.info("[COMMAND] Manager started.")

        while True:
            try:
                commands = (
                    get_pending_commands(
                        COMPUTER_CODE
                    )
                )

                for command in commands:
                    self.execute(
                        command
                    )

            except Exception as e:
                logger.error(f"[COMMAND ERROR] {e}")

            time.sleep(2)

    def execute(
        self,
        command
    ):
        cmd = command[
            "command"
        ]

        payload = command.get(
            "payload"
        ) or {}

        logger.info(f"[COMMAND] {cmd}")

        if cmd == "LOCK":
            lock_pc()

        elif cmd == "UNLOCK":
            # Windows has no supported API to dismiss LockWorkStation()
            # remotely without stored credentials, so there is nothing safe
            # to automate here. Log it clearly instead of silently completing
            # the command with no effect — front desk unlocks at the machine,
            # or sends EXTEND_SESSION so the countdown doesn't lock it again.
            logger.info(
                "[COMMAND] UNLOCK requested — Windows requires unlocking at "
                "the physical machine; no remote action taken."
            )

        elif cmd == "RESTART":
            os.system(
                "shutdown /r /t 0"
            )

        elif cmd == "SHUTDOWN":
            os.system(
                "shutdown /s /t 0"
            )

        elif cmd == "REFRESH":
            pass

        elif cmd == "EXTEND_SESSION":
            self._extend_session(payload)

        else:
            logger.error(f"[COMMAND] Unknown command: {cmd}")

        complete_command(
            command["id"]
        )

    def _extend_session(self, payload):
        if not self.session_manager:
            logger.error(
                "[COMMAND] EXTEND_SESSION received but no session manager attached."
            )
            return

        seconds = payload.get("seconds")
        if seconds is None:
            minutes = payload.get("minutes", 30)
            seconds = int(minutes) * 60

        self.session_manager.extend(int(seconds))
