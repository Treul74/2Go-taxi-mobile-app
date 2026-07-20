import type { Location } from '@/types';
import type { VehicleMarkerVariant } from './markers/CarMarker';

/**
 * A Transporter vehicle to render as an animated top-down car marker
 */
export interface MapVehicle {
  /** Stable unique id (used as the React key — must not change between updates) */
  id: string;
  latitude: number;
  longitude: number;
  /** Compass heading in degrees (0 = north) */
  heading: number;
  /** Only 'offline' changes rendering (dims the marker); other tiers all render the same car asset */
  variant?: VehicleMarkerVariant;
}

/**
 * Shared Map component props for cross-platform usage
 */
export interface MapProps {
  /** Current user location (center of map if no markers) */
  userLocation?: Location;

  /** Pickup location marker */
  pickup?: Location;

  /** Destination location marker */
  destination?: Location;

  /** Show route polyline between pickup and destination */
  showRoute?: boolean;

  /** Route polyline coordinates (if showRoute is true) */
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;

  /** Route steps for turn-by-turn navigation (optional, for enhanced visualization) */
  routeSteps?: Array<{
    instruction: string;
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    startLocation: { latitude: number; longitude: number };
    endLocation: { latitude: number; longitude: number };
    maneuver?: string;
  }>;

  /** Show user location marker */
  showUserMarker?: boolean;

  /** Map interaction enabled */
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;

  /** Callback when map is ready */
  onMapReady?: () => void;

  /** Callback when user taps on map */
  onMapPress?: (location: Location) => void;

  /** Callback when user starts dragging the map */
  onPanDrag?: () => void;

  /** Map region change is complete (user stopped dragging) */
  onRegionChangeComplete?: () => void;

  /** Map type (standard, satellite, hybrid, terrain) */
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';

  /** Driver location for custom car marker */
  driverLocation?: { latitude: number; longitude: number };

  /** Driver heading in degrees for car rotation */
  driverHeading?: number;

  /** Only 'offline' changes rendering (dims the marker); defaults to 'comfort' */
  driverVehicleVariant?: VehicleMarkerVariant;

  /** Render the driver marker as a heading-aware directional arrow instead of the top-down car icon (used during turn-by-turn navigation) */
  navigationArrowMode?: boolean;

  /** Render the pickup marker as the pulsing UserLocationMarker dot instead of the default pin (used by the customer's live tracking screen) */
  showPickupAsUserLocation?: boolean;

  /** Render the pickup marker as a large pulsing search circle instead of the default pin (used while matching a driver) */
  showSearchPulse?: boolean;

  /** Nearby Transporter vehicles rendered as animated car markers (native only) */
  vehicles?: MapVehicle[];

  /** Disable built-in driver auto-follow (for custom camera control) */
  autoFollowDriver?: boolean;

  /** Passenger H3 Hexagon Index (Resolution 9) */
  passengerHex9?: string | null;

  /** Show H3 Grid overlay (for visualization) */
  showH3Grid?: boolean;

  /** H3 Grid cells to display (array of hex9 strings) */
  h3Grid?: string[];

  /** ETA text to display on the map (e.g. "2 min ETA") */
  eta?: string;

  /** Optional position for the ETA badge (defaults to pickup or destination) */
  etaPosition?: { latitude: number; longitude: number };

  /** Show zoom control buttons on the map */
  showZoomControls?: boolean;

  /** Hide the green pickup pin (e.g. during active turn-by-turn navigation) */
  hidePickupPin?: boolean;
}


/**
 * Base Map component - platform-specific implementations
 * This file is a type definition only; actual implementations are in:
 * - Map.native.tsx (iOS/Android using react-native-maps)
 * - Map.web.tsx (Web using @react-google-maps/api)
 *
 * Re-exported here (matching the MapPickerModal.tsx pattern) so TypeScript
 * can resolve the value while Metro handles platform-specific loading.
 */
export { Map } from './Map.native';

