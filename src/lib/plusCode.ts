import { OpenLocationCode } from 'open-location-code';

/**
 * Plus Code (Open Location Code) wrapper.
 *
 * Only file that imports `open-location-code` directly — everywhere else
 * should go through the helpers below, matching the spatialEngine.ts
 * pattern used for h3-js.
 */

const olc = new OpenLocationCode();

// 4-8 chars, '+', 2-3 chars. Covers short codes (e.g. "F445+3FH") and full
// codes (e.g. "6PH58QMF+2X"). Case-insensitive, word-boundary anchored so it
// doesn't match inside an unrelated longer token.
const PLUS_CODE_PATTERN = /\b[23456789CFGHJMPQRVWXcfghjmpqrvwx]{4,8}\+[23456789CFGHJMPQRVWXcfghjmpqrvwx]{2,3}\b/;

export interface ExtractedPlusCode {
  code: string;
  /** Any other comma-separated segment(s) in the input, joined — likely a locality/district. */
  locality: string | null;
}

/**
 * Scans free-form input for a Plus Code segment anywhere in the string
 * (not just when the whole input is a code), and pulls out whatever locality
 * text accompanies it — e.g. "Royal Kutachika, F445+3FH, Zambezi" yields
 * code "F445+3FH" and locality "Royal Kutachika, Zambezi".
 */
export function extractPlusCode(input: string): ExtractedPlusCode | null {
  const match = input.match(PLUS_CODE_PATTERN);
  if (!match) return null;

  const code = match[0].toUpperCase();
  const segments = input.split(',').map((s) => s.trim()).filter(Boolean);

  let locality: string | null;
  if (segments.length > 1) {
    // Comma-separated input (e.g. "Name, F445+3FH, Zambezi") — locality is
    // whichever segment(s) aren't the one containing the code.
    const codeSegmentIndex = segments.findIndex((seg) => seg.toUpperCase().includes(code));
    const rest = segments.filter((_, i) => i !== codeSegmentIndex);
    locality = rest.length > 0 ? rest.join(', ') : null;
  } else {
    // No commas (e.g. "F445+3FH Zambezi") — whatever's left after removing
    // the code is the locality.
    const remainder = input.replace(match[0], '').trim();
    locality = remainder.length > 0 ? remainder : null;
  }

  return { code, locality };
}

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Decodes a Plus Code to coordinates.
 * - Full codes decode standalone.
 * - Short codes need a reference point (a nearby locality or the caller's
 *   current/last known location) to recover the full code first, matching
 *   how Google's short codes resolve. Returns null if a short code has no
 *   usable reference.
 */
export function decodePlusCode(code: string, reference?: LatLng | null): LatLng | null {
  try {
    if (olc.isFull(code)) {
      const area = olc.decode(code);
      return { latitude: area.latitudeCenter, longitude: area.longitudeCenter };
    }

    if (olc.isShort(code) && reference) {
      const fullCode = olc.recoverNearest(code, reference.latitude, reference.longitude);
      const area = olc.decode(fullCode);
      return { latitude: area.latitudeCenter, longitude: area.longitudeCenter };
    }

    return null;
  } catch (error) {
    console.error('Error decoding Plus Code:', error);
    return null;
  }
}

/** Encodes coordinates into a full Plus Code. */
export function encodePlusCode(latitude: number, longitude: number): string {
  return olc.encode(latitude, longitude);
}
