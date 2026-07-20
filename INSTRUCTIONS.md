# React Native Expo App Template - Instructions

This document serves as a reference guide for building applications with this React Native Expo template.

## ⚠️ Important Notice: WelcomePage.tsx

**Before you start building your app, you MUST replace or rename `src/screens/WelcomePage.tsx`.**

The `WelcomePage.tsx` file is a default welcome screen included in this template. It serves as a placeholder and should be replaced with your first actual screen when building your application. The welcome page is currently being used in `app/(tabs)/index.tsx` as the home screen.

**Action Required:**
- Rename `WelcomePage.tsx` to your desired screen name, OR
- Replace the content of `WelcomePage.tsx` with your first screen implementation
- Update the import in `app/(tabs)/index.tsx` if you rename the file

## Technology Stack

This template uses the following technologies:

### Core Framework
- **React Native** (v0.81.5) - Cross-platform mobile framework
- **React** (v19.1.0) - UI library
- **Expo** (~54.0.25) - Development platform and toolchain
- **Expo Router** (~6.0.15) - File-based routing system

### Navigation
- **@react-navigation/native** (v7.1.8) - Navigation library
- **@react-navigation/bottom-tabs** (v7.4.0) - Tab navigation
- **@react-navigation/elements** (v2.6.3) - Navigation elements

### Styling
- **NativeWind** (v4.2.1) - Tailwind CSS for React Native
- **Tailwind CSS** (v3.4.18) - Utility-first CSS framework
- **expo-linear-gradient** (~15.0.7) - Gradient components

### State Management
- **Zustand** (v5.0.8) - Lightweight state management

### Authentication & Database
- **@clerk/clerk-expo** (v2.19.6) - Authentication service
- **@neondatabase/serverless** (v1.0.2) - Serverless database client
- **pg** (v8.16.3) - PostgreSQL client

### UI & UX
- **@expo/vector-icons** (v15.0.3) - Icon library
- **expo-haptics** (~15.0.7) - Haptic feedback
- **expo-image** (~3.0.10) - Optimized image component
- **react-native-safe-area-context** (~5.6.0) - Safe area handling
- **react-native-screens** (v4.16.0) - Native screen components

### Development Tools
- **TypeScript** (~5.9.2) - Type-safe JavaScript
- **ESLint** (v9.25.0) - Code linting
- **expo-linting** - Expo linting configuration

### Additional Expo Modules
- **expo-constants** (~18.0.10) - App constants
- **expo-font** (~14.0.9) - Font loading
- **expo-linking** (~8.0.9) - Deep linking
- **expo-secure-store** (~15.0.7) - Secure storage
- **expo-splash-screen** (~31.0.11) - Splash screen
- **expo-status-bar** (~3.0.8) - Status bar
- **expo-symbols** (~1.0.7) - SF Symbols
- **expo-system-ui** (~6.0.8) - System UI
- **expo-web-browser** (~15.0.9) - Web browser

### Animation & Gestures
- **react-native-reanimated** (~4.1.1) - Animation library
- **react-native-gesture-handler** (~2.28.0) - Gesture handling
- **react-native-worklets** (v0.5.1) - Worklets support

## Installation

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn** package manager
- **Expo CLI** (optional, can use npx)

### Step 1: Install Dependencies

Navigate to the project root directory and install all dependencies:

```bash
npm install
```

This will install all the packages listed in `package.json` including:
- React Native and Expo core packages
- Navigation libraries
- UI components and styling libraries
- Authentication and database clients
- Development tools

### Step 2: Install Backend Dependencies (if needed)

If you're using the backend folder, navigate to it and install dependencies:

```bash
cd backend
npm install
```

### Step 3: Environment Setup

Create a `.env` file in the root directory for environment variables:

```bash
# Example .env file
# Add your API keys and configuration here
```

**Note:** The template does not include any hardcoded API keys. You'll need to add your own:
- Clerk Frontend API key (if using Clerk authentication)
- Neon Database URL (if using Neon database)
- Any other API keys or configuration values your app requires

### Step 4: Start the Development Server

Run the Expo development server:

```bash
npx expo start
```

This will start the Metro bundler and provide options to:
- Open in development build
- Open in Android emulator
- Open in iOS simulator
- Open in Expo Go app

### Additional Commands

- **Android**: `npm run android` - Start on Android
- **iOS**: `npm run ios` - Start on iOS
- **Web**: `npm run web` - Start web version
- **Lint**: `npm run lint` - Run ESLint
- **Reset Project**: `npm run reset-project` - Get a fresh app directory

## Project Structure

```
expo_template/
├── app/                    # Expo Router file-based routing
│   ├── (tabs)/            # Tab navigation screens
│   └── modal.tsx          # Modal screen
├── src/
│   ├── assets/            # Images and static assets
│   ├── components/        # Reusable components
│   ├── constants/         # App constants (theme, etc.)
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility libraries
│   ├── navigation/        # Navigation configuration
│   ├── screens/           # Screen components (including WelcomePage.tsx)
│   ├── state/             # State management (Zustand stores)
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── backend/               # Backend code (if applicable)
├── scripts/               # Build and utility scripts
└── package.json           # Dependencies and scripts
```

## Getting Started

1. **Replace WelcomePage.tsx**: As mentioned above, replace or rename the default welcome screen
2. **Configure Environment**: Set up your `.env` file with necessary API keys
3. **Customize Theme**: Edit `src/constants/theme.ts` to match your brand
4. **Update App Info**: Modify `app.json` with your app name, slug, and configuration
5. **Start Building**: Begin creating your screens in the `app/` directory or `src/screens/`

## File-Based Routing

This template uses Expo Router for file-based routing. Files in the `app/` directory automatically become routes:

- `app/(tabs)/index.tsx` → Home tab (currently uses WelcomePage)
- `app/(tabs)/explore.tsx` → Explore tab
- `app/modal.tsx` → Modal screen

See [Expo Router documentation](https://docs.expo.dev/router/introduction/) for more details.

## TypeScript Configuration

The project uses TypeScript with strict mode enabled. Path aliases are configured:
- `@/*` maps to `./src/*`

Use the `@/` prefix when importing from the `src/` directory:
```typescript
import WelcomePage from '@/screens/WelcomePage';
```

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)

## Support

For issues or questions:
- Check the Expo documentation
- Visit the Expo Discord community
- Review the Expo GitHub repository

---

**Remember**: Always replace `WelcomePage.tsx` before building your first screen!

