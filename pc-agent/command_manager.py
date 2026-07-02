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


class CommandManager:

    def start(self):
        print(
            "[COMMAND] Manager started."
        )

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
                print(
                    "[COMMAND ERROR]",
                    str(e)
                )

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
        )

        print(
            f"[COMMAND] {cmd}"
        )

        if cmd == "LOCK":
            lock_pc()

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
            print(
                payload
            )

        complete_command(
            command["id"]
        )