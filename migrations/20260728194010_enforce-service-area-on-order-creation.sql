-- Closes the gap confirmed in audit_export/audit_28-07-26_21-24_fare-vehicle-
-- service-area-migration-check.md: bookings today can be created with a
-- pickup/dropoff anywhere on Earth -- no client check, no RLS, no trigger
-- ever validates against service_areas. This migration adds the server-side
-- enforcement (the only layer that can't be bypassed by a modified client
-- or a direct API call, matching the same trust-boundary reasoning already
-- applied to fare in migrations/20260726030000_server-side-fare-at-order-
-- creation.sql). Client-side pre-check for UX (so the customer sees
-- "Service not available in this area" before finishing the booking flow,
-- instead of only at submit) is a follow-up app-code change, out of scope
-- for this SQL-only migration per instructions.
--
-- Pickup only, per instructions -- dropoff is not checked.
--
-- IMPORTANT schema note discovered while writing this: the task description
-- assumed service_areas.polygon_coordinates is "a jsonb array of {lat,lng}
-- points". Live data (queried directly, no migration file exists for this
-- table -- it was created out-of-band like several others) shows it is
-- actually standard GeoJSON:
--   { "type": "Polygon", "coordinates": [ [ [lng, lat], [lng, lat], ... ] ] }
-- i.e. an array of rings, each ring an array of [longitude, latitude] pairs
-- (GeoJSON coordinate order, not {lat,lng} objects), with the first/last
-- point identical to close the ring. The ray-casting implementation below
-- reads that real shape (exterior ring only, index 0 -- holes are not
-- supported since no current row uses them) rather than the shape assumed
-- in the prompt; had it been implemented against the assumed shape, the
-- function would silently never match either of the two currently active
-- polygon rows.

-- ============================================================
-- 1. is_within_service_area(lat, lng) -- true if the point falls inside
--    ANY active service_areas row, polygon or radius.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_within_service_area(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_area RECORD;
  v_ring JSONB;
  v_n INT;
  v_inside BOOLEAN;
  v_xi DOUBLE PRECISION;
  v_yi DOUBLE PRECISION;
  v_xj DOUBLE PRECISION;
  v_yj DOUBLE PRECISION;
  i INT;
  j INT;
  v_distance_m DOUBLE PRECISION;
  v_earth_radius_m CONSTANT DOUBLE PRECISION := 6371000;
BEGIN
  FOR v_area IN
    SELECT * FROM public.service_areas WHERE status = 'active'
  LOOP
    IF v_area.area_type = 'radius' THEN
      IF v_area.center_lat IS NULL OR v_area.center_lng IS NULL
         OR v_area.radius_meters IS NULL THEN
        CONTINUE;
      END IF;

      -- Haversine great-circle distance between (p_lat,p_lng) and
      -- (center_lat,center_lng), in meters.
      v_distance_m := 2 * v_earth_radius_m * asin(sqrt(
        power(sin(radians(p_lat - v_area.center_lat) / 2), 2) +
        cos(radians(v_area.center_lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - v_area.center_lng) / 2), 2)
      ));

      IF v_distance_m <= v_area.radius_meters THEN
        RETURN TRUE;
      END IF;

    ELSIF v_area.area_type = 'polygon' THEN
      IF v_area.polygon_coordinates IS NULL THEN
        CONTINUE;
      END IF;

      -- GeoJSON Polygon: coordinates -> [ring] -> [point] -> [lng, lat].
      -- Exterior ring only (index 0); interior rings (holes) are not
      -- supported since no current row has them.
      v_ring := v_area.polygon_coordinates -> 'coordinates' -> 0;
      IF v_ring IS NULL THEN
        CONTINUE;
      END IF;

      v_n := jsonb_array_length(v_ring);
      IF v_n < 3 THEN
        CONTINUE;
      END IF;

      -- Standard ray-casting point-in-polygon test: count how many times a
      -- ray cast eastward from (p_lng, p_lat) crosses an edge of the
      -- ring; odd crossing count = inside.
      v_inside := FALSE;
      j := v_n - 1;
      FOR i IN 0 .. v_n - 1 LOOP
        v_xi := ((v_ring -> i) ->> 0)::DOUBLE PRECISION; -- lng
        v_yi := ((v_ring -> i) ->> 1)::DOUBLE PRECISION; -- lat
        v_xj := ((v_ring -> j) ->> 0)::DOUBLE PRECISION;
        v_yj := ((v_ring -> j) ->> 1)::DOUBLE PRECISION;

        -- Nested IFs (not a single AND'd expression) so the division
        -- below only ever executes when v_yi <> v_yj is already
        -- guaranteed by the outer condition -- avoids any division by
        -- zero risk from relying on unspecified AND short-circuit order.
        IF (v_yi > p_lat) <> (v_yj > p_lat) THEN
          IF p_lng < (v_xj - v_xi) * (p_lat - v_yi) / (v_yj - v_yi) + v_xi THEN
            v_inside := NOT v_inside;
          END IF;
        END IF;

        j := i;
      END LOOP;

      IF v_inside THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

-- Not called anywhere client-side yet (no app code touched in this
-- migration), but granted now so a future client-side pre-check (the UX
-- companion to this trigger, recommended in the referenced audit) can call
-- it via RPC without a further grant migration -- same pattern as
-- calculate_fare_breakdown/calculate_fare.
GRANT EXECUTE ON FUNCTION public.is_within_service_area(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ============================================================
-- 2. BEFORE INSERT trigger on orders -- pickup location only, per
--    instructions. Rejects outright (RAISE EXCEPTION) rather than silently
--    allowing an out-of-area booking, mirroring the fail-loud pattern
--    already used by handle_order_creation_fare().
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_order_service_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_within_service_area(NEW.pickup_lat, NEW.pickup_lng) THEN
    RAISE EXCEPTION 'Service not available in this area';
  END IF;
  RETURN NEW;
END;
$$;

-- Named order_area_validation_trigger (not order_service_area_..., etc.) so
-- it sorts alphabetically before order_creation_fare_trigger -- Postgres
-- fires same-table BEFORE ROW triggers in trigger-name order, and there's
-- no reason to compute a fare breakdown for a booking that's about to be
-- rejected for being outside every service area.
DROP TRIGGER IF EXISTS order_area_validation_trigger ON public.orders;
CREATE TRIGGER order_area_validation_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_service_area();
