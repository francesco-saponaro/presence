/**
 * withAndroidBlocker.js
 *
 * Expo Config Plugin — Android
 * 1. Declares the BlockerService in AndroidManifest.xml.
 * 2. Adds ML Kit text-recognition dependency to app/build.gradle.
 * 3. Copies Kotlin module files into the generated Android project.
 * 4. Registers BlockerPackage and OCRPackage in MainApplication.kt.
 */

const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const KOTLIN_FILES = [
  "BlockerModule.kt",
  "BlockerPackage.kt",
  "BlockerService.kt",
  "OCRModule.kt",
  "OCRPackage.kt",
];

const PACKAGE_PATH = ["com", "franciccio", "presence"];

/** Step 1 – AndroidManifest: service declaration */
function withBlockerService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const application = manifest.application[0];

    if (!application.service) application.service = [];

    const alreadyDeclared = application.service.some(
      (s) => s.$["android:name"] === ".BlockerService"
    );

    if (!alreadyDeclared) {
      application.service.push({
        $: {
          "android:name": ".BlockerService",
          "android:enabled": "true",
          "android:exported": "false",
          "android:foregroundServiceType": "dataSync",
        },
      });
    }

    // Ensure FOREGROUND_SERVICE_DATA_SYNC is declared (Android 14+)
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = manifest["uses-permission"];
    const addPerm = (name) => {
      if (!perms.some((p) => p.$["android:name"] === name)) {
        perms.push({ $: { "android:name": name } });
      }
    };
    addPerm("android.permission.FOREGROUND_SERVICE_DATA_SYNC");

    return cfg;
  });
}

/** Step 2 – app/build.gradle: ML Kit dependency */
function withMLKitGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    const ml = "com.google.android.gms:play-services-mlkit-text-recognition:19.0.1";
    if (cfg.modResults.contents.includes(ml)) return cfg;

    // Target the dependencies block that appears INSIDE the android { } block.
    // Using a two-pass approach: find the android { } block, then append the
    // implementation line just before its closing brace so we never touch the
    // buildscript dependencies block at the top of the file.
    const androidBlockMatch = cfg.modResults.contents.match(/android\s*\{[\s\S]*?\ndependencies\s*\{/);
    if (androidBlockMatch) {
      // Insert right after the matched `dependencies {`
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(\nandroid\s*\{[\s\S]*?\ndependencies\s*\{)/,
        `$1\n    implementation '${ml}'`
      );
    } else {
      // Fallback: append to first dependencies block (standard single-block gradle)
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation '${ml}'`
      );
    }
    return cfg;
  });
}

/** Step 3 – Copy Kotlin files into the generated android project */
function withCopyKotlinFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(
        platformRoot,
        "app",
        "src",
        "main",
        "java",
        ...PACKAGE_PATH
      );
      const srcDir = path.join(cfg.modRequest.projectRoot, "modules", "android");

      fs.mkdirSync(destDir, { recursive: true });

      for (const file of KOTLIN_FILES) {
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

/** Step 4 – Patch MainApplication.kt to register the packages */
function withRegisterPackages(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const mainAppPath = path.join(
        platformRoot,
        "app",
        "src",
        "main",
        "java",
        ...PACKAGE_PATH,
        "MainApplication.kt"
      );

      if (!fs.existsSync(mainAppPath)) return cfg;

      let contents = fs.readFileSync(mainAppPath, "utf8");

      // Skip if already patched
      if (contents.includes("BlockerPackage()")) return cfg;

      // Insert package registrations after `val packages = PackageList(this).packages`
      contents = contents.replace(
        /val packages = PackageList\(this\)\.packages/,
        `val packages = PackageList(this).packages\n        packages.add(BlockerPackage())\n        packages.add(OCRPackage())`
      );

      fs.writeFileSync(mainAppPath, contents, "utf8");
      return cfg;
    },
  ]);
}

module.exports = function withAndroidBlocker(config) {
  config = withBlockerService(config);
  config = withMLKitGradle(config);
  config = withCopyKotlinFiles(config);
  config = withRegisterPackages(config);
  return config;
};
