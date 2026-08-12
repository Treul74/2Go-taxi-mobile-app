# Prompt 29 — Update BookForSomeoneModal loading state initialization
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/BookForSomeoneModal.tsx around lines 140 - 157, Update the loading state initialization used by the contacts-loading flow so the first render after the modal becomes visible remains in the loading branch until loadContacts has attempted permission detection. Prefer initializing loading to true, while preserving the existing loading reset and permission-result behavior in loadContacts.
