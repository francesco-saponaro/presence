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
    // Family Controls also needs to be on the MAIN app's entitlements
    cfg.modResults["com.apple.developer.family-controls"] = true;
    return cfg;
  });
}

function withExtension(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const iosRoot = cfg.modRequest.platformProjectRoot;
    const extDir = path.join(iosRoot, EXTENSION_NAME);

    // 1. FILE CREATION ON DISK
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

    // 2. TARGET CREATION (idempotent)
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
    const objects = xcodeProject.hash.project.objects;
    const mainTarget = xcodeProject.getFirstTarget();
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;

    // 3. SOURCE FILE INJECTION
    // Path must be unquoted; sourceTree must be quoted because of "<group>"
    const fileRefUUID = xcodeProject.generateUuid();
    if (!objects["PBXFileReference"]) objects["PBXFileReference"] = {};
    objects["PBXFileReference"][fileRefUUID] = {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      name: "PresenceMonitor.swift",
      path: `${EXTENSION_NAME}/PresenceMonitor.swift`,
      sourceTree: `"<group>"`,
    };
    objects["PBXFileReference"][`${fileRefUUID}_comment`] =
      "PresenceMonitor.swift";

    const buildFileUUID = xcodeProject.generateUuid();
    if (!objects["PBXBuildFile"]) objects["PBXBuildFile"] = {};
    objects["PBXBuildFile"][buildFileUUID] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUUID,
      fileRef_comment: "PresenceMonitor.swift",
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
        const phaseObj = objects["PBXSourcesBuildPhase"]?.[phase.value];
        if (phaseObj) {
          if (!phaseObj.files) phaseObj.files = [];
          phaseObj.files.push({
            value: buildFileUUID,
            comment: "PresenceMonitor.swift in Sources",
          });
        }
      }
    }

    // 4. BUILD SETTINGS — UNQUOTED for plain values, QUOTED only when path contains $() or special chars
    let teamId = "";
    const mainConfigListUUID = mainTarget.firstTarget.buildConfigurationList;
    const mainConfigList =
      xcodeProject.pbxXCConfigurationList()[mainConfigListUUID];
    if (mainConfigList) {
      for (const conf of mainConfigList.buildConfigurations) {
        const buildCfg =
          xcodeProject.pbxXCBuildConfigurationSection()[conf.value];
        if (buildCfg?.buildSettings?.DEVELOPMENT_TEAM) {
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
        if (buildCfg?.buildSettings) {
          const newSettings = {
            SWIFT_VERSION: "5.0",
            PRODUCT_NAME: EXTENSION_NAME,
            PRODUCT_BUNDLE_IDENTIFIER: extBundleId,
            INFOPLIST_FILE: `${EXTENSION_NAME}/${EXTENSION_NAME}-Info.plist`,
            CODE_SIGN_ENTITLEMENTS: `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`,
            IPHONEOS_DEPLOYMENT_TARGET: "16.0",
            SKIP_INSTALL: "YES",
            APPLICATION_EXTENSION_API_ONLY: "YES",
            ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "NO",
            CODE_SIGN_STYLE: "Automatic",
            TARGETED_DEVICE_FAMILY: "1,2",
            SWIFT_EMIT_LOC_STRINGS: "YES",
            MARKETING_VERSION: config.version || "1.0.0",
            CURRENT_PROJECT_VERSION: String(config.ios?.buildNumber || "1"),
            GENERATE_INFOPLIST_FILE: "NO",
            LD_RUNPATH_SEARCH_PATHS: `"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"`,
          };

          if (teamId) {
            newSettings.DEVELOPMENT_TEAM = teamId;
          }

          Object.assign(buildCfg.buildSettings, newSettings);
        }
      });
    }

    // 5. EMBED EXTENSION INTO MAIN APP'S PlugIns FOLDER
    // Use the productReference returned by addTarget directly — way more reliable than searching
    const extProductRef =
      extTarget.pbxNativeTarget.productReference ||
      objects["PBXNativeTarget"]?.[extTarget.uuid]?.productReference;

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
            // Verify this embed phase actually belongs to the MAIN target,
            // not to the Pods or another extension
            const mainTargetObj = objects["PBXNativeTarget"][mainTarget.uuid];
            const belongsToMain = mainTargetObj?.buildPhases?.some(
              (p) => p.value === uuid,
            );
            if (belongsToMain) {
              embedPhaseUUID = uuid;
              embedPhase = phase;
              break;
            }
          }
        }
      }

      if (embedPhase) {
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
          comment: `${EXTENSION_NAME}.appex in Embed App Extensions`,
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
        if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"
          bc.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
          bc.build_settings['CODE_SIGN_IDENTITY'] = ''
          bc.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ''
          bc.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
        end
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
