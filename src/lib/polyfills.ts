import 'react-native-get-random-values';
require('fast-text-encoding');

/**
 * H3 Spatial Engine Polyfills
 * 
 * H3-js v4 uses WASM and requires a TextDecoder that supports 'utf-16le'.
 * Expo's default implementation (winter/TextDecoder) does not support this.
 * We aggressively override the global TextEncoder and TextDecoder.
 */

// Use Object.defineProperty to ensure these aren't easily overridden by the environment
const defineProperty = (obj: any, prop: string, value: any) => {
    try {
        Object.defineProperty(obj, prop, {
            value,
            writable: false,
            configurable: true
        });
    } catch (e) {
        // Fallback for objects that don't support defineProperty
        obj[prop] = value;
    }
};

const targets = [];
if (typeof global !== 'undefined') targets.push(global);
if (typeof window !== 'undefined') targets.push(window);
if (typeof self !== 'undefined') targets.push(self);

if (targets.length > 0) {
    const FastText = require('fast-text-encoding');
    targets.forEach(target => {
        defineProperty(target, 'TextEncoder', FastText.TextEncoder);
        defineProperty(target, 'TextDecoder', FastText.TextDecoder);
    });
}
