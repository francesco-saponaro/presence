/**
 * withScreenTime.js
 *
 * Expo Config Plugin — iOS
 * 1. Adds the com.apple.developer.family-controls entitlement.
 * 2. Adds NSFamilyControlsUsageDescription to Info.plist.
 * 3. Copies the Swift + ObjC bridge files into the generated Xcode project directory.
 * 4. Adds the copied source files to the Xcode build target's Sources phase.
 *
 * NOTE: xcodeProject.pbxFileByName() does NOT exist in the `xcode` npm package.
 *       Use findPBXGroupKey() + addSourceFile() instead. addSourceFile() is a no-op
 *       (returns false) when the file reference already exists, so it is safe to
 *       call on every prebuild without creating duplicates.
 */

const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const NATIVE_FILES = [
  "PresenceScreenTime.m",
  "PresenceScreenTime.swift",
  "PresenceOCR.m",
  "PresenceOCR.swift",
];

/** Step 1 – FamilyControls entitlement */
function withFamilyControlsEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.family-controls"] = true;
    return cfg;
  });
}

/** Step 2 – Info.plist usage description */
function withFamilyControlsInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSFamilyControlsUsageDescription =
      "Presence uses Screen Time to shield distracting apps until you make a real connection.";
    return cfg;
  });
}

/** Step 3 – Copy Swift/ObjC source files into ios/<ProjectName>/ */
function withCopyNativeFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectName = cfg.modRequest.projectName;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(platformRoot, projectName);
      const srcDir = path.join(cfg.modRequest.projectRoot, "modules", "ios");

      for (const file of NATIVE_FILES) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
      return cfg;
    },
  ]);
}

/** Step 4 – Register the copied files in the Xcode project Sources build phase */
function withAddFilesToXcode(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;

    // Locate the main app PBX group (the one named after the project).
    const groupKey = xcodeProject.findPBXGroupKey({ name: projectName });
    if (!groupKey) {
      console.warn(
        `[withScreenTime] Could not find PBX group "${projectName}" — skipping source file registration.`
      );
      return cfg;
    }

    for (const file of NATIVE_FILES) {
      // addSourceFile returns false (not throws) if the file reference already
      // exists in the project, making this call idempotent across prebuilds.
      xcodeProject.addSourceFile(file, {}, groupKey);
    }

    return cfg;
  });
}

module.exports = function withScreenTime(config) {
  config = withFamilyControlsEntitlement(config);
  config = withFamilyControlsInfoPlist(config);
  config = withCopyNativeFiles(config);
  config = withAddFilesToXcode(config);
  return config;
};
