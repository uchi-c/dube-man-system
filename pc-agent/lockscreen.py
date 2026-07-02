import ctypes


def lock_pc():
    try:
        ctypes.windll.user32.LockWorkStation()
    except Exception as e:
        print(
            "[LOCK ERROR]",
            str(e)
        )