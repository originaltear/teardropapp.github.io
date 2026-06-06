/**
 * Dynamic Expo config.
 *
 * Expo loads app.json first and passes it here as `config`. We use this file to
 * inject secrets from environment variables so they never live in version control.
 *
 * Local builds read these from `.env` (gitignored). EAS builds read them from the
 * build profile `env` block in eas.json or from EAS environment variables/secrets.
 *
 *   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY  — Android Google Maps SDK key
 *
 * NOTE: keys prefixed EXPO_PUBLIC_ are embedded in the app binary and are NOT
 * secret from end users — anyone can extract them from the APK. Moving them out
 * of the repo only prevents them from being committed to GitHub. The real
 * protection is to restrict each key in its provider console (e.g. lock the Maps
 * key to this app's package name + signing SHA-1, and to the Maps SDK only).
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
