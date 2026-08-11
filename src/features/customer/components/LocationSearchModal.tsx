import { BackButton } from '@/components/ui';
import { calculateDistanceKm } from '@/lib/distance';
import { getPlaceDetails, reverseGeocodeComponents, type PlacePrediction } from '@/lib/google';
import { resolvePlaceSelection, searchLocation, toLocation, type LocationSearchResult } from '@/lib/locationSearch';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LocationSearchModalProps {
  /** Whether modal is visible */
  visible: boolean;

  /** Modal title */
  title: string;

  /** Initial query value */
  initialQuery?: string;

  /** User's current location for biasing results */
  userLocation?: Location;

  /** Callback when location is selected */
  onSelectLocation: (location: Location) => void;

  /** Callback to open map picker */
  onOpenMapPicker: () => void;

  /** Callback when modal is closed */
  onClose: () => void;
}

/** Strips a trailing ", Zambia" (or bare "Zambia") from a Places secondary text — the user's country is already known from context. */
function stripCountrySuffix(text: string): string {
  return text.replace(/,?\s*Zambia\s*$/i, '').trim();
}

/**
 * Full-screen Location Search Modal
 * Provides a clean interface for searching locations with autocomplete
 */
export function LocationSearchModal({
  visible,
  title,
  initialQuery = '',
  userLocation,
  onSelectLocation,
  onOpenMapPicker,
  onClose,
}: LocationSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [resolvedResult, setResolvedResult] = useState<LocationSearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suggestionSubtext, setSuggestionSubtext] = useState<Record<string, string>>({});
  const [contextDistrict, setContextDistrict] = useState<string | null>(userLocation?.district ?? null);
  const inputRef = useRef<TextInput>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, initialQuery]);

  // Debounced search: detects a Plus Code anywhere in the input and resolves
  // it directly, otherwise falls back to Places Autocomplete text search.
  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      setResolvedResult(null);
      setNotFound(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setNotFound(false);
      try {
        const outcome = await searchLocation(query, userLocation);

        if (outcome.type === 'resolved') {
          setResolvedResult(outcome.result);
          setSuggestions([]);
        } else if (outcome.type === 'places') {
          setSuggestions(outcome.predictions);
          setResolvedResult(null);
        } else {
          setSuggestions([]);
          setResolvedResult(null);
          setNotFound(true);
        }
      } catch (error) {
        console.error('Location search error:', error);
        setSuggestions([]);
        setResolvedResult(null);
        setNotFound(true);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, userLocation]);

  // Resolves the district for the header label — same reference point used to
  // bias suggestions, and the same reverseGeocodeComponents helper the app
  // already uses elsewhere (e.g. Plus Code resolution) to derive a district.
  useEffect(() => {
    if (!visible || !userLocation) {
      setContextDistrict(null);
      return;
    }

    if (userLocation.district) {
      setContextDistrict(userLocation.district);
      return;
    }

    let cancelled = false;

    reverseGeocodeComponents(userLocation.latitude, userLocation.longitude).then((result) => {
      if (!cancelled) setContextDistrict(result?.district ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, userLocation]);

  // Enriches each suggestion's subtext with district (in place of country) and
  // distance from the user's current location, once Place Details resolves.
  useEffect(() => {
    if (suggestions.length === 0) {
      setSuggestionSubtext({});
      return;
    }

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        suggestions.map(async (suggestion) => {
          const details = await getPlaceDetails(suggestion.placeId);
          if (!details) return null;

          const area = stripCountrySuffix(suggestion.structuredFormatting.secondaryText);
          const district = details.district;
          const base =
            district && !area.toLowerCase().includes(district.toLowerCase())
              ? [area, district].filter(Boolean).join(', ')
              : area || district || '';

          const distanceKm = userLocation
            ? calculateDistanceKm(
                userLocation.latitude,
                userLocation.longitude,
                details.location.latitude,
                details.location.longitude
              )
            : null;

          const subtext = distanceKm !== null ? `${base} · ${Math.round(distanceKm)} km` : base;

          return [suggestion.placeId, subtext] as const;
        })
      );

      if (cancelled) return;

      setSuggestionSubtext(Object.fromEntries(entries.filter(Boolean) as [string, string][]));
    })();

    return () => {
      cancelled = true;
    };
  }, [suggestions, userLocation]);

  const handleSelectSuggestion = useCallback(
    async (prediction: PlacePrediction) => {
      setSelectedId(prediction.placeId);

      try {
        const result = await resolvePlaceSelection(prediction.placeId);

        if (result) {
          onSelectLocation(toLocation(result));
          onClose();
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error getting place details:', error);
        setNotFound(true);
      } finally {
        setSelectedId(null);
      }
    },
    [onSelectLocation, onClose]
  );

  const handleSelectResolved = useCallback(() => {
    if (!resolvedResult) return;
    onSelectLocation(toLocation(resolvedResult));
    onClose();
  }, [resolvedResult, onSelectLocation, onClose]);

  const handleClear = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setResolvedResult(null);
    setNotFound(false);
    inputRef.current?.focus();
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={styles.title}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#7B8387" style={styles.searchIcon} />

            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Search for a location..."
              placeholderTextColor="#7B8387"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
            />

            {query.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#7B8387" />
              </Pressable>
            )}
          </View>

          {/* Main Content Area */}
          <View style={{ flex: 1 }}>
            <ScrollView
              style={styles.resultsContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 80 }}
            >
              {/* Your Location Option */}
              {userLocation && (
                <Pressable
                  onPress={() => {
                    onSelectLocation(userLocation);
                    onClose();
                  }}
                  style={styles.suggestionItem}
                >
                  <View style={styles.suggestionIcon}>
                    <Ionicons name="navigate" size={20} color="#3B82F6" />
                  </View>
                  <View style={styles.suggestionText}>
                    <Text style={styles.suggestionMain}>Your Location</Text>
                    <Text style={styles.suggestionSecondary}>Use current GPS location</Text>
                  </View>
                </Pressable>
              )}

              {/* Choose on Map Button */}
              <Pressable
                onPress={() => {
                  onClose();
                  onOpenMapPicker();
                }}
                style={styles.suggestionItem}
              >
                <View style={[styles.suggestionIcon, { backgroundColor: '#FFF5F3' }]}>
                  <Ionicons name="map-outline" size={20} color="#FE5035" />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionMain}>Choose on Map</Text>
                  <Text style={styles.suggestionSecondary}>Select a point manually</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#7B8387" />
              </Pressable>

              {/* Results */}
              {isSearching ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#FE5035" />
                  <Text style={styles.loadingText}>Searching in your area...</Text>
                </View>
              ) : resolvedResult ? (
                <>
                  <Text style={styles.sectionTitle}>Plus Code Match</Text>
                  <Pressable
                    onPress={handleSelectResolved}
                    style={[styles.suggestionItem, styles.suggestionItemLast]}
                  >
                    <View style={styles.suggestionIcon}>
                      <Ionicons name="locate" size={20} color="#7B8387" />
                    </View>

                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionMain} numberOfLines={1}>
                        {resolvedResult.addressName}
                      </Text>
                      <Text style={styles.suggestionSecondary} numberOfLines={1}>
                        {[resolvedResult.plusCode, resolvedResult.districtName]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                </>
              ) : suggestions.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Suggestions in {contextDistrict ?? 'Zambia'}</Text>
                  {suggestions.map((suggestion, index) => (
                    <Pressable
                      key={suggestion.placeId}
                      onPress={() => handleSelectSuggestion(suggestion)}
                      style={[
                        styles.suggestionItem,
                        index === suggestions.length - 1 && styles.suggestionItemLast,
                      ]}
                      disabled={selectedId === suggestion.placeId}
                    >
                      <View style={styles.suggestionIcon}>
                        <Ionicons
                          name={
                            suggestion.description.toLowerCase().includes('airport')
                              ? 'airplane'
                              : suggestion.description.toLowerCase().includes('hotel')
                                ? 'bed'
                                : suggestion.description.toLowerCase().includes('station')
                                  ? 'bus'
                                  : 'location'
                          }
                          size={20}
                          color="#7B8387"
                        />
                      </View>

                      <View style={styles.suggestionText}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                          {suggestion.structuredFormatting.mainText}
                        </Text>
                        <Text style={styles.suggestionSecondary} numberOfLines={1}>
                          {suggestionSubtext[suggestion.placeId] ??
                            stripCountrySuffix(suggestion.structuredFormatting.secondaryText)}
                        </Text>
                      </View>

                      {selectedId === suggestion.placeId && (
                        <ActivityIndicator size="small" color="#FE5035" />
                      )}
                    </Pressable>
                  ))}
                </>
              ) : notFound || query.length >= 3 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>Location not found</Text>
                  <Text style={styles.emptySubtext}>
                    Try a different search term, or include a nearby district if
                    you entered a Plus Code
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="location-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>Search for a location</Text>
                  <Text style={styles.emptySubtext}>Type at least 3 characters to see suggestions</Text>
                </View>
              )}
            </ScrollView>

            {/* Repositioned Back Arrow - Floating near the bottom/keyboard */}
            <BackButton onPress={onClose} style={styles.floatingBackButton} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#26344F',
    textAlign: 'center',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#26344F',
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  resultsContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7B8387',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 16,
    fontWeight: '600',
    color: '#26344F',
    marginBottom: 4,
  },
  suggestionSecondary: {
    fontSize: 14,
    color: '#7B8387',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#7B8387',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#26344F',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#7B8387',
    textAlign: 'center',
  },
  floatingBackButton: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    zIndex: 1000,
  },
});

