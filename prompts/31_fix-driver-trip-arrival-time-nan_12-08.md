# Prompt 31 — Fix driver trip arrival time NaN
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @prompts/15_fix-driver-trip-arrival-time_12-08.md at line 5, Update the arrival-time calculation before rendering DriverActiveTripCard to treat distance as unavailable only when it is nullish or non-finite, while preserving 0 as valid input. Return the '...' placeholder for null, undefined, NaN, and other non-finite distances; retain the existing calculation for finite values and pass the result as arrivalTime.
