# Prompt 14 — Update LocationSearchModal empty-state conditional
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/LocationSearchModal.tsx around lines 395 - 403, Update the empty-state conditional in LocationSearchModal so the “Location not found” message is rendered only when notFound is true; remove the query.length >= 3 trigger and preserve a neutral state while the debounced search has not started or has no result yet.
