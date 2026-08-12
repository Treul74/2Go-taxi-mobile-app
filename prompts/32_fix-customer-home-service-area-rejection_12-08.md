# Prompt 32 — Fix customer home service area rejection
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @prompts/16_fix-customer-home-service-area-lookup_12-08.md at line 6, Update the useEffect containing checkServiceAreaAvailable so its rejection handler also checks the effect’s active state before calling setShowServiceAreaBanner. Define the catch behavior to preserve the intended service-area banner state, retain cleanup on unmount, and ensure the rejected promise is handled without unhandled errors.
