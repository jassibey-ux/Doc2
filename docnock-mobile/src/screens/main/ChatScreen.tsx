import { Images } from '@assets';
import {
  CenterLoader,
  ChatFooter,
  ChatHeader,
  ChatList,
  NoChatItem,
  SenderRingCard,
} from '@components';
import { useCallContext } from '@context';
import { useAppDispatch, useAppSelector, useCallSockets, useChatSocket, useTheme } from '@hooks';
import { useCustomRoute } from '@navigation';
import { useFocusEffect } from '@react-navigation/native';
import { ChatItemType, removeUnreadChat, setChatGroupId, setSelectedUser } from '@store';
import { commonStyles } from '@styles';
import { mScale } from '@utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Keyboard, StatusBar, View } from 'react-native';

interface CallMeFunction {
  (): void;
}

export const ChatScreen = () => {
  const params = useCustomRoute<'ChatScreen'>()?.params;
  const { isEFax = false, isGroup = false, data = {} } = params ?? {};
  const groupId: string = useMemo(() => data?.groupId ?? '', [data]);
  const userIds: string[] = useMemo(
    () => (data?.userIds ?? [])?.map(item => item.userid ?? '')?.filter(item => !!item),
    [data],
  );

  const dispatch = useAppDispatch();
  const chats = useAppSelector(state => state.chats.chats);
  const ownChats = chats?.[groupId || ''];
  const onlineUsers = useAppSelector(state => state.chats.onlineUsers);
  const unreadChats = useAppSelector(state => state.chats.unreadChats);
  const profileDetails = useAppSelector(state => state.auth?.loginDetails?.profile);
  const currentUserId: any = profileDetails?._id;
  const colors = useTheme(theme => theme.colors);

  const hasUnreadChat = useMemo(
    () =>
      (groupId
        ? unreadChats?.filter(chat => (chat?.groupId || chat?.conversationId || '') === groupId)
        : []
      )?.length,
    [groupId, unreadChats],
  );

  const [searchText, setSearchText] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMoreChat, setHasMoreChat] = useState(false);
  const [messageSelected, setMessageSelected] = useState<Partial<ChatItemType> | undefined>();
  const [messageOpened, setMessageOpened] = useState<Partial<ChatItemType> | undefined>();
  const [callStartedStatus, setCallStartedStatus] = useState<any>(null);

  const {
    emitGetMessages,
    emitJoinGroup,
    emitSetpagename,
    emitLeavepagename,
    emitGetCallStarted,
    emitUserRegister,
    emitMarkAsRead,
  } = useChatSocket();
  const { showCallSenderModel, setShowCallSenderModel, setCallSenderDetails, setAllCallDetails } = useCallContext();
  const { emitCancelCall } = useCallSockets();

  const emitMarkAsReadRef = useRef(emitMarkAsRead);
  const emitGetCallStartedRef = useRef(emitGetCallStarted);
  useEffect(() => {
    emitMarkAsReadRef.current = emitMarkAsRead;
    emitGetCallStartedRef.current = emitGetCallStarted;
  }, [emitMarkAsRead, emitGetCallStarted]);

  const callStatusInFlightRef = useRef(false);
  const lastCallStatusKeyRef = useRef('');

  const styles = ChatScreenStyles();

  const appState = useRef(AppState.currentState);
  const isScreenFocused = useRef(false);

  // Handle app state changes (background/foreground/killed)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App is going to background or being killed
        if (groupId && userIds?.length && isScreenFocused.current) {
          emitLeavepagename(currentUserId, '');
          emitLeavepagename(currentUserId, groupId);
          dispatch(setChatGroupId(''));
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [groupId, userIds, emitLeavepagename, dispatch]);

  const onGetMessages = useCallback(
    (more?: boolean) => {
      setIsLoadingChat(false);
      setIsFetchingMore(false);
      setPageNumber(pre => pre + 1);
      setHasMoreChat(!!more);
      if (groupId && hasUnreadChat) {
        dispatch(removeUnreadChat(groupId));
      }
    },
    [groupId, dispatch, hasUnreadChat],
  );

  useFocusEffect(
    useCallback(() => {
      if (groupId && currentUserId) {
        emitMarkAsReadRef.current(groupId, currentUserId);
      }

      const fetchCallStatus = async () => {
        if (!groupId || callStatusInFlightRef.current) {
          dispatch(setSelectedUser([]));
          return;
        }

        callStatusInFlightRef.current = true;
        if (groupId) {
          try {
            const response = await emitGetCallStartedRef.current(groupId);
            const nextKey = JSON.stringify(response ?? null);
            if (lastCallStatusKeyRef.current !== nextKey) {
              lastCallStatusKeyRef.current = nextKey;
              setCallStartedStatus(response);
            }
          } catch (error) {
            console.error('Failed to fetch call status:', error);
          } finally {
            callStatusInFlightRef.current = false;
          }
        }
        dispatch(setSelectedUser([]));
      };

      fetchCallStatus();
    }, [groupId, currentUserId, dispatch]),
  );

  const currentGroupChats = chats?.[groupId || ''];

  const getMoreMessages = () => {
    if (!groupId || !hasMoreChat || isFetchingMore || isLoadingChat) {
      return;
    }
    setIsFetchingMore(true);
    emitGetMessages(groupId, pageNumber, undefined, onGetMessages);
  };

  const chatListRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      isScreenFocused.current = true;
      emitSetpagename(currentUserId, groupId);

      return () => {
        isScreenFocused.current = false;
        emitLeavepagename(currentUserId, groupId);
        dispatch(setChatGroupId(''));
      };
    }, [groupId, emitSetpagename, emitLeavepagename, currentUserId, dispatch]),
  );

  // Always fetch messages when groupId/userIds change (including notification tap)
  useEffect(() => {
    if (groupId && userIds?.length) {
      setIsLoadingChat(true);
      emitGetMessages(groupId, undefined, undefined, (more?: boolean) => {
        setIsLoadingChat(false);
        setPageNumber(2);
        setHasMoreChat(!!more);
        if (groupId && hasUnreadChat) {
          dispatch(removeUnreadChat(groupId));
        }
        // Scroll to bottom after fetching
        setTimeout(() => {
          chatListRef.current?.scrollToEnd?.({ animated: true });
        }, 300);
      });

      // Join group and set active chat id
      emitJoinGroup(groupId, userIds);
      dispatch(setChatGroupId(groupId));
    }
  }, [groupId, userIds, hasUnreadChat, dispatch, emitGetMessages, emitJoinGroup]);

  const isUserOnline = useMemo(
    () => !!onlineUsers?.find(user => user === data?.userid),
    [onlineUsers, data],
  );

  const status = useMemo(
    () => (isGroup ? undefined : isUserOnline ? 'online' : 'offline'),
    [isGroup, isUserOnline],
  );

  const onCancelEdit = () => {
    setMessageSelected(undefined);
    setMessageOpened(undefined);
    Keyboard.dismiss();
  };

  const callMeRef = useRef<() => void>();

  const handleScrollToBottom = useCallback((callMeFunction: CallMeFunction) => {
    callMeRef.current = callMeFunction;
  }, []);

  const handleBackToBottom = () => {
    callMeRef.current?.();
  };

  useEffect(() => {
    if (!showCallSenderModel && groupId && userIds?.length) {
      const timer = setTimeout(() => {
        emitSetpagename(currentUserId, groupId);
        dispatch(setChatGroupId(groupId));
      }, 500);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [showCallSenderModel, groupId, userIds, emitSetpagename, currentUserId, dispatch]);

  return (
    <View style={[commonStyles.flex, styles.container]}>
      <Image
        source={Images.chat_background_graphic}
        resizeMode="cover"
        style={styles.imageBackground}
        tintColor={colors.loginGraphicTintColor}
      />
      <ChatHeader
        status={status}
        searchCallback={setSearchText}
        callStatusDetails={callStartedStatus}
        {...{ isEFax, isGroup, data, searchText }}
      />
      {!isLoadingChat || ownChats?.length ? (
        <View style={[commonStyles.flex, styles.innerContainer]}>
          {data?.groupId && currentGroupChats?.length ? (
            <View style={[commonStyles.flex, styles.chatListContainer]}>
              <ChatList
                searchText={searchText}
                onEndReach={getMoreMessages}
                groupData={data}
                isFetchingMore={isFetchingMore}
                {...{ setMessageSelected, messageSelected, messageOpened, setMessageOpened }}
                onScrollToBottom={handleScrollToBottom}
                ref={chatListRef}
              />
            </View>
          ) : (
            <View style={[commonStyles.flex, commonStyles.centerCenter, styles.noChatContainer]}>
              <NoChatItem />
            </View>
          )}
          <ChatFooter
            chatId={data?.groupId}
            {...{ onCancelEdit, messageSelected }}
            backToBottom={handleBackToBottom}
          />
        </View>
      ) : (
        <CenterLoader visible={isLoadingChat} />
      )}
      <StatusBar translucent backgroundColor={'transparent'} />
      {showCallSenderModel && (
        <SenderRingCard
          onCancelPress={() => {
            setShowCallSenderModel(false),
              setCallSenderDetails(null),
              setAllCallDetails([])
              emitCancelCall(data?.groupId ?? '');
          }}
        />
      )}
    </View>
  );
};

const ChatScreenStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.primary,
    },
    imageBackground: {
      position: 'absolute',
      top: 0,
      width: '100%',
      height: '100%',
      zIndex: 1,
    },
    innerContainer: {
      backgroundColor: 'transparent',
      zIndex: 5,
    },
    chatListContainer: {
      // marginBottom: -mScale(40),
      // maxHeight: mScale(300),
      zIndex: 10,
    },
    noChatContainer: {
      marginBottom: -mScale(120),
    },
    typingContainer: {
      marginHorizontal: mScale(14),
      marginBottom: mScale(6),
    },
  }));
