/**
 * Turns on the two R8 settings Play lists as missing under "Optimer din apps
 * hukommelse og ydeevne med R8-optimering", measured against release 14:
 *
 *   R8-konfiguration
 *     ✅ Optimeret tilstand            (full mode, on by default since AGP 8.0)
 *     ✅ Ressourcekomprimering         (expo-build-properties)
 *     ⊖ Ressourcekomprimering er optimeret   ← this file
 *     ⊖ Klasser til ompakning                ← extraProguardRules in app.json
 *
 * Optimized resource shrinking hands resource shrinking to R8 so it sees code
 * and resources as one graph, instead of aapt2 keeping every resource that any
 * removed code might once have referenced. It arrived in AGP 8.12 behind this
 * flag and becomes the default in AGP 9.0, which Expo will bring later.
 *
 * expo-build-properties has no option for it, and android/ is generated fresh
 * by prebuild on EAS, so editing gradle.properties by hand would be thrown
 * away. A config plugin is the only place this survives.
 *
 * Release builds only, so it cannot be tested from the dev client: check the
 * next production build starts, its images and icons are intact, and that Play
 * reports both lines as enabled.
 */
const { withGradleProperties } = require('expo/config-plugins');

const PROPERTIES = [
  ['android.r8.optimizedResourceShrinking', 'true'],
];

module.exports = function withR8Extras(config) {
  return withGradleProperties(config, cfg => {
    for (const [key, value] of PROPERTIES) {
      const existing = cfg.modResults.find(
        item => item.type === 'property' && item.key === key,
      );
      if (existing) {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: 'property', key, value });
      }
    }
    return cfg;
  });
};
