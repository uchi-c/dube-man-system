import time
import traceback

from config import (
    COMPUTER_CODE,
    HEARTBEAT_INTERVAL
)

from database import (
    register_computer,
    update_heartbeat
)

from metrics import (
    get_metrics
)


def start_heartbeat():

    print(
        f"[HEARTBEAT] "
        f"Starting "
        f"{COMPUTER_CODE}"
    )

    register_computer(
        COMPUTER_CODE
    )

    while True:
        try:
            metrics = (
                get_metrics()
            )

            update_heartbeat(
                COMPUTER_CODE,
                metrics
            )

            print(
                f"[HEARTBEAT] "
                f"CPU:{metrics['cpu']}% "
                f"RAM:{metrics['ram']}% "
                f"DISK:{metrics['disk']}%"
            )

        except Exception as e:
            print(
                "[HEARTBEAT ERROR]",
                str(e)
            )

            traceback.print_exc()

        time.sleep(
            HEARTBEAT_INTERVAL
        )