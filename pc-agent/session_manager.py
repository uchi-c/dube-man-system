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


class SessionManager:

    def __init__(self):
        self.current_session = None

    def restore_session(self):
        self.current_session = (
            load_session()
        )

    def start(self):
        self.restore_session()

        while True:

            if not self.current_session:
                self.current_session = (
                    get_active_session(
                        COMPUTER_CODE
                    )
                )

                if self.current_session:
                    print(
                        "[SESSION STARTED]"
                    )

                    save_session(
                        self.current_session
                    )

            if self.current_session:
                self.tick()

            time.sleep(1)

    def tick(self):

        session_id = (
            self.current_session[
                "id"
            ]
        )

        remaining = (
            self.current_session.get(
                "seconds_remaining",
                0
            )
        )

        if remaining <= 0:

            print(
                "[SESSION EXPIRED]"
            )

            lock_pc()

            complete_session(
                session_id
            )

            clear_session()

            self.current_session = None

            return

        remaining -= 1

        self.current_session[
            "seconds_remaining"
        ] = remaining

        save_session(
            self.current_session
        )

        update_session_time(
            session_id,
            remaining
        )

        print(
            f"{remaining} seconds left"
        )