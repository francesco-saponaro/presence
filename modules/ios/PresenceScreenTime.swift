// PresenceScreenTime.swift
// Bridges Apple FamilyControls + ManagedSettings to React Native.
//
// Requires the com.apple.developer.family-controls entitlement
// (injected automatically by plugins/withScreenTime.js).
//
// Do NOT add `import React` here — React Native ObjC headers are provided
// to Swift via the project's auto-generated bridging header.

import Foundation
import FamilyControls
import ManagedSettings

@objc(PresenceScreenTime)
class PresenceScreenTime: NSObject {

  private let store = ManagedSettingsStore()

  // MARK: – Authorization

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
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

  @objc
  func applyShield(
    _ bundleIds: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let ids = bundleIds.compactMap { $0 as? String }

    guard #available(iOS 16.0, *) else {
      // iOS 15 fallback: shield all app categories
      store.shield.applicationCategories = .all()
      store.shield.webDomainCategories = .all()
      resolve(["tokensApplied": 0, "appsFound": ids.count])
      return
    }

    let apps = ids.map { Application(bundleIdentifier: $0) }
    let tokens = Set(apps.compactMap { $0.token })

    NSLog("[PresenceScreenTime] applyShield: input=%d bundleIds, resolved tokens=%d",
          ids.count, tokens.count)
    for (id, app) in zip(ids, apps) {
      NSLog("[PresenceScreenTime]   bundleId=%@ token=%@",
            id, app.token != nil ? "OK" : "NIL")
    }

    if tokens.isEmpty {
      // Tokens resolve to nil when FamilyControls can't match the bundle ID
      // (e.g. provisioning profile missing entitlement, or app not on device).
      // Fall back to shielding all categories so blocking still works.
      NSLog("[PresenceScreenTime] tokens empty — falling back to shield all categories")
      store.shield.applicationCategories = .all()
      store.shield.webDomainCategories = .all()
      resolve(["tokensApplied": 0, "appsFound": ids.count])
    } else {
      store.shield.applications = tokens
      store.shield.applicationCategories = nil
      store.shield.webDomainCategories = nil
      NSLog("[PresenceScreenTime] shield applied with %d specific app tokens", tokens.count)
      resolve(["tokensApplied": tokens.count, "appsFound": ids.count])
    }
  }

  @objc
  func clearShield(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.shield.applications = nil
    store.shield.applicationCategories = nil
    store.shield.webDomainCategories = nil
    resolve(nil)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
