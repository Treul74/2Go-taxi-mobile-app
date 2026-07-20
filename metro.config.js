const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// React Native has no built-in `crypto` module. @insforge/sdk's OAuth PKCE
// helper falls back to `import('crypto')` when `globalThis.crypto.subtle` is
// missing, which Metro otherwise fails to resolve. See src/lib/nodeCryptoShim.js.
const cryptoShimPath = path.resolve(__dirname, 'src/lib/nodeCryptoShim.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: cryptoShimPath,
};

const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'crypto') {
    return { type: 'sourceFile', filePath: cryptoShimPath };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });

