// PresenceOCR.m
// Objective-C bridge that exposes the Swift PresenceOCR module to React Native.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PresenceOCR, NSObject)

/// Run on-device OCR (Apple Vision) on the image at `imagePath`.
/// Returns the full recognised text as a plain string.
RCT_EXTERN_METHOD(recognizeText:(NSString *)imagePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
