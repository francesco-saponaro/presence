import Foundation
import FamilyControls
import ManagedSettings
import React // Required for RCTPromiseResolveBlock / RCTPromiseRejectBlock

@objc(PresenceScreenTime)
public class PresenceScreenTime: NSObject {

    private let store = ManagedSettingsStore()

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
        let tokens = Set(
            bundleIds
                .compactMap { Application(bundleIdentifier: $0) }
                .compactMap { $0.token } 
        )

        // Setting to nil when empty ensures we never leave a stale empty-set shield.
        if tokens.isEmpty {
            store.shield.applications = nil
        } else {
            store.shield.applications = tokens
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
        resolve(nil)
    }
}
