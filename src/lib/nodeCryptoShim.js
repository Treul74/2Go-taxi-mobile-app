// Metro shim for Node's `crypto` module.
//
// @insforge/sdk's OAuth PKCE helper (used only by signInWithOAuth) does
// `const { webcrypto } = await import('crypto')` as a fallback when
// `globalThis.crypto.subtle` isn't available. React Native has no built-in
// `crypto` module, so Metro can't resolve that import — this shim satisfies
// the bundler. `react-native-get-random-values` (imported first in
// app/_layout.tsx) already polyfills `globalThis.crypto.getRandomValues`, so
// this just re-exports the global. `.subtle` (SHA-256 for the PKCE code
// challenge) is NOT polyfilled here — Google/Apple sign-in are UI-only
// placeholders in this app, so signInWithOAuth is never actually invoked.
module.exports = {
  webcrypto: globalThis.crypto,
};
