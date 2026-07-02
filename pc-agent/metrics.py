import psutil
import socket


def get_metrics():
    try:
        disk = psutil.disk_usage(
            "C:\\"
        )
    except:
        disk = psutil.disk_usage(
            "/"
        )

    return {
        "cpu":
        psutil.cpu_percent(),

        "ram":
        psutil.virtual_memory().percent,

        "disk":
        disk.percent,

        "hostname":
        socket.gethostname(),

        "ip_address":
        socket.gethostbyname(
            socket.gethostname()
        )
    }