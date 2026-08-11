# Prompt 04 — Fix driver marker visibility
Read AGENTS.md first and follow it strictly.

[TASK]
Fix the driver's static location marker not rendering. The audit
confirmed the render logic, conditions, and component placement are
all correct — the only issue is
src/components/map/markers/DriverStaticPositionMarker.tsx has
tracksViewChanges={false}, causing react-native-maps to snapshot
the marker before its nested SVG and custom styles have laid out,
resulting in a permanently empty/invisible frame on Android.

1. In DriverStaticPositionMarker.tsx, change tracksViewChanges from
   false to true, matching the same pattern already used correctly
   in AnimatedUserLocation.tsx for the customer's own marker.

[CONSTRAINTS]
Only change this one prop in this one file.
Do not change AnimatedUserLocation.tsx, Map.native.tsx, or any
other marker component.
Do not touch any protected auth or flow systems.
Confirm the marker now renders visibly on the driver's own map.
