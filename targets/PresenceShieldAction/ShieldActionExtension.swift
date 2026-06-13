import ManagedSettings
import Foundation

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
 * Opening the host app from an app extension:
 *   `UIApplication.shared.open(_:)` is marked unavailable in app extensions at
 *   compile time, but the underlying ObjC selector still exists. Looking up
 *   `UIApplication` via `NSClassFromString` and invoking `openURL:` via
 *   `perform(_:)` is the well-known runtime workaround that ships in many
 *   Screen Time apps. It bypasses the compiler check without using truly
 *   private API.
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
        guard let url = URL(string: appURLScheme) else { return }
        guard let appCls = NSClassFromString("UIApplication") as? NSObject.Type else { return }
        guard let app = appCls.value(forKey: "sharedApplication") as? NSObject else { return }
        let selector = NSSelectorFromString("openURL:")
        guard app.responds(to: selector) else { return }
        _ = app.perform(selector, with: url)
    }
}
