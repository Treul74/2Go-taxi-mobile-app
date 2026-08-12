# Prompt 30 — Update driverWalletStore persist migration key
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/state/driverWalletStore.ts around lines 136 - 150, Update the version-0 migration in the store persist configuration to transform persistedState.transactions, renaming passengerName to customerName for each legacy receipt while preserving entries without that field. Remove the receipts transformation unless receipts is an intentionally supported confirmed legacy storage key, and keep the migrated result cast as WalletState.
