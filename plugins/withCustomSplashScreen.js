/**
 * Expo Config Plugin: withCustomSplashScreen
 *
 * This plugin restores custom splash screen assets after prebuild.
 * It copies files from splash-assets/ to the appropriate ios/ and android/ locations.
 *
 * Usage: Add to app.config.js plugins array:
 *   plugins: [
 *     './plugins/withCustomSplashScreen',
 *     // ... other plugins
 *   ]
 */

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copy a file, creating parent directories if needed
 */
function copyFileSync(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * Copy a directory recursively
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * iOS: Copy custom splash screen storyboard and image assets
 */
function withCustomSplashScreenIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;

      // Paths
      const splashAssetsDir = path.join(projectRoot, 'splash-assets', 'ios');
      const appName = config.modRequest.projectName || 'Quorum';
      const iosAppDir = path.join(platformProjectRoot, appName);
      const imagesXcassetsDir = path.join(iosAppDir, 'Images.xcassets');

      // Check if splash assets exist
      if (!fs.existsSync(splashAssetsDir)) {
        console.log('[withCustomSplashScreen] No iOS splash assets found, skipping...');
        return config;
      }

      console.log('[withCustomSplashScreen] Copying iOS splash screen assets...');

      // Copy SplashScreen.storyboard
      const storyboardSrc = path.join(splashAssetsDir, 'SplashScreen.storyboard');
      const storyboardDest = path.join(iosAppDir, 'SplashScreen.storyboard');
      if (fs.existsSync(storyboardSrc)) {
        copyFileSync(storyboardSrc, storyboardDest);
        console.log('  - Copied SplashScreen.storyboard');
      }

      // Copy SplashScreenLogo.imageset
      const logoImagesetSrc = path.join(splashAssetsDir, 'SplashScreenLogo.imageset');
      const logoImagesetDest = path.join(imagesXcassetsDir, 'SplashScreenLogo.imageset');
      if (fs.existsSync(logoImagesetSrc)) {
        copyDirSync(logoImagesetSrc, logoImagesetDest);
        console.log('  - Copied SplashScreenLogo.imageset');
      }

      // Copy SplashScreenBackground.colorset
      const colorsetSrc = path.join(splashAssetsDir, 'SplashScreenBackground.colorset');
      const colorsetDest = path.join(imagesXcassetsDir, 'SplashScreenBackground.colorset');
      if (fs.existsSync(colorsetSrc)) {
        copyDirSync(colorsetSrc, colorsetDest);
        console.log('  - Copied SplashScreenBackground.colorset');
      }

      return config;
    },
  ]);
}

/**
 * Android: Copy custom splash screen drawables
 */
function withCustomSplashScreenAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;

      // Paths
      const splashAssetsDir = path.join(projectRoot, 'splash-assets', 'android');
      const resDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'res');

      // Check if splash assets exist
      if (!fs.existsSync(splashAssetsDir)) {
        console.log('[withCustomSplashScreen] No Android splash assets found, skipping...');
        return config;
      }

      console.log('[withCustomSplashScreen] Copying Android splash screen assets...');

      // Map of source file names to destination directories
      const densityMap = {
        'splashscreen_logo-mdpi.png': 'drawable-mdpi',
        'splashscreen_logo-hdpi.png': 'drawable-hdpi',
        'splashscreen_logo-xhdpi.png': 'drawable-xhdpi',
        'splashscreen_logo-xxhdpi.png': 'drawable-xxhdpi',
        'splashscreen_logo-xxxhdpi.png': 'drawable-xxxhdpi',
        'splashscreen_logo-night-mdpi.png': 'drawable-night-mdpi',
        'splashscreen_logo-night-hdpi.png': 'drawable-night-hdpi',
        'splashscreen_logo-night-xhdpi.png': 'drawable-night-xhdpi',
        'splashscreen_logo-night-xxhdpi.png': 'drawable-night-xxhdpi',
        'splashscreen_logo-night-xxxhdpi.png': 'drawable-night-xxxhdpi',
      };

      for (const [srcFileName, destDir] of Object.entries(densityMap)) {
        const srcPath = path.join(splashAssetsDir, srcFileName);
        const destPath = path.join(resDir, destDir, 'splashscreen_logo.png');

        if (fs.existsSync(srcPath)) {
          copyFileSync(srcPath, destPath);
          console.log(`  - Copied ${srcFileName} to ${destDir}/`);
        }
      }

      return config;
    },
  ]);
}

/**
 * Main plugin function
 */
function withCustomSplashScreen(config) {
  return withPlugins(config, [
    withCustomSplashScreenIOS,
    withCustomSplashScreenAndroid,
  ]);
}

module.exports = withCustomSplashScreen;
