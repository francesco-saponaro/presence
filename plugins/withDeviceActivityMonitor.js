const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const EXTENSION_NAME = "PresenceMonitor";
const APP_GROUP = "group.com.franciccio.presence";

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups =
      cfg.modResults["com.apple.security.application-groups"] ?? [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    cfg.modResults["com.apple.security.application-groups"] = groups;
    return cfg;
  });
}

function withExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const extDir = path.join(iosRoot, EXTENSION_NAME);
      fs.mkdirSync(extDir, { recursive: true });

      const swiftSrc = path.join(
        cfg.modRequest.projectRoot,
        "native-src",
        "PresenceMonitor.swift",
      );
      if (fs.existsSync(swiftSrc))
        fs.copyFileSync(swiftSrc, path.join(extDir, "PresenceMonitor.swift"));

      // CRITICAL FIX: The complete Info.plist that passes Xcode's ValidateEmbeddedBinary check
      fs.writeFileSync(
        path.join(extDir, `${EXTENSION_NAME}-Info.plist`),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>${EXTENSION_NAME}</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.deviceactivity.monitor</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).PresenceMonitor</string>
    </dict>
</dict>
</plist>`,
      );

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
</plist>`,
      );
      return cfg;
    },
  ]);
}

// function withExtensionTarget(config) {
//   return withXcodeProject(config, (cfg) => {
//     const xcodeProject = cfg.modResults;
//     const bundleId = cfg.ios?.bundleIdentifier ?? "com.franciccio.presence";
//     const extBundleId = `${bundleId}.${EXTENSION_NAME}`;

//     const existingTargets = Object.values(
//       xcodeProject.pbxNativeTargetSection(),
//     );
//     if (
//       existingTargets.some(
//         (t) =>
//           t &&
//           typeof t === "object" &&
//           (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`),
//       )
//     ) {
//       return cfg;
//     }

//     const extTarget = xcodeProject.addTarget(
//       EXTENSION_NAME,
//       "app_extension",
//       EXTENSION_NAME,
//       extBundleId,
//     );

//     const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
//     xcodeProject.addSourceFile(
//       `${EXTENSION_NAME}/PresenceMonitor.swift`,
//       { target: extTarget.uuid },
//       mainGroupKey,
//     );

//     let teamId = "";
//     const mainTarget = xcodeProject.getFirstTarget();
//     const mainConfigListUUID = mainTarget.firstTarget.buildConfigurationList;
//     const mainConfigList =
//       xcodeProject.pbxXCConfigurationList()[mainConfigListUUID];
//     if (mainConfigList) {
//       for (const conf of mainConfigList.buildConfigurations) {
//         const buildCfg =
//           xcodeProject.pbxXCBuildConfigurationSection()[conf.value];
//         if (
//           buildCfg &&
//           buildCfg.buildSettings &&
//           buildCfg.buildSettings.DEVELOPMENT_TEAM
//         ) {
//           teamId = buildCfg.buildSettings.DEVELOPMENT_TEAM;
//           break;
//         }
//       }
//     }

//     const extConfigListUUID = extTarget.pbxNativeTarget.buildConfigurationList;
//     const extConfigList =
//       xcodeProject.pbxXCConfigurationList()[extConfigListUUID];

//     if (extConfigList) {
//       extConfigList.buildConfigurations.forEach((c) => {
//         const buildCfg =
//           xcodeProject.pbxXCBuildConfigurationSection()[
//             typeof c === "object" ? c.value : c
//           ];
//         if (buildCfg && buildCfg.buildSettings) {
//           Object.assign(buildCfg.buildSettings, {
//             SWIFT_VERSION: "5.0",
//             PRODUCT_NAME: `"${EXTENSION_NAME}"`,
//             PRODUCT_BUNDLE_IDENTIFIER: `"${extBundleId}"`,
//             INFOPLIST_FILE: `"${EXTENSION_NAME}/${EXTENSION_NAME}-Info.plist"`,
//             CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements"`,
//             IPHONEOS_DEPLOYMENT_TARGET: "16.0",
//             SKIP_INSTALL: "YES",
//             APPLICATION_EXTENSION_API_ONLY: "YES",
//             ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "NO",
//             CODE_SIGN_STYLE: "Automatic",
//             TARGETED_DEVICE_FAMILY: `"1"`,
//             SWIFT_EMIT_LOC_STRINGS: "YES",
//             DEVELOPMENT_TEAM: teamId || '""',
//             MARKETING_VERSION: `"${config.version || "1.0.0"}"`,
//             CURRENT_PROJECT_VERSION: `"${config.ios?.buildNumber || "1"}"`,
//           });
//         }
//       });
//     }

//     const objects = xcodeProject.hash.project.objects;
//     let extProductRef = null;
//     Object.entries(objects["PBXNativeTarget"] || {}).forEach(([, t]) => {
//       if (
//         t &&
//         typeof t === "object" &&
//         (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`)
//       ) {
//         extProductRef = t.productReference;
//       }
//     });

//     if (extProductRef) {
//       const buildFileUUID = xcodeProject.generateUuid();
//       if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
//       objects["PBXBuildFile"][buildFileUUID] = {
//         isa: "PBXBuildFile",
//         fileRef: extProductRef,
//         fileRef_comment: `${EXTENSION_NAME}.appex`,
//         settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
//       };
//       objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
//         `${EXTENSION_NAME}.appex in Embed App Extensions`;

//       // CRITICAL FIX: Find the EXISTING Embed Extensions phase (dstSubfolderSpec: 13)
//       // This prevents the duplicate tasks error by merging into Expo's native pipeline.
//       let embedPhaseUUID = null;
//       let embedPhase = null;
//       if (objects["PBXCopyFilesBuildPhase"]) {
//         for (const [uuid, phase] of Object.entries(
//           objects["PBXCopyFilesBuildPhase"],
//         )) {
//           if (
//             phase &&
//             typeof phase === "object" &&
//             phase.dstSubfolderSpec === 13
//           ) {
//             embedPhaseUUID = uuid;
//             embedPhase = phase;
//             break;
//           }
//         }
//       }

//       if (embedPhase) {
//         // Safe Merge: Append to the existing phase
//         if (!embedPhase.files.some((f) => f.value === buildFileUUID)) {
//           embedPhase.files.push({
//             value: buildFileUUID,
//             comment: `${EXTENSION_NAME}.appex in ${embedPhase.name || "Embed App Extensions"}`,
//           });
//         }
//       } else {
//         // Fallback: Create it safely if it truly doesn't exist
//         embedPhaseUUID = xcodeProject.generateUuid();
//         embedPhase = {
//           isa: "PBXCopyFilesBuildPhase",
//           buildActionMask: 2147483647,
//           dstPath: `""`,
//           dstSubfolderSpec: 13,
//           files: [
//             {
//               value: buildFileUUID,
//               comment: `${EXTENSION_NAME}.appex in Embed App Extensions`,
//             },
//           ],
//           name: `"Embed App Extensions"`,
//           runOnlyForDeploymentPostprocessing: 0,
//         };
//         if (!objects["PBXCopyFilesBuildPhase"])
//           objects["PBXCopyFilesBuildPhase"] = {};
//         objects["PBXCopyFilesBuildPhase"][embedPhaseUUID] = embedPhase;
//         objects["PBXCopyFilesBuildPhase"][`${embedPhaseUUID}_comment`] =
//           "Embed App Extensions";

//         const mainTargetObj = objects["PBXNativeTarget"][mainTarget.uuid];
//         if (mainTargetObj && Array.isArray(mainTargetObj.buildPhases)) {
//           mainTargetObj.buildPhases.push({
//             value: embedPhaseUUID,
//             comment: "Embed App Extensions",
//           });
//         }
//       }

//       xcodeProject.addTargetDependency(mainTarget.uuid, [extTarget.uuid]);
//     }

//     return cfg;
//   });
// }
function withExtensionTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const bundleId = cfg.ios?.bundleIdentifier ?? "com.franciccio.presence";
    const extBundleId = `${bundleId}.${EXTENSION_NAME}`;

    const existingTargets = Object.values(
      xcodeProject.pbxNativeTargetSection(),
    );
    if (
      existingTargets.some(
        (t) =>
          t &&
          typeof t === "object" &&
          (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`),
      )
    ) {
      return cfg;
    }

    const extTarget = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME,
      extBundleId,
    );

    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const swiftFile = xcodeProject.addSourceFile(
      `${EXTENSION_NAME}/PresenceMonitor.swift`,
      { target: extTarget.uuid },
      mainGroupKey,
    );

    // --- SURGICAL FIX: FORCE SWIFT FILE INTO EXTENSION COMPILE PHASE ---
    const objects = xcodeProject.hash.project.objects;
    const mainTarget = xcodeProject.getFirstTarget();

    if (swiftFile && swiftFile.uuid) {
      const mainTargetObj = objects["PBXNativeTarget"][mainTarget.uuid];
      const extTargetObj = objects["PBXNativeTarget"][extTarget.uuid];

      // 1. Remove from Main App's Compile Phase (Fixes node-xcode bug)
      if (mainTargetObj && mainTargetObj.buildPhases) {
        for (const phase of mainTargetObj.buildPhases) {
          const phaseObj = objects["PBXSourcesBuildPhase"][phase.value];
          if (phaseObj && phaseObj.files) {
            phaseObj.files = phaseObj.files.filter(
              (f) => f.value !== swiftFile.uuid,
            );
          }
        }
      }

      // 2. Add strictly to Extension's Compile Phase so the binary is actually created
      if (extTargetObj && extTargetObj.buildPhases) {
        for (const phase of extTargetObj.buildPhases) {
          const phaseObj = objects["PBXSourcesBuildPhase"][phase.value];
          if (phaseObj && phaseObj.files) {
            if (!phaseObj.files.some((f) => f.value === swiftFile.uuid)) {
              phaseObj.files.push({
                value: swiftFile.uuid,
                comment: `PresenceMonitor.swift in Sources`,
              });
            }
          }
        }
      }
    }
    // -------------------------------------------------------------------

    let teamId = "";
    const mainConfigListUUID = mainTarget.firstTarget.buildConfigurationList;
    const mainConfigList =
      xcodeProject.pbxXCConfigurationList()[mainConfigListUUID];
    if (mainConfigList) {
      for (const conf of mainConfigList.buildConfigurations) {
        const buildCfg =
          xcodeProject.pbxXCBuildConfigurationSection()[conf.value];
        if (
          buildCfg &&
          buildCfg.buildSettings &&
          buildCfg.buildSettings.DEVELOPMENT_TEAM
        ) {
          teamId = buildCfg.buildSettings.DEVELOPMENT_TEAM;
          break;
        }
      }
    }

    const extConfigListUUID = extTarget.pbxNativeTarget.buildConfigurationList;
    const extConfigList =
      xcodeProject.pbxXCConfigurationList()[extConfigListUUID];

    if (extConfigList) {
      extConfigList.buildConfigurations.forEach((c) => {
        const buildCfg =
          xcodeProject.pbxXCBuildConfigurationSection()[
            typeof c === "object" ? c.value : c
          ];
        if (buildCfg && buildCfg.buildSettings) {
          Object.assign(buildCfg.buildSettings, {
            SWIFT_VERSION: "5.0",
            PRODUCT_NAME: `"${EXTENSION_NAME}"`,
            PRODUCT_BUNDLE_IDENTIFIER: `"${extBundleId}"`,
            INFOPLIST_FILE: `"${EXTENSION_NAME}/${EXTENSION_NAME}-Info.plist"`,
            CODE_SIGN_ENTITLEMENTS: `"${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements"`,
            IPHONEOS_DEPLOYMENT_TARGET: "16.0",
            SKIP_INSTALL: "YES",
            APPLICATION_EXTENSION_API_ONLY: "YES",
            ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "NO",
            CODE_SIGN_STYLE: "Automatic",
            TARGETED_DEVICE_FAMILY: `"1"`,
            SWIFT_EMIT_LOC_STRINGS: "YES",
            DEVELOPMENT_TEAM: teamId || '""',
            MARKETING_VERSION: `"${config.version || "1.0.0"}"`,
            CURRENT_PROJECT_VERSION: `"${config.ios?.buildNumber || "1"}"`,
            GENERATE_INFOPLIST_FILE: "NO",
            MACH_O_TYPE: '"mh_execute"',
            WRAPPER_EXTENSION: '"appex"',
            EXECUTABLE_NAME: '"$(PRODUCT_NAME)"',
            LD_RUNPATH_SEARCH_PATHS:
              '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
          });
        }
      });
    }

    let extProductRef = null;
    Object.entries(objects["PBXNativeTarget"] || {}).forEach(([, t]) => {
      if (
        t &&
        typeof t === "object" &&
        (t.name === EXTENSION_NAME || t.name === `"${EXTENSION_NAME}"`)
      ) {
        extProductRef = t.productReference;
      }
    });

    if (extProductRef) {
      const buildFileUUID = xcodeProject.generateUuid();
      if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
      objects["PBXBuildFile"][buildFileUUID] = {
        isa: "PBXBuildFile",
        fileRef: extProductRef,
        fileRef_comment: `${EXTENSION_NAME}.appex`,
        settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
      };
      objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
        `${EXTENSION_NAME}.appex in Embed App Extensions`;

      let embedPhaseUUID = null;
      let embedPhase = null;
      if (objects["PBXCopyFilesBuildPhase"]) {
        for (const [uuid, phase] of Object.entries(
          objects["PBXCopyFilesBuildPhase"],
        )) {
          if (
            phase &&
            typeof phase === "object" &&
            phase.dstSubfolderSpec === 13
          ) {
            embedPhaseUUID = uuid;
            embedPhase = phase;
            break;
          }
        }
      }

      if (embedPhase) {
        if (!embedPhase.files.some((f) => f.value === buildFileUUID)) {
          embedPhase.files.push({
            value: buildFileUUID,
            comment: `${EXTENSION_NAME}.appex in ${embedPhase.name || "Embed App Extensions"}`,
          });
        }
      } else {
        embedPhaseUUID = xcodeProject.generateUuid();
        embedPhase = {
          isa: "PBXCopyFilesBuildPhase",
          buildActionMask: 2147483647,
          dstPath: `""`,
          dstSubfolderSpec: 13,
          files: [
            {
              value: buildFileUUID,
              comment: `${EXTENSION_NAME}.appex in Embed App Extensions`,
            },
          ],
          name: `"Embed App Extensions"`,
          runOnlyForDeploymentPostprocessing: 0,
        };
        if (!objects["PBXCopyFilesBuildPhase"])
          objects["PBXCopyFilesBuildPhase"] = {};
        objects["PBXCopyFilesBuildPhase"][embedPhaseUUID] = embedPhase;
        objects["PBXCopyFilesBuildPhase"][`${embedPhaseUUID}_comment`] =
          "Embed App Extensions";

        const mainTargetObj = objects["PBXNativeTarget"][mainTarget.uuid];
        if (mainTargetObj && Array.isArray(mainTargetObj.buildPhases)) {
          mainTargetObj.buildPhases.push({
            value: embedPhaseUUID,
            comment: "Embed App Extensions",
          });
        }
      }

      xcodeProject.addTargetDependency(mainTarget.uuid, [extTarget.uuid]);
    }

    return cfg;
  });
}

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
        `${projectName}.xcscheme`,
      );

      if (fs.existsSync(schemePath)) {
        let scheme = fs.readFileSync(schemePath, "utf8");
        const extensionNamePattern = new RegExp(
          `BlueprintName\\s*=\\s*"${EXTENSION_NAME}"`,
        );
        scheme = scheme.replace(
          /<BuildActionEntry[^>]*>[\s\S]*?<\/BuildActionEntry>/g,
          (match) => (extensionNamePattern.test(match) ? "" : match),
        );
        fs.writeFileSync(schemePath, scheme, "utf8");
      }
      return cfg;
    },
  ]);
}

module.exports = function withDeviceActivityMonitor(config) {
  config = withAppGroupEntitlement(config);
  config = withExtensionFiles(config);
  config = withExtensionTarget(config);
  config = withExtensionScheme(config);
  return config;
};
