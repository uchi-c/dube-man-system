import threading

from heartbeat import (
    start_heartbeat
)

from session_manager import (
    SessionManager
)

from command_manager import (
    CommandManager
)


def main():

    heartbeat_thread = (
        threading.Thread(
            target=start_heartbeat,
            daemon=True,
            name="Heartbeat"
        )
    )

    command_thread = (
        threading.Thread(
            target=CommandManager().start,
            daemon=True,
            name="Commands"
        )
    )

    heartbeat_thread.start()
    command_thread.start()

    manager = (
        SessionManager()
    )

    manager.start()


if __name__ == "__main__":
    main()