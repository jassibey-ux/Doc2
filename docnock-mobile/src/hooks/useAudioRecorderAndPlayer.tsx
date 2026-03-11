import React, { useCallback, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet } from 'react-native';
import RNFS from 'react-native-fs';
import AudioRecorder, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  AVModeIOSOption,
} from 'react-native-audio-recorder-player';
import { showMessage } from 'react-native-flash-message';
import { compressAudio, devLogger, IS_ANDROID } from '@utils';
import { BaseText } from '@components';
import { FontSizes, FontWeights } from '@theme';
import { check, PERMISSIONS, request } from 'react-native-permissions';

export type RecorderState =
  | 'inactive'
  | 'recording-paused'
  | 'player-paused'
  | 'recording'
  | 'playing';

export const MAX_RECORDING_DURATION = 1000 * 60 * 10;

const AudioRecorderInstance = new AudioRecorder();

const getCachedAudioPath = async (remoteUri: string) => {
  const cleanedUri = remoteUri.split('?')[0];
  const fileName = cleanedUri.split('/').pop() || `audio_${Date.now()}.mp3`;
  const cachePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
  const fileExists = await RNFS.exists(cachePath);
  if (!fileExists) {
    await RNFS.downloadFile({
      fromUrl: remoteUri,
      toFile: cachePath,
    }).promise;
  }
  return cachePath;
};

export const useAudioRecorderAndPlayer = () => {
  const [recorderState, setRecorderState] = useState<RecorderState>('inactive');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const requestRecordingPermission = useCallback(async () => {
    try {
      const permissionToCheck =
        Platform.OS === 'ios' ? PERMISSIONS.IOS.MICROPHONE : PERMISSIONS.ANDROID.RECORD_AUDIO;
      const status = await check(permissionToCheck);
      if (status === 'granted') {
        return true;
      }
      const requestStatus = await request(permissionToCheck);
      if (requestStatus === 'granted') {
        return true;
      }
      Alert.alert('Permission denied', 'Please enable microphone permission from settings', [
        {
          text: 'Cancel',
        },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return false;
    } catch (error) {
      devLogger('🚀 ~ requestRecordingPermission ~ error:', error);
      return false;
    }
  }, []);

  const resetStates = useCallback(() => {
    setCurrentTime(0);
    setRecorderState('inactive');
    AudioRecorderInstance.removeRecordBackListener();
    AudioRecorderInstance.removePlayBackListener();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (recorderState === 'recording-paused') {
        const response = await AudioRecorderInstance.resumeRecorder();
        devLogger('🚀 ~ startRecording ~ response:', response);
        setRecorderState('recording');
      } else {
        const response = await AudioRecorderInstance.startRecorder(undefined, {
          AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
          AudioSourceAndroid: AudioSourceAndroidType.MIC,
          AVModeIOS: AVModeIOSOption.measurement,
          AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
          AVNumberOfChannelsKeyIOS: 2,
          AVFormatIDKeyIOS: AVEncodingOption.aac,
        });
        devLogger('🚀 ~ startRecording ~ response:', response);
        setRecorderState('recording');
        AudioRecorderInstance.addRecordBackListener(props => {
          devLogger('🚀 ~ startRecording ~ props:', props);
          setCurrentTime(props?.currentPosition);
        });
      }
    } catch (error) {
      devLogger('🚀 ~ startRecording ~ error:', error);
      showMessage({
        type: 'danger',
        message: 'Recording failed',
        description: 'Something went wrong',
      });
    }
  }, [recorderState]);

  const stopRecording = useCallback(async () => {
    try {
      const response = await AudioRecorderInstance.stopRecorder();
      let compressedResult;
      if (!response?.toLowerCase().includes('already stopped')) {
        if (IS_ANDROID) {
          compressedResult = { path: response };
        } else {
          compressedResult = await compressAudio(response);
        }
      }
      devLogger('🚀 ~ stopRecording ~ response:', { response, compressedResult });
      resetStates?.();
      return compressedResult?.path;
    } catch (error) {
      devLogger('🚀 ~ stopRecording ~ error:', error);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      const response = await AudioRecorderInstance.pauseRecorder();
      setRecorderState('recording-paused');
      devLogger('🚀 ~ pauseRecording ~ response:', response);
    } catch (error) {
      devLogger('🚀 ~ pauseRecording ~ error:', error);
    }
  }, []);

  const renderRecordingTime = () => {
    const timeString = AudioRecorderInstance?.mmssss(Math.floor(currentTime));

    return (
      <BaseText style={styles.timeText}>{`${timeString?.slice(
        0,
        timeString?.length - 3,
      )}`}</BaseText>
    );
  };

  const renderDuration = () => {
    const timeString = AudioRecorderInstance?.mmssss(Math.floor(duration));

    return (
      <BaseText style={styles.timeText}>{`${timeString?.slice(
        0,
        timeString?.length - 3,
      )}`}</BaseText>
    );
  };

  const addPlayerCallback = () => {
    AudioRecorderInstance.addPlayBackListener(props => {
      setCurrentTime(props?.currentPosition);
      setDuration(props?.duration);
    });
  };

  const playRecording = useCallback(
    async (uri: string) => {
      try {
        await AudioRecorderInstance?.stopRecorder();
        if (recorderState === 'player-paused') {
          await AudioRecorderInstance.resumePlayer();
          setRecorderState('playing');
          return true;
        } else if (recorderState === 'inactive') {
          const isRemoteUri = uri?.startsWith('http://') || uri?.startsWith('https://');
          const hasFileScheme = uri?.startsWith('file://');
          const playableUri =
            Platform.OS === 'ios' && isRemoteUri ? await getCachedAudioPath(uri) : uri;
          const processedUri =
            Platform.OS === 'ios' && !hasFileScheme ? `file://${playableUri}` : playableUri;
          await AudioRecorderInstance.startPlayer(processedUri);
          addPlayerCallback();
          setRecorderState('playing');
          return true;
        }
        return false;
      } catch (error) {
        devLogger('🚀 ~ error:', error);
        return false;
      }
    },
    [recorderState],
  );

  const pausePlayer = async () => {
    await AudioRecorderInstance.pausePlayer();
    setRecorderState('player-paused');
  };

  const stopPlayer = useCallback(async () => {
    await AudioRecorderInstance.stopPlayer();
    setCurrentTime(0);
    setRecorderState('inactive');
  }, []);

  const onSeek = async (uri: string, value: number) => {
    const finalTime = duration * (value / 100);
    if (recorderState === 'inactive') {
      playRecording(uri);
    }
    const response = await AudioRecorderInstance.seekToPlayer(finalTime);
    await AudioRecorderInstance.resumePlayer();
    setRecorderState('playing');
    devLogger('🚀 ~ onSeek ~ response:', response);
  };

  return {
    instance: AudioRecorderInstance,
    recorderState,
    currentTime,
    startRecording,
    stopRecording,
    pauseRecording,
    resetStates,
    renderRecordingTime,
    renderDuration,
    playRecording,
    pausePlayer,
    stopPlayer,
    duration,
    onSeek,
    requestRecordingPermission,
  };
};

const styles = StyleSheet.create({
  timeText: {
    fontSize: FontSizes.size_16,
    fontWeight: FontWeights.semibold,
  },
});
