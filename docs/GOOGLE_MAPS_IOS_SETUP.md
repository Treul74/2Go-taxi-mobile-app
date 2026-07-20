# Google Maps on iOS - Dev Build Setup

This document explains how to get **Google Maps tiles** on iOS (instead of Apple Maps) by moving from Expo Go to an Expo development build.

## Current Status

✅ **Working in Expo Go:**
- Web: Google Maps (via Google Maps JavaScript API)
- Android: Google Maps (via react-native-maps with Google provider)
- iOS: Apple Maps (via react-native-maps default provider in Expo Go)

To get **Google Maps tiles on iOS**, you need a **custom development build** because Expo Go doesn't include the Google Maps SDK for iOS.

## Prerequisites

1. **EAS CLI** installed:
   ```bash
   npm install -g eas-cli
   ```

2. **Expo account** (sign up at expo.dev)

3. **iOS device or simulator** for testing

4. **Google Maps API Key** with **Maps SDK for iOS** enabled

## Step 1: Update app.json

Add the `react-native-maps` config plugin with your iOS API key:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-maps",
        {
          "googleMapsApiKey": "YOUR_IOS_API_KEY_HERE"
        }
      ]
    ]
  }
}
```

**Security Note:** For production, use environment variables instead of hardcoding:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-maps",
        {
          "googleMapsApiKey": "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS}"
        }
      ]
    ]
  }
}
```

## Step 2: Configure EAS Build

Create `eas.json` if it doesn't exist:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

## Step 3: Run Development Build

### For iOS Simulator:

```bash
eas build --profile development --platform ios
```

After the build completes, download and install on simulator:

```bash
# EAS will provide a download URL
# Install the .tar.gz in your simulator
```

### For Physical iOS Device:

1. Register your device:
   ```bash
   eas device:create
   ```

2. Build for device:
   ```bash
   eas build --profile development --platform ios
   ```

3. Install via TestFlight or direct download

## Step 4: Start Development Server

```bash
npx expo start --dev-client
```

Press `i` to open on iOS simulator or scan QR code with your physical device.

## Step 5: Verify Google Maps

In your app, the iOS map should now show **Google Maps tiles** instead of Apple Maps.

## Alternative: Local Development Build

If you have Xcode installed, you can build locally:

```bash
npx expo prebuild
npx expo run:ios
```

This generates native iOS project files and runs the app.

## Troubleshooting

### "Invariant Violation: Native module cannot be null"

This means the Google Maps SDK isn't linked. Ensure:
- You added the config plugin to `app.json`
- You're running a development build (not Expo Go)
- You ran `npx expo prebuild` if building locally

### Map shows blank/white screen

Check:
- API key is valid and has Maps SDK for iOS enabled
- Billing is enabled on Google Cloud project
- API key restrictions allow your bundle ID (`com.twogo.lusaka`)

### "Google Maps SDK requires a valid API key"

Your key might be restricted incorrectly. In Google Cloud Console:
- Go to "Credentials"
- Edit your iOS API key
- Under "Application restrictions", select "iOS apps"
- Add your bundle ID: `com.twogo.lusaka`

## Cost Considerations

- EAS builds are free for personal accounts (limited builds/month)
- Google Maps API usage: first $200/month is free credit
- Monitor usage in Google Cloud Console

## Resources

- [Expo Development Builds](https://docs.expo.dev/development/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [react-native-maps Documentation](https://github.com/react-native-maps/react-native-maps)
- [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/)

