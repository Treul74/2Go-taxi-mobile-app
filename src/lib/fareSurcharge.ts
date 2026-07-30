/**
 * Mirrors the server's night/peak surcharge window logic exactly (see
 * calculate_fare_breakdown() in
 * migrations/20260728200758_apply-night-peak-surcharge-to-fare-calculation.sql)
 * so the picker preview can show the same surcharge the server will
 * actually apply. Display/informational only -- the charged fare is always
 * computed server-side; never let this drive what gets billed.
 *
 * Zambia (Africa/Lusaka) is UTC+2 year-round with no DST, so a fixed
 * 2-hour offset is exact here -- no timezone library needed.
 */

const ZAMBIA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

export type FareSurchargeType = 'night' | 'peak' | null;

export function getActiveFareSurcharge(at: Date = new Date()): FareSurchargeType {
  const lusaka = new Date(at.getTime() + ZAMBIA_UTC_OFFSET_MS);
  const hour = lusaka.getUTCHours();
  const isoDow = lusaka.getUTCDay() === 0 ? 7 : lusaka.getUTCDay(); // 1=Monday .. 7=Sunday

  if (hour >= 22 || hour < 5) return 'night';

  if (isoDow >= 1 && isoDow <= 5 && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19))) {
    return 'peak';
  }

  return null;
}
