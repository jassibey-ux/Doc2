import React, { useMemo, useCallback } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from '@navigation';
import { useCallContext, CallType } from '@context';
import { BaseTouchable, SvgIconButton } from './button';
import { BaseText } from './BaseText';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';

export const AudioCallRibbon = () => {
  const {
    showCallRibbon,
    type,
    callDuration,
    callRingerDetails,
    micOn,
    toggleMic,
    leaveChannel,
  } = useCallContext();

  const isAudioCall = type === CallType.audio;
  const insets = useSafeAreaInsets();
  const styles = Styles();

  const displayName = callRingerDetails?.callerName || 'Call';
  const groupId = callRingerDetails?.groupId;

  const handleOpenCall = useCallback(() => {
    navigationRef.navigate('CallingScreen', {
      groupId,
      name: displayName,
      uid: null,
    });
  }, [displayName, groupId]);

  const handleToggleMic = useCallback(() => {
    toggleMic?.({
      groupId: groupId ?? '',
      senderID: callRingerDetails?.callerId ?? '',
      isAudioMuted: micOn ?? false,
      uid: undefined,
    });
  }, [groupId, callRingerDetails?.callerId, micOn, toggleMic]);

  const handleHangUp = useCallback(() => {
    leaveChannel?.();
  }, [leaveChannel]);

  if (!showCallRibbon || !isAudioCall) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + mScale(10),
        },
      ]}
    >
      <BaseTouchable style={styles.card} onPress={handleOpenCall}>
        <View style={styles.leftSection}>
          <View style={styles.badge}>
            <SvgIconButton icon="Call" style={styles.badgeIcon} />
          </View>
          <View style={styles.meta}>
            <BaseText style={styles.name} numberOfLines={1}>
              {displayName}
            </BaseText>
            <BaseText style={styles.timer}>{callDuration}</BaseText>
          </View>
        </View>

        <View style={styles.actions}>
          <SvgIconButton
            icon={micOn ? 'MicOn' : 'MicOff'}
            style={styles.actionButton}
            iconProps={{ color: styles.iconColor, height: mScale(16), width: mScale(16) }}
            onPress={handleToggleMic}
          />
          <SvgIconButton
            icon="CallEnd"
            style={[styles.actionButton, styles.hangUp]}
            iconProps={{ color: styles.iconColor, height: mScale(16), width: mScale(16) }}
            onPress={handleHangUp}
          />
          <SvgIconButton
            icon="Expand"
            style={styles.actionButton}
            iconProps={{ color: styles.iconColor, height: mScale(16), width: mScale(16) }}
            onPress={handleOpenCall}
          />
        </View>
      </BaseTouchable>
    </Animated.View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      position: 'absolute',
      left: mScale(10),
      right: mScale(10),
      zIndex: 1000,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: mScale(12),
      paddingVertical: mScale(10),
      borderRadius: mScale(16),
      backgroundColor: colors.searchInputBackground,
      borderWidth: 0.5,
      borderColor: colors.blackOpacity05,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    leftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    badge: {
      width: mScale(40),
      height: mScale(40),
      borderRadius: mScale(20),
      backgroundColor: colors.callGreen,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: mScale(10),
    },
    badgeIcon: {
      backgroundColor: 'transparent',
      height: mScale(22),
      width: mScale(22),
    },
    meta: {
      flexShrink: 1,
    },
    name: {
      fontSize: FontSizes.size_15,
      fontWeight: FontWeights.semibold,
      color: colors.white,
    },
    timer: {
      marginTop: mScale(4),
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
      color: colors.white,
      opacity: 0.9,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: mScale(10),
    },
    actionButton: {
      width: mScale(32),
      height: mScale(32),
      borderRadius: mScale(16),
      backgroundColor: colors.blackOpacity05,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hangUp: {
      backgroundColor: colors.callRed,
    },
    iconColor: colors.white,
  }));
