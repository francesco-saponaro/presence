// PresenceScreenTime.m
// Objective-C bridge that exposes the Swift PresenceScreenTime module to React Native.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PresenceScreenTime, NSObject)

/// Request FamilyControls authorization for the individual user.
RCT_EXTERN_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/// Apply a content shield using ManagedSettings.
/// bundleIds – array of app bundle identifiers to shield.
RCT_EXTERN_METHOD(applyShield:(NSArray *)bundleIds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/// Remove the active content shield.
RCT_EXTERN_METHOD(clearShield:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/// Returns the current authorization status as a string.
RCT_EXTERN_METHOD(getAuthorizationStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
