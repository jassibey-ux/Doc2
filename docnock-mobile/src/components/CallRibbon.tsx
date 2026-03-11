import { mScale } from '@utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RtcSurfaceView } from 'react-native-agora';
import { BaseText } from './BaseText';
import { FontSizes, FontWeights } from '@theme';
import { BaseTouchable, SvgIconButton } from './button';
import { commonStyles } from '@styles';
import { useAppSelector, useTheme } from '@hooks';
import { navigationRef } from '@navigation';
import { CallType, getAgoraUID, useCallContext } from '@context';
import LinearGradient from 'react-native-linear-gradient';

export const CallRibbon = () => {
  const {
    showCallRibbon,
    callDuration,
    callRingerDetails,
    type,
    videoOn,
    remoteUsers,
    micOn,
    toggleMic,
    toggleVideo,
    toggleCamera,
    leaveChannel,
    selfUID,
  } = useCallContext();
  const insets = useSafeAreaInsets();
  const styles = Styles();
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const colors = useAppSelector(state => state.theme.colors);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [ribbonSize, setRibbonSize] = useState(() => ({
    width: mScale(190),
    height: mScale(250),
  }));
  const sizeBounds = useMemo(
    () => ({
      minWidth: mScale(140),
      minHeight: mScale(190),
      maxWidth: mScale(260),
      maxHeight: mScale(340),
    }),
    [],
  );
  const sizeRef = useRef(ribbonSize);
  const resizeStartRef = useRef(ribbonSize);
  const isVideoCall = type === CallType.video;
  const remoteUid = getAgoraUID(remoteUsers?.[0]);
  const currentUserId = loginDetails?.profile?._id ?? '';
  const currentUserName = loginDetails?.profile?.fullName ?? '';
  const callGroupId = callRingerDetails?.groupId ?? '';
  const displayName = callRingerDetails?.callerName ?? currentUserName;
  const localUid = selfUID ? String(selfUID) : '';
  const gradientColors = useMemo(
    () => [colors.searchInputBackground, colors.blackOpacity05],
    [colors.blackOpacity05, colors.searchInputBackground],
  );

  useEffect(() => {
    sizeRef.current = ribbonSize;
  }, [ribbonSize]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: () => {
          pan.stopAnimation((value: any) => {
            dragStartRef.current = {
              x: Number(value?.x ?? 0),
              y: Number(value?.y ?? 0),
            };
          });
        },
        onPanResponderMove: (_, gestureState) => {
          pan.setValue({
            x: dragStartRef.current.x + gestureState.dx,
            y: dragStartRef.current.y + gestureState.dy,
          });
        },
      }),
    [pan],
  );

  const clamp = useCallback((value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  }, []);

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
        },
        onPanResponderGrant: () => {
          resizeStartRef.current = { ...sizeRef.current };
        },
        onPanResponderMove: (_, gestureState) => {
          const nextWidth = clamp(
            resizeStartRef.current.width + gestureState.dx,
            sizeBounds.minWidth,
            sizeBounds.maxWidth,
          );
          const nextHeight = clamp(
            resizeStartRef.current.height + gestureState.dy,
            sizeBounds.minHeight,
            sizeBounds.maxHeight,
          );
          setRibbonSize(prev => {
            if (prev.width === nextWidth && prev.height === nextHeight) {
              return prev;
            }
            return { width: nextWidth, height: nextHeight };
          });
        },
      }),
    [clamp, sizeBounds.maxHeight, sizeBounds.maxWidth, sizeBounds.minHeight, sizeBounds.minWidth],
  );

  const handleToggleMic = useCallback(() => {
    toggleMic?.({
      groupId: callGroupId,
      senderID: currentUserId,
      isAudioMuted: micOn ?? false,
      uid: localUid,
    });
  }, [callGroupId, currentUserId, localUid, micOn, toggleMic]);

  const handleToggleVideo = useCallback(() => {
    if (!isVideoCall) {
      return;
    }
    toggleVideo?.({
      groupId: callGroupId,
      senderID: currentUserId,
      isVideoMuted: videoOn ?? false,
      uid: localUid,
      name: displayName,
    });
  }, [callGroupId, currentUserId, displayName, isVideoCall, localUid, toggleVideo, videoOn]);

  const handleToggleCamera = useCallback(() => {
    if (isVideoCall) {
      toggleCamera?.();
    }
  }, [isVideoCall, toggleCamera]);

  const handleHangUp = useCallback(() => {
    leaveChannel?.();
  }, [leaveChannel]);

  const BackToCallButton = useMemo(
    () => (
      <BaseTouchable style={styles.backButton} onPress={onPressOpenCall}>
        <BaseText style={styles.backButtonText}>Back to call</BaseText>
      </BaseTouchable>
    ),
    [onPressOpenCall, styles.backButton, styles.backButtonText],
  );

  const onPressOpenCall = () => {
    navigationRef.navigate('CallingScreen', {
      groupId: callRingerDetails?.groupId,
      name: callRingerDetails?.callerName ?? '',
      uid: null,
    });
  };

  if (!showCallRibbon || !isVideoCall) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + mScale(8),
          width: ribbonSize.width,
          height: ribbonSize.height,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.card}>
        <View style={styles.previewShell}>
          <LinearGradient
            colors={gradientColors}
            style={styles.gradientLayer}
            pointerEvents="none"
          />
          <BaseTouchable style={styles.previewTouchable} onPress={onPressOpenCall}>
            {isVideoCall ? (
              <View style={styles.videoContainer}>
                {!!remoteUid?.toString() ? (
                  <RtcSurfaceView
                    canvas={{ uid: remoteUid, renderMode: 2 }}
                    style={styles.videoPreview}
                    zOrderOnTop={false}
                    zOrderMediaOverlay={false}
                  />
                ) : !!videoOn ? (
                  <RtcSurfaceView
                    canvas={{ uid: 0, renderMode: 2 }}
                    style={styles.videoPreview}
                    zOrderOnTop={false}
                    zOrderMediaOverlay={false}
                  />
                ) : (
                  <View style={[commonStyles.centerCenter, styles.audioFallbackContainer]}>
                    <View style={styles.callBadge}>
                      <SvgIconButton icon="Call" style={styles.callBadgeIcon} />
                    </View>
                    <BaseText style={styles.audioText}>{displayName || 'Call'}</BaseText>
                  </View>
                )}

                {!!videoOn && (
                  <View style={styles.localPreviewContainer}>
                    <RtcSurfaceView
                      canvas={{ uid: 0, renderMode: 2 }}
                      style={styles.localPreview}
                      zOrderOnTop={false}
                      zOrderMediaOverlay={false}
                    />
                  </View>
                )}
              </View>
            ) : (
              <View style={[commonStyles.centerCenter, styles.audioFallbackContainer]}>
                <View style={styles.callBadge}>
                  <SvgIconButton icon="Call" style={styles.callBadgeIcon} />
                </View>
                <BaseText style={styles.audioText}>{displayName || 'Call'}</BaseText>
              </View>
            )}

            <View style={[commonStyles.rowItemCenterJustifyBetween, styles.topOverlay]}>
              <View style={styles.topMeta}>
                <BaseText style={styles.durationStyle}>{callDuration}</BaseText>
                {!!displayName && (
                  <BaseText style={styles.callerName} numberOfLines={1}>
                    {displayName}
                  </BaseText>
                )}
              </View>
              <SvgIconButton
                icon="Expand"
                style={styles.expandButton}
                onPress={onPressOpenCall}
                iconProps={{ color: colors.white, height: mScale(14), width: mScale(14) }}
              />
            </View>
          </BaseTouchable>
        </View>

        <View style={styles.controlsWrapper}>
          <View style={[commonStyles.rowItemsCenter, styles.controlsContainer]}>
            <SvgIconButton
              icon={micOn ? 'MicOn' : 'MicOff'}
              style={[
                styles.controlButton,
                micOn ? styles.controlButtonActive : styles.controlButtonMuted,
              ]}
              iconProps={{ color: colors.white, height: mScale(16), width: mScale(16) }}
              onPress={handleToggleMic}
            />
            {isVideoCall && (
              <SvgIconButton
                icon={videoOn ? 'VideoOn' : 'VideoOff'}
                style={[
                  styles.controlButton,
                  videoOn ? styles.controlButtonActive : styles.controlButtonMuted,
                ]}
                iconProps={{ color: colors.white, height: mScale(16), width: mScale(16) }}
                onPress={handleToggleVideo}
              />
            )}
            <SvgIconButton
              icon="Call"
              style={[styles.controlButton, styles.controlButtonDanger]}
              iconProps={{ color: colors.white, height: mScale(16), width: mScale(16) }}
              onPress={handleHangUp}
            />
            {!isVideoCall && BackToCallButton}
            {isVideoCall && (
              <SvgIconButton
                icon="CameraSwitch"
                style={[styles.controlButton, styles.controlButtonMuted]}
                iconProps={{ color: colors.white, height: mScale(16), width: mScale(16) }}
                onPress={handleToggleCamera}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.resizeHandle} {...resizeResponder.panHandlers}>
        <View style={styles.resizeGrip} />
      </View>
    </Animated.View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      position: 'absolute',
      right: mScale(12),
      zIndex: 1000,
      borderRadius: mScale(18),
      overflow: 'visible',
      elevation: 6,
    },
    card: {
      flex: 1,
      borderRadius: mScale(18),
      backgroundColor: colors.searchInputBackground,
      paddingBottom: mScale(6),
    },
    previewShell: {
      flex: 1,
      borderRadius: mScale(18),
      overflow: 'hidden',
      position: 'relative',
    },
    gradientLayer: {
      ...commonStyles.absoluteFill,
    },
    previewTouchable: {
      flex: 1,
    },
    videoContainer: {
      flex: 1,
    },
    videoPreview: {
      height: '100%',
      width: '100%',
    },
    localPreviewContainer: {
      position: 'absolute',
      right: mScale(8),
      bottom: mScale(12),
      width: mScale(46),
      height: mScale(64),
      borderRadius: mScale(10),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.inputBackground,
      backgroundColor: colors.blackOpacity05,
    },
    localPreview: {
      height: '100%',
      width: '100%',
    },
    audioFallbackContainer: {
      flex: 1,
      backgroundColor: colors.inputBackground,
    },
    callBadge: {
      width: mScale(48),
      height: mScale(48),
      borderRadius: mScale(24),
      backgroundColor: colors.callGreen,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callBadgeIcon: {
      backgroundColor: 'transparent',
      height: mScale(24),
      width: mScale(24),
    },
    audioText: {
      marginTop: mScale(10),
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_16,
      color: colors.white,
    },
    topOverlay: {
      position: 'absolute',
      top: mScale(8),
      left: mScale(8),
      right: mScale(8),
    },
    durationStyle: {
      fontWeight: FontWeights.medium,
      fontSize: FontSizes.size_13,
      color: colors.white,
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(8),
      paddingHorizontal: mScale(6),
      paddingVertical: mScale(3),
    },
    topMeta: {
      flexShrink: 1,
    },
    callerName: {
      marginTop: mScale(4),
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_12,
      color: colors.white,
    },
    expandButton: {
      height: mScale(30),
      width: mScale(30),
      borderRadius: mScale(16),
      backgroundColor: colors.blackOpacity05,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlsWrapper: {
      paddingHorizontal: mScale(12),
      paddingTop: mScale(8),
      flexShrink: 0,
    },
    controlsContainer: {
      flex: 1,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: mScale(6),
      paddingHorizontal: mScale(10),
      borderRadius: mScale(32),
      backgroundColor: colors.blackOpacity05,
      borderWidth: 0.6,
      borderColor: 'rgba(255,255,255,0.12)',
      gap: mScale(10),
    },
    controlButton: {
      width: mScale(32),
      height: mScale(32),
      borderRadius: mScale(16),
      padding: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlButtonMuted: {
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    controlButtonActive: {
      backgroundColor: colors.tint,
    },
    controlButtonDanger: {
      backgroundColor: colors.callRed,
    },
    backButton: {
      paddingHorizontal: mScale(12),
      paddingVertical: mScale(6),
      borderRadius: mScale(14),
      backgroundColor: colors.blackOpacity05,
    },
    backButtonText: {
      color: colors.white,
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
    },
    resizeHandle: {
      position: 'absolute',
      right: mScale(6),
      bottom: mScale(6),
      width: mScale(30),
      height: mScale(30),
      borderRadius: mScale(15),
      backgroundColor: colors.blackOpacity05,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resizeGrip: {
      width: mScale(12),
      height: mScale(12),
      borderRightWidth: 2,
      borderBottomWidth: 2,
      borderColor: colors.white,
      transform: [{ rotate: '45deg' }],
    },
  }));
