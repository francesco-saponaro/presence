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
 * Opening the host app from an app extension — TWO approaches, tried in order:
 *
 * 1. `NSExtensionContext.open(_:completionHandler:)` accessed via KVC on `self`.
 *    Apple-sanctioned API for opening URLs from extensions; the shield-action
 *    extension point is not on the unavailable list. The catch is that
 *    `ShieldActionDelegate` doesn't publicly expose `extensionContext`, so we
 *    fish it out via `value(forKey:)`. Works on iOS 16+.
 *
 * 2. Runtime `UIApplication.sharedApplication openURL:` selector lookup. The
 *    compiler-level "unavailable in app extensions" check is a Swift overlay
 *    only; the underlying ObjC selector still exists at runtime. Ships in
 *    several production Screen Time apps. Requires UIKit to be linked into
 *    this extension — `import UIKit` above forces Swift's autolinker to add
 *    it, since `@bacons/apple-targets`' shield-action registry entry only
 *    declares ManagedSettings.
 *
 * Whichever fires first wins. Both are wrapped so a failure can't crash the
 * extension or change the response we hand the system.
 */
class ShieldActionExtension: ShieldActionDelegate {

    private let appURLScheme = "presence://shield"

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
        switch action {
        case .primaryButtonPressed:
            // Best-effort open of the host app; the shield closes either way.
            openHostApp()
            completionHandler(.close)
        case .secondaryButtonPressed:
            completionHandler(.defer)
        @unknown default:
            completionHandler(.none)
        }
    }

    // MARK: - URL-scheme launch

    private func openHostApp() {
        guard let url = URL(string: appURLScheme) else {
            NSLog("[PresenceShieldAction] bad URL string")
            return
        }

        // Approach 1: NSExtensionContext.open via KVC.
        if let context = self.value(forKey: "extensionContext") as? NSExtensionContext {
            NSLog("[PresenceShieldAction] opening via extensionContext")
            context.open(url) { success in
                NSLog("[PresenceShieldAction] extensionContext open success=%@", success ? "true" : "false")
            }
            return
        }

        // Approach 2: runtime UIApplication.sharedApplication openURL:.
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
        NSLog("[PresenceShieldAction] opening via UIApplication runtime selector")
        _ = app.perform(selector, with: url)
    }
}
