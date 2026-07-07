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

from print_monitor import (
    start_print_monitor
)


def main():

    heartbeat_thread = threading.Thread(
        target=start_heartbeat,
        daemon=True,
        name="Heartbeat"
    )

    command_thread = threading.Thread(
        target=CommandManager().start,
        daemon=True,
        name="Commands"
    )

    # Print Monitor — watches the Windows print spooler and pushes jobs
    print_monitor_thread = threading.Thread(
        target=start_print_monitor,
        daemon=True,
        name="PrintMonitor"
    )

    heartbeat_thread.start()
    command_thread.start()
    print_monitor_thread.start()

    manager = SessionManager()
    manager.start()


if __name__ == "__main__":
    main()