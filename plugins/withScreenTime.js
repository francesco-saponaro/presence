/**
 * withScreenTime.js
 *
 * Expo Config Plugin — iOS
 * 1. Adds the com.apple.developer.family-controls entitlement.
 * 2. Adds NSFamilyControlsUsageDescription to Info.plist.
 * 3. Copies the Swift + ObjC bridge files into the generated Xcode project.
 * 4. Adds the copied source files to the Xcode build target.
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

/**
 * Step 1 – FamilyControls entitlement
 */
function withFamilyControlsEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.family-controls"] = true;
    return cfg;
  });
}

/**
 * Step 2 – Info.plist usage description
 */
function withFamilyControlsInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSFamilyControlsUsageDescription =
      "Presence uses Screen Time to shield distracting apps until you make a real connection.";
    return cfg;
  });
}

/**
 * Step 3 – Copy Swift/ObjC files into ios/<ProjectName>/
 */
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

/**
 * Step 4 – Add copied files to the Xcode project build phase
 */
function withAddFilesToXcode(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;

    for (const file of NATIVE_FILES) {
      const filePath = `${projectName}/${file}`;
      if (!xcodeProject.pbxFileByName(file)) {
        xcodeProject.addSourceFile(
          filePath,
          {},
          xcodeProject.getFirstTarget().uuid
        );
      }
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
