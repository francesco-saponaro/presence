import DeviceActivity
import ManagedSettings
import FamilyControls
import Foundation

/**
 * PresenceMonitor — DeviceActivityMonitor app extension
 *
 * The OS launches this extension at the scheduled block time (and immediately if
 * the schedule is registered while the interval is already running), even when
 * the main Presence app is closed. It reads routine data from the shared App
 * Group UserDefaults and applies the ManagedSettingsStore shield.
 *
 * Overnight-persistence model: the shield is applied at the block trigger and is
 * NOT auto-lifted at the interval's end — it persists across midnight (and
 * inactive days) until the user completes a verified connection, at which point
 * the MAIN APP clears the shield (PresenceScreenTime.clearShield) and writes a
 * fresh `lastConnectionAt`.
 *
 * To avoid blocking when it shouldn't (e.g. the schedule was registered in the
 * morning and the OS fires intervalDidStart immediately, or it re-fires after the
 * user already connected today), intervalDidStart applies the shield ONLY if the
 * most recent block trigger is later than the "baseline" — the later of
 * `scheduleSetAt` and `lastConnectionAt`. This mirrors isBlockTimeActive() in JS.
 *
 * Data written by the main app (PresenceScreenTime.swift):
 *   familyActivitySelection — base64 selection            (scheduleMonitoring)
 *   blockFrequency          — "daily" | "5x" | "weekends" (scheduleMonitoring)
 *   blockHour / blockMinute — local block time            (scheduleMonitoring)
 *   scheduleSetAt           — epoch ms, schedule baseline  (scheduleMonitoring)
 *   lastConnectionAt        — epoch ms, last verification  (recordLastConnection)
 */
// No @available needed — deployment target is iOS 16.0 (set in expo-target.config.js),
// so DeviceActivityMonitor is always available. Placing @available on the class breaks
// the ObjC principal-class lookup iOS uses when loading the extension.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    private let store = ManagedSettingsStore()
    private let appGroup = "group.com.franciccio.presence"

    // ── intervalDidStart ──────────────────────────────────────────────────────
    // OS calls this at the scheduled intervalStart (block time), or immediately
    // if monitoring is registered while the interval is already active.

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard activity.rawValue == "presence.blockTime" else { return }
        guard shouldBlockNow() else { return }
        applyShield()
    }

    // ── intervalDidEnd ────────────────────────────────────────────────────────
    // Intentionally does NOT clear the shield. The block persists until the user
    // completes a verified connection (the main app calls clearShield then).

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        // no-op: overnight persistence — see file header.
    }

    // ── Should-block decision (mirrors JS isBlockTimeActive) ───────────────────

    private func shouldBlockNow() -> Bool {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return false }
        let frequency = defaults.string(forKey: "blockFrequency") ?? "daily"
        let hour = defaults.integer(forKey: "blockHour")
        let minute = defaults.integer(forKey: "blockMinute")
        let scheduleSetAt = defaults.double(forKey: "scheduleSetAt")       // ms (0 if unset)
        let lastConnectionAt = defaults.double(forKey: "lastConnectionAt") // ms (0 if unset)
        let baseline = max(scheduleSetAt, lastConnectionAt)

        guard let trigger = mostRecentTriggerMs(hour: hour, minute: minute, frequency: frequency) else {
            return false
        }
        return trigger > baseline
    }

    /// Epoch-ms of the most recent block-time occurrence at or before now, on an
    /// active day for `frequency`. Walks back up to 7 days. Returns nil if none.
    private func mostRecentTriggerMs(hour: Int, minute: Int, frequency: String) -> Double? {
        let now = Date()
        let cal = Calendar.current
        for back in 0..<7 {
            guard let day = cal.date(byAdding: .day, value: -back, to: now) else { continue }
            var comps = cal.dateComponents([.year, .month, .day], from: day)
            comps.hour = hour
            comps.minute = minute
            comps.second = 0
            guard let occurrence = cal.date(from: comps) else { continue }
            if occurrence > now { continue } // future (today, before block time)
            let weekday = cal.component(.weekday, from: occurrence)
            if !isActiveDay(weekday: weekday, frequency: frequency) { continue }
            return occurrence.timeIntervalSince1970 * 1000.0
        }
        return nil
    }

    /// Calendar weekday: 1 = Sunday, 2 = Monday … 7 = Saturday.
    private func isActiveDay(weekday: Int, frequency: String) -> Bool {
        switch frequency {
        case "5x":       return weekday >= 2 && weekday <= 6 // Mon–Fri
        case "weekends": return weekday == 1 || weekday == 7 // Sun/Sat
        default:         return true                          // "daily"
        }
    }

    // ── Shield application ──────────────────────────────────────────────────────

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
}
