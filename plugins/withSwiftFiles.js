const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withCustomSwiftFiles = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = config.modRequest.platformProjectRoot;

      // Define where the files live safely in your repo
      const srcScreenTime = path.join(
        projectRoot,
        "native-src",
        "PresenceScreenTime.swift",
      );
      const srcOCR = path.join(projectRoot, "native-src", "PresenceOCR.swift");

      // Define where Xcode is looking for them (based on your error log)
      const destScreenTime = path.join(iosRoot, "PresenceScreenTime.swift");
      const destOCR = path.join(iosRoot, "PresenceOCR.swift");

      // Copy the files into the generated iOS folder during prebuild
      if (fs.existsSync(srcScreenTime)) {
        fs.copyFileSync(srcScreenTime, destScreenTime);
        console.log("✅ Copied PresenceScreenTime.swift to ios directory");
      } else {
        console.warn("⚠️ PresenceScreenTime.swift not found in native-src!");
      }

      if (fs.existsSync(srcOCR)) {
        fs.copyFileSync(srcOCR, destOCR);
        console.log("✅ Copied PresenceOCR.swift to ios directory");
      } else {
        console.warn("⚠️ PresenceOCR.swift not found in native-src!");
      }

      return config;
    },
  ]);
};

module.exports = withCustomSwiftFiles;
