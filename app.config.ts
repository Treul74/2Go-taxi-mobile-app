import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '2Go',
  slug: '2gotaxi',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './src/assets/images/icon.png',
  scheme: 'twogo',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.twogo.lusaka',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: '2Go needs your location to show nearby drivers and calculate routes.',
      NSLocationAlwaysAndWhenInUseUsageDescription: '2Go needs your location to show nearby drivers and calculate routes.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#26344F',
      foregroundImage: './src/assets/images/android-icon-foreground.png',
      backgroundImage: './src/assets/images/android-icon-background.png',
      monochromeImage: './src/assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.twogo.lusaka',
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
    ],
  },
  web: {
    output: 'static',
    favicon: './src/assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './src/assets/images/asset_splash_screen.png',
        resizeMode: 'cover',
        backgroundColor: '#26344F',
      },
    ],

    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: '2Go needs your location to show nearby drivers and calculate routes.',
        locationAlwaysPermission: '2Go needs your location to show nearby drivers and calculate routes.',
        locationWhenInUsePermission: '2Go needs your location to show nearby drivers and calculate routes.',
      },
    ],

    [
      'expo-image-picker',
      {
        photosPermission: '2Go accesses your photos so you can upload a driver profile photo.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '02f955a5-17a3-4740-b573-a14faea1df4d',
    },
  },
  owner: 'treul',
});

