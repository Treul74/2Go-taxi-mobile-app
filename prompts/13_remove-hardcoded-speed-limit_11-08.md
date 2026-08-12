# Prompt 13 — Remove hardcoded speed limit
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/components/navigation/DriverActiveTripCard.tsx at line 69, Replace the hardcoded speedLimitKph value in DriverActiveTripCard with the current speed limit from Navigation Engine route state, ensuring the widget reflects the active road; if that state is unavailable, omit the prop until real data exists.
