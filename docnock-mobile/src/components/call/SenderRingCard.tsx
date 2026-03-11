import React, { useEffect, useState } from 'react';
import { Modal, StatusBar, StyleSheet, View } from 'react-native';
import { checkIsLightTheme, mScale } from '@utils';
import { commonStyles } from '@styles';
import { useTheme } from '@hooks';
import { useCallContext } from '@context';
import { Images } from '@assets';
import { BaseImage } from '../BaseImage';
import { SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import Sound from 'react-native-sound';
import { FontSizes, FontWeights } from '@theme';

interface SenderRingCardProps {
onCancelPress: () => void;
}
export const SenderRingCard = ({
    onCancelPress,
}:SenderRingCardProps) => {
  const [isSongLoaded, setIsSongLoaded] = useState(false);
  const [loadedSound, setLoadedSound] = useState<Sound | null>(null);

  const {
    callingValue,
    callSenderDetails,
    showCallSenderModel,
  } = useCallContext();

  const styles = Styles();


  const initializeSound = async () => {
    const ringSound = new Sound('call_ring', Sound.MAIN_BUNDLE, error => {
      if (!error) {
        ringSound?.setNumberOfLoops(-1);
        setIsSongLoaded(true);
      }
    });
    setLoadedSound(ringSound);
  };

  useEffect(() => {
    initializeSound();
  }, []);

  useEffect(() => {
    if (showCallSenderModel && isSongLoaded && loadedSound) {
      loadedSound?.play();
    }
    return () => {
      loadedSound?.stop();
    };
  }, [showCallSenderModel, isSongLoaded, loadedSound]);

  return (
    <Modal transparent visible={showCallSenderModel} animationType="fade" statusBarTranslucent>
      {showCallSenderModel && (
        <View style={styles.container}>
          {callSenderDetails?.image ? (
            <BaseImage
              containerStyle={[StyleSheet.absoluteFill, styles.backgroundImageContainer]}
              withShimmer={true}
              source={{ uri: callSenderDetails?.image }}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.noImageBackground]} />
          )}
          <View style={[StyleSheet.absoluteFill, styles.dimOverlay]} />

          <View style={styles.topRow}>
            <SvgIconButton icon="ChevronLeft" style={styles.topActionButton} />
            <SvgIconButton icon="Export" style={styles.topActionButton} />
          </View>

          <View style={styles.infoContainer}>
            <BaseText style={styles.personName} numberOfLines={1}>
              {callSenderDetails?.title ?? 'Call'}
            </BaseText>
            <BaseText style={styles.callingText} numberOfLines={1}>
              {`${callingValue || 'Ringing'}...`}
            </BaseText>
          </View>

          <View style={styles.bottomActionsContainer}>
            <View style={[commonStyles.rowItemsCenter, styles.bottomActionRow]}>
              <SvgIconButton
                icon="Call2"
                style={[styles.iconContainer, styles.rejectButtonStyle]}
                iconProps={styles.endCallIcon}
                onPress={onCancelPress}
              />
            </View>
          </View>
        </View>
      )}
      <StatusBar translucent={true} barStyle={'light-content'} backgroundColor={'transparent'} />
    </Modal>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      flex: 1,
      backgroundColor: colors.black,
      justifyContent: 'space-between',
      paddingTop: mScale(54),
      paddingBottom: mScale(34),
      paddingHorizontal: mScale(16),
    },
    backgroundImageContainer: {
      opacity: 0.95,
    },
    noImageBackground: {
      backgroundColor: colors.black,
    },
    dimOverlay: {
      backgroundColor: colors.blackOpacity05,
    },
    topRow: {
      zIndex: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    topActionButton: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(38),
    },
    infoContainer: {
      alignItems: 'center',
      marginTop: mScale(20),
      zIndex: 2,
    },
    personName: {
      fontSize: FontSizes.size_34,
      fontWeight: FontWeights.bold,
      textAlign: 'center',
      color: colors.white,
    },
    callingText: {
      marginTop: mScale(4),
      fontSize: FontSizes.size_18,
      fontWeight: FontWeights.medium,
      color: colors.white,
      opacity: 0.9,
      textAlign: 'center',
    },
    bottomActionsContainer: {
      zIndex: 2,
      alignItems: 'center',
    },
    bottomActionRow: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(40),
      paddingHorizontal: mScale(16),
      paddingVertical: mScale(10),
      gap: mScale(10),
    },
    iconContainer: {
      width: mScale(58),
      height: mScale(58),
      borderRadius: mScale(40),
      backgroundColor: colors.blackOpacity05,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectButtonStyle: {
      backgroundColor: colors.callRed,
      transform: [{ rotate: '135deg' }],
    },
    endCallIcon: {
      color: colors.white,
    },
  }));
