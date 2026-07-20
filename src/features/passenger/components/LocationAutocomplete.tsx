import { type PlacePrediction } from '@/lib/google';
import { resolvePlaceSelection, searchLocation, toLocation, type LocationSearchResult } from '@/lib/locationSearch';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

interface LocationAutocompleteProps {
  /** Search query input */
  query: string;
  
  /** Callback when location is selected */
  onSelectLocation: (location: Location) => void;
  
  /** User's current location for biasing results */
  userLocation?: Location;
  
  /** Show loading state */
  loading?: boolean;
}

/**
 * Location Autocomplete Dropdown
 * Shows Google Places suggestions as user types
 */
export function LocationAutocomplete({
  query,
  onSelectLocation,
  userLocation,
  loading = false,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [resolvedResult, setResolvedResult] = useState<LocationSearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, userLocation]);

  const handleSelectSuggestion = useCallback(async (prediction: PlacePrediction) => {
    setSelectedId(prediction.placeId);

    try {
      const result = await resolvePlaceSelection(prediction.placeId);

      if (result) {
        onSelectLocation(toLocation(result));
        setSuggestions([]); // Clear suggestions after selection
      } else {
        setNotFound(true);
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      setNotFound(true);
    } finally {
      setSelectedId(null);
    }
  }, [onSelectLocation]);

  const handleSelectResolved = useCallback(() => {
    if (!resolvedResult) return;
    onSelectLocation(toLocation(resolvedResult));
    setResolvedResult(null); // Clear after selection
  }, [resolvedResult, onSelectLocation]);

  // Don't show dropdown if no query or nothing to show
  if (query.length < 3 || (suggestions.length === 0 && !resolvedResult && !notFound && !isSearching)) {
    return null;
  }

  return (
    <View className="mt-2 bg-white rounded-3xl shadow-lg overflow-hidden">
      {isSearching ? (
        <View className="p-4 items-center">
          <ActivityIndicator size="small" color="#FE5035" />
          <Text className="text-secondary text-sm mt-2">Searching...</Text>
        </View>
      ) : resolvedResult ? (
        <Pressable
          onPress={handleSelectResolved}
          className="flex-row items-center p-4"
        >
          <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3">
            <Ionicons name="locate" size={20} color="#7B8387" />
          </View>

          <View className="flex-1">
            <Text className="text-primary font-semibold text-sm" numberOfLines={1}>
              {resolvedResult.addressName}
            </Text>
            <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
              {[resolvedResult.plusCode, resolvedResult.districtName].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      ) : notFound ? (
        <View className="p-4 items-center">
          <Ionicons name="alert-circle-outline" size={24} color="#CBD5E1" />
          <Text className="text-primary font-semibold text-sm mt-2">Location not found</Text>
          <Text className="text-secondary text-xs mt-1 text-center">
            Try a different search term, or include a nearby district if you
            entered a Plus Code
          </Text>
        </View>
      ) : (
        <ScrollView
          className="max-h-64"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.placeId}
              onPress={() => handleSelectSuggestion(suggestion)}
              className={`flex-row items-center p-4 ${
                index < suggestions.length - 1 ? 'border-b border-gray-100' : ''
              }`}
              disabled={selectedId === suggestion.placeId}
            >
              <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3">
                <Ionicons 
                  name={
                    suggestion.description.toLowerCase().includes('airport') 
                      ? 'airplane-outline'
                      : suggestion.description.toLowerCase().includes('hotel')
                      ? 'bed-outline'
                      : suggestion.description.toLowerCase().includes('station')
                      ? 'bus-outline'
                      : 'location-outline'
                  } 
                  size={20} 
                  color="#7B8387" 
                />
              </View>
              
              <View className="flex-1">
                <Text className="text-primary font-semibold text-sm" numberOfLines={1}>
                  {suggestion.structuredFormatting.mainText}
                </Text>
                <Text className="text-secondary text-xs mt-0.5" numberOfLines={1}>
                  {suggestion.structuredFormatting.secondaryText}
                </Text>
              </View>
              
              {selectedId === suggestion.placeId && (
                <ActivityIndicator size="small" color="#FE5035" />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

