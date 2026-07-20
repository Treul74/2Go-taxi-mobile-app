export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Compass bearing in degrees (0 = north, clockwise) from `a` to `b`. */
export function calculateBearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/** Meters per degree of latitude (~constant at all latitudes). */
const METERS_PER_DEGREE_LAT = 111320;

function toPlanarXY(point: LatLng, originLat: number) {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180);
  return {
    x: point.longitude * metersPerDegreeLng,
    y: point.latitude * METERS_PER_DEGREE_LAT,
  };
}

function fromPlanarXY(xy: { x: number; y: number }, originLat: number): LatLng {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180);
  return {
    longitude: xy.x / metersPerDegreeLng,
    latitude: xy.y / METERS_PER_DEGREE_LAT,
  };
}

export interface RouteSnapResult {
  position: LatLng;
  /** Forward bearing (0 = north) of the route segment the point snapped onto. */
  segmentBearing: number;
}

/**
 * Projects `point` onto the nearest segment of `path` (a directed polyline,
 * e.g. a Directions API route) using a local equirectangular approximation —
 * accurate enough at city scale and far cheaper than a Roads API round trip
 * on every GPS fix. Returns `null` when `path` has fewer than two vertices.
 */
export function snapToPath(point: LatLng, path: LatLng[]): RouteSnapResult | null {
  if (path.length < 2) return null;

  const originLat = point.latitude;
  const p = toPlanarXY(point, originLat);

  let best: { xy: { x: number; y: number }; bearing: number; distSq: number } | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const a = toPlanarXY(path[i], originLat);
    const b = toPlanarXY(path[i + 1], originLat);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const distSq = (p.x - projX) ** 2 + (p.y - projY) ** 2;

    if (!best || distSq < best.distSq) {
      best = { xy: { x: projX, y: projY }, bearing: calculateBearing(path[i], path[i + 1]), distSq };
    }
  }

  return {
    position: fromPlanarXY(best!.xy, originLat),
    segmentBearing: best!.bearing,
  };
}
