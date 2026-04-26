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

function withExtension(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const iosRoot = cfg.modRequest.platformProjectRoot;
    const extDir = path.join(iosRoot, EXTENSION_NAME);

    // 1. FILE CREATION
    fs.mkdirSync(extDir, { recursive: true });

    const swiftSrc = path.join(
      cfg.modRequest.projectRoot,
      "native-src",
      "PresenceMonitor.swift",
    );
    if (fs.existsSync(swiftSrc)) {
      fs.copyFileSync(swiftSrc, path.join(extDir, "PresenceMonitor.swift"));
    }

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

    // 2. TARGET CREATION
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
      return cfg; // Abort early to prevent target duplication
    }

    const extTarget = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME,
      extBundleId,
    );
    const objects = xcodeProject.hash.project.objects;
    const mainTarget = xcodeProject.getFirstTarget();
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;

    // 3. FILE INJECTION
    const fileRefUUID = xcodeProject.generateUuid();
    if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
    objects["PBXFileReference"][fileRefUUID] = {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      name: `"PresenceMonitor.swift"`,
      path: `"${EXTENSION_NAME}/PresenceMonitor.swift"`,
      sourceTree: `"<group>"`,
    };
    objects["PBXFileReference"][`${fileRefUUID}_comment`] =
      "PresenceMonitor.swift";

    const buildFileUUID = xcodeProject.generateUuid();
    if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
    objects["PBXBuildFile"][buildFileUUID] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUUID,
    };
    objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
      "PresenceMonitor.swift in Sources";

    if (objects["PBXGroup"] && objects["PBXGroup"][mainGroupKey]) {
      if (!objects["PBXGroup"][mainGroupKey].children)
        objects["PBXGroup"][mainGroupKey].children = [];
      objects["PBXGroup"][mainGroupKey].children.push({
        value: fileRefUUID,
        comment: "PresenceMonitor.swift",
      });
    }

    const extTargetObj = objects["PBXNativeTarget"][extTarget.uuid];
    if (extTargetObj && extTargetObj.buildPhases) {
      for (const phase of extTargetObj.buildPhases) {
        const phaseObj = objects["PBXSourcesBuildPhase"][phase.value];
        if (phaseObj) {
          if (!phaseObj.files) phaseObj.files = [];
          phaseObj.files.push({
            value: buildFileUUID,
            comment: "PresenceMonitor.swift in Sources",
          });
        }
      }
    }

    // 4. APPLY BUILD SETTINGS
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
          const newSettings = {
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
            MARKETING_VERSION: `"${config.version || "1.0.0"}"`,
            CURRENT_PROJECT_VERSION: `"${config.ios?.buildNumber || "1"}"`,
            GENERATE_INFOPLIST_FILE: "NO",
            MACH_O_TYPE: '"mh_execute"',
            WRAPPER_EXTENSION: '"appex"',
            EXECUTABLE_NAME: '"$(PRODUCT_NAME)"',
            LD_RUNPATH_SEARCH_PATHS:
              '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
          };

          // Only assign team ID if it exists. DO NOT inject an empty string.
          if (teamId) {
            newSettings.DEVELOPMENT_TEAM = teamId;
          }

          Object.assign(buildCfg.buildSettings, newSettings);
        }
      });
    }

    // 5. EMBED EXTENSION WITHOUT DUPLICATES
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
      const embedBuildFileUUID = xcodeProject.generateUuid();
      if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
      objects["PBXBuildFile"][embedBuildFileUUID] = {
        isa: "PBXBuildFile",
        fileRef: extProductRef,
        fileRef_comment: `${EXTENSION_NAME}.appex`,
        settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
      };
      objects["PBXBuildFile"][`${embedBuildFileUUID}_comment`] =
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
        // Scrub ANY existing references to this specific extension to prevent fastlane "Duplicate File" crash
        if (embedPhase.files) {
          embedPhase.files = embedPhase.files.filter((f) => {
            const fileObj = objects["PBXBuildFile"][f.value];
            return !fileObj || fileObj.fileRef !== extProductRef;
          });
        } else {
          embedPhase.files = [];
        }

        embedPhase.files.push({
          value: embedBuildFileUUID,
          comment: `${EXTENSION_NAME}.appex in ${embedPhase.name || "Embed App Extensions"}`,
        });
      } else {
        embedPhaseUUID = xcodeProject.generateUuid();
        embedPhase = {
          isa: "PBXCopyFilesBuildPhase",
          buildActionMask: 2147483647,
          dstPath: `""`,
          dstSubfolderSpec: 13,
          files: [
            {
              value: embedBuildFileUUID,
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

// FIX: Patch the Podfile to disable code signing on resource bundle targets.
// Required since Xcode 14 — otherwise archive fails with:
// "resource bundles are signed by default, which requires setting the development team"
function withPodfilePostInstall(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      if (!fs.existsSync(podfilePath)) return cfg;

      let contents = fs.readFileSync(podfilePath, "utf8");

      const marker = "# PRESENCE_RESOURCE_BUNDLE_FIX";
      if (contents.includes(marker)) return cfg;

      const snippet = `
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        # Disable code signing for resource bundles (Xcode 14+ fix)
        if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"
          bc.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
          bc.build_settings['CODE_SIGN_IDENTITY'] = ''
          bc.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ''
          bc.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
        end
        # Bump deployment target to match the extension
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < 16.0
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
        end
      end
    end
`;

      if (contents.match(/post_install\s+do\s+\|installer\|/)) {
        contents = contents.replace(
          /(post_install\s+do\s+\|installer\|)/,
          `$1\n${snippet}`,
        );
      } else {
        contents += `\npost_install do |installer|\n${snippet}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents, "utf8");
      return cfg;
    },
  ]);
}

module.exports = function withDeviceActivityMonitor(config) {
  config = withAppGroupEntitlement(config);
  config = withExtension(config);
  config = withExtensionScheme(config);
  config = withPodfilePostInstall(config);
  return config;
};

// const {
//   withXcodeProject,
//   withEntitlementsPlist,
//   withDangerousMod,
// } = require("@expo/config-plugins");
// const path = require("path");
// const fs = require("fs");

// const EXTENSION_NAME = "PresenceMonitor";
// const APP_GROUP = "group.com.franciccio.presence";

// function withAppGroupEntitlement(config) {
//   return withEntitlementsPlist(config, (cfg) => {
//     const groups =
//       cfg.modResults["com.apple.security.application-groups"] ?? [];
//     if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
//     cfg.modResults["com.apple.security.application-groups"] = groups;
//     return cfg;
//   });
// }

// function withExtensionFiles(config) {
//   return withDangerousMod(config, [
//     "ios",
//     async (cfg) => {
//       const iosRoot = cfg.modRequest.platformProjectRoot;
//       const extDir = path.join(iosRoot, EXTENSION_NAME);
//       fs.mkdirSync(extDir, { recursive: true });

//       const swiftSrc = path.join(
//         cfg.modRequest.projectRoot,
//         "native-src",
//         "PresenceMonitor.swift",
//       );
//       if (fs.existsSync(swiftSrc))
//         fs.copyFileSync(swiftSrc, path.join(extDir, "PresenceMonitor.swift"));

//       fs.writeFileSync(
//         path.join(extDir, `${EXTENSION_NAME}-Info.plist`),
//         `<?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
// <plist version="1.0">
// <dict>
//     <key>CFBundleDevelopmentRegion</key>
//     <string>$(DEVELOPMENT_LANGUAGE)</string>
//     <key>CFBundleDisplayName</key>
//     <string>${EXTENSION_NAME}</string>
//     <key>CFBundleExecutable</key>
//     <string>$(EXECUTABLE_NAME)</string>
//     <key>CFBundleIdentifier</key>
//     <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
//     <key>CFBundleInfoDictionaryVersion</key>
//     <string>6.0</string>
//     <key>CFBundleName</key>
//     <string>$(PRODUCT_NAME)</string>
//     <key>CFBundlePackageType</key>
//     <string>XPC!</string>
//     <key>CFBundleShortVersionString</key>
//     <string>$(MARKETING_VERSION)</string>
//     <key>CFBundleVersion</key>
//     <string>$(CURRENT_PROJECT_VERSION)</string>
//     <key>NSExtension</key>
//     <dict>
//         <key>NSExtensionPointIdentifier</key>
//         <string>com.apple.deviceactivity.monitor</string>
//         <key>NSExtensionPrincipalClass</key>
//         <string>$(PRODUCT_MODULE_NAME).PresenceMonitor</string>
//     </dict>
// </dict>
// </plist>`,
//       );

//       fs.writeFileSync(
//         path.join(extDir, `${EXTENSION_NAME}.entitlements`),
//         `<?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
// <plist version="1.0">
// <dict>
//     <key>com.apple.developer.family-controls</key>
//     <true/>
//     <key>com.apple.security.application-groups</key>
//     <array>
//         <string>${APP_GROUP}</string>
//     </array>
// </dict>
// </plist>`,
//       );
//       return cfg;
//     },
//   ]);
// }

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

//     const objects = xcodeProject.hash.project.objects;
//     const mainTarget = xcodeProject.getFirstTarget();
//     const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;

//     // --- BULLETPROOF MANUAL SOURCE INJECTION ---
//     // NO addSourceFile(). This manually writes the Swift file to Xcode's brain.
//     const fileRefUUID = xcodeProject.generateUuid();
//     if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
//     objects["PBXFileReference"][fileRefUUID] = {
//       isa: "PBXFileReference",
//       lastKnownFileType: "sourcecode.swift",
//       name: `"PresenceMonitor.swift"`,
//       path: `"${EXTENSION_NAME}/PresenceMonitor.swift"`,
//       sourceTree: `"<group>"`,
//     };
//     objects["PBXFileReference"][`${fileRefUUID}_comment`] =
//       "PresenceMonitor.swift";

//     const buildFileUUID = xcodeProject.generateUuid();
//     if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
//     objects["PBXBuildFile"][buildFileUUID] = {
//       isa: "PBXBuildFile",
//       fileRef: fileRefUUID,
//     };
//     objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
//       "PresenceMonitor.swift in Sources";

//     // Attach to the main file group so Xcode knows it exists
//     if (objects["PBXGroup"] && objects["PBXGroup"][mainGroupKey]) {
//       if (!objects["PBXGroup"][mainGroupKey].children)
//         objects["PBXGroup"][mainGroupKey].children = [];
//       objects["PBXGroup"][mainGroupKey].children.push({
//         value: fileRefUUID,
//         comment: "PresenceMonitor.swift",
//       });
//     }

//     // Force the file into the Extension's compile phase!
//     const extTargetObj = objects["PBXNativeTarget"][extTarget.uuid];
//     if (extTargetObj && extTargetObj.buildPhases) {
//       for (const phase of extTargetObj.buildPhases) {
//         const phaseObj = objects["PBXSourcesBuildPhase"][phase.value];
//         if (phaseObj) {
//           if (!phaseObj.files) phaseObj.files = [];
//           phaseObj.files.push({
//             value: buildFileUUID,
//             comment: "PresenceMonitor.swift in Sources",
//           });
//         }
//       }
//     }
//     // -------------------------------------------------------------------

//     let teamId = "";
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
//             GENERATE_INFOPLIST_FILE: "NO",

//             // THE COMMANDS THAT FORCE THE BINARY TO COMPILE
//             MACH_O_TYPE: '"mh_execute"',
//             WRAPPER_EXTENSION: '"appex"',
//             EXECUTABLE_NAME: '"$(PRODUCT_NAME)"',
//             LD_RUNPATH_SEARCH_PATHS:
//               '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
//           });
//         }
//       });
//     }

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
//       const embedBuildFileUUID = xcodeProject.generateUuid();
//       if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
//       objects["PBXBuildFile"][embedBuildFileUUID] = {
//         isa: "PBXBuildFile",
//         fileRef: extProductRef,
//         fileRef_comment: `${EXTENSION_NAME}.appex`,
//         settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
//       };
//       objects["PBXBuildFile"][`${embedBuildFileUUID}_comment`] =
//         `${EXTENSION_NAME}.appex in Embed App Extensions`;

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
//         if (!embedPhase.files.some((f) => f.value === embedBuildFileUUID)) {
//           embedPhase.files.push({
//             value: embedBuildFileUUID,
//             comment: `${EXTENSION_NAME}.appex in ${embedPhase.name || "Embed App Extensions"}`,
//           });
//         }
//       } else {
//         embedPhaseUUID = xcodeProject.generateUuid();
//         embedPhase = {
//           isa: "PBXCopyFilesBuildPhase",
//           buildActionMask: 2147483647,
//           dstPath: `""`,
//           dstSubfolderSpec: 13,
//           files: [
//             {
//               value: embedBuildFileUUID,
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

// function withExtensionScheme(config) {
//   return withDangerousMod(config, [
//     "ios",
//     async (cfg) => {
//       const iosRoot = cfg.modRequest.platformProjectRoot;
//       const projectName = cfg.modRequest.projectName;
//       const schemePath = path.join(
//         iosRoot,
//         `${projectName}.xcodeproj`,
//         "xcshareddata",
//         "xcschemes",
//         `${projectName}.xcscheme`,
//       );

//       if (fs.existsSync(schemePath)) {
//         let scheme = fs.readFileSync(schemePath, "utf8");
//         const extensionNamePattern = new RegExp(
//           `BlueprintName\\s*=\\s*"${EXTENSION_NAME}"`,
//         );
//         scheme = scheme.replace(
//           /<BuildActionEntry[^>]*>[\s\S]*?<\/BuildActionEntry>/g,
//           (match) => (extensionNamePattern.test(match) ? "" : match),
//         );
//         fs.writeFileSync(schemePath, scheme, "utf8");
//       }
//       return cfg;
//     },
//   ]);
// }

// module.exports = function withDeviceActivityMonitor(config) {
//   config = withAppGroupEntitlement(config);
//   config = withExtensionFiles(config);
//   config = withExtensionTarget(config);
//   config = withExtensionScheme(config);
//   return config;
// };

// const {
//   withXcodeProject,
//   withEntitlementsPlist,
//   withDangerousMod,
// } = require("@expo/config-plugins");
// const path = require("path");
// const fs = require("fs");

// const EXTENSION_NAME = "PresenceMonitor";
// const APP_GROUP = "group.com.franciccio.presence";

// function withAppGroupEntitlement(config) {
//   return withEntitlementsPlist(config, (cfg) => {
//     const groups =
//       cfg.modResults["com.apple.security.application-groups"] ?? [];
//     if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
//     cfg.modResults["com.apple.security.application-groups"] = groups;
//     return cfg;
//   });
// }

// function withExtensionFiles(config) {
//   return withDangerousMod(config, [
//     "ios",
//     async (cfg) => {
//       const iosRoot = cfg.modRequest.platformProjectRoot;
//       const extDir = path.join(iosRoot, EXTENSION_NAME);
//       fs.mkdirSync(extDir, { recursive: true });

//       const swiftSrc = path.join(
//         cfg.modRequest.projectRoot,
//         "native-src",
//         "PresenceMonitor.swift",
//       );
//       if (fs.existsSync(swiftSrc))
//         fs.copyFileSync(swiftSrc, path.join(extDir, "PresenceMonitor.swift"));

//       // CRITICAL FIX: The complete Info.plist that passes Xcode's ValidateEmbeddedBinary check
//       fs.writeFileSync(
//         path.join(extDir, `${EXTENSION_NAME}-Info.plist`),
//         `<?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
// <plist version="1.0">
// <dict>
//     <key>CFBundleDevelopmentRegion</key>
//     <string>$(DEVELOPMENT_LANGUAGE)</string>
//     <key>CFBundleDisplayName</key>
//     <string>${EXTENSION_NAME}</string>
//     <key>CFBundleExecutable</key>
//     <string>$(EXECUTABLE_NAME)</string>
//     <key>CFBundleIdentifier</key>
//     <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
//     <key>CFBundleInfoDictionaryVersion</key>
//     <string>6.0</string>
//     <key>CFBundleName</key>
//     <string>$(PRODUCT_NAME)</string>
//     <key>CFBundlePackageType</key>
//     <string>XPC!</string>
//     <key>CFBundleShortVersionString</key>
//     <string>$(MARKETING_VERSION)</string>
//     <key>CFBundleVersion</key>
//     <string>$(CURRENT_PROJECT_VERSION)</string>
//     <key>NSExtension</key>
//     <dict>
//         <key>NSExtensionPointIdentifier</key>
//         <string>com.apple.deviceactivity.monitor</string>
//         <key>NSExtensionPrincipalClass</key>
//         <string>$(PRODUCT_MODULE_NAME).PresenceMonitor</string>
//     </dict>
// </dict>
// </plist>`,
//       );

//       fs.writeFileSync(
//         path.join(extDir, `${EXTENSION_NAME}.entitlements`),
//         `<?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
// <plist version="1.0">
// <dict>
//     <key>com.apple.developer.family-controls</key>
//     <true/>
//     <key>com.apple.security.application-groups</key>
//     <array>
//         <string>${APP_GROUP}</string>
//     </array>
// </dict>
// </plist>`,
//       );
//       return cfg;
//     },
//   ]);
// }

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
//     const objects = xcodeProject.hash.project.objects;
//     const mainTarget = xcodeProject.getFirstTarget();
//     const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;

//     // --- BULLETPROOF MANUAL SOURCE INJECTION ---
//     // We completely delete xcodeProject.addSourceFile() because it silently fails.
//     // This explicitly writes the Swift file directly into the Xcode project JSON.
//     const fileRefUUID = xcodeProject.generateUuid();
//     if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
//     objects["PBXFileReference"][fileRefUUID] = {
//       isa: "PBXFileReference",
//       lastKnownFileType: "sourcecode.swift",
//       name: `"PresenceMonitor.swift"`,
//       path: `"${EXTENSION_NAME}/PresenceMonitor.swift"`,
//       sourceTree: `"<group>"`,
//     };
//     objects["PBXFileReference"][`${fileRefUUID}_comment`] =
//       "PresenceMonitor.swift";

//     const buildFileUUID = xcodeProject.generateUuid();
//     if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
//     objects["PBXBuildFile"][buildFileUUID] = {
//       isa: "PBXBuildFile",
//       fileRef: fileRefUUID,
//     };
//     objects["PBXBuildFile"][`${buildFileUUID}_comment`] =
//       "PresenceMonitor.swift in Sources";

//     // Attach to the main file group so Xcode knows it exists
//     if (objects["PBXGroup"] && objects["PBXGroup"][mainGroupKey]) {
//       if (!objects["PBXGroup"][mainGroupKey].children)
//         objects["PBXGroup"][mainGroupKey].children = [];
//       objects["PBXGroup"][mainGroupKey].children.push({
//         value: fileRefUUID,
//         comment: "PresenceMonitor.swift",
//       });
//     }

//     // Force the file into the Extension's compile phase!
//     const extTargetObj = objects["PBXNativeTarget"][extTarget.uuid];
//     if (extTargetObj && extTargetObj.buildPhases) {
//       for (const phase of extTargetObj.buildPhases) {
//         const phaseObj = objects["PBXSourcesBuildPhase"][phase.value];
//         if (phaseObj) {
//           if (!phaseObj.files) phaseObj.files = [];
//           phaseObj.files.push({
//             value: buildFileUUID,
//             comment: "PresenceMonitor.swift in Sources",
//           });
//         }
//       }
//     }
//     // -------------------------------------------------------------------

//     let teamId = "";
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
//             GENERATE_INFOPLIST_FILE: "NO",
//             MACH_O_TYPE: '"mh_execute"',
//             WRAPPER_EXTENSION: '"appex"',
//             EXECUTABLE_NAME: '"$(PRODUCT_NAME)"',
//             LD_RUNPATH_SEARCH_PATHS:
//               '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
//           });
//         }
//       });
//     }

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
//       const embedBuildFileUUID = xcodeProject.generateUuid();
//       if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
//       objects["PBXBuildFile"][embedBuildFileUUID] = {
//         isa: "PBXBuildFile",
//         fileRef: extProductRef,
//         fileRef_comment: `${EXTENSION_NAME}.appex`,
//         settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
//       };
//       objects["PBXBuildFile"][`${embedBuildFileUUID}_comment`] =
//         `${EXTENSION_NAME}.appex in Embed App Extensions`;

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
//         if (!embedPhase.files.some((f) => f.value === embedBuildFileUUID)) {
//           embedPhase.files.push({
//             value: embedBuildFileUUID,
//             comment: `${EXTENSION_NAME}.appex in ${embedPhase.name || "Embed App Extensions"}`,
//           });
//         }
//       } else {
//         embedPhaseUUID = xcodeProject.generateUuid();
//         embedPhase = {
//           isa: "PBXCopyFilesBuildPhase",
//           buildActionMask: 2147483647,
//           dstPath: `""`,
//           dstSubfolderSpec: 13,
//           files: [
//             {
//               value: embedBuildFileUUID,
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

// function withExtensionScheme(config) {
//   return withDangerousMod(config, [
//     "ios",
//     async (cfg) => {
//       const iosRoot = cfg.modRequest.platformProjectRoot;
//       const projectName = cfg.modRequest.projectName;
//       const schemePath = path.join(
//         iosRoot,
//         `${projectName}.xcodeproj`,
//         "xcshareddata",
//         "xcschemes",
//         `${projectName}.xcscheme`,
//       );

//       if (fs.existsSync(schemePath)) {
//         let scheme = fs.readFileSync(schemePath, "utf8");
//         const extensionNamePattern = new RegExp(
//           `BlueprintName\\s*=\\s*"${EXTENSION_NAME}"`,
//         );
//         scheme = scheme.replace(
//           /<BuildActionEntry[^>]*>[\s\S]*?<\/BuildActionEntry>/g,
//           (match) => (extensionNamePattern.test(match) ? "" : match),
//         );
//         fs.writeFileSync(schemePath, scheme, "utf8");
//       }
//       return cfg;
//     },
//   ]);
// }

// module.exports = function withDeviceActivityMonitor(config) {
//   config = withAppGroupEntitlement(config);
//   config = withExtensionFiles(config);
//   config = withExtensionTarget(config);
//   config = withExtensionScheme(config);
//   return config;
// };
