import React, { useMemo } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import { checkIsLightTheme, getProfileImageUrlFromImageName, mScale } from '@utils';
import { useAppSelector, useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { FontSizes, FontWeights } from '@theme';
import { GroupDataType, useCustomNavigation } from '@navigation';
import { BaseTouchable, SvgIconButton, SvgIconButtonProps } from '../button';
import { BaseText } from '../BaseText';
import { BaseImage } from '../BaseImage';
import { Images } from '@assets';
import { useCallContext } from '@context';

export const CHAT_AVATAR_SIZE = mScale(50);

export const avatarProps: SvgIconButtonProps['iconProps'] = {
  height: CHAT_AVATAR_SIZE,
  width: CHAT_AVATAR_SIZE,
};

export type ChatCardProps = {
  selectionMode?: boolean;
  onSelectPress?: () => void;
  isGroup?: boolean;
  selected?: boolean;
  item: GroupDataType;
  isEFax?: boolean;
  count?:number;
  status?: 'online' | 'offline';
};

export const ChatCard = ({
  selectionMode = false,
  onSelectPress,
  isGroup = false,
  selected = false,
  item,
  isEFax = false,
  status,
  count = 0,
}: ChatCardProps) => {
  const image = item?.group
    ? item?.image
    : item?.actualgroupmemberid?.[0]?.profilePicture?.savedName;
  const navigation = useCustomNavigation();
  const unreadChats = useAppSelector(state => state.chats.unreadChats);
  const typingChats = useAppSelector(state => state.chats.typingChats);
  const { colors } = useTheme(theme => theme);
  const {
    getCallPariticipantInfo
  } = useCallContext();
  

  const styles = ChatCardStyles();

  const onPress = () => {
    if (!item?.group) {
      getCallPariticipantInfo(item?.userid ?? '')
    }
    navigation.navigate('ChatScreen', {
      isEFax: !!isEFax,
      isGroup,
      data: item,
    });
    // console.log('ChatScreen param >>', {
    //   isEFax: !!isEFax,
    //   isGroup,
    //   data: item,
    // });
  };

  const pendingUnreadChats = unreadChats?.filter(
    chat => (chat?.groupId || chat?.conversationId || '') === item?.groupId,
  );
  // console.log('firstpendingUnreadChats', pendingUnreadChats)

  const latestUnreadChatTime = useMemo(() => {
    const latestItem = pendingUnreadChats?.sort((a, b) => b.timestamp - a.timestamp)[0];
    return latestItem?.timestamp ? dayjs(latestItem?.timestamp).format('HH:mm') : undefined;
  }, [pendingUnreadChats]);

  const isTyping = useMemo(() => {
    return item?.groupId ? typingChats?.[item?.groupId] ?? false : false;
  }, [typingChats, item?.groupId]);

  const formatTimestamp = (timestamp: number | undefined) => {
    const messageDate = dayjs(timestamp);
    const today = dayjs();
    return messageDate.isSame(today, 'day') 
      ? messageDate.format('HH:mm')
      : messageDate.format('MM/DD/YYYY');
  };

  return (
    <>
      <BaseTouchable
        activeOpacity={0.7}
        onPress={selectionMode ? onSelectPress : onPress}
        style={styles.container}
      >
        <View>
          {image ? (
            <BaseImage
              source={{ uri: getProfileImageUrlFromImageName(image || '') }}
              borderRadius={CHAT_AVATAR_SIZE}
              containerStyle={styles.avatar}
              defaultSource={
                isGroup
                  ? Images.group_avatar
                  : checkIsLightTheme()
                  ? Images.avatar_placeholder_light
                  : Images.avatar_placeholder
              }
            />
          ) : (
            <SvgIconButton
              icon={isGroup ? 'GroupPlaceholder' : 'AvatarPlaceholder'}
              iconProps={{
                ...avatarProps,
                color: isGroup ? colors.iconContrast : colors.avatarColor,
              }}
              style={styles.avatarBg}
            />
          )}
          {!!status && (
            <View style={[styles.offlineBadge, status === 'online' && styles.onlineBadge]} />
          )}
        </View>

        <View style={styles.otherContainer}>
          <View style={styles.detailContainer}>
            <BaseText style={styles.chatName} numberOfLines={1}>
              {item?.title ?? `N/A`}
            </BaseText>
            {isTyping ? (
              <BaseText style={styles.typing}>Typing ...</BaseText>
            ) : (
              <BaseText style={styles.chatText} numberOfLines={2}>
                {item?.latestMessage ?? ''}
              </BaseText>
            )}
          </View>

          <View style={styles.unreadInfoContainer}>
            <BaseText style={styles.unreadTime}>
              {latestUnreadChatTime ?? formatTimestamp(item?.timestamp)}
            </BaseText>
            {count > 0 && <BaseText style={styles.unreadCount}>{count}</BaseText>}
          </View>

          {selectionMode && (
            <SvgIconButton
              style={[commonStyles.center]}
              icon={selected ? 'SelectFilledGreen' : 'SelectOutline'}
              onPress={onSelectPress}
            />
          )}
        </View>
      </BaseTouchable>
      <View style={styles.divider} />
    </>
  );
};

export const ChatCardStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: mScale(12),
      backgroundColor: colors.primary,
      paddingVertical: mScale(10),
      paddingHorizontal: mScale(16),
    },
    otherContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    detailContainer: {
      flex: 1,
      justifyContent: 'center',
      gap: mScale(2),
    },
    chatName: {
      fontSize: FontSizes.size_17,
      fontWeight: FontWeights.medium,
      color: colors.text,
    },
    chatText: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.regular,
      color: colors.inputPlaceHolder,
      lineHeight: mScale(18),
    },
    divider: {
      backgroundColor: colors.searchInputBackground,
      height: 0.5,
      marginLeft: mScale(78),
    },
    avatar: {
      height: CHAT_AVATAR_SIZE,
      width: CHAT_AVATAR_SIZE,
    },
    offlineBadge: {
      height: mScale(12),
      width: mScale(12),
      backgroundColor: colors.inputPlaceHolder,
      position: 'absolute',
      borderRadius: mScale(6),
      bottom: mScale(2),
      right: mScale(2),
      borderWidth: 2,
      borderColor: colors.primary,
    },
    onlineBadge: {
      backgroundColor: colors.callGreen,
    },
    unreadTime: {
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.regular,
      color: colors.inputPlaceHolder,
    },
    unreadCount: {
      fontSize: FontSizes.size_11,
      fontWeight: FontWeights.bold,
      color: colors.white,
      backgroundColor: colors.tint,
      minWidth: mScale(22),
      height: mScale(22),
      textAlign: 'center',
      textAlignVertical: 'center',
      lineHeight: mScale(22),
      borderRadius: mScale(11),
      overflow: 'hidden',
      paddingHorizontal: mScale(6),
    },
    typing: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.regular,
      color: colors.tint,
    },
    unreadInfoContainer: {
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      gap: mScale(6),
      marginLeft: mScale(8),
    },
    avatarBg: {
      backgroundColor: colors.searchInputBackground,
      borderRadius: 100,
    },
  }));
