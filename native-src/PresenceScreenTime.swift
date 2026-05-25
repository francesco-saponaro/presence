import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity
import Combine
import React // Required for RCTPromiseResolveBlock / RCTPromiseRejectBlock

@objc(PresenceScreenTime)
public class PresenceScreenTime: RCTEventEmitter {

    private let store = ManagedSettingsStore()
    private let appGroup = "group.com.franciccio.presence"
    private var cancellables = Set<AnyCancellable>()
    private var hasListeners = false

    // ── RCTEventEmitter ───────────────────────────────────────────────────────

    @objc override public static func requiresMainQueueSetup() -> Bool { return false }

    @objc override public func supportedEvents() -> [String]! {
        return ["onScreenTimeAuthChanged"]
    }

    /// Called by RN when the first JS listener subscribes.
    /// Starts the Combine subscription on AuthorizationCenter.$authorizationStatus
    /// so we emit an event the moment the OS updates the status — fixing the
    /// AppState-foreground race condition where the status was still stale.
    @objc override public func startObserving() {
        hasListeners = true
        if #available(iOS 15.0, *) {
            AuthorizationCenter.shared.$authorizationStatus
                .dropFirst() // skip the current value; only react to changes
                .removeDuplicates() // only emit on a REAL status change — breaks the
                                    // requestAuthorization()→re-publish→checkAndUpdateShield feedback loop
                .receive(on: DispatchQueue.main)
                .sink { [weak self] status in
                    guard let self = self, self.hasListeners else { return }
                    let s: String
                    switch status {
                    case .approved:      s = "approved"
                    case .denied:        s = "denied"
                    case .notDetermined: s = "notDetermined"
                    @unknown default:    s = "unknown"
                    }
                    NSLog("[PresenceScreenTime] authorizationStatus changed → %@", s)
                    self.sendEvent(withName: "onScreenTimeAuthChanged", body: ["status": s])
                }
                .store(in: &cancellables)
        }
    }

    /// Called by RN when the last JS listener unsubscribes.
    @objc override public func stopObserving() {
        hasListeners = false
        cancellables.removeAll()
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    @objc
    public func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                                     reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.0, *) {
            // iOS 16+ requires specifying the member type — the old zero-argument
            // completion handler was deprecated and silently fails on iOS 16+.
            Task {
                do {
                    try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                    resolve("Approved")
                } catch {
                    reject("AUTH_ERROR", error.localizedDescription, error)
                }
            }
        } else if #available(iOS 15.0, *) {
            AuthorizationCenter.shared.requestAuthorization { result in
                switch result {
                case .success:
                    resolve("Approved")
                case .failure(let error):
                    reject("AUTH_ERROR", error.localizedDescription, error as Error?)
                }
            }
        } else {
            reject("UNSUPPORTED", "FamilyControls requires iOS 15.0 or newer", nil as Error?)
        }
    }

    // ── Authorization status ──────────────────────────────────────────────────

    @objc
    public func getAuthorizationStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                                       reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 15.0, *) {
            switch AuthorizationCenter.shared.authorizationStatus {
            case .approved:
                resolve("approved")
            case .denied:
                resolve("denied")
            case .notDetermined:
                resolve("notDetermined")
            @unknown default:
                resolve("unknown")
            }
        } else {
            resolve("unknown")
        }
    }

    // ── Shield management ─────────────────────────────────────────────────────

    /**
     Shields the given apps by their bundle identifiers.
     Requires iOS 16+ for per-app targeting via Application(bundleIdentifier:).
     The FamilyControls authorization must already have been granted via
     requestAuthorization before calling this.
     */
    @objc
    public func applyShield(_ bundleIds: [String],
                             resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.0, *) else {
            reject("UNSUPPORTED", "App-specific shielding requires iOS 16.0 or newer", nil as Error?)
            return
        }

        // CRITICAL FIX: The second mapping MUST be compactMap to unwrap the optional tokens
        let apps = bundleIds.map { Application(bundleIdentifier: $0) }
        let tokens = Set(apps.compactMap { $0.token })

        NSLog("[PresenceScreenTime] applyShield: input=%d bundleIds, tokens=%d",
              bundleIds.count, tokens.count)
        for (id, app) in zip(bundleIds, apps) {
            NSLog("[PresenceScreenTime]   bundleId=%@ token=%@", id, app.token != nil ? "OK" : "NIL")
        }

        if tokens.isEmpty {
            // Tokens resolve to nil when FamilyControls cannot match the bundle ID
            // (e.g. provisioning profile missing entitlement, or app not on device).
            // Fall back to shielding ALL categories so blocking still works.
            NSLog("[PresenceScreenTime] tokens empty — falling back to shield all categories")
            store.shield.applicationCategories = .all()
            store.shield.webDomainCategories = .all()
            resolve(["tokensApplied": 0, "appsFound": apps.count])
        } else {
            store.shield.applications = tokens
            store.shield.applicationCategories = nil
            store.shield.webDomainCategories = nil
            NSLog("[PresenceScreenTime] shield applied with %d tokens", tokens.count)
            resolve(["tokensApplied": tokens.count, "appsFound": apps.count])
        }
    }

    /**
     Applies a shield from a base64-encoded FamilyActivitySelection produced by
     PresencePicker.show(). Uses real ApplicationTokens so only the user-selected
     apps are blocked — no fallback to .all() needed here.
     Also writes the selection to the shared App Group so the DeviceActivityMonitor
     extension can read it when the main app is closed.
     */
    @objc
    public func applyShieldFromSelection(_ base64: String,
                                         resolve: @escaping RCTPromiseResolveBlock,
                                         reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.0, *) else {
            reject("UNSUPPORTED", "Requires iOS 16 or later", nil as Error?)
            return
        }

        guard let data = Data(base64Encoded: base64),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            reject("DECODE_ERROR", "Failed to decode FamilyActivitySelection", nil as Error?)
            return
        }

        // Persist to App Group so the DeviceActivityMonitor extension can read it
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set(base64, forKey: "familyActivitySelection")
            defaults.synchronize()
        }

        let tokens = selection.applicationTokens
        NSLog("[PresenceScreenTime] applyShieldFromSelection: %d app tokens", tokens.count)

        if tokens.isEmpty {
            // Picker was shown but no apps were picked — clear any existing shield
            store.shield.applications = nil
            store.shield.applicationCategories = nil
            store.shield.webDomainCategories = nil
            NSLog("[PresenceScreenTime] selection has no tokens — shield cleared")
        } else {
            store.shield.applications = tokens
            store.shield.applicationCategories = nil
            store.shield.webDomainCategories = nil
            NSLog("[PresenceScreenTime] shield applied with %d specific app tokens", tokens.count)
        }
        resolve(nil)
    }

    /**
     Removes all application and category shields from the ManagedSettingsStore.
     Safe to call even when no shield is active.
     */
    @objc
    public func clearShield(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomainCategories = nil
        resolve(nil)
    }

    // ── DeviceActivity scheduling ─────────────────────────────────────────────

    /**
     Schedules the DeviceActivityMonitor extension to apply the shield at the
     user's configured block time, even when Presence is not running.

     - selectionBase64: base64-encoded FamilyActivitySelection (may be empty for legacy users)
     - localHour: block time in the device's LOCAL timezone (0–23)
     - localMinute: minutes component (0–59)
     - frequency: "daily" | "5x" | "weekends"

     The OS fires intervalDidStart in PresenceMonitor.swift at the scheduled time.
     The schedule repeats daily; the extension filters by day-of-week using
     the `frequency` value stored in the shared UserDefaults.

     The block window is 23 hours (blockTime → blockTime+23h), giving the user
     the full next-day morning to verify. The main app calls clearShield() on
     successful verification, which takes effect immediately regardless of the
     DeviceActivity schedule still running.
     */
    @objc
    public func scheduleMonitoring(_ selectionBase64: String,
                                    localHour: Double,
                                    localMinute: Double,
                                    frequency: String,
                                    resolve: @escaping RCTPromiseResolveBlock,
                                    reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.0, *) else {
            // DeviceActivity requires iOS 16 — silently succeed on older OS
            resolve(nil)
            return
        }

        // Write shared data for the extension to read
        if let defaults = UserDefaults(suiteName: appGroup) {
            if !selectionBase64.isEmpty {
                defaults.set(selectionBase64, forKey: "familyActivitySelection")
            }
            defaults.set(frequency, forKey: "blockFrequency")
            defaults.synchronize()
        }

        let hour = Int(localHour)
        let minute = Int(localMinute)
        let endHour = (hour + 23) % 24  // 23-hour block window

        var startComponents = DateComponents()
        startComponents.hour = hour
        startComponents.minute = minute

        var endComponents = DateComponents()
        endComponents.hour = endHour
        endComponents.minute = minute

        let schedule = DeviceActivitySchedule(
            intervalStart: startComponents,
            intervalEnd: endComponents,
            repeats: true
        )

        let center = DeviceActivityCenter()
        do {
            // stopMonitoring first so re-configuring the schedule works cleanly
            center.stopMonitoring([DeviceActivityName("presence.blockTime")])
            try center.startMonitoring(DeviceActivityName("presence.blockTime"), during: schedule)
            NSLog("[PresenceScreenTime] scheduleMonitoring: block at %02d:%02d, window=23h, freq=%@",
                  hour, minute, frequency)
            resolve(nil)
        } catch {
            NSLog("[PresenceScreenTime] scheduleMonitoring failed: %@", error.localizedDescription)
            reject("SCHEDULE_ERROR", error.localizedDescription, error)
        }
    }

    /**
     Stops all DeviceActivity monitoring (called when the user disables their routine).
     */
    @objc
    public func stopMonitoring(_ resolve: @escaping RCTPromiseResolveBlock,
                                reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.0, *) else {
            resolve(nil)
            return
        }
        DeviceActivityCenter().stopMonitoring()
        NSLog("[PresenceScreenTime] stopMonitoring: all activities stopped")
        resolve(nil)
    }
}
