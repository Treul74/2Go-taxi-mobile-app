# Why You See MapPlaceholder on Mobile (Expo Go)

## The Situation

When you run your app on **mobile using Expo Go**, you see an animated placeholder map instead of the real Google Maps. This is **expected behavior**, not a bug!

## Why This Happens

### Expo Go Limitation

**Expo Go** is a sandbox app that contains a fixed set of pre-compiled native modules. It **cannot** include `react-native-maps` because:

1. Maps require native SDKs (Google Maps SDK for Android/iOS)
2. These SDKs need to be compiled into the app binary
3. Expo Go's binary is already built and can't add new native modules at runtime

### What Works vs. What Doesn't

| Feature | Expo Go | Development Build | Web |
|---------|---------|-------------------|-----|
| **Map Display** | ❌ Placeholder | ✅ Real Map | ✅ Real Map |
| **Current Location** | ✅ Works | ✅ Works | ✅ Works |
| **Autocomplete** | ✅ Works | ✅ Works | ✅ Works |
| **Directions API** | ✅ Works | ✅ Works | ✅ Works |
| **Places Search** | ✅ Works | ✅ Works | ✅ Works |

**Good news:** All the Google Maps **APIs work perfectly** (autocomplete, directions, geocoding) because they're HTTP requests, not native modules!

## What You CAN Do Now (Expo Go)

Even with the placeholder, you can:

✅ **Get your current location** - GPS works!  
✅ **Search for destinations** - Autocomplete shows real suggestions  
✅ **Calculate routes** - Directions API works  
✅ **Book rides** - Full app functionality  
✅ **Test on Web** - Real Google Maps on web browser

## Testing Your Features

### Test Current Location
1. Open app on mobile (Expo Go)
2. Grant location permission when prompted
3. You'll see "Current Location" auto-fill in pickup field
4. The coordinates are real (check console logs)

### Test Autocomplete
1. Type in "Where to?" field
2. After 3 characters, you'll see real Google Places suggestions
3. Tap a suggestion → it sets the destination
4. The location data is real (lat/lng from Google)

### Test on Web (See Real Map)
```bash
npx expo start
# Press 'w' for web
```

On web, you'll see:
- ✅ Real Google Maps
- ✅ Your location marker
- ✅ Pickup/destination markers
- ✅ Everything working

## How to Get Real Maps on Mobile

### Option 1: Development Build (Recommended)

Create a custom development build that includes `react-native-maps`:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure and build
eas build --profile development --platform android
# or
eas build --profile development --platform ios
```

See [`GOOGLE_MAPS_IOS_SETUP.md`](./GOOGLE_MAPS_IOS_SETUP.md) for detailed instructions.

### Option 2: Local Build

If you have Android Studio / Xcode:

```bash
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

## Why We Built It This Way

The app is designed to **gracefully degrade**:

1. **Try to load native maps** → If available (dev build), use them
2. **Fall back to placeholder** → If not available (Expo Go), show placeholder
3. **All features still work** → Location, search, booking work regardless

This means:
- ✅ You can develop and test in Expo Go
- ✅ All business logic works
- ✅ When you build for production, maps will work
- ✅ No code changes needed!

## Bottom Line

**For development in Expo Go:**
- The placeholder is **normal and expected**
- All your features (location, search, booking) **work perfectly**
- The map is just visual - the data behind it is real

**For production:**
- Build with EAS or `expo prebuild`
- Real maps will appear automatically
- No code changes required

## Quick Comparison

### What You're Seeing Now (Expo Go):
```
📱 Mobile: Animated placeholder + real location data
🌐 Web: Real Google Maps
```

### What You'll Get (Development Build):
```
📱 Mobile: Real Google Maps + real location data
🌐 Web: Real Google Maps
```

The **functionality is identical** - only the visual map changes!

## Need Help?

If you want to create a development build to see real maps on mobile, follow the guide in [`GOOGLE_MAPS_IOS_SETUP.md`](./GOOGLE_MAPS_IOS_SETUP.md).

For now, you can continue developing with Expo Go - everything works except the visual map!

