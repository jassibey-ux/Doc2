import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, View } from 'react-native';
import { commonStyles } from '@styles';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { useAppDispatch, useAppSelector, useChatSocket, useTheme } from '@hooks';
import { ChatItemType, deleteChat } from '@store';
import { GroupDataType } from '@navigation';
import { BaseText } from '@components';
import { ChatItem } from './ChatItem';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { socketInstance } from '@socket';

export type ChatListProps = {
  searchText?: string;
  onEndReach?: () => void;
  groupData?: GroupDataType;
  isFetchingMore?: boolean;
  setMessageSelected?: (item?: Partial<ChatItemType>) => void;
  messageOpened?: Partial<ChatItemType>;
  setMessageOpened?: (item?: Partial<ChatItemType>) => void;
  onScrollToBottom?: (callback: () => void) => void;
};

type ChatListRef = {
  scrollToBottom: () => void;
};

const ChatListComponent = (
  {
    searchText = '',
    groupData,
    onEndReach,
    isFetchingMore = false,
    setMessageSelected,
    messageOpened,
    setMessageOpened,
    onScrollToBottom,
  }: ChatListProps,
  ref: React.ForwardedRef<ChatListRef>,
) => {
  // // chat List Scroll Avinash
  const listRef1 = useRef<FlatList<Partial<ChatItemType>> | null>(null);

  const callMe = useCallback(() => {
    listRef1.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useEffect(() => {
    onScrollToBottom?.(callMe);
  }, [onScrollToBottom, callMe]);

  const chatId = groupData?.groupId ?? '';

  const dispatch = useAppDispatch();
  const chats = useAppSelector(state => state.chats.chats);

  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Partial<ChatItemType>>({});
  const { emitUserRegister, emitDeleteMessage } = useChatSocket();
  const processedChatMessages = useMemo(() => chats?.[chatId] ?? [], [chats, chatId]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      listRef1.current?.scrollToIndex({ index: 0, animated: true });
    },
  }));

  const styles = ChatListStyles();

  const onEditMessage = useCallback((item: Partial<ChatItemType>) => {
    setMessageSelected?.(item);
    listRef1.current?.scrollToIndex({ index: 0, animated: true });
  }, [setMessageSelected]);

  const confirmDelete = (type: string) => {
    if (!selectedItem?.messageId || !chatId || !groupData?.userIds) return;
    const ids =
      type === 'me'
        ? [loginDetails?.profile?._id]
        : [
            ...(groupData?.actualgroupmemberid?.map((ele: any) => ele._id) || []),
            loginDetails?.profile?._id,
          ];

    emitDeleteMessage(chatId, selectedItem?.messageId.toString(), ids);
    dispatch(deleteChat({ ...selectedItem }));
    setSelectedItem({});
    setShowDeleteModal(false);
    setMessageOpened?.(undefined);
  };
  const onCancelPress = () => {
    setMessageOpened?.(undefined);
    setSelectedItem({});
    setShowDeleteModal(false);
  };

  const onDeleteMessage = useCallback((item: Partial<ChatItemType>) => {
    setShowDeleteModal(true);
    setSelectedItem(item);
  }, []);

  const renderChatItem = useCallback(
    ({ item, index }: { item: Partial<ChatItemType>; index: number }) => {
      return (
        <ChatItem
          {...{
            item,
            index,
            searchText,
            chatMessages: processedChatMessages,
            groupData,
            onDeleteMessage,
            onEditMessage,
            messageOpened,
            setMessageOpened,
          }}
        />
      );
    },
    [
      searchText,
      processedChatMessages,
      groupData,
      onDeleteMessage,
      onEditMessage,
      messageOpened,
      setMessageOpened,
    ],
  );

  useEffect(() => {
    const onConnect = () => {
      if (loginDetails?.profile?._id) {
        emitUserRegister();
      }
    };
    socketInstance.on('connect', onConnect);
    return () => {
      socketInstance.off('connect', onConnect);
    };
  }, [emitUserRegister, loginDetails?.profile?._id]);

  return (
    <View style={[commonStyles.flex, styles.container]}>
      <FlatList
        ref={listRef1}
        showsVerticalScrollIndicator={false}
        data={processedChatMessages}
        renderItem={renderChatItem}
        keyExtractor={(item, index) => `${item?.messageId || item.timestamp}_${index}`}
        style={[commonStyles.flex]}
        contentContainerStyle={styles.chatListContainer}
        inverted
        onEndReached={onEndReach}
        ListFooterComponent={
          isFetchingMore ? (
            <View style={styles.paginationLoaderContainer}>
              <View style={styles.loaderDot} />
              <BaseText style={styles.loaderText}>Loading previous messages...</BaseText>
            </View>
          ) : null
        }
      />
      {!!showDeleteModal && (
        <ConfirmDeleteModal
          modalVisible={showDeleteModal}
          onDeleteForEveryone={() => confirmDelete('everyone')}
          onDeleteForMe={() => confirmDelete('me')}
          onCancel={onCancelPress}
        />
      )}
    </View>
  );
};

export const ChatList = React.forwardRef<ChatListRef, ChatListProps>(ChatListComponent);
ChatList.displayName = 'ChatList';

export const ChatListStyles = () =>
  useTheme(({ colors, theme }) => ({
    container: {
      marginHorizontal: mScale(12),
    },
    chatListContainer: {
      paddingBottom: mScale(150),
      paddingTop: mScale(8),
    },
    messageContainer: {
      maxWidth: '85%',
      marginVertical: mScale(2),
      gap: mScale(6),
      alignSelf: 'flex-start',
    },
    ownMessageContainer: {
      alignSelf: 'flex-end',
      flexDirection: 'row-reverse',
    },
    messageTextContainer: {
      borderRadius: mScale(18),
      padding: mScale(8),
      paddingHorizontal: mScale(12),
      flexShrink: 1,
      gap: mScale(4),
      minWidth: mScale(60),
    },
    ownMessageTextContainer: {
      borderBottomRightRadius: mScale(4),
      backgroundColor: colors.ownMessageBackground,
    },
    otherMessageTextContainer: {
      borderBottomLeftRadius: mScale(4),
      backgroundColor: colors.messageBackground,
      borderWidth: theme === 'light' ? 1 : 0,
      borderColor: theme === 'light' ? colors.searchInputBackground : 'transparent',
    },
    timeStamp: {
      fontSize: FontSizes.size_11,
      color: colors.inputPlaceHolder,
      alignSelf: 'flex-end',
    },
    typingContainer: {
      paddingVertical: mScale(4),
      paddingHorizontal: mScale(8),
    },
    lottieStyle: {
      width: mScale(40),
      height: mScale(30),
    },
    importantMessageIcon: {
      position: 'absolute',
      top: -mScale(6),
      backgroundColor: 'red',
      height: mScale(20),
      width: mScale(20),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: mScale(10),
    },
    importantMessageBorder: {
      borderColor: '#EE000070',
      borderWidth: 1,
    },
    senderName: {
      marginHorizontal: mScale(6),
      maxWidth: '75%',
      marginVertical: mScale(2),
      marginTop: mScale(6),
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_13,
      color: colors.tint,
    },
    actionContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      width: mScale(70),
      height: '100%',
      flexDirection: 'row',
      gap: mScale(10),
    },
    ownMessageText: {
      color: theme === 'light' ? colors.black : colors.white,
    },
    paginationLoaderContainer: {
      paddingVertical: mScale(12),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: mScale(8),
    },
    loaderDot: {
      width: mScale(7),
      height: mScale(7),
      borderRadius: mScale(4),
      backgroundColor: colors.inputPlaceHolder,
      opacity: 0.8,
    },
    loaderText: {
      color: colors.inputPlaceHolder,
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
    },
    whiteMode: {
      color: colors.white,
    },
    darkModel: {
      color: colors.black,
    },
  }));
