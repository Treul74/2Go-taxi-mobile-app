# Prompt 03 — Audit driver marker visibility
Read AGENTS.md first and follow it strictly.
Save this audit to audit_exports/ as instructed in AGENTS.md.

[TASK]
Audit only — do not change anything.

The driver's live location marker (the blue circle + triangle
arrow + halo added in a previous prompt) is not appearing on the
driver's map, even though camera centering/auto-follow to the
driver's location is working correctly. The customer-side map
correctly shows the customer's own location marker using the same
general pattern. Compare the two to find the conflict.

1. Show how the customer-side map (PassengerHome.tsx / Map.native.tsx)
   renders the customer's own live location marker — the exact
   component, its conditions for rendering, and where it sits in
   the marker render order/z-index.

2. Show how the driver's own live location marker was added in the
   most recent change — the exact component, file, and its
   conditions for rendering.

3. Check for a naming/prop conflict — is there more than one
   component or marker trying to render at the driver's own
   position simultaneously (e.g. the new static blue-circle marker
   AND an existing AnimatedVehicleMarker/NavigationArrowMarker both
   targeting the same coordinate)? List every marker component that
   could be rendering at the driver's current location right now.

4. Check the render condition for the new marker — is it actually
   being reached (i.e. is driverLocation/the coordinate it depends
   on populated at the time this component renders), or is a
   condition silently preventing it from rendering at all (null
   check, wrong prop name, wrong store field, feature flag, etc.)?

5. Check z-index/render order — is the new marker being rendered
   but visually hidden underneath another map layer (H3 grid,
   another marker, a polygon, the route polyline)?

6. Confirm which Map component instance the driver's own screen is
   actually using right now (Map.native.tsx directly vs
   NavigationMap.tsx) and whether the new marker was added to the
   correct one given the recent Navigation Engine migration work.

Report exact file/line references for everything found. Do not
change anything.
