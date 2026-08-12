# Prompt 27 — Fix RidePlannerSheet route fetch dependencies
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/RidePlannerSheet.tsx around lines 154 - 203, Check whether RouteEngine.fetchRoute coalesces or caches requests by coordinate pair; if it does not, prevent the route-fetching effect in RidePlannerSheet from depending on pickup object identity by deriving rounded pickup and destination coordinate keys and using those keys as the fetch-trigger dependencies. Preserve the existing navigation-mode updates and route-clearing behavior, while allowing small GPS movements within the rounding threshold to avoid refetching.
