const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const mobileNodeModules = path.resolve(__dirname, 'node_modules');

// Ensure React and React Query resolve from the mobile app's node_modules
// to avoid duplicate instances
config.resolver.extraNodeModules = {
  'react': path.resolve(mobileNodeModules, 'react'),
  'react-native': path.resolve(mobileNodeModules, 'react-native'),
  '@tanstack/react-query': path.resolve(mobileNodeModules, '@tanstack/react-query'),
};

// Ensure Metro resolves dependencies from this project's node_modules
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
];

// Block nested node_modules inside local modules to prevent TreeFS conflicts
config.resolver.blockList = [
  /node_modules\/quorum-crypto\/node_modules\/.*/,
];

module.exports = config;
