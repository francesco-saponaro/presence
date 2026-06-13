module.exports = {
  type: "shield-action",
  name: "PresenceShieldAction",
  entitlements: {
    // Same App Group as the ShieldConfiguration extension so the two stay in
    // lockstep (Configuration sets the button label, Action handles the tap).
    // We don't actually read App Group data in this extension yet, but keeping
    // the entitlement set means future changes (e.g. reading the active locale
    // to localise a confirmation toast) won't need provisioning churn.
    "com.apple.security.application-groups": ["group.com.franciccio.presence"],
  },
  deploymentTarget: "16.0",
};
