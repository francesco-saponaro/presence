import ManagedSettings
import UIKit

/**
 * PresenceShieldAction — ShieldActionDelegate app extension
 *
 * Handles taps on the shield's buttons. Without this extension, the primary
 * "Open Presence" button (whose label is set by ShieldConfigurationExtension)
 * just dismisses the shielded app and drops the user on the home screen —
 * they then have to find the Presence icon and open it manually.
 *
 * With this extension:
 *   • Primary button → opens Presence via the `presence://` URL scheme.
 *   • Secondary button → defers (no-op; lets the system close the shield).
 *
 * Registered via @bacons/apple-targets (type "shield-action") — no manual
 * Xcode work. The principal class name in Info.plist is set by the plugin to
 * `$(PRODUCT_MODULE_NAME).ShieldActionExtension`, so this class must keep
 * exactly that name.
 *
 * ─── Opening the host app from an app extension ──────────────────────────
 * Apple does not provide a sanctioned API to open the host app from a Shield
 * Action extension. Production Screen Time apps (Opal, Brick, Jomo, etc.)
 * use a small set of workarounds; we try three in sequence so that whichever
 * the OS currently allows wins:
 *
 * 1. `NSExtensionContext.open(_:completionHandler:)` reached by KVC on `self`.
 *    Apple-sanctioned for extensions in general but `ShieldActionDelegate`
 *    doesn't publicly expose `extensionContext`, hence the KVC fish-out.
 *    Sometimes returns success=false even when it "works"; we don't gate the
 *    other approaches on its outcome.
 *
 * 2. `LSApplicationWorkspace.openURL:` via runtime class string. Technically
 *    private API but widely used in shipping Screen Time apps. Bypasses the
 *    extension-API restriction because it's not statically referenced.
 *
 * 3. `UIApplication.sharedApplication openURL:` via runtime selector. The
 *    Swift overlay marks `UIApplication.shared` unavailable in extensions,
 *    but the underlying ObjC selector still exists at runtime. Requires UIKit
 *    to be linked into this extension.
 *
 * ─── UIKit linkage ───────────────────────────────────────────────────────
 * `@bacons/apple-targets`' shield-action registry entry only declares the
 * `ManagedSettings` framework. We need UIKit too (for approach 3, and to
 * make `LSApplicationWorkspace` discoverable since LaunchServices is loaded
 * alongside UIKit). `import UIKit` alone is theoretically enough via Swift's
 * autolink directives, but those can be stripped if no UIKit symbol is
 * actually referenced at compile time. The `uiKitLinkageAnchor` static below
 * is a real compile-time UIKit reference that forces the linker to include
 * the framework.
 */
class ShieldActionExtension: ShieldActionDelegate {

    private let appURLScheme = "presence://shield"

    // Compile-time reference to a UIKit symbol — forces the linker to include
    // UIKit in the extension binary, which Swift autolink directives alone
    // may not guarantee for an extension that only references UIKit via
    // runtime class lookups.
    private static let uiKitLinkageAnchor: AnyClass = UIColor.self

    // MARK: - Application shield

    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handlePrimaryOrSecondary(action: action, completionHandler: completionHandler)
    }

    // MARK: - Web domain shield

    override func handle(
        action: ShieldAction,
        for webDomain: WebDomainToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handlePrimaryOrSecondary(action: action, completionHandler: completionHandler)
    }

    // MARK: - Category shield

    override func handle(
        action: ShieldAction,
        for category: ActivityCategoryToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handlePrimaryOrSecondary(action: action, completionHandler: completionHandler)
    }

    // MARK: - Shared handler

    private func handlePrimaryOrSecondary(
        action: ShieldAction,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        // Touch the anchor so the optimiser can't strip it.
        _ = ShieldActionExtension.uiKitLinkageAnchor

        switch action {
        case .primaryButtonPressed:
            openHostApp()
            completionHandler(.close)
        case .secondaryButtonPressed:
            completionHandler(.defer)
        @unknown default:
            completionHandler(.none)
        }
    }

    // MARK: - URL-scheme launch (try every known approach)

    private func openHostApp() {
        guard let url = URL(string: appURLScheme) else {
            NSLog("[PresenceShieldAction] bad URL string")
            return
        }
        tryExtensionContextOpen(url)
        tryLSApplicationWorkspaceOpen(url)
        tryUIApplicationOpen(url)
    }

    private func tryExtensionContextOpen(_ url: URL) {
        guard let context = self.value(forKey: "extensionContext") as? NSExtensionContext else {
            NSLog("[PresenceShieldAction] extensionContext not accessible via KVC")
            return
        }
        NSLog("[PresenceShieldAction] attempting extensionContext.open")
        context.open(url) { success in
            NSLog("[PresenceShieldAction] extensionContext.open success=%@", success ? "true" : "false")
        }
    }

    private func tryLSApplicationWorkspaceOpen(_ url: URL) {
        guard let workspaceCls = NSClassFromString("LSApplicationWorkspace") as? NSObject.Type else {
            NSLog("[PresenceShieldAction] LSApplicationWorkspace class not found")
            return
        }
        let defaultWorkspaceSelector = NSSelectorFromString("defaultWorkspace")
        guard workspaceCls.responds(to: defaultWorkspaceSelector) else {
            NSLog("[PresenceShieldAction] LSApplicationWorkspace doesn't respond to defaultWorkspace")
            return
        }
        let unmanaged = workspaceCls.perform(defaultWorkspaceSelector)
        guard let workspace = unmanaged?.takeUnretainedValue() as? NSObject else {
            NSLog("[PresenceShieldAction] couldn't get LSApplicationWorkspace instance")
            return
        }
        let openSelector = NSSelectorFromString("openURL:")
        guard workspace.responds(to: openSelector) else {
            NSLog("[PresenceShieldAction] LSApplicationWorkspace doesn't respond to openURL:")
            return
        }
        NSLog("[PresenceShieldAction] LSApplicationWorkspace.openURL invoked")
        _ = workspace.perform(openSelector, with: url)
    }

    private func tryUIApplicationOpen(_ url: URL) {
        guard let appCls = NSClassFromString("UIApplication") as? NSObject.Type else {
            NSLog("[PresenceShieldAction] UIApplication class not found (UIKit not loaded)")
            return
        }
        guard let app = appCls.value(forKey: "sharedApplication") as? NSObject else {
            NSLog("[PresenceShieldAction] sharedApplication unavailable")
            return
        }
        let selector = NSSelectorFromString("openURL:")
        guard app.responds(to: selector) else {
            NSLog("[PresenceShieldAction] openURL: selector not responding")
            return
        }
        NSLog("[PresenceShieldAction] UIApplication.openURL: invoked")
        _ = app.perform(selector, with: url)
    }
}
