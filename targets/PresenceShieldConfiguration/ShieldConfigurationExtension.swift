import ManagedSettingsUI
import ManagedSettings
import UIKit

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

    private let appGroup = "group.com.franciccio.presence"

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(
        shielding application: Application,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        presenceConfiguration()
    }

    override func configuration(
        shielding webDomain: WebDomain,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        presenceConfiguration()
    }

    // ── Shared configuration ──────────────────────────────────────────────────

    private func presenceConfiguration() -> ShieldConfiguration {
        let lang = UserDefaults(suiteName: appGroup)?.string(forKey: "appLanguage") ?? "en"
        let s = localizedStrings(for: lang)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            // #261B10 deep espresso — matches the app's dark background
            backgroundColor: UIColor(
                red: 0.149, green: 0.106, blue: 0.063, alpha: 0.92
            ),
            title: ShieldConfiguration.Label(
                text: s.title,
                // #FDFBF7 warm white
                color: UIColor(red: 0.992, green: 0.984, blue: 0.969, alpha: 1.0)
            ),
            subtitle: ShieldConfiguration.Label(
                text: s.subtitle,
                // #D6B588 tan — warm accent
                color: UIColor(red: 0.839, green: 0.710, blue: 0.533, alpha: 1.0)
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: s.button,
                // #FDFBF7 warm white
                color: UIColor(red: 0.992, green: 0.984, blue: 0.969, alpha: 1.0)
            ),
            // #705E46 medium brown
            primaryButtonBackgroundColor: UIColor(
                red: 0.439, green: 0.369, blue: 0.275, alpha: 1.0
            )
        )
    }

    /// Localised shield copy. The extension can't use react-i18next, so the
    /// strings live here and are selected by the language code the main app
    /// mirrors into the App Group via ScreenTimeModule.setAppLanguage().
    private func localizedStrings(for lang: String) -> (title: String, subtitle: String, button: String) {
        switch lang {
        case "it":
            return ("È ora di connetterti.",
                    "Le tue app sono bloccate finché non contatti qualcuno di reale. Apri Presence, condividi uno screenshot della conversazione e sblocca le tue app.",
                    "Apri Presence")
        case "es":
            return ("Hora de conectar.",
                    "Tus apps están bloqueadas hasta que contactes a alguien real. Abre Presence, comparte una captura de tu conversación y desbloquea tus apps.",
                    "Abrir Presence")
        case "fr":
            return ("Il est temps de se connecter.",
                    "Vos applis sont verrouillées jusqu'à ce que vous contactiez quelqu'un de réel. Ouvrez Presence, partagez une capture de votre conversation et déverrouillez vos applis.",
                    "Ouvrir Presence")
        case "pt":
            return ("Hora de se conectar.",
                    "Seus apps estão bloqueados até você entrar em contato com alguém real. Abra o Presence, compartilhe uma captura da conversa e desbloqueie seus apps.",
                    "Abrir o Presence")
        default:
            return ("Time to connect.",
                    "Your apps are locked until you reach out to someone real. Open Presence, share a screenshot of your conversation, and unlock your apps.",
                    "Open Presence")
        }
    }
}
