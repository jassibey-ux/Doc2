import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Alert, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'react-native-image-crop-picker';
import LottieView from 'lottie-react-native';
import { types } from '@react-native-documents/picker';
import { devLogger, mScale, vscale } from '@utils';
import { FontSizes, UI } from '@theme';
import { commonStyles } from '@styles';
import { RootStackParamList, useCustomNavigation } from '@navigation';
import {
  ChatAttachmentTypeRaw,
  MAX_RECORDING_DURATION,
  RecorderState,
  useAppDispatch,
  useAppSelector,
  useAudioRecorderAndPlayer,
  useChatSocket,
  useDocumentPicker,
  useMediaPicker,
  useTheme,
} from '@hooks';
import {
  ChatItemType,
  editChat,
  setLoader,
  updateChat,
} from '@store';
import { LottieFiles } from '@assets';
import { BaseTouchable, SvgIconButton, SvgIconButtonProps } from '../button';
import { BaseText } from '../BaseText';
import { BackDropComponent, ChatHeaderStyle } from './ChatHeader';
import { BaseInput } from '../input';
import { KeyboardAwareWrapper } from '../wrapper';
import { useIsFocused } from '@react-navigation/native';

export type ChatInputAttachmentOptionType = {
  icon: SvgIconButtonProps['icon'];
  title: string;
};

export const ChatInputAttachmentOptions: ChatInputAttachmentOptionType[] = [
  { icon: 'ChatSelectPhotos', title: 'Photos' },
  { icon: 'ChatDocuments', title: 'Documents' },
  { icon: 'ChatVoiceNote', title: 'Mic' },
  { icon: 'ChatAttachments', title: 'Attachment' },
];

export type ChatFooterProps = {
  onlyText?: boolean;
  chatId?: string;
  selectedMedia?: ChatAttachmentTypeRaw[];
  allowWithoutTextSend?: boolean;
  goBackAfterSend?: boolean;
  onCancelEdit?: () => void;
  messageSelected?: Partial<ChatItemType>;
  isForm?: boolean;
  backToBottom?: () => void;
};

const ChatFooterComponent = ({
  onlyText,
  chatId,
  selectedMedia = [],
  allowWithoutTextSend = false,
  goBackAfterSend = false,
  onCancelEdit,
  messageSelected,
  isForm = false,
  backToBottom = () => {},
}: ChatFooterProps) => {
  const isFocused = useIsFocused();
  const dispatch = useAppDispatch();
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const navigation = useCustomNavigation();
  const { bottom } = useSafeAreaInsets();
  const {
    startRecording,
    stopRecording,
    recorderState,
    renderRecordingTime,
    pauseRecording,
    resetStates,
    currentTime,
    requestRecordingPermission,
  } = useAudioRecorderAndPlayer();

  const chatHeaderStyles = ChatHeaderStyle();
  const styles = ChatFooterStyle();
  const { theme, colors } = useTheme(_t => _t);

  const [messageText, setMessageText] = useState('');
  const [attachmentExpanded, setAttachmentExpanded] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [typingStarted, setTypingStarted] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingType, setUploadingType] = useState<'image' | 'audio' | null>(null);

  const LottieState = useRef<LottieView>(null);
  const InputRef = useRef<TextInput>(null);

  const onSelectPhotos = (response: Image | Image[]) => {
    const images: RootStackParamList['ImagesPreviewScreen']['images'] = [];
    if (Array.isArray(response)) {
      images.push(...response);
    } else {
      images.push(response);
    }
    if (!chatId) {
      return;
    }
    navigation.navigate('ImagesPreviewScreen', {
      images,
      initialIndex: 0,
      isEdit: true,
      showChatInput: true,
      chatId,
    });
  };

  const { askOptions } = useMediaPicker(onSelectPhotos, 2, true, {
    multiple: true,
    maxFiles: 10,
  });
  const { pickDocument } = useDocumentPicker();

  const { emitTyping, emitStopTyping, emitSendMessage, emitGetMessages, emitEditMessage } =
    useChatSocket();

  const playLottie = () => LottieState?.current?.play();
  const pauseLottie = useCallback(() => LottieState?.current?.pause(), []);

  const renderInnerRightComponent = () => {
    if (messageSelected) {
      return <SvgIconButton icon="ChatPlus" style={[styles.closeIcon]} onPress={onCancelEdit} />;
    }
    return (
      <View style={[commonStyles.rowItemsCenter, styles.inputOptionContainer]}>
        <SvgIconButton
          icon="ChatInputAlert"
          iconProps={{ color: isImportant ? 'red' : colors.secondary }}
          onPress={setIsImportant.bind(this, !isImportant)}
        />
        <SvgIconButton
          icon="ChatPlus"
          style={[attachmentExpanded ? styles.closeIcon : styles.plusIcon]}
          onPress={setAttachmentExpanded.bind(this, !attachmentExpanded)}
        />
      </View>
    );
  };

  const onPickDocuments = async () => {
    try {
      setLoader(true);
      const response = await pickDocument({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      if (response && response?.length) {
        const finalArray: RootStackParamList['DocumentPreviewScreen']['documents'] = [
          ...response,
        ].map(item => ({
          fileName: item?.name ?? '',
          uri: item?.uri,
          type: item?.type ?? types.pdf,
        }));
        navigation.navigate('DocumentPreviewScreen', {
          documents: finalArray,
          initialIndex: 0,
          isEdit: false,
          showChatInput: true,
          chatId,
        });
      }
      setLoader(false);
    } catch (error) {
      devLogger('🚀 ~ onPickDocuments ~ error:', error);
      setLoader(false);
    }
  };

  const onMicAction = async () => {
    const permissionGranted = await requestRecordingPermission();
    if (!permissionGranted) {
      return;
    }
    setAttachmentExpanded(false);
    setTimeout(() => {
      playLottie();
    }, 500);
    stopRecording?.();
    await startRecording();
  };

  const getActionHandler = async (action: string) => {
    switch (action) {
      case 'Photos':
        askOptions();
        break;
      case 'Attachment':
        onPickDocuments();
        break;

      case 'Mic':
        await onMicAction();
        break;

      case 'Documents':
        navigation.navigate('ChatDocumentFormScreen', { chatId });
        break;
      default:
        break;
    }
  };

  const onStartRecording = () => {
    playLottie();
    startRecording();
  };

  const onPauseRecording = useCallback(() => {
    pauseLottie();
    pauseRecording();
  }, [pauseLottie, pauseRecording]);

  const onDoneRecording = useCallback(async () => {
    try {
      setLoader(true);
      pauseLottie();
      const response = await stopRecording();
      setLoader(false);
      if (response) {
        navigation.navigate('RecordingPreviewScreen', {
          recording: response,
          chatId,
          showChatInput: true,
        });
      }
    } catch (error) {
      devLogger('🚀 ~ onDeleteRecording ~ error:', error);
      setLoader(false);
    }
  }, [chatId, navigation, stopRecording, pauseLottie]);

  const onDeleteRecording = async () => {
    try {
      setLoader(true);
      pauseLottie();
      await stopRecording();
      setLoader(false);
    } catch (error) {
      devLogger('🚀 ~ onDeleteRecording ~ error:', error);
      setLoader(false);
    }
  };

  const onDiscardRecording = async () => {
    pauseLottie();
    await pauseRecording();
    Alert.alert('Are you sure', 'You want to discard the recording?', [
      {
        text: 'Yes, Discard',
        onPress: onDeleteRecording,
        style: 'destructive',
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  useEffect(() => {
    if (currentTime && currentTime >= MAX_RECORDING_DURATION) {
      onPauseRecording();
    }
  }, [currentTime, onPauseRecording]);

  const Lottie = (
    <LottieView
      source={LottieFiles.recording}
      style={styles.lottieStyle}
      onAnimationFailure={playLottie}
      loop
      ref={LottieState}
    />
  );

  useEffect(() => {
    const stopTypingTimeout = setTimeout(() => {
      if (chatId && typingStarted) {
        emitStopTyping?.(chatId);
        setTypingStarted(false);
      }
    }, 2000);

    return () => {
      clearTimeout(stopTypingTimeout);
    };
  }, [chatId, emitStopTyping, messageText, typingStarted]);

  useEffect(() => {
    return () => {
      isFocused && stopRecording?.();
      resetStates();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  useEffect(() => {
    if (messageSelected) {
      setMessageText(messageSelected?.message ?? '');
      InputRef?.current?.focus();
    } else {
      setMessageText('');
    }
  }, [messageSelected]);

  const onTyping = (text: string) => {
    setMessageText(text);
    if (chatId && !typingStarted) {
      emitTyping(chatId);
      setTypingStarted(true);
    }
  };

  const onSend = async () => {
    if (!allowWithoutTextSend && !messageText) return;

    if (chatId && loginDetails?.profile?._id) {
      emitStopTyping?.(chatId);

      // If sending media, show upload progress
      if (selectedMedia && selectedMedia.length > 0) {
        setUploadProgress(0);
        setUploadingType(selectedMedia[0]?.type?.startsWith('audio') ? 'audio' : 'image');
      }

      // Provide onProgress callback to update UI during upload
      const sent = await emitSendMessage(
        messageText,
        chatId,
        undefined,
        isImportant,
        selectedMedia,
        (percent: number) => {
          setUploadProgress(percent);
          if (percent >= 100) {
            // small delay to show completion
            setTimeout(() => {
              setUploadProgress(null);
              setUploadingType(null);
            }, 400);
          }
        },
      );

      if (sent) {
        setIsImportant(false);
        setMessageText('');
        backToBottom();
        if (goBackAfterSend) {
          navigation.goBack();
          isForm && navigation.goBack();
        }
      }
    }
  };

  const onUpdateMessage = async () => {
    if (!messageSelected?.messageId || !chatId || !messageText) {
      return;
    }

    console.log('messageSelected<><><>', messageSelected);
    emitEditMessage(chatId, messageSelected?.messageId?.toString(), messageText);
    dispatch(editChat({ ...messageSelected, message: messageText ?? '' }));
    onCancelEdit?.();
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: bottom ? UI.spacing.sm + bottom : UI.spacing.md },
      ]}
    >
      <KeyboardAwareWrapper extraKeyboardSpace={Platform.OS === 'ios' ? -vscale(30) : 0}>
        {!(['recording', 'recording-paused'] as RecorderState[]).includes(recorderState) ? (
          <View style={[commonStyles.rowItemsCenter, styles.innerContainer]}>
            <BaseInput
              ref={InputRef}
              placeholder="Write a message"
              containerStyle={[commonStyles.flex]}
              value={messageText}
              onChangeText={onTyping}
              {...(!onlyText ? { renderInnerRightComponent } : {})}
            />
            <SvgIconButton
              icon="ChatSend"
              iconProps={{ color: colors.white }}
              style={[commonStyles.centerCenter, styles.sendButton]}
              onPress={messageSelected?.messageId ? onUpdateMessage : onSend}
            />
          </View>
        ) : (
          <View style={[commonStyles.rowItemCenterJustifyBetween, styles.recordingContainer]}>
            <View style={[commonStyles.rowItemsCenter]}>
              {Lottie}
              {renderRecordingTime()}
            </View>
            <View style={[commonStyles.rowItemsCenter, styles.recordingActionContainer]}>
              {currentTime <= MAX_RECORDING_DURATION && (
                <>
                  {recorderState === 'recording-paused' && (
                    <SvgIconButton
                      icon="Play"
                      style={[commonStyles.centerCenter, styles.sendButton, styles.recorderButtons]}
                      onPress={onStartRecording}
                    />
                  )}
                  {recorderState === 'recording' && (
                    <>
                      <SvgIconButton
                        icon="Pause"
                        style={[
                          commonStyles.centerCenter,
                          styles.sendButton,
                          styles.recorderButtons,
                        ]}
                        onPress={onPauseRecording}
                      />
                    </>
                  )}
                </>
              )}
              <SvgIconButton
                icon="CheckBold"
                style={[commonStyles.centerCenter, styles.sendButton, styles.recorderButtons]}
                onPress={onDoneRecording}
              />
              <SvgIconButton
                icon="Trash"
                style={[commonStyles.centerCenter, styles.sendButton, styles.recorderButtons]}
                onPress={onDiscardRecording}
              />
            </View>
          </View>
        )}
        {!onlyText && attachmentExpanded && (
          <View style={[commonStyles.rowItemsCenter, styles.attachmentOptionsContainer]}>
            {ChatInputAttachmentOptions.map(option => (
              <BaseTouchable
                key={option.title}
                style={[commonStyles.flex, commonStyles.centerCenter, styles.attachmentItem]}
              >
                <SvgIconButton
                  icon={option.icon}
                  style={[commonStyles.centerCenter, styles.attachmentIcon]}
                  onPress={getActionHandler.bind(this, option.title)}
                />
                <BaseText style={styles.text}>{option.title}</BaseText>
              </BaseTouchable>
            ))}
          </View>
        )}
        {/* Upload Progress UI */}
        {uploadProgress !== null && (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <ActivityIndicator size="small" color={colors.tint} />
            <BaseText style={{ color: colors.tint, marginTop: 4 }}>
              {uploadingType === 'audio' ? 'Uploading audio' : 'Uploading image'}: {uploadProgress}%
            </BaseText>
          </View>
        )}
      </KeyboardAwareWrapper>
      <BackDropComponent blurType={theme} style={chatHeaderStyles.backgroundBlur} />
    </View>
  );
};

export const ChatFooter = memo(ChatFooterComponent);

export const ChatFooterStyle = () =>
  useTheme(({ colors }) => ({
    container: {
      width: '100%',
      paddingTop: UI.spacing.md,
      paddingHorizontal: UI.screenPadding,
      borderTopLeftRadius: UI.radii.normal,
      borderTopRightRadius: UI.radii.normal,
      overflow: 'hidden',
      zIndex: 20,
    },
    innerContainer: {
      width: '100%',
      gap: UI.spacing.md,
    },
    inputOptionContainer: {
      gap: UI.spacing.lg,
      marginLeft: UI.spacing.sm,
    },
    sendButton: {
      backgroundColor: colors.tint,
      height: 48,
      width: 48,
      borderRadius: 24,
    },
    recorderButtons: {
      backgroundColor: colors.inputBackground,
    },
    attachmentOptionsContainer: {
      marginTop: UI.spacing.lg,
    },
    attachmentItem: {
      gap: UI.spacing.xs,
    },
    attachmentIcon: {
      height: UI.avatar.small,
      width: UI.avatar.small,
      borderRadius: UI.avatar.small / 2,
      backgroundColor: colors.inputBackground,
    },
    text: {
      fontSize: FontSizes.size_12,
    },
    closeIcon: {
      transform: [{ rotate: '45deg' }],
    },
    plusIcon: {
      transform: [{ rotate: '0deg' }],
    },
    recordingContainer: {
      marginHorizontal: mScale(16),
    },
    lottieStyle: {
      width: mScale(50),
      height: mScale(50),
    },
    recordingActionContainer: {
      gap: mScale(8),
    },
  }));
