import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface ProvinceLabelProps {
  province: string | null;
  loading?: boolean;
}

/**
 * Province Label - Shows current province in top-right of map
 * Respects safe area to avoid notch/Dynamic Island
 */
export function ProvinceLabel({ province, loading }: ProvinceLabelProps) {
  const insets = useSafeAreaInsets();
  
  if (loading) {
    return (
      <View style={[styles.container, { top: insets.top + 8, right: 16 }]}>
        <Ionicons name="location-outline" size={14} color="#7B8387" />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (!province) {
    return null;
  }

  return (
    <View style={[styles.container, { top: insets.top + 8, right: 16 }]}>
      <Ionicons name="location" size={14} color="#FE5035" />
      <Text style={styles.text}>{province} Province</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#26344F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 5,
  },
  text: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#26344F',
  },
});

