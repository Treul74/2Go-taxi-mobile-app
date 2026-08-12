# Prompt 21 — Fix navigation engine types duplicate setRoute declaration
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/navigation/NavigationEngine/types.ts around lines 388 - 393, Remove the earlier setRoute declaration from the NavigationDataActions interface, preserving the later declaration and its complete route-state documentation. Do not alter setOverviewRoute or setGpsFix.
