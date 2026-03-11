import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import { FontSizes, FontWeights } from '@theme';
import Svg, { Path } from 'react-native-svg';

type CallMessageItemProps = {
  message: string;
  isOwnMessage: boolean;
};

/**
 * Parse call message text like:
 * "Video call has been completed. call duration: 0h 2m 48s"
 * "Audio call has been completed. call duration: 0h 0m 32s"
 * "Video call has been missed"
 */
const parseCallMessage = (message: string) => {
  const lower = message.toLowerCase();
  const isVideo = lower.includes('video call');
  const isAudio = lower.includes('audio call');
  const isMissed = lower.includes('missed');
  const isDeclined = lower.includes('declined');
  const isCompleted = lower.includes('completed');
  const isNoAnswer = lower.includes('no answer');

  // Extract duration
  const durationMatch = message.match(
    /duration[:\s]*(\d+)h\s*(\d+)m\s*(\d+)s/i,
  );
  let duration = '';
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const mins = parseInt(durationMatch[2], 10);
    const secs = parseInt(durationMatch[3], 10);
    if (hours > 0) {
      duration = `${hours}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      duration = `${mins}m ${secs}s`;
    } else {
      duration = `${secs}s`;
    }
  }

  let status = 'Call ended';
  if (isMissed) {
    status = 'Missed';
  } else if (isDeclined) {
    status = 'Declined';
  } else if (isNoAnswer) {
    status = 'No answer';
  } else if (isCompleted) {
    status = 'Ended';
  }

  return { isVideo, isAudio, status, duration, isMissed };
};

export const isCallMessage = (message?: string): boolean => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    (lower.includes('video call') || lower.includes('audio call')) &&
    (lower.includes('completed') ||
      lower.includes('missed') ||
      lower.includes('declined') ||
      lower.includes('no answer'))
  );
};

export const CallMessageItem = ({ message, isOwnMessage }: CallMessageItemProps) => {
  const styles = CallMessageItemStyles();
  const { isVideo, status, duration, isMissed } = parseCallMessage(message);

  const iconColor = isMissed ? '#ef4444' : '#22c55e';

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, isMissed ? styles.missedCircle : styles.successCircle]}>
        <SvgIconButton
          icon={isVideo ? 'ChatVideoCall' : 'ChatCall'}
          iconProps={{
            height: mScale(18),
            width: mScale(18),
            color: iconColor,
          }}
          disabled
        />
        {isMissed && (
          <View style={styles.missedArrow}>
            <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
              <Path
                d="M8 2L2 8M2 8V3M2 8H7"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        )}
      </View>
      <View style={styles.textContainer}>
        <BaseText style={[styles.callType, isOwnMessage && styles.ownText]}>
          {isVideo ? 'Video Call' : 'Voice Call'}
        </BaseText>
        <BaseText style={[styles.callStatus, isOwnMessage && styles.ownSubText]}>
          {status}
          {duration ? ` · ${duration}` : ''}
        </BaseText>
      </View>
    </View>
  );
};

const CallMessageItemStyles = () =>
  useTheme(({ colors, theme }) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: mScale(10),
      paddingVertical: mScale(4),
      paddingHorizontal: mScale(2),
      minWidth: mScale(140),
    },
    iconCircle: {
      height: mScale(36),
      width: mScale(36),
      borderRadius: mScale(18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    successCircle: {
      backgroundColor: colors.searchInputBackground,
    },
    missedCircle: {
      backgroundColor: colors.lavender,
    },
    missedArrow: {
      position: 'absolute',
      bottom: mScale(2),
      right: mScale(2),
    },
    textContainer: {
      flex: 1,
    },
    callType: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.semibold,
      color: colors.text,
    },
    callStatus: {
      fontSize: FontSizes.size_12,
      color: colors.inputPlaceHolder,
      marginTop: mScale(1),
    },
    ownText: {
      color: theme === 'light' ? colors.black : colors.white,
    },
    ownSubText: {
      color: 'rgba(255,255,255,0.7)',
    },
  }));
