/**
 * Minimal ambient typings for `open-location-code` (Google's reference Plus
 * Code implementation), which ships no TypeScript declarations of its own.
 * Only the members actually used by src/lib/plusCode.ts are declared.
 */
declare module 'open-location-code' {
  export interface CodeArea {
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  }

  export class OpenLocationCode {
    isValid(code: string): boolean;
    isShort(code: string): boolean;
    isFull(code: string): boolean;
    encode(latitude: number, longitude: number, codeLength?: number): string;
    decode(code: string): CodeArea;
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string;
  }
}
