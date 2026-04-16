#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PresenceOCR, NSObject)

RCT_EXTERN_METHOD(scanImage:(NSString *)imagePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end