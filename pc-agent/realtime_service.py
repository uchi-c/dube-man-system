# Supabase realtime subscriptions go here
import time


class RealtimeService:

    def start(self):
        print(
            "[REALTIME] Started."
        )

        while True:
            try:
                time.sleep(30)

            except Exception as e:
                print(
                    "[REALTIME ERROR]",
                    str(e)
                )