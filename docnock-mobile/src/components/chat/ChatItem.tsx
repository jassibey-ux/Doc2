import { useAppSelector, useTheme } from '@hooks';
import { ChatItemAttachmentType, ChatItemType } from '@store';
import { commonStyles } from '@styles';
import { formatChatDate, mScale } from '@utils';
import { Swipeable } from 'react-native-gesture-handler';
import { SvgIconButton, SvgIconButtonProps } from '../button';
import { DocumentItemChat } from './DocumentItemChat';
import { RecordingItemChat } from './RecordingItemChat';
import { PhotosItemChat } from './PhotosItemChat';
import { BaseHighlightText } from '../BaseHighlightText';
import { BaseText } from '../BaseText';
import { GroupDataType } from '@navigation';
import { CallMessageItem, isCallMessage } from './CallMessageItem';
import dayjs from 'dayjs';
import { ChatListStyles } from './ChatList';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export const ChatItem = ({
  item,
  index,
  searchText = '',
  groupData,
  chatMessages,
  onEditMessage: _onEditMessage,
  onDeleteMessage: _onDeleteMessage,
  messageOpened,
  setMessageOpened,
}: {
  item: Partial<ChatItemType>;
  index: number;
  searchText?: string;
  groupData?: GroupDataType;
  chatMessages: Partial<ChatItemType>[];
  onEditMessage: (item: Partial<ChatItemType>) => void;
  onDeleteMessage: (item: Partial<ChatItemType>) => void;
  messageOpened?: Partial<ChatItemType>;
  setMessageOpened?: (item?: Partial<ChatItemType>) => void;
}) => {
  const colors = useTheme(({ colors: _c }) => _c);
  const { theme } = useTheme(_t => _t);

  const chatId = groupData?.groupId ?? '';
  const isGroup = groupData?.group;
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const currentUserId = loginDetails?.profile?._id;
  const isOwnMessage = item?.senderID === currentUserId;
  const isImportantMessage = item?.isImportant;
  const timeStamp = item?.timestamp ?? new Date()?.getTime();
  const isDifferentDate =
    index === chatMessages?.length - 1 ||
    new Date(timeStamp)?.getDate() !==
      new Date(chatMessages[index + 1]?.timestamp ?? new Date()).getDate();
  const isDifferentSender =
    index === chatMessages?.length - 1 || item?.senderID !== chatMessages[index + 1]?.senderID;
  const dateString = formatChatDate(timeStamp);
  const time = dayjs(item?.timestamp);
  const timeString = time?.format('HH:mm');

  const swipeableRef = useRef<Swipeable>(null);

  const styles = ChatListStyles();
  const normalizedAttachments: ChatItemAttachmentType[] = useMemo(
    () =>
      (item?.attachments ?? []).map(attachment => {
        const attachmentData = attachment?.data ?? '';
        const resolvedUri = attachment?.uri || (attachmentData ? attachmentData : undefined);
        return {
          ...attachment,
          uri: resolvedUri,
        };
      }),
    [item?.attachments],
  );

  const includesDocument =
    normalizedAttachments?.length > 0 &&
    (normalizedAttachments?.[0]?.type?.includes('pdf') ||
      normalizedAttachments?.[0]?.type?.includes('doc') ||
      normalizedAttachments?.[0]?.type?.includes('word'));

  const includesPhotos =
    normalizedAttachments?.length > 0 && normalizedAttachments?.[0]?.type?.includes('image');
  // console.log('====================================');
  // console.log(includesPhotos, 'includesPhotos');
  // console.log('====================================');
  const includesRecording =
    normalizedAttachments?.length > 0 &&
    (() => {
      const firstAttachment = normalizedAttachments[0];
      const mediaType = (firstAttachment?.type ?? '').toLowerCase();
      const mediaUri = (firstAttachment?.uri ?? firstAttachment?.data ?? '').toLowerCase();
      const audioExtensions = ['mp3', 'm4a', 'mp4a', 'aac', 'wav', 'ogg', 'webm', 'webpm'];
      return (
        mediaType.includes('audio/') ||
        audioExtensions.some(ext => mediaType.includes(ext) || mediaUri.includes(`.${ext}`))
      );
    })();
  const hasLocalAttachmentData = !!normalizedAttachments?.some(attachment => {
    const data = attachment?.data ?? attachment?.uri ?? '';
    return !!data && !data.startsWith('http://') && !data.startsWith('https://');
  });
  const showAttachmentSendingLoader =
    item?.status === 'SENDING' &&
    isOwnMessage &&
    hasLocalAttachmentData &&
    (includesPhotos || includesDocument);

  const alertIconProps: SvgIconButtonProps['iconProps'] = {
    height: mScale(12),
    width: mScale(12),
    color: 'white',
    fillOpacity: 1,
  };

  const senderData = groupData?.userIds?.find(userId => userId.userid === item?.senderID);

  const renderRightActions = () => {
    return (
      <></>
      // <View style={styles.actionContainer}>
      //   <SvgIconButton
      //     icon="Pencil"
      //     iconProps={{ height: mScale(20), width: mScale(20), }}
      //     onPress={onEditMessage.bind(this, item)}
      //   />
      //   <SvgIconButton
      //     icon="Trash"
      //     iconProps={{ height: mScale(24), width: mScale(24)}}
      //     onPress={onDeleteMessage.bind(this, item)}
      //   />
      // </View>
    );
  };

  const MessageStatusTick = ({ status }: { status?: string }) => {
    if (!status) return null;

    const isRead = status === 'READ';
    const strokeColor = isRead ? '#1DA1F2' : '#6b7280';

    if (status === 'SENDING') {
      return <ActivityIndicator size="small" color={colors.inputPlaceHolder} />;
    }

    if (status === 'QUEUED') {
      return (
        <BaseText
          style={{
            fontSize: mScale(11),
            color: colors.inputPlaceHolder,
            lineHeight: mScale(12),
          }}
        >
          {'🕓'}
        </BaseText>
      );
    }

    if (status === 'SENT') {
      return (
        <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
          <Path
            d="M2 8.5L6 12L14 4"
            stroke={strokeColor}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    }

    if (status === 'DELIVERED' || status === 'READ') {
      return (
        <Svg width={18} height={16} viewBox="0 0 18 16" fill="none">
          <Path
            d="M1 8.5L5 12L12 4"
            stroke={strokeColor}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M6 8.5L10 12L17 4"
            stroke={strokeColor}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    }

    return null;
  };

  useEffect(() => {
    if (
      !messageOpened?.messageId ||
      (messageOpened?.messageId && messageOpened?.messageId !== item?.messageId)
    ) {
      swipeableRef?.current?.close();
    }
  }, [messageOpened?.messageId, item?.messageId]);

  return (
    <>
      <Swipeable
        enabled={isOwnMessage}
        renderRightActions={isOwnMessage ? renderRightActions : undefined}
        childrenContainerStyle={[
          commonStyles.flex,
          commonStyles.rowItemsCenter,
          styles.messageContainer,
          isOwnMessage ? styles.ownMessageContainer : {},
        ]}
        ref={swipeableRef}
        onSwipeableOpen={setMessageOpened?.bind(this, item)}
      >
        {/* {!item?._id && (
          <SvgIconButton
            icon="ChatSend"
            iconProps={{ height: mScale(15), width: mScale(15) }}
            style={[{ transform: [{ rotate: '-20deg' }] }]}
          />
        )} */}
        <View
          style={[
            styles.messageTextContainer,
            isOwnMessage ? styles.ownMessageTextContainer : styles.otherMessageTextContainer,
            isImportantMessage ? styles.importantMessageBorder : {},
          ]}
        >
          {isImportantMessage && (
            <SvgIconButton
              icon="ChatInputAlert"
              iconProps={alertIconProps}
              style={[
                styles.importantMessageIcon,
                {
                  [isOwnMessage ? 'left' : 'right']: -mScale(6),
                },
              ]}
            />
          )}

          {includesDocument && normalizedAttachments?.length > 0 && (
            <>
              <DocumentItemChat documents={normalizedAttachments} self={isOwnMessage} />
              {isOwnMessage && (
                <View style={{ marginLeft: mScale(4), alignSelf: 'flex-end' }}>
                  <MessageStatusTick status={item?.status ?? 'SENT'} />
                </View>
              )}
            </>
          )}
          {includesRecording && normalizedAttachments?.length > 0 && (
            <>
            <RecordingItemChat
              recordings={normalizedAttachments}
              self={isOwnMessage}
              chatId={chatId}
            />
            {isOwnMessage && (
                <View style={{ marginLeft: mScale(4), alignSelf: 'flex-end' }}>
                  <MessageStatusTick status={item?.status ?? 'SENT'} />
                </View>
              )}
            </>
          )}
          {includesPhotos && normalizedAttachments?.length > 0 &&
            <>
              <PhotosItemChat images={normalizedAttachments} />
              {showAttachmentSendingLoader && (
                <View
                  style={[
                    commonStyles.centerCenter,
                    {
                      position: 'absolute',
                      top: mScale(10),
                      right: mScale(10),
                      zIndex: 100,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={colors.tint} />
                </View>
              )}
              {isOwnMessage && (
                <View style={{ marginLeft: mScale(4), alignSelf: 'flex-end' }}>
                  <MessageStatusTick status={item?.status ?? 'SENT'} />
                </View>
              )}
            </>
          }

          {/* ===== MESSAGE + TICK SAME LINE ===== */}
          {!!item?.message && isCallMessage(item?.message) ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                flexShrink: 1,
              }}
            >
              <CallMessageItem
                message={item?.message ?? ''}
                isOwnMessage={isOwnMessage}
              />
              {isOwnMessage && (
                <View style={{ marginLeft: mScale(4), alignSelf: 'flex-end' }}>
                  <MessageStatusTick status={item?.status ?? 'SENT'} />
                </View>
              )}
            </View>
          ) : !!item?.message ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                flexShrink: 1,
              }}
            >
              <BaseHighlightText
                style={[
                  { flexShrink: 1 },
                  theme === 'dark' ? styles.whiteMode : styles.darkModel,
                  isOwnMessage ? styles.ownMessageText : {},
                ]}
                textToHighlight={item?.message ?? ''}
                searchWords={[searchText]}
                highlightBGColor={isOwnMessage ? colors.white : undefined}
                highlightTextColor={isOwnMessage ? colors.black : undefined}
              />

              {isOwnMessage && (
                <View style={{ marginLeft: mScale(4) }}>
                  <MessageStatusTick status={item?.status ?? 'SENT'} />
                </View>
              )}
            </View>
          ) : null}
        </View>

        <BaseText style={[styles.timeStamp]}>{timeString}</BaseText>
      </Swipeable>
      {(isDifferentDate || isDifferentSender) && isGroup && !isOwnMessage && (
        <BaseText numberOfLines={1} style={[styles.senderName]}>
          {senderData?.name}
        </BaseText>
      )}
      {isDifferentDate && (
        <View style={[commonStyles.center]}>
          <BaseText style={[commonStyles.center]}>
            {new Date(timeStamp)?.getDate() === new Date().getDate() ? `Today` : dateString}
          </BaseText>
        </View>
      )}
    </>
  );
};
