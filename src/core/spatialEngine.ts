import '@/lib/polyfills';
import { cellToBoundary, cellToLatLng, gridDisk, latLngToCell } from 'h3-js';

/**
 * H3 Spatial Engine
 * 
 * Provides hexagon-based spatial indexing using Uber's H3 library.
 * All functions use resolution 9 (≈170m street-level precision).
 */

/** H3 resolution locked to 9 for street-level precision (≈170m hexagons) */
const RESOLUTION = 9;

/**
 * Convert GPS coordinates to H3 hexagon index
 * 
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @returns H3 hexagon index string (resolution 9)
 */
export function getHex9(latitude: number, longitude: number): string {
    return latLngToCell(latitude, longitude, RESOLUTION);
}

/**
 * Get surrounding hexagons using k-ring algorithm (gridDisk in v4)
 * 
 * Returns all hexagons within `ringSize` distance from the center hexagon.
 * Ring size 1 returns 6 immediate neighbors + center (7 total).
 * Ring size 2 returns 18 hexagons + center (19 total).
 * 
 * @param hex9 - Center H3 hexagon index
 * @param ringSize - Number of rings to expand (default: 1)
 * @returns Array of H3 hexagon indices including the center
 */
export function getNearbyHexes(hex9: string, ringSize: number = 1): string[] {
    return gridDisk(hex9, ringSize);
}

/**
 * Get the geographic center point of a hexagon
 * 
 * @param hex9 - H3 hexagon index
 * @returns Object with latitude and longitude of hexagon center
 */
export function getHexCenter(hex9: string): { latitude: number; longitude: number } {
    const [lat, lng] = cellToLatLng(hex9);
    return { latitude: lat, longitude: lng };
}

/**
 * Get the vertices (corners) of a hexagon boundary
 * 
 * @param hex9 - H3 hexagon index
 * @returns Array of coordinates forming the hexagon boundary
 */
export function getHexBoundary(hex9: string): Array<{ latitude: number; longitude: number }> {
    try {
        const boundary = cellToBoundary(hex9);
        return boundary.map(([lat, lng]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
        }));
    } catch (error) {
        console.error('Failed to get H3 boundary:', error);
        return [];
    }
}
