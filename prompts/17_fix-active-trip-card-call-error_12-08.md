# Prompt 17 — Fix active trip card call error
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/ActiveTripCard.tsx around lines 93 - 95, Update handleCall to handle the promise rejection from Linking.openURL, displaying an Alert to inform the customer when calling is unavailable; add Alert to the existing react-native imports and preserve the current phone-link behavior on success.
