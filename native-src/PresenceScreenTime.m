#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PresenceScreenTime, NSObject)

RCT_EXTERN_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end