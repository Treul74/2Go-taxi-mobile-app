# Prompt 01 — Driver static position marker

Show the driver's live location on the map as a static position
marker matching the attached screenshot — a blue circular icon
containing the triangle arrow from
assets/images/svg/NavigationArrow.tsx, surrounded by a soft
translucent blue radius halo.

1. Render this marker at the driver's current GPS coordinates on
   their own map — replacing whatever marker currently represents
   the driver's own position.

2. This is a static position indicator only — no heading rotation,
   no directional pointing, no movement-based animation logic. The
   arrow icon inside the circle stays fixed, always pointing the
   same direction regardless of which way the driver is facing or
   moving.

3. The marker's position updates as the driver's GPS location
   changes, using the same smooth position-interpolation approach
   already used for other markers in the app (useAnimatedMarker())
   — position only, not rotation.

4. Style: solid blue circle background, white/light triangle arrow
   centered inside it, larger soft translucent blue circle halo
   around it (radius indicator), matching the attached screenshot's
   visual style.

[CONSTRAINTS]
Do not add heading-based rotation — this marker never rotates.
Reuse assets/images/svg/NavigationArrow.tsx for the arrow shape
only.
Do not confuse this with NavigationArrowMarker.tsx, which IS
heading/rotation-based and used elsewhere for active
navigation — this is a separate, simpler, static marker.
Do not touch any protected auth or flow systems.
