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
}
