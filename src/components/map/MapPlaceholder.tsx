import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface MapPlaceholderProps {
  showMarker?: boolean;
  showRoute?: boolean;
  pickupLabel?: string;
  destinationLabel?: string;
}

/**
 * MapPlaceholder - Simulated map base layer
 * Shows a stylized placeholder when no Google Maps API key is available
 */
export function MapPlaceholder({
  showMarker = true,
  showRoute = false,
  pickupLabel = 'Pickup',
  destinationLabel = 'Destination',
}: MapPlaceholderProps) {
  // Pulsing animation for marker
  const markerScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);
  
  React.useEffect(() => {
    markerScale.value = withRepeat(
      withTiming(1.2, { duration: 1500 }),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1500 }),
      -1,
      true
    );
  }, []);
  
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: markerScale.value }],
    opacity: pulseOpacity.value,
  }));
  
  return (
    <View style={styles.container}>
      {/* Background gradient simulating map */}
      <LinearGradient
        colors={['#E7F1F9', '#D4E5F0', '#C1D9E7']}
        style={styles.gradient}
      >
        {/* Grid pattern to simulate streets */}
        <View style={styles.gridContainer}>
          {/* Horizontal lines */}
          {[...Array(12)].map((_, i) => (
            <View
              key={`h-${i}`}
              style={[
                styles.gridLine,
                styles.horizontalLine,
                { top: `${(i + 1) * 8}%` },
              ]}
            />
          ))}
          {/* Vertical lines */}
          {[...Array(8)].map((_, i) => (
            <View
              key={`v-${i}`}
              style={[
                styles.gridLine,
                styles.verticalLine,
                { left: `${(i + 1) * 12}%` },
              ]}
            />
          ))}
          
          {/* Main roads (thicker) */}
          <View style={[styles.mainRoad, { top: '30%', left: 0, right: 0 }]} />
          <View style={[styles.mainRoad, { top: '65%', left: 0, right: 0 }]} />
          <View style={[styles.mainRoadVertical, { left: '25%', top: 0, bottom: 0 }]} />
          <View style={[styles.mainRoadVertical, { left: '70%', top: 0, bottom: 0 }]} />
        </View>
        
        {/* Park areas */}
        <View style={[styles.parkArea, { top: '15%', left: '40%' }]} />
        <View style={[styles.parkArea, { top: '75%', left: '10%', width: 60, height: 40 }]} />
        
        {/* Buildings (blocks) */}
        {[...Array(6)].map((_, i) => (
          <View
            key={`building-${i}`}
            style={[
              styles.building,
              {
                top: `${20 + (i % 3) * 25}%`,
                left: `${15 + Math.floor(i / 3) * 45}%`,
                width: 30 + (i % 2) * 20,
                height: 25 + (i % 3) * 10,
              },
            ]}
          />
        ))}
        
        {/* Route line (if showing route) */}
        {showRoute && (
          <View style={styles.routeContainer}>
            <View style={styles.routeLine} />
          </View>
        )}
        
        {/* Center marker with pulse effect */}
        {showMarker && (
          <View style={styles.markerContainer}>
            {/* Pulse ring */}
            <Animated.View style={[styles.pulseRing, pulseStyle]} />
            
            {/* Main marker */}
            <View style={styles.marker}>
              <Ionicons name="location" size={32} color="#FE5035" />
            </View>
            
            {/* Marker shadow */}
            <View style={styles.markerShadow} />
          </View>
        )}
        
        {/* Route markers (pickup and destination) */}
        {showRoute && (
          <>
            {/* Pickup marker */}
            <View style={[styles.routeMarker, { top: '35%', left: '20%' }]}>
              <View style={styles.pickupDot} />
              <View style={styles.routeLabel}>
                <Text style={styles.routeLabelText}>{pickupLabel}</Text>
              </View>
            </View>
            
            {/* Destination marker */}
            <View style={[styles.routeMarker, { top: '70%', left: '75%' }]}>
              <View style={styles.destinationDot} />
              <View style={styles.routeLabel}>
                <Text style={styles.routeLabelText}>{destinationLabel}</Text>
              </View>
            </View>
          </>
        )}
        
        {/* Map attribution */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>2Go Map View</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#CBD5E1',
  },
  horizontalLine: {
    height: 1,
    left: 0,
    right: 0,
    opacity: 0.5,
  },
  verticalLine: {
    width: 1,
    top: 0,
    bottom: 0,
    opacity: 0.5,
  },
  mainRoad: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  mainRoadVertical: {
    position: 'absolute',
    width: 4,
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  parkArea: {
    position: 'absolute',
    width: 80,
    height: 50,
    backgroundColor: '#86EFAC',
    borderRadius: 8,
    opacity: 0.4,
  },
  building: {
    position: 'absolute',
    backgroundColor: '#CBD5E1',
    borderRadius: 4,
    opacity: 0.6,
  },
  routeContainer: {
    position: 'absolute',
    top: '35%',
    left: '20%',
    width: '60%',
    height: '40%',
  },
  routeLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: '#FE5035',
    borderStyle: 'dashed',
    borderRadius: 100,
    opacity: 0.6,
  },
  markerContainer: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
    alignItems: 'center',
    zIndex: 1,
  },
  pulseRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FE5035',
    top: 10,
  },
  marker: {
    zIndex: 2,
  },
  markerShadow: {
    width: 12,
    height: 4,
    backgroundColor: '#000',
    borderRadius: 6,
    opacity: 0.2,
    marginTop: -4,
  },
  routeMarker: {
    position: 'absolute',
    alignItems: 'center',
  },
  pickupDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#00D26A',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FE5035',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  routeLabel: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#26344F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  routeLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#26344F',
  },
  attribution: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  attributionText: {
    fontSize: 10,
    color: '#7B8387',
  },
});

