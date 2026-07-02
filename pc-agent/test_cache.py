from cache import (
    save_session,
    load_session,
    clear_session
)

save_session({
    "session_id": 1,
    "minutes": 30
})

print(load_session())

clear_session()

print(load_session())