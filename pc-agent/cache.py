import json
from pathlib import Path
from config import CACHE_FILE


def save_session(
    session
):
    with open(
        CACHE_FILE,
        "w"
    ) as file:
        json.dump(
            session,
            file,
            indent=4,
            default=str
        )


def load_session():
    path = Path(
        CACHE_FILE
    )

    if not path.exists():
        return None

    with open(
        CACHE_FILE,
        "r"
    ) as file:
        return json.load(
            file
        )


def clear_session():
    path = Path(
        CACHE_FILE
    )

    if path.exists():
        path.unlink()