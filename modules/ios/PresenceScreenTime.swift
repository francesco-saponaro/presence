// PresenceScreenTime.swift
// Bridges Apple FamilyControls + ManagedSettings to React Native.
//
// Requires the com.apple.developer.family-controls entitlement
// (injected automatically by plugins/withScreenTime.js).
//
// Do NOT add `import React` here — React Native ObjC headers are provided
// to Swift via the project's auto-generated bridging header.  Adding
// `import React` causes "No such module 'React'" in classic-bridge builds.

import Foundation
import FamilyControls
import ManagedSettings

@objc(PresenceScreenTime)
class PresenceScreenTime: NSObject {

  // ManagedSettingsStore is available iOS 15+, same as our deployment target.
  private let store = ManagedSettingsStore()

  // MARK: – Authorization

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // AuthorizationCenter.requestAuthorization(for: .individual) requires iOS 16.
    guard #available(iOS 16.0, *) else {
      reject("UNAVAILABLE", "Screen Time controls require iOS 16 or later.", nil)
      return
    }
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
    guard #available(iOS 16.0, *) else {
      resolve("notDetermined")
      return
    }
    let status: String
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved:      status = "approved"
    case .denied:        status = "denied"
    case .notDetermined: status = "notDetermined"
    @unknown default:    status = "unknown"
    }
    resolve(status)
  }

  // MARK: – Shield management
  //
  // ManagedSettingsStore is available iOS 15+, so no availability guard needed.
  // For Phase 6 we will wire up real FamilyActivitySelection / ApplicationTokens.
  // For now we shield ALL categories when the block window is active.

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

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
