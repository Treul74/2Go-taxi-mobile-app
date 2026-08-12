# Prompt 15 — Fix Driver Trip Arrival Time NaN Calculation
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @app/(driver)/trip.tsx around lines 322 - 336, Update the arrival-time calculation in the trip screen before rendering DriverActiveTripCard so it returns the '...' placeholder whenever distance is unavailable, rather than passing a NaN-derived timestamp. Preserve the existing arrival calculation for valid distance values and continue passing the resulting arrivalTime to DriverActiveTripCard.
