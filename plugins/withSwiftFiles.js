const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withCustomSwiftFiles = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = config.modRequest.platformProjectRoot;

      // The exact files we need to rescue from native-src
      const filesToCopy = [
        "PresenceScreenTime.swift",
        "PresenceOCR.swift",
        "PresenceScreenTime.m",
        "PresenceOCR.m",
      ];

      filesToCopy.forEach((file) => {
        const src = path.join(projectRoot, "native-src", file);
        const dest = path.join(iosRoot, file);

        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`✅ Copied ${file} to ios directory`);
        } else {
          console.warn(`⚠️ ${file} not found in native-src!`);
        }
      });

      return config;
    },
  ]);
};

module.exports = withCustomSwiftFiles;
