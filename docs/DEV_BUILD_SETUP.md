# Development Build Setup - Real Maps on Mobile

This guide will help you switch from Expo Go to a Development Build so you can see **real Google Maps** on your mobile device.

## Why You Need This

**Expo Go** cannot load native modules like `react-native-maps`. To see real interactive maps on iOS/Android, you need a **custom development build** that includes the native Google Maps SDK.

## Prerequisites

1. **Google Maps API Key** - Already configured in your `.env` file ✅
2. **EAS Account** - Free tier is sufficient
3. **Physical Device or Emulator**:
   - Android: Android Studio + emulator OR physical device
   - iOS: Xcode + simulator OR physical device (requires Apple Developer account for device)

## Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

## Step 2: Login to EAS

```bash
eas login
```

Enter your Expo credentials (or create an account at expo.dev).

## Step 3: Configure Your Project

Your project is already configured! We've added:
- ✅ `eas.json` - Build configuration
- ✅ `app.config.ts` - Native plugins (react-native-maps, expo-location)
- ✅ Location permissions for iOS/Android

## Step 4: Build for Your Platform

### Android (Recommended - Faster)

Build an APK for Android:

```bash
eas build --profile development --platform android
```

This will:
- Upload your code to EAS servers
- Build a development client APK
- Provide a download link when complete (~10-15 minutes)

**Install on device:**
1. Download the APK from the link EAS provides
2. Transfer to your Android device
3. Install (you may need to enable "Install from Unknown Sources")

**Or install on emulator:**
```bash
# After build completes, EAS provides a command like:
eas build:run -p android
```

### iOS (Requires macOS)

**For iOS Simulator:**

```bash
eas build --profile development --platform ios
```

After build completes:
```bash
eas build:run -p ios
```

**For Physical iOS Device:**

1. Register your device:
```bash
eas device:create
```

2. Build:
```bash
eas build --profile development --platform ios
```

3. Install via TestFlight or direct download

## Step 5: Start Development Server

After installing the development build on your device:

```bash
npx expo start --dev-client
```

**Important:** Use `--dev-client` flag (not regular `expo start`)

Then:
- **Android**: Press `a` or scan QR code with the dev client app
- **iOS**: Press `i` or scan QR code with the dev client app

## Step 6: Verify Everything Works

Once the app loads, you should see:

✅ **Real Google Maps** (not placeholder)  
✅ **Your current location** marker  
✅ **Pickup/destination** markers  
✅ **Route line** (A→B) when both locations are set  
✅ **Map picker** works (tap map icon → select location)  
✅ **Autocomplete** shows real Google Places suggestions  

## Troubleshooting

### "Unable to resolve module react-native-maps"

You're still using Expo Go. Make sure you:
1. Installed the development build APK/IPA
2. Started server with `--dev-client` flag
3. Opened the **development build app** (not Expo Go)

### Map shows blank screen

Check:
1. `.env` file exists with your API key
2. API key has Maps SDK enabled in Google Cloud Console
3. Billing is enabled on your Google Cloud project

### "Location permission denied"

The app should prompt for permission on first launch. If not:
- **Android**: Settings → Apps → 2Go → Permissions → Location → Allow
- **iOS**: Settings → 2Go → Location → While Using the App

### Build fails

Common issues:
- **Android**: Check that package name matches (`com.twogo.lusaka`)
- **iOS**: Ensure bundle ID matches (`com.twogo.lusaka`)
- Check EAS build logs for specific errors

## Local Development (Alternative)

If you have Android Studio or Xcode installed locally:

```bash
# Generate native folders
npx expo prebuild

# Run on Android
npx expo run:android

# Run on iOS (macOS only)
npx expo run:ios
```

This builds locally instead of using EAS servers (faster iteration).

## Cost

- **EAS Builds**: Free tier includes limited builds per month
- **Google Maps API**: $200 free credit per month (plenty for development)

## Next Steps

Once your development build is running:

1. **Test current location** - Should auto-detect your GPS position
2. **Test autocomplete** - Type in "Where to?" and see real suggestions
3. **Test map picker** - Tap map icon → select location on map
4. **Test routing** - Set pickup + destination → see route line A→B
5. **Pan/zoom map** - Map should be fully interactive

## Switching Back to Expo Go

To test web or other features that don't need native maps:

```bash
# Regular Expo Go
npx expo start

# Development build
npx expo start --dev-client
```

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Development Builds Guide](https://docs.expo.dev/development/introduction/)
- [react-native-maps Setup](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md)

---

**Need Help?** Check the build logs in EAS dashboard or run with `--verbose` flag for detailed output.

