// Dynamic Expo config that extends app.json
// This allows us to inject environment variables at build time

module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      // Preserve existing plugins from app.json
      ...(config.plugins || []),
      // Custom plugin to restore splash screen assets after prebuild
      './plugins/withCustomSplashScreen',
      // Video and audio support
      'expo-video',
      'expo-audio',
      // SQLite-backed message storage. See services/storage/messagesDb.ts.
      'expo-sqlite',
    ],
    extra: {
      ...config.extra,
      // QNS API URL - read from env or use production default
      qnsApiUrl: process.env.EXPO_PUBLIC_QNS_API_URL || 'https://names.quilibrium.com',
      // Quorum API URL - read from env or use production default
      quorumApiUrl: process.env.EXPO_PUBLIC_QUORUM_API_URL || 'https://api.quilibrium.com',
    },
  };
};
