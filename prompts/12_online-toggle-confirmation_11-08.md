# Prompt 12 — Update OnlineToggle's handlePress flow
read AGENTS.md first and follow it strictly

Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/driver/components/OnlineToggle.tsx around lines 17 - 30, Update OnlineToggle’s handlePress flow to require confirmation specifically when transitioning from online to offline, while preserving immediate toggling when going offline to online. Use the existing isOnline state and established confirmation mechanism, then invoke onToggle only after the user confirms the online-to-offline action.
