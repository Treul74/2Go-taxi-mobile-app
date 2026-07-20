function haversine(lat1: number, lon1: number, lat2: number, lon2: number, R: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return haversine(lat1, lon1, lat2, lon2, 6371);
}

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return haversine(lat1, lon1, lat2, lon2, 6371000);
}

/** Formats a live distance-to-maneuver value for turn-by-turn HUD countdown text. */
export function formatManeuverDistance(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)}m`;
}
