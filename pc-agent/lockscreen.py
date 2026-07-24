import logger

try:
    import win32ts
    import win32process
    import win32profile
    import win32con
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    logger.error("[LOCK] pywin32 not available -- lock command disabled.")


def lock_pc():
    """
    ctypes.windll.user32.LockWorkStation() only locks the CALLING session's
    desktop. This agent runs as a Windows Service, which executes in
    Session 0 -- an isolated background session with no interactive
    desktop of its own (Session 0 isolation, introduced in Vista for
    security). Calling LockWorkStation() directly from here "succeeds"
    against a desktop nobody is looking at, while the operator's actual
    screen (a different, numbered session) stays completely unlocked --
    which is exactly what was observed live: commands completed with no
    error, but nothing happened on screen.

    The documented way around this is to duplicate the logged-in user's
    session token and launch the lock command inside THEIR session
    instead of ours, via WTSQueryUserToken + CreateProcessAsUser. This is
    the standard Windows pattern for a service that needs to act on the
    interactive user's desktop.
    """
    if not WIN32_AVAILABLE:
        logger.error("[LOCK ERROR] pywin32 not available.")
        return

    try:
        session_id = win32ts.WTSGetActiveConsoleSessionId()
        if session_id in (0xFFFFFFFF, -1):
            logger.error("[LOCK ERROR] No active console session -- nobody is logged in locally right now.")
            return

        user_token = win32ts.WTSQueryUserToken(session_id)
        try:
            env = win32profile.CreateEnvironmentBlock(user_token, False)
            startup_info = win32process.STARTUPINFO()
            win32process.CreateProcessAsUser(
                user_token,
                None,
                "rundll32.exe user32.dll,LockWorkStation",
                None,
                None,
                False,
                win32con.NORMAL_PRIORITY_CLASS | win32con.CREATE_NO_WINDOW,
                env,
                None,
                startup_info,
            )
            logger.info(f"[LOCK] Sent lock command into session {session_id}.")
        finally:
            user_token.Close()
    except Exception as e:
        logger.error(f"[LOCK ERROR] {e}")
