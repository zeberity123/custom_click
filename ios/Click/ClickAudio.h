#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface ClickAudio : NSObject
- (BOOL)prepare:(NSError **)error;
- (BOOL)configure:(NSDictionary *)config;
- (BOOL)command:(NSString *)command high:(BOOL)high;
- (NSDictionary *)snapshot;
- (NSArray<NSDictionary *> *)drainEvents;
- (void)stopOutput;
@end
NS_ASSUME_NONNULL_END
