# Bug Fixes

## Ghost Window Issue - Monitor UI Becomes Unresponsive After Inactivity

**Date:** 2026-02-09
**Issue:** After leaving the API server idle for extended periods without calling endpoints, the Monitor UI window becomes non-responsive ("ghost window") with a transparent interior.

**Root Cause:** 
The SWT Display thread requires periodic activity to remain responsive. During long idle periods with no API calls and no log messages, there were no events being dispatched to the Display thread, causing Windows to mark the window as unresponsive.

While the loggingQueue timer ran every 100ms, it would early-exit if the widget was disposed, and during idle periods with no log messages, there wasn't enough UI activity to keep the window healthy on Windows.

**Fix:**
1. **Added heartbeat mechanism** (`monitorUI.js`):
   - New `_startHeartbeat()` method that runs every 2 seconds
   - Calls `shell.update()` to force minimal window updates
   - Ensures Display thread receives regular events even during idle periods
   - Stops automatically when shell is disposed or shutting down

2. **Improved loggingQueue resilience** (`loggingQueue.js`):
   - Timer continues running even if log widget becomes invalid
   - Added try-catch around widget updates to prevent timer chain breakage
   - Reschedules regardless of message presence to maintain Display thread activity

**Files Modified:**
- `scripts/lib/server/monitorUI.js` - Added heartbeat timer and state tracking
- `scripts/lib/server/loggingQueue.js` - Improved timer resilience

**Testing:**
After applying this fix, the monitor window should remain responsive indefinitely even when the server is idle with no API calls for extended periods (hours). The heartbeat runs every 2 seconds, which is frequent enough to prevent ghost window state but infrequent enough to have negligible performance impact.
