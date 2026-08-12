# Prompt 26 — Update RidePlannerSheet setPickup manual flag
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/RidePlannerSheet.tsx around lines 118 - 135, Update the live GPS synchronization branch in the useEffect around setPickup to pass false explicitly as the manual flag when applying currentLocation. Confirm useRideStore.setPickup’s second-parameter default and preserve the existing manual-pickup behavior and Live location label handling.
