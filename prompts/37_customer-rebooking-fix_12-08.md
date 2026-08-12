# Prompt 37 — Customer Rebooking Fix — Reset Ride State After Rating

# Customer Rebooking Fix — Reset Ride State After Rating

Read `AGENTS.md` first and follow it strictly.

Also read:

- `2GO Navigation Engine Bible.md`
- `NavigationEngine/Architecture.md`
- `src/state/rideStore.ts`
- `app/rating/[id].tsx`

Read the Protected Features / Regression Protection section in `AGENTS.md`.

---

## OBJECTIVE

Fix the confirmed customer rebooking regression identified in:

`audit_reports/post_trip_flow_audit.md`

### Confirmed root cause

After a ride is completed and the customer reaches the rating screen:

- `rideStore.status` remains `'completed'`
- `resetRide()` is not called
- `CustomerHome.tsx` only renders `RidePlannerSheet` when:

```tsx
status === 'idle' || status === 'planning'
```
