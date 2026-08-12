# Prompt 16 — Fix CustomerHome service area lookup

read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/CustomerHome.tsx around lines 237 - 244, Update the useEffect around checkServiceAreaAvailable to handle rejected lookups without leaving an unhandled promise, and prevent setShowServiceAreaBanner from running after the component unmounts. Track effect activity with cleanup, guard the resolved-state update, and add appropriate rejection handling while preserving the existing service-area banner behavior.
