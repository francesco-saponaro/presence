/**
 * withDeviceActivityMonitor.js
 *
 * Expo Config Plugin — iOS only
 *
 * Adds the PresenceMonitor DeviceActivityMonitor app extension to the Xcode
 * project so the OS can block apps at the scheduled time even when the main
 * Presence app is not running.
 *
 * What this plugin does:
 *   1. Adds the App Group entitlement to the main app target.
 *   2. Creates ios/PresenceMonitor/ with Info.plist, entitlements, and the
 *      Swift source (copied from native-src/PresenceMonitor.swift).
 *   3. Adds a new "app_extension" Xcode target for PresenceMonitor with the
 *      correct build settings and Swift source file.
 *      System frameworks (DeviceActivity, FamilyControls, ManagedSettings) are
 *      Swift auto-linked — no explicit addFramework() needed.
 *   4. Embeds the extension in the main app via a PBXCopyFilesBuildPhase.
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const EXTENSION_NAME = "PresenceMonitor";
const APP_GROUP = "group.com.franciccio.presence";

// ── Step 1: App Group entitlement on the main app ────────────────────────────

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups =
      cfg.modResults["com.apple.security.application-groups"] ?? [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    cfg.modResults["com.apple.security.application-groups"] = groups;
    return cfg;
  });
}

// ── Step 2: Write extension files to ios/PresenceMonitor/ ───────────────────

function withExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const bundleId =
        cfg.ios?.bundleIdentifier ?? "com.franciccio.presence";
      const extDir = path.join(iosRoot, EXTENSION_NAME);

      fs.mkdirSync(extDir, { recursive: true });

      // Swift source
      const swiftSrc = path.join(
        projectRoot,
        "native-src",
        "PresenceMonitor.swift"
      );
      if (fs.existsSync(swiftSrc)) {
        fs.copyFileSync(swiftSrc, path.join(extDir, "PresenceMonitor.swift"));
        console.log("✅ Copied PresenceMonitor.swift to ios/PresenceMonitor/");
      } else {
        console.warn(
          "⚠️  native-src/PresenceMonitor.swift not found — extension will not compile"
        );
      }

      // Info.plist
      fs.writeFileSync(
        path.join(extDir, "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.deviceactivity.monitor</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).PresenceMonitor</string>
    </dict>
</dict>
</plist>`
      );

      // Extension entitlements
      fs.writeFileSync(
        path.join(extDir, `${EXTENSION_NAME}.entitlements`),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.family-controls</key>
    <true/>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>`
      );

      return cfg;
    },
  ]);
}

// ── Step 3 & 4: Add Xcode target + embed phase ───────────────────────────────

function withExtensionTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const bundleId =
      cfg.ios?.bundleIdentifier ?? "com.franciccio.presence";
    const extBundleId = `${bundleId}.${EXTENSION_NAME}`;

    // ── Idempotency check ──────────────────────────────────────────────────
    const existingTargets = Object.values(
      xcodeProject.pbxNativeTargetSection()
    );
    const alreadyExists = existingTargets.some(
      (t) =>
        t &&
        typeof t === "object" &&
        (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`)
    );
    if (alreadyExists) {
      console.log(
        `[withDeviceActivityMonitor] target ${EXTENSION_NAME} already present — skipping`
      );
      return cfg;
    }

    // ── Create extension target ────────────────────────────────────────────
    const extTarget = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME,
      extBundleId
    );

    if (!extTarget) {
      console.warn(
        "[withDeviceActivityMonitor] addTarget() returned null — skipping"
      );
      return cfg;
    }

    // ── Add Swift source to the extension's Sources build phase ───────────
    const groupKey = xcodeProject.findPBXGroupKey({ name: EXTENSION_NAME });
    if (groupKey) {
      xcodeProject.addSourceFile(
        "PresenceMonitor.swift",
        { target: extTarget.uuid },
        groupKey
      );
    }

    // ── Configure build settings ───────────────────────────────────────────
    const configListUUID =
      extTarget.pbxNativeTarget.buildConfigurationList;
    const allConfigLists = xcodeProject.pbxXCConfigurationList();
    const extConfigList = allConfigLists[configListUUID];

    if (extConfigList) {
      const buildConfigUUIDs = extConfigList.buildConfigurations.map((c) =>
        typeof c === "object" ? c.value : c
      );

      buildConfigUUIDs.forEach((uuid) => {
        const allConfigs = xcodeProject.pbxXCBuildConfigurationSection();
        const buildCfg = allConfigs[uuid];
        if (!buildCfg || !buildCfg.buildSettings) return;

        Object.assign(buildCfg.buildSettings, {
          SWIFT_VERSION: "5.0",
          PRODUCT_NAME: `"${EXTENSION_NAME}"`,
          PRODUCT_BUNDLE_IDENTIFIER: `"${extBundleId}"`,
          INFOPLIST_FILE: `"${EXTENSION_NAME}/Info.plist"`,
          CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements"`,
          IPHONEOS_DEPLOYMENT_TARGET: "16.0",
          SKIP_INSTALL: "YES",
          APPLICATION_EXTENSION_API_ONLY: "YES",
          ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "NO",
          CODE_SIGN_STYLE: "Automatic",
          TARGETED_DEVICE_FAMILY: `"1"`,
          SWIFT_EMIT_LOC_STRINGS: "YES",
        });
      });
    }

    // NOTE: DeviceActivity, FamilyControls, ManagedSettings are Apple system
    // frameworks — Swift auto-links them when imported. Adding them explicitly
    // via addFramework() caused "Unexpected duplicate tasks" errors because
    // calling addFramework without a target adds to ALL targets' Frameworks
    // phases, duplicating entries for the extension target. Omitting is correct.

    // ── Embed extension in main app ────────────────────────────────────────
    try {
      const objects = xcodeProject.hash.project.objects;

      // Find main native target (first target = the app)
      const mainTarget = xcodeProject.getFirstTarget();
      const mainTargetUUID = mainTarget.uuid;

      // Find the extension's product file reference
      const nativeTargets = objects["PBXNativeTarget"] || {};
      let extProductRef = null;
      Object.entries(nativeTargets).forEach(([, t]) => {
        if (
          t &&
          typeof t === "object" &&
          (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`)
        ) {
          extProductRef = t.productReference;
        }
      });

      if (!extProductRef) {
        console.warn(
          "[withDeviceActivityMonitor] Could not find extension product reference — embed skipped"
        );
        return cfg;
      }

      // Create a PBXBuildFile for the extension appex
      const buildFileUUID = xcodeProject.generateUuid();
      if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
      objects["PBXBuildFile"][buildFileUUID] = {
        isa: "PBXBuildFile",
        fileRef: extProductRef,
        fileRef_comment: `${EXTENSION_NAME}.appex`,
        settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
      };
      objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
        `${EXTENSION_NAME}.appex in Embed Foundation Extensions`;

      // Create the PBXCopyFilesBuildPhase
      const embedPhaseUUID = xcodeProject.generateUuid();
      if (!objects["PBXCopyFilesBuildPhase"])
        objects["PBXCopyFilesBuildPhase"] = {};
      objects["PBXCopyFilesBuildPhase"][embedPhaseUUID] = {
        isa: "PBXCopyFilesBuildPhase",
        buildActionMask: 2147483647,
        dstPath: `""`,
        dstSubfolderSpec: 13, // 13 = PlugIns (app extensions)
        files: [
          {
            value: buildFileUUID,
            comment: `${EXTENSION_NAME}.appex in Embed Foundation Extensions`,
          },
        ],
        name: `"Embed Foundation Extensions"`,
        runOnlyForDeploymentPostprocessing: 0,
      };
      objects["PBXCopyFilesBuildPhase"][`${embedPhaseUUID}_comment`] =
        "Embed Foundation Extensions";

      // Append embed phase to main target's buildPhases array
      const mainTargetObj =
        objects["PBXNativeTarget"][mainTargetUUID] ||
        objects["PBXNativeTarget"][
          Object.keys(objects["PBXNativeTarget"]).find(
            (k) => objects["PBXNativeTarget"][k].name === projectName ||
                   objects["PBXNativeTarget"][k].name === `"${projectName}"`
          )
        ];

      if (mainTargetObj && Array.isArray(mainTargetObj.buildPhases)) {
        mainTargetObj.buildPhases.push({
          value: embedPhaseUUID,
          comment: "Embed Foundation Extensions",
        });
      }

      // Add extension as a target dependency of the main app
      xcodeProject.addTargetDependency(mainTargetUUID, [extTarget.uuid]);

      console.log(
        `✅ PresenceMonitor extension target added and embedded in ${projectName}`
      );
    } catch (e) {
      console.warn(
        `[withDeviceActivityMonitor] embed phase setup failed: ${e.message}`
      );
    }

    return cfg;
  });
}

// ── Step 5: Remove extension from scheme's direct build targets ──────────────
//
// addTarget() adds PresenceMonitor to PBXProject.targets, so Expo's prebuild
// includes it in the generated scheme as a direct build target.  When Xcode
// then archives the "Presence" scheme it tries to build PresenceMonitor both
// (a) directly as a scheme target, and (b) again as a dependency of Presence
// (via addTargetDependency).  This produces the "Unexpected duplicate tasks"
// error.  Removing it from the scheme's BuildActionEntries means it only ever
// builds as a dependency — which is the correct behaviour for an app extension.

function withExtensionScheme(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const projectName = cfg.modRequest.projectName;
      const schemePath = path.join(
        iosRoot,
        `${projectName}.xcodeproj`,
        "xcshareddata",
        "xcschemes",
        `${projectName}.xcscheme`
      );

      if (!fs.existsSync(schemePath)) {
        console.log(
          "[withDeviceActivityMonitor] scheme file not found — skipping"
        );
        return cfg;
      }

      let scheme = fs.readFileSync(schemePath, "utf8");
      const before = scheme;

      // Remove any BuildActionEntry whose BuildableReference names our extension.
      // The entry spans multiple lines so we use the 's' (dotAll) flag.
      scheme = scheme.replace(
        /<BuildActionEntry[^>]*>[\s\S]*?<\/BuildActionEntry>/g,
        (match) =>
          match.includes(`BlueprintName="${EXTENSION_NAME}"`) ? "" : match
      );

      if (scheme !== before) {
        fs.writeFileSync(schemePath, scheme, "utf8");
        console.log(
          `✅ Removed ${EXTENSION_NAME} from scheme BuildActionEntries`
        );
      }

      return cfg;
    },
  ]);
}

// NOTE: withExtensionPodfile was removed.
//
// PresenceMonitor uses ONLY Apple system frameworks (DeviceActivity,
// FamilyControls, ManagedSettings) — it has zero pod dependencies.
// CocoaPods only errors about "Unable to find host target(s)" when an
// extension IS declared in the Podfile but without a proper host target
// nesting.  If the extension is absent from the Podfile entirely, CocoaPods
// never processes it and never looks for a host — no error.
// Xcode still finds and builds the target from the .pbxproj, so nothing
// breaks at compile time.

// ── Export ───────────────────────────────────────────────────────────────────

module.exports = function withDeviceActivityMonitor(config) {
  config = withAppGroupEntitlement(config);
  config = withExtensionFiles(config);
  config = withExtensionTarget(config);
  config = withExtensionScheme(config);
  return config;
};
