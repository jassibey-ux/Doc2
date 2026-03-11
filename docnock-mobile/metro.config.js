/* eslint-disable @typescript-eslint/no-var-requires */
const os = require('os');
// Shim or fallback if availableParallelism isn't present
if (typeof os.availableParallelism !== 'function') {
  os.availableParallelism = () => {
    const cpus = require('os').cpus() || [];
    return cpus.length > 0 ? cpus.length : 1;
  };
}

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  // You can override or add additional fields here if needed
  // e.g. transformer, resolver, etc.
};

const merged = mergeConfig(getDefaultConfig(__dirname), customConfig);

module.exports = wrapWithReanimatedMetroConfig(merged);
