# Prompt 22 — Add persist migration to driver wallet store
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/state/driverWalletStore.ts at line 9, Add a persist migration to the store configuration using the existing `driver-wallet-storage` key, mapping legacy hydrated receipt objects from `passengerName` to `customerName` before exposing state. Include the required version and migrate handler, preserve all other persisted fields, and ensure already-current receipts remain unchanged.
