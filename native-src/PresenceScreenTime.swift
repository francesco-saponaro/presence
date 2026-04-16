import Foundation
import FamilyControls
import ManagedSettings
import React // Fixes the missing RCTPromise block errors

@objc(PresenceScreenTime)
public class PresenceScreenTime: NSObject {
    
    let store = ManagedSettingsStore()
    
    @objc
    public func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 15.0, *) {
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
}