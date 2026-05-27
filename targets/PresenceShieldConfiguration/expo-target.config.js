module.exports = {
  type: "shield-config",
  name: "PresenceShieldConfiguration",
  entitlements: {
    // Needed so the extension can read `appLanguage` from the shared App Group
    // UserDefaults (written by the main app) to localise the shield overlay.
    // Without this, UserDefaults(suiteName:) can't reach the shared container
    // and the shield falls back to English.
    "com.apple.security.application-groups": ["group.com.franciccio.presence"],
  },
  deploymentTarget: "16.0",
};
