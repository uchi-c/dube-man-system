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

from watchdog import (
    Watchdog
)

import logger


def main():

    logger.info("[AGENT] Starting Uruu Agent")

    session_manager = SessionManager()
    command_manager = CommandManager(session_manager)

    watched = [
        ("Heartbeat", start_heartbeat),
        ("Commands", command_manager.start),
        ("PrintMonitor", start_print_monitor),
    ]

    watchdog = Watchdog(watched)
    watchdog.start()

    # The session countdown runs on the main thread (not as a daemon thread)
    # so an unhandled error here surfaces as the service actually stopping,
    # rather than silently going quiet like an unwatched daemon thread would.
    session_manager.start()


if __name__ == "__main__":
    main()
