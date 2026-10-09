/**
 * with-arm64-only — production APK ABI restriction.
 *
 * The React Native Gradle template packages every ABI listed in the
 * `reactNativeArchitectures` Gradle property (default:
 * `armeabi-v7a,arm64-v8a,x86,x86_64`). The Hibbullah production APK is
 * distributed directly to phones from the showcase website, so the
 * emulator-only x86/x86_64 slices (~49 MB) and the legacy 32-bit
 * armeabi-v7a slice (~16 MB) are dead weight.
 *
 * This plugin narrows the property to `arm64-v8a` during `expo prebuild`,
 * so the EAS `production-apk` profile packages arm64-v8a only. It touches
 * nothing else: no source, no dependencies, no runtimeVersion, no channel.
 */
const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withArm64Only(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => item.key !== 'reactNativeArchitectures',
    );
    config.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'arm64-v8a',
    });
    return config;
  });
};
