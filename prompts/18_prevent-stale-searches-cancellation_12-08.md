# Prompt 18 — Prevent stale searches cancellation
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/LocationAutocomplete.tsx around lines 40 - 76, Prevent stale debounced searches in the useEffect by declaring a cancellation flag before setTimeout, setting it during cleanup, and checking it before applying searchLocation results, errors, or loading-state updates. Apply the same cancellation pattern to the corresponding search effect in LocationSearchModal, preserving current behavior for the latest active query.
