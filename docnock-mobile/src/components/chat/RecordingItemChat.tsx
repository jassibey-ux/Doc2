import React from 'react';
// import { View } from 'react-native';
// import { Slider } from 'react-native-awesome-slider';
// import LottieView from 'lottie-react-native';
// import { useSharedValue } from 'react-native-reanimated';
// import { LottieFiles } from '@assets';
// import { useTheme } from '@hooks';
// import { mScale, wp } from '@utils';
import { commonStyles } from '@styles';
// import { getTrackThemes, RecordingPreviewScreenStyles } from '@screens';
// import { ChatFooterStyle } from './ChatFooter';
import { BaseTouchable, SvgIconButton } from '../button';
import { ChatItemAttachmentType } from '@store';
// import { useIsFocused } from '@react-navigation/native';
import { BaseText } from '../BaseText';
import { useCustomNavigation } from '@navigation';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';

const getRecordingDisplayName = (recording?: ChatItemAttachmentType): string => {
  const givenName = (recording?.name ?? '').trim();
  if (givenName) {
    return givenName;
  }

  const mediaUrl = (recording?.uri ?? recording?.data ?? '').trim();
  if (mediaUrl) {
    const lastPart = mediaUrl.split('/').pop()?.split('?')[0] ?? '';
    if (lastPart) {
      try {
        return decodeURIComponent(lastPart);
      } catch (_e) {
        return lastPart;
      }
    }
  }

  const mediaType = (recording?.type ?? '').toLowerCase();
  const ext = mediaType.includes('/') ? mediaType.split('/')[1] : '';
  return ext ? `Audio.${ext}` : 'Audio file';
};

export const RecordingItemChat = ({
  self,
  recordings,
  chatId,
}: {
  self: boolean;
  recordings: ChatItemAttachmentType[];
  chatId: string;
}) => {
  const navigation = useCustomNavigation();
  const styles = RecordingItemChatStyles();
  // const LottieState = React.useRef<LottieView>(null);

  // const minValue = useSharedValue(0);
  // const maxValue = useSharedValue(100);
  // const progress = useSharedValue(30);

  const recording = recordings?.[0];
  const displayName = getRecordingDisplayName(recording);
  // console.log("🚀 ~ recording:", recording?.uri)
  // // const recordingURI: string = recording?.uri ?? '';
  // // const {
  // //   renderDuration,
  // //   renderRecordingTime,
  // //   onSeek,
  // //   playRecording,
  // //   pausePlayer,
  // //   stopPlayer,
  // //   recorderState,
  // //   currentTime,
  // //   duration,
  // // } = useAudioRecorderAndPlayer();
  // console.log("🚀 ~ recorderState:", recorderState)
  // const isFocused = useIsFocused();

  // const chatFooterStyles = ChatFooterStyle();
  // const recordingPreviewScreenStyles = RecordingPreviewScreenStyles();
  // const styles = Styles();

  // const onPlay = async () => {
  //   console.log("called onPlay", recordingURI)
  //   if (!recordingURI) {
  //     return;
  //   }
  //   await playRecording?.(recordingURI);
  //   setTimeout(() => {
  //     LottieState.current?.play();
  //   }, 250);
  // };

  // const onPause = () => {
  //   pausePlayer?.();
  //   LottieState.current?.pause();
  // };

  // useEffect(() => {
  //   if (!isFocused) {
  //     stopPlayer?.();
  //   }
  // }, [isFocused, stopPlayer]);

  // useEffect(() => {
  //   if (currentTime && duration && currentTime === duration) {
  //     stopPlayer();
  //   }

  //   const progressFloat = (currentTime / duration) * 100;
  //   progress.set(progressFloat);
  // }, [currentTime, duration, stopPlayer, progress]);

  // const Lottie = (
  //   <LottieView
  //     source={LottieFiles.recording}
  //     style={[chatFooterStyles.lottieStyle, styles.lottieStyle]}
  //     loop
  //     ref={LottieState}
  //     autoPlay={false}
  //   />
  // );

  // const isPlaying = recorderState === 'playing';

  const onPressItem = () => {
    // {console.log('recoding url', recording?.uri )}
    navigation.navigate('RecordingPreviewScreen', {
      recording: recording?.uri ?? '',
      chatId,
      showChatInput: false,
    });
  };

  return (
    <BaseTouchable
      style={[
        commonStyles.rowItemsCenter,
        styles.container,
        self ? styles.selfContainer : styles.otherContainer,
      ]}
      onPress={onPressItem}
    >
      <BaseTouchable style={styles.iconContainer} onPress={onPressItem}>
        <SvgIconButton icon="ChatVoiceNote" />
      </BaseTouchable>
      <BaseTouchable style={styles.contentContainer} onPress={onPressItem}>
        <BaseText style={styles.fileName} numberOfLines={1}>
          {displayName}
        </BaseText>
        <BaseText style={styles.metaText} numberOfLines={1}>
          Audio file
        </BaseText>
      </BaseTouchable>
      {/* <BaseText>.pdf</BaseText> */}
    </BaseTouchable>
  );
};

const RecordingItemChatStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      borderRadius: mScale(14),
      paddingVertical: mScale(10),
      paddingHorizontal: mScale(12),
      gap: mScale(10),
      minWidth: mScale(210),
      maxWidth: mScale(280),
      alignItems: 'center',
    },
    selfContainer: {
      backgroundColor: colors.inputBackground,
    },
    otherContainer: {
      backgroundColor: colors.primary,
    },
    iconContainer: {
      height: mScale(34),
      width: mScale(34),
      borderRadius: mScale(17),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.searchInputBackground,
    },
    contentContainer: {
      flex: 1,
      gap: mScale(2),
    },
    fileName: {
      fontSize: FontSizes.size_15,
      fontWeight: FontWeights.medium,
      color: colors.text,
    },
    metaText: {
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.regular,
      color: colors.inputPlaceHolder,
    },
  }));

// oldCode
//       {/* {Lottie}
//       <View style={[styles.flexShrink, styles.sliderContainer]}>
//         <Slider
//           style={styles.sliderStyle}
//           progress={progress}
//           minimumValue={minValue}
//           maximumValue={maxValue}
//           bubbleContainerStyle={recordingPreviewScreenStyles.sliderBubbleContainer}
//           onSlidingComplete={onSeek.bind(this, recordingURI ?? '')}
//           onValueChange={onSeek.bind(this, recordingURI ?? '')}
//           theme={getTrackThemes()}
//         />

//         <View style={[commonStyles.rowItemsCenter, styles.durationContainer]}>
//           {renderRecordingTime()}
//           {renderDuration()}
//         </View>
//       </View>
//       <SvgIconButton icon={isPlaying ? 'Pause' : 'Play'} onPress={isPlaying ? onPause : onPlay} />
//       <SvgIconButton icon="Pause" onPress={onPause} /> */}

// const Styles = () =>
//   useTheme(() => ({
//     flexShrink: {
//       flexShrink: 1,
//     },
//     lottieStyle: {
//       height: mScale(35),
//       paddingVertical: 0,
//       width: mScale(35),
//     },
//     sliderContainer: {
//       marginHorizontal: mScale(6),
//       marginRight: mScale(10),
//     },
//     sliderStyle: {
//       maxWidth: wp(30),
//     },
//     durationContainer: {
//       gap: mScale(30),
//     },
//   }));
