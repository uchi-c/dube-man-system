# Process monitoring and restart logic
import threading
import time


class Watchdog:

    def __init__(
        self,
        threads
    ):
        self.threads = threads

    def start(self):
        print(
            "[WATCHDOG] Started."
        )

        while True:
            for thread in self.threads:

                if not thread.is_alive():
                    print(
                        f"[WATCHDOG] "
                        f"{thread.name} died."
                    )

            time.sleep(10)