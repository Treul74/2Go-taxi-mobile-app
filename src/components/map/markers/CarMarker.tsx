import React from 'react';
import { Image, View } from 'react-native';

/**
 * Marker color variants for Transporter vehicles on the map.
 * No longer used to tint the car body (every active vehicle class renders
 * the same car asset) — kept only to distinguish the offline/unavailable
 * state, which dims the marker instead of recoloring it.
 */
export type VehicleMarkerVariant = 'economy' | 'comfort' | 'premium' | 'offline';

export const VEHICLE_MARKER_COLORS: Record<VehicleMarkerVariant, string> = {
  economy: '#FE5035',
  comfort: '#4F7DFF',
  premium: '#222222',
  offline: '#BDBDBD',
};

export const DEFAULT_VEHICLE_MARKER_SIZE = 36;

/** Opacity applied when `variant` is 'offline' (unavailable vehicles). */
const OFFLINE_OPACITY = 0.45;

// Bird's-eye car artwork, extracted from src/assets/images/asset_SVG_car_birdview.svg
// (that file wraps this same raster image in an SVG shell as a single embedded
// PNG — extracting it avoids relying on SVG data-URI parsing at runtime).
const CAR_MARKER_IMAGE = require('@/assets/images/carBirdview.png');
/** height / width of the source asset (419×205px), used to size it without distortion. */
const CAR_ASSET_ASPECT_RATIO = 205 / 419;

export interface CarMarkerProps {
  /** Only affects rendering for 'offline' (dims the marker). Ignored otherwise. */
  variant?: VehicleMarkerVariant;
  /** Unused — the car asset is no longer recolored per class. Kept so existing callers don't break. */
  color?: string;
  /** Rendered square size in px. */
  size?: number;
}

/**
 * Bird's-eye (top-down) vehicle icon for map markers.
 *
 * Pure static image: it never animates itself, so a marker using it can keep
 * `tracksViewChanges={false}`. The source artwork's nose points left (west),
 * so it carries a fixed +90° rotation to point north/up — the orientation
 * `AnimatedVehicleMarker`'s parent marker assumes before applying live
 * heading rotation on top.
 */
export const CarMarker = React.memo(function CarMarker({
  variant = 'economy',
  size = DEFAULT_VEHICLE_MARKER_SIZE,
}: CarMarkerProps) {
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      pointerEvents="none"
    >
      <Image
        source={CAR_MARKER_IMAGE}
        resizeMode="contain"
        style={{
          width: size,
          height: size * CAR_ASSET_ASPECT_RATIO,
          transform: [{ rotate: '90deg' }],
          opacity: variant === 'offline' ? OFFLINE_OPACITY : 1,
        }}
      />
    </View>
  );
});
