# Google Maps Integration - Complete Setup Guide

This guide walks you through setting up Google Maps for the 2Go taxi app on Web, Android, and iOS.

## Overview

The app uses Google Maps across all platforms:
- **Web**: Google Maps JavaScript API
- **Android**: Maps SDK for Android (via react-native-maps)
- **iOS**: Maps SDK for iOS (requires dev build) or Apple Maps (in Expo Go)

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable billing (required for Places API and Directions API)

## Step 2: Enable Required APIs

In your Google Cloud project, enable these APIs:

### Required (for basic functionality):
- ✅ **Maps JavaScript API** - Web map display
- ✅ **Maps SDK for Android** - Android map display
- ✅ **Maps SDK for iOS** - iOS map display (if using dev build)
- ✅ **Places API** - Address autocomplete and search
- ✅ **Directions API** - Route calculations
- ✅ **Geocoding API** - Address ↔ coordinates conversion

### Recommended (for enhanced features):
- **Distance Matrix API** - Multi-point ETA calculations (driver matching)
- **Roads API** - Snap-to-road, better route tracking
- **Time Zone API** - Handle scheduled rides across time zones

Navigate to: **APIs & Services → Library** and search for each API to enable it.

## Step 3: Create API Keys

Create **3 separate API keys** for better security:

### Web API Key
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → API Key**
3. Name it: `2Go Web API Key`
4. Click **Edit API key**
5. Under **Application restrictions**:
   - Select **HTTP referrers (web sites)**
   - Add your domains:
     - `localhost:8081/*`
     - `localhost:19006/*`
     - `yourdomain.com/*` (production domain)
6. Under **API restrictions**:
   - Select **Restrict key**
   - Enable:
     - Maps JavaScript API
     - Places API
     - Directions API
     - Geocoding API

### Android API Key
1. Create Credentials → API Key
2. Name it: `2Go Android API Key`
3. Under **Application restrictions**:
   - Select **Android apps**
   - Add your package name: `com.twogo.lusaka`
   - Get SHA-1 certificate fingerprint:
     ```bash
     # For development
     cd android
     ./gradlew signingReport
     ```
4. Under **API restrictions**:
   - Enable:
     - Maps SDK for Android
     - Places API
     - Directions API
     - Geocoding API

### iOS API Key
1. Create Credentials → API Key
2. Name it: `2Go iOS API Key`
3. Under **Application restrictions**:
   - Select **iOS apps**
   - Add your bundle ID: `com.twogo.lusaka`
4. Under **API restrictions**:
   - Enable:
     - Maps SDK for iOS
     - Places API
     - Directions API
     - Geocoding API

## Step 4: Add API Keys to Your Project

### Create .env File

Create a `.env` file in your project root (**never commit this file!**):

```bash
# Google Maps API Keys
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB=your_web_api_key_here
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID=your_android_api_key_here
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS=your_ios_api_key_here
```

### Verify .gitignore

Ensure `.env` is ignored (already configured):

```
# .gitignore
.env
.env*.local
```

## Step 5: Test the Integration

### Web
```bash
npx expo start --web
```

The map should load with Google Maps tiles.

### Android (Expo Go)
```bash
npx expo start
```

Scan the QR code with Expo Go. The map should show Google Maps.

### iOS (Expo Go)
The map will show **Apple Maps** in Expo Go. To get Google Maps tiles, see [GOOGLE_MAPS_IOS_SETUP.md](./GOOGLE_MAPS_IOS_SETUP.md).

## Step 6: Integrate with Ride Planner

The Google Maps API wrapper provides these functions:

```typescript
import { 
  getPlaceAutocomplete, 
  getPlaceDetails, 
  getDirections 
} from '@/lib/google';

// Autocomplete for "Where to?" input
const predictions = await getPlaceAutocomplete('Cairo Road', userLocation);

// Get full details when user selects a place
const placeDetails = await getPlaceDetails(predictions[0].placeId);

// Calculate route
const direction = await getDirections(pickupLocation, destinationLocation);
```

### Example: Hook into RidePlannerSheet

```typescript
// In RidePlannerSheet.tsx
const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);

const handleDestinationChange = async (text: string) => {
  setDestinationQuery(text);
  
  if (text.length > 2) {
    const predictions = await getPlaceAutocomplete(text, pickup);
    setSuggestions(predictions);
  }
};

const handleSelectSuggestion = async (prediction: PlacePrediction) => {
  const details = await getPlaceDetails(prediction.placeId);
  if (details) {
    setDestination(details.location);
    setDestinationQuery(details.formattedAddress);
    
    // Optionally fetch route
    if (pickup) {
      const route = await getDirections(pickup, details.location);
      // Use route.coordinates to draw polyline on map
    }
  }
};
```

## API Usage & Costs

Google Maps Platform offers **$200 free credit per month**. Typical usage for a taxi app:

| API | Cost per 1000 requests | Monthly Free |
|-----|------------------------|--------------|
| Maps JavaScript API | $7 | ~28,571 loads |
| Maps SDK (Mobile) | $7 | ~28,571 loads |
| Places Autocomplete | $2.83 - $17 | Variable |
| Directions API | $5 | ~40,000 requests |
| Geocoding | $5 | ~40,000 requests |

**Tips to minimize costs:**
- Cache autocomplete results on client
- Debounce autocomplete requests (wait 300ms after typing stops)
- Cache directions between common locations
- Use Distance Matrix sparingly (more expensive)

## Monitoring Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services → Dashboard**
3. Click on each API to see usage charts
4. Set up **billing alerts** to avoid surprises

## Troubleshooting

### "This API key is not authorized to use this service or API"

- Check that the API is enabled for your project
- Verify the API key restrictions match your platform
- Wait a few minutes after creating/updating keys

### Map loads but shows "For development purposes only" watermark

- Billing is not enabled on your Google Cloud project
- Enable billing in **Billing → Overview**

### Autocomplete returns no results

- Ensure Places API is enabled
- Check API key has Places API in restrictions
- Verify network requests are reaching Google servers (check Network tab)

### CORS errors on web

- Add your domain to HTTP referrer restrictions
- Include `localhost:*` for local development

## Next Steps

1. **Add autocomplete UI** in RidePlannerSheet destination input
2. **Draw routes** on map using polyline from Directions API
3. **Implement location services** using `expo-location` to get user's current position
4. **Add driver matching** using Distance Matrix API
5. **Optimize API calls** with caching and debouncing

## Resources

- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [API Key Best Practices](https://developers.google.com/maps/api-security-best-practices)
- [Expo Location Docs](https://docs.expo.dev/versions/latest/sdk/location/)
- [react-native-maps](https://github.com/react-native-maps/react-native-maps)

