#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PresencePicker, NSObject)

/// Present the FamilyActivityPicker sheet.
/// initialBase64 — base64-encoded FamilyActivitySelection (nil on first launch)
/// Resolves with nil (cancelled) or { selection: String, apps: [{ bundleId, name? }] }
RCT_EXTERN_METHOD(show:(NSString *)initialBase64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
