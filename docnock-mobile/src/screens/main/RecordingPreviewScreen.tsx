import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Slider, SliderThemeType } from 'react-native-awesome-slider';
import { useSharedValue } from 'react-native-reanimated';
import {
  ChatFooter,
  ChatFooterStyle,
  DashBoardHeader,
  ScreenWrapper,
  SvgIconButton,
} from '@components';
import { commonStyles } from '@styles';
import { devLogger, getValidMediaFileName, mScale, wp } from '@utils';
import { ChatAttachmentTypeRaw, useAudioRecorderAndPlayer, useTheme } from '@hooks';
import { useCustomRoute } from '@navigation';
import { store } from '@store';
import { renderLeftComponent } from './AllNurseList';
import { ImagesPreviewScreenStyles } from './ImagesPreviewScreen';

export const getTrackThemes: () => SliderThemeType = () => {
  const colors = store.getState().theme.colors;
  return {
    minimumTrackTintColor: colors.tint,
    maximumTrackTintColor: colors.searchInputBackground,
  };
};

export const RecordingPreviewScreen = () => {
  const isFocused = useIsFocused();
  const route = useCustomRoute<'RecordingPreviewScreen'>();
  const recording = route?.params?.recording;
  const chatId = route?.params?.chatId;
  const showChatInput = route?.params?.showChatInput;

  const minValue = useSharedValue(0);
  const maxValue = useSharedValue(100);
  const progress = useSharedValue(30);

  const {
    playRecording,
    pausePlayer,
    stopPlayer,
    renderDuration,
    renderRecordingTime,
    recorderState,
    onSeek,
    currentTime,
    duration,
  } = useAudioRecorderAndPlayer();

  const styles = RecordingPreviewScreenStyles();
  const chatFooterStyles = ChatFooterStyle();
  const imagesPreviewStyles = ImagesPreviewScreenStyles();

  const onPressStart = useCallback(async () => {
    try {
      await playRecording(recording);
    } catch (error) {
      devLogger('🚀 ~ onPressStart ~ error:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => {
    if (!isFocused) {
      stopPlayer?.();
    }
    if (recording && isFocused) {
      onPressStart();
    }
    return () => {
      stopPlayer?.();
    };
  }, [recording, stopPlayer, isFocused, onPressStart]);

  useEffect(() => {
    if (currentTime && duration && currentTime === duration) {
      stopPlayer();
    }

    const progressFloat = (currentTime / duration) * 100;
    progress.set(progressFloat);
  }, [currentTime, duration, stopPlayer, progress]);

  const processedRecordings: ChatAttachmentTypeRaw[] = useMemo(() => {
    if (!recording) {
      return [];
    }
    let ext = recording.split('.').pop();
    if(Platform.OS == 'android' && ext == 'mp4') {
      ext = 'mp4a';
    }
    const fileName = getValidMediaFileName(chatId, ext);
    return [{ fileName, type: ext, mime: ext, uri: recording }] as ChatAttachmentTypeRaw[];
  }, [recording, chatId]);

  return (
    <View style={[commonStyles.flex, imagesPreviewStyles.container]}>
      <ScreenWrapper
        enableTopSafeArea={false}
        enableBottomSafeArea={false}
        style={[commonStyles.flex]}
        edges={['top']}
      >
        <DashBoardHeader
          renderLeftComponent={renderLeftComponent}
          containerStyle={[imagesPreviewStyles.headerContainerStyle]}
          headerText={`Preview Recording`}
          {...{ disableRightComponent: true }}
        />
        <View style={[commonStyles.flex, commonStyles.centerCenter, styles.audioContainer]}>
          <View style={[commonStyles.rowItemsCenter, styles.sliderContainer]}>
            {renderRecordingTime()}
            <Slider
              style={styles.sliderStyle}
              progress={progress}
              minimumValue={minValue}
              maximumValue={maxValue}
              bubbleContainerStyle={styles.sliderBubbleContainer}
              onSlidingComplete={
                duration !== currentTime ? onSeek.bind(this, recording) : undefined
              }
              theme={getTrackThemes()}
              onValueChange={duration !== currentTime ? onSeek.bind(this, recording) : undefined}
            />
            {renderDuration()}
          </View>
          <View style={[commonStyles.rowItemsCenter]}>
            <SvgIconButton
              icon={recorderState === 'playing' ? 'Pause' : 'Play'}
              style={[
                commonStyles.centerCenter,
                chatFooterStyles.sendButton,
                chatFooterStyles.recorderButtons,
              ]}
              onPress={recorderState === 'playing' ? pausePlayer : onPressStart}
            />
          </View>
        </View>
      </ScreenWrapper>
      {showChatInput && (
        <ChatFooter
          onlyText
          chatId={chatId}
          selectedMedia={processedRecordings}
          allowWithoutTextSend
          goBackAfterSend
        />
      )}
    </View>
  );
};

export const RecordingPreviewScreenStyles = () =>
  useTheme(() => ({
    audioContainer: {
      gap: mScale(16),
    },
    sliderContainer: {
      gap: wp(2),
    },
    sliderStyle: {
      maxWidth: wp(65),
      alignSelf: 'center',
      maxHeight: mScale(50),
    },
    sliderBubbleContainer: {
      display: 'none',
    },
  }));
