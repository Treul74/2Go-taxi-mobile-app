# Prompt 20 — Fix navigation store duplicate setRoute
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/navigation/NavigationEngine/NavigationStore.ts at line 257, Remove the earlier duplicate setRoute property near the route state definition in NavigationStore, preserving the full setRoute implementation that updates route-derived state. Then run npx tsc --noEmit to verify the duplicate-property error is resolved.
