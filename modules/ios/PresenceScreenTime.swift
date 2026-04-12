// PresenceScreenTime.swift
// Bridges Apple FamilyControls + ManagedSettings to React Native.
//
// Requires iOS 16+ and the com.apple.developer.family-controls entitlement.
// The plugin withScreenTime.js injects that entitlement automatically.

import Foundation
import React

#if canImport(FamilyControls)
import FamilyControls
import ManagedSettings

@available(iOS 16.0, *)
@objc(PresenceScreenTime)
class PresenceScreenTime: NSObject {

  private let store = ManagedSettingsStore()

  // MARK: – Authorization

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        resolve(nil)
      } catch {
        reject("AUTH_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func getAuthorizationStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let status: String
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved:    status = "approved"
    case .denied:      status = "denied"
    case .notDetermined: status = "notDetermined"
    @unknown default:  status = "unknown"
    }
    resolve(status)
  }

  // MARK: – Shield management
  //
  // NOTE: FamilyControls' ManagedSettings works with opaque ApplicationTokens
  // (obtained via FamilyActivityPicker), not raw bundle IDs. For the MVP, we
  // shield ALL application categories when asked and clear them on success.
  // Phase 6 (App Picker integration) will pass real FamilyActivitySelection data.

  @objc
  func applyShield(
    _ bundleIds: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.shield.applicationCategories = .all()
    store.shield.webDomainCategories = .all()
    resolve(nil)
  }

  @objc
  func clearShield(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.clearAllSettings()
    resolve(nil)
  }

  // React Native bridge utilities
  @objc static func requiresMainQueueSetup() -> Bool { false }
}

#else

// Stub for simulator / macOS builds that don't have FamilyControls.
@objc(PresenceScreenTime)
class PresenceScreenTime: NSObject {
  @objc func requestAuthorization(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(nil)
  }
  @objc func getAuthorizationStatus(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve("notDetermined")
  }
  @objc func applyShield(_ bundleIds: NSArray, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(nil)
  }
  @objc func clearShield(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(nil)
  }
  @objc static func requiresMainQueueSetup() -> Bool { false }
}

#endif
