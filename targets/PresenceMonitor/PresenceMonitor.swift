import DeviceActivity
import ManagedSettings
import FamilyControls
import Foundation

/**
 * PresenceMonitor — DeviceActivityMonitor app extension
 *
 * The OS launches this extension at the scheduled block time, even when the
 * main Presence app is closed. It reads the stored FamilyActivitySelection from
 * the shared App Group UserDefaults and applies / lifts the ManagedSettingsStore
 * shield accordingly.
 *
 * Data written by the main app (PresenceScreenTime.swift → scheduleMonitoring):
 *   group.com.franciccio.presence / familyActivitySelection  — base64 selection
 *   group.com.franciccio.presence / blockFrequency           — "daily"|"5x"|"weekends"
 */
// No @available needed — deployment target is iOS 16.0 (set in expo-target.config.js),
// so DeviceActivityMonitor is always available. Placing @available on the class breaks
// the ObjC principal-class lookup iOS uses when loading the extension.
@objc(PresenceMonitor)
class PresenceMonitor: DeviceActivityMonitor {

    private let store = ManagedSettingsStore()
    private let appGroup = "group.com.franciccio.presence"

    // ── intervalDidStart ──────────────────────────────────────────────────────
    // OS calls this at the scheduled intervalStart (block time).

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard activity.rawValue == "presence.blockTime" else { return }
        guard shouldBlockToday() else { return }
        applyShield()
    }

    // ── intervalDidEnd ────────────────────────────────────────────────────────
    // Safety valve: OS calls this at intervalEnd (23 h after start).
    // The main app already clears the shield on verification — this is a fallback.

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard activity.rawValue == "presence.blockTime" else { return }
        clearShield()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private func shouldBlockToday() -> Bool {
        let defaults = UserDefaults(suiteName: appGroup)
        let frequency = defaults?.string(forKey: "blockFrequency") ?? "daily"
        let weekday = Calendar.current.component(.weekday, from: Date())
        // weekday: 1 = Sunday, 2 = Monday … 7 = Saturday
        switch frequency {
        case "5x":       return weekday >= 2 && weekday <= 6  // Mon–Fri
        case "weekends": return weekday == 1 || weekday == 7  // Sat–Sun
        default:         return true                           // "daily"
        }
    }

    private func applyShield() {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let base64 = defaults.string(forKey: "familyActivitySelection"),
            !base64.isEmpty,
            let data = Data(base64Encoded: base64),
            let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else {
            // No valid selection stored — block all app categories as a safe fallback
            store.shield.applicationCategories = .all()
            return
        }

        let tokens = selection.applicationTokens
        if tokens.isEmpty {
            store.shield.applicationCategories = .all()
        } else {
            store.shield.applications = tokens
            store.shield.applicationCategories = nil
            store.shield.webDomainCategories = nil
        }
    }

    private func clearShield() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomainCategories = nil
    }
}
