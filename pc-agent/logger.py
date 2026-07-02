import logging

logging.basicConfig(
    filename="agent.log",
    level=logging.INFO,
    format=(
        "%(asctime)s "
        "%(levelname)s "
        "%(message)s"
    )
)


def info(message):
    logging.info(
        message
    )


def error(message):
    logging.error(
        message
    )