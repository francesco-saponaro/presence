module.exports = {
  type: "device-activity-monitor",
  name: "PresenceMonitor",
  entitlements: {
    "com.apple.developer.family-controls": true,
    "com.apple.security.application-groups": ["group.com.franciccio.presence"],
  },
  deploymentTarget: "16.0",
};
