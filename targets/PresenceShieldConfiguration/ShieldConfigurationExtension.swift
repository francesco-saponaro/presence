import ManagedSettingsUI
import ManagedSettings

/**
 * PresenceShieldConfiguration — ShieldConfigurationDataSource app extension
 *
 * Replaces Apple's default "App Restricted" overlay with a warm, branded message
 * that tells the user exactly what to do to unlock their apps.
 *
 * Registered via @bacons/apple-targets (type "shield-config") — no manual
 * Xcode work needed. The principal class name in Info.plist is set by the
 * plugin to "$(PRODUCT_MODULE_NAME).ShieldConfigurationExtension".
 *
 * NOTE: This extension only controls the shield's visual configuration.
 * The primary button always opens Screen Time settings (iOS default) unless
 * a separate ShieldAction extension is added in the future.
 */
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(
        shielding application: Application,
        in context: DeviceActivityEvent.Name
    ) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(
        shielding webDomain: WebDomain,
        in context: DeviceActivityEvent.Name
    ) -> ShieldConfiguration {
        presenceConfiguration()
    }

    // ── Shared configuration ──────────────────────────────────────────────────

    private func presenceConfiguration() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            // #261B10 deep espresso — matches the app's dark background
            backgroundColor: UIColor(
                red: 0.149, green: 0.106, blue: 0.063, alpha: 0.92
            ),
            title: ShieldConfiguration.Label(
                text: "Time to connect.",
                // #FDFBF7 warm white
                color: UIColor(red: 0.992, green: 0.984, blue: 0.969, alpha: 1.0)
            ),
            subtitle: ShieldConfiguration.Label(
                text: "Your apps are locked until you reach out to someone real. Open Presence, share a screenshot of your conversation, and unlock your apps.",
                // #D6B588 tan — warm accent
                color: UIColor(red: 0.839, green: 0.710, blue: 0.533, alpha: 1.0)
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "Open Presence",
                // #FDFBF7 warm white
                color: UIColor(red: 0.992, green: 0.984, blue: 0.969, alpha: 1.0)
            ),
            // #705E46 medium brown
            primaryButtonBackgroundColor: UIColor(
                red: 0.439, green: 0.369, blue: 0.275, alpha: 1.0
            )
        )
    }
}
