# Prompt 36 — Fix trip screen route replacement during fare receipt

read AGENTS.md first and follow it strictly

Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @audit_reports/post_trip_flow_audit.md around lines 47 - 65, Update the customer trip screen’s redirect effect around status and activeTrip so it does not replace the route while a fareReceipt is present. Keep the trip/receipt flow mounted until FareReceiptModal dismissal clears the receipt, then navigate to the rating screen instead of the tabs home screen.
