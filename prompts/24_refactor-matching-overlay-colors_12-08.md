# Prompt 24 — Refactor MatchingOverlay hardcoded colors to semantic tokens
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/MatchingOverlay.tsx around lines 179 - 241, Update the JSX in MatchingOverlay to replace all hardcoded color values (#26344F, #FE5035, #7B8387, #E2E8F0, and #F1F5F9) with the corresponding configured semantic NativeWind token classes, matching the palette usage in CancelSearchDialog. Apply the tokens consistently to text, borders, backgrounds, icons, and progress indicators without changing layout or behavior.
