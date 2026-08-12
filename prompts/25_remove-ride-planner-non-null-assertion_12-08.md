# Prompt 25 — Remove RidePlannerSheet non-null assertion
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/RidePlannerSheet.tsx at line 313, Remove the non-null assertion from the currentPayment lookup in RidePlannerSheet, then handle the resulting undefined value before any currentPayment property access, including currentPayment.icon, while preserving the existing behavior for valid payment methods.
