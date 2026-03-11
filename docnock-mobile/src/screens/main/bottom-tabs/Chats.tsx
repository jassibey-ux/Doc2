import {
  API_ENDPOINTS,
  axiosAuthClient,
  fcmTokenPayload,
  GroupListItemType,
  GroupPageType,
  useGetGroupListQuery,
  useGetUserInfoMutation,
  useGetUserUnreadCount,
  useSendFcmToken,
  useUpdateGroupMemberMutation,
} from '@api';
import {
  BaseList,
  BottomTabScreenWrapper,
  CenterLoader,
  ChatCard,
  ChatTabs,
  ChatFilterType,
  SearchInputProps,
  SvgIconButton,
} from '@components';
import {
  getListener,
  useAppDispatch,
  useAppSelector,
  useCallSockets,
  useChatSocket,
  useRefreshOnFocus,
} from '@hooks';
import { GroupDataType, useCustomNavigation } from '@navigation';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { ChatSocketEmitTypes, ChatSocketListenerTypes, socketInstance } from '@socket';
import { setNotifcationUnreadCont, setOnlineUsers, updateChatList } from '@store';
import { commonStyles } from '@styles';
import React, { useEffect, useMemo, useState } from 'react';
import { DashboardStyles } from './DashBoard';
import { ListEmptyComponent, ListFooterComponent, PhysicianStyles } from './Physicians';
import { CallType, useCallContext } from '@context';
import { decryptData, devLogger } from '@utils';
import { navigationService } from '../../../navigation/NavigationService';
import { TouchableOpacity, View } from 'react-native';
import ConfirmDeleteModal from '../../../components/chat/ConfirmDeleteModal';

const hitSlopProp = {
  top: 50,
  right: 50,
  left: 25,
  bottom: 50,
};

export const Chats = ({ route }: any) => {
  const navigation = useCustomNavigation();
  const {
    setIsGroup,
    setType,
    callRingerDetails,
    setShowRingerDialogue,
    startCall,
    setCallRingerDetails,
    showRingerDialogue,
  } = useCallContext();
  const fetchGroupList = async ({ limit = 20, userId = '', page = 1, searchKey = '' }) => {
    const params = {
      page,
      limit,
      userId,
      name: searchKey,
    };
    const response = await axiosAuthClient.get(API_ENDPOINTS.GROUP_LIST, { params });

    if (response?.data?.success) {
      const data = await decryptData(response?.data?.encryptDatagroupdata);
      const pagination: any = response?.data?.pagination;
      return { data: [...(data ?? [])], pagination };
    }

    return null;
  };
  // Voip Avinash
  const {
    emitSetpagename,
    emitLeavepagename,
    emitDeleteConversation,
    emitEditGroupMember,
    getUnreadCount,
  } = useChatSocket();
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();
  const { mutateAsync: updateGroupMembers } = useUpdateGroupMemberMutation();
  const [prpofileDate, setPrpofileDate] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isGroupType, setIsGroupType] = useState<boolean>(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedGroupMember, setSelectedGroupMember] = useState<[]>([]);
  useEffect(() => {
    const getData = async () => {
      const newProfile = await getUserInfo();
      const decryptedProfile = await decryptData(newProfile?.data?.encryptDatauserdata);
      setPrpofileDate(decryptedProfile);
    };
    getData();
  }, []);

  const onPressAcceptCall = async (
    callerId: string,
    groupId: string,
    audio: boolean,
    isGroup: boolean,
  ) => {
    // if (!callerId || !groupId) {
    //   return;
    // }
    console.log('callRingerDetails111', callerId, groupId, audio, prpofileDate);
    console.log('callRingerDetails111isGroup', isGroup);

    const success = await emitAcceptCall(callerId, groupId, audio, prpofileDate);

    if (success) {
      setType?.(audio ? CallType.audio : CallType.video);
      // setIsGroup?.(
      //   !!callRingerDetails?.activegrouuserids &&
      //     callRingerDetails?.activegrouuserids?.length > 1,
      // );
      // setIsGroup?.(isGroup);
      setShowRingerDialogue?.(false);

      // console.log('success<><<><>>', success);
      // setBackhanduid(success?.uid || null);
      startCall?.(groupId, audio, false);
    }
  };
  // console.log('route<><><><>', route);

  useEffect(() => {
    if (route.params) {
      const { callerId, groupId, audio, isGroup } = route.params;
      onPressAcceptCall(callerId, groupId, audio, isGroup);
    }
  }, [route.params]);
  const { emitAcceptCall, emitRejectCall } = useCallSockets();

  const listRef = React.useRef<any>(null);
  const userPermissions = useAppSelector(state => state.auth.userPermissions);

  const onlineUsers = useAppSelector(state => state.chats.onlineUsers);
  const unreadChats = useAppSelector(state => state.chats.unreadChats);
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const chatList = useAppSelector(state => state.chats.chatList);
  const dispatch = useAppDispatch();

  const isFocused = useIsFocused();

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const [activeTab, setActiveTab] = useState<ChatFilterType>('all');

  const physicianStyles = PhysicianStyles();
  const dashboardStyles = DashboardStyles();

  const queryResponse = useGetGroupListQuery({
    refreshingKey: unreadChats?.length?.toString(),
    searchKey,
  });

  useRefreshOnFocus(queryResponse.refetch);

  const onSearchCallBack: SearchInputProps['onSearchCallBack'] = val => {
    setSearchKey(val);
  };

  const renderCard = ({ item }: { item: GroupDataType; index: number }) => {
    const isUserOnline = !!onlineUsers?.find(user => user === item?.userid);
    const status = item.group ? undefined : isUserOnline ? 'online' : 'offline';

    return (
      <ChatCard
        status={status}
        isGroup={item?.group}
        key={item?.groupId?.toString()}
        item={item}
        isEFax={false}
        count={item?.count}
      />
    );
  };

  // Calculate counts for filter chips
  const groupsCount = useMemo(() => chatList.filter(item => item.group === true).length, [chatList]);
  const totalUnreadCount = useMemo(() => chatList.reduce((sum, item) => sum + (item.count || 0), 0), [chatList]);

  // Filter data based on active tab
  const filteredChatList = useMemo(() => {
    switch (activeTab) {
      case 'groups':
        return chatList.filter(item => item.group === true);
      case 'unread':
        return chatList.filter(item => (item.count || 0) > 0);
      case 'all':
      default:
        return chatList;
    }
  }, [chatList, activeTab]);
  const onExitBtnPress = (
    item: any,
    index: number,
    rowMap: { [key: string]: { closeRow: () => void } },
  ) => {
    setIsGroupType(item?.group);
    setSelectedGroupId(item?.groupId);
    setSelectedGroupMember(item?.actualgroupmemberid || []);
    setShowDeleteModal(true);
    setTimeout(() => {
      const rowKey = 'NurseScreen' + item?.groupId?.toString();
      if (rowMap[rowKey]) {
        rowMap[rowKey].closeRow();
      }
    }, 200);
  };
  const renderSwipeButtons = (
    { item, index }: { item: any; index: number },
    rowMap: { [key: string]: { closeRow: () => void } },
  ) => {
    return (
      <TouchableOpacity
        style={dashboardStyles.swipeItemStyle}
        hitSlop={hitSlopProp}
        onPress={() => onExitBtnPress(item, index, rowMap)}
      >
        <SvgIconButton icon={item?.group ? 'Logout' : 'Trash'} />
      </TouchableOpacity>
    );
  };

  // const renderNoData = (queryRef: typeof nurseQuery) => {
  //   return (
  //     <BaseText style={dashboardStyles.noDataText}>
  //       {queryRef?.isLoading ? `Please wait ..` : `No data found`}
  //     </BaseText>
  //   );
  // };

  const onPressCreateGroup = () => {
    navigation.navigate('CreateGroupScreen', {
      update: false,
    });
  };

  const allowCreateGroup = useMemo(() => {
    return (
      userPermissions && userPermissions?.findIndex(_module => _module.moduleName === 'C') !== -1
    );
  }, [userPermissions]);

  useEffect(() => {
    if (isFocused) {
      socketInstance.emit(ChatSocketEmitTypes.getOnlineUsers, (data: string[]) => {
        dispatch(setOnlineUsers(data));
      });
    }
  }, [isFocused, dispatch]);

  const onEndReached = () => {
    if (
      queryResponse?.hasNextPage &&
      !queryResponse?.isLoading &&
      !queryResponse?.isFetchingNextPage
    ) {
      queryResponse?.fetchNextPage();
    }
  };

  const { mutateAsync: saveFcmToken } = useSendFcmToken();

  const auth = useAppSelector(state => state.auth);
  const { deviceToken, fcmToken } = useAppSelector(state => state.auth);
  const sendToken = async () => {
    const fcmTokenPayload: fcmTokenPayload = {
      fcm_token: fcmToken || '',
      device_token: deviceToken || '',
    };
    const response = await saveFcmToken(fcmTokenPayload);
    // console.log('FCMRES', response);
  };

  useEffect(() => {
    sendToken();
  }, []);

  const { mutateAsync: getUserNotificationUnreadCount } = useGetUserUnreadCount();
  useFocusEffect(
    React.useCallback(() => {
      const getCount = async () => {
        const count = await getUserNotificationUnreadCount();
        // console.log('notification count <><><><>', count.data.count);
        dispatch(setNotifcationUnreadCont(count.data.count));
      };
      getCount();
      return () => {};
    }, []),
  );

  useFocusEffect(
    React.useCallback(() => {
      const userId = loginDetails?.profile?._id;
      emitSetpagename(userId ?? '', '');

      return () => {
        const rote = navigationService.getCurrentRoute();
        if (rote === 'ChatScreen') return;
        emitLeavepagename(userId ?? '', '');
      };
    }, [loginDetails]),
  );

  useFocusEffect(
    React.useCallback(() => {
      const totalRecords: GroupDataType[] = [];
      queryResponse?.data?.pages?.forEach(page => {
        totalRecords.push(...((page as GroupPageType)?.data ?? []));
      });

      if (totalRecords.length > 0) {
        const unreadCountPromises = totalRecords.map(async (group, index) => {
          const count = await getUnreadCount(group.groupId ?? '');
          totalRecords[index].count = typeof count === 'number' ? count : 0;
        });

        Promise.all(unreadCountPromises).then(() => {
          dispatch(updateChatList(totalRecords));
        });

        listRef.current?._listView?._listRef?.scrollToOffset?.({ offset: 0, animated: false });
      }
    }, [queryResponse?.data]),
  );

  const onCancelPress = () => {
    setShowDeleteModal(false);
    setSelectedGroupId('');
  };

  const updateGroup = async (payload: any) => {
    try {
      const res = await updateGroupMembers(payload);
      if (res?.data) {
        emitEditGroupMember(selectedGroupId ?? '');
        setShowDeleteModal(false);
        setSelectedGroupId('');
        setSelectedGroupMember([]);
        callListinApi();
      } else {
        devLogger('🚀 ~ Error in deleting group ~ error:');
      }
    } catch (error) {
      devLogger('🚀 ~ Error in exiting group ~ error:', error);
    }
  };

  const onConfirmDelete = async () => {
    if (isGroupType) {
      const users = selectedGroupMember.map((item: any) => ({
        userid: item._id,
        name: item.fullName,
        profilePicture: item.profilePicture,
        status: item.status,
      }));
      const payload = {
        members: users,
        groupID: selectedGroupId,
        isExit: true,
      };
      updateGroup(payload);
    } else {
      const userId = loginDetails?.profile?._id;
      const res = await emitDeleteConversation(selectedGroupId, userId ?? '');
      if (res?.success) {
        setShowDeleteModal(false);
        setSelectedGroupId('');
        callListinApi();
      } else {
        console.warn('Delete failed', res);
      }
    }
  };
  const callListinApi = async () => {
    try {
      const result = await fetchGroupList({
        limit: 20,
        userId: '',
        page: 1,
        searchKey: '',
      });
      if (result?.data?.length) {
        dispatch(updateChatList(result.data));
      }
    } catch (err) {
      console.error('Error fetching groups in socket listener:', err);
    }
  };

  return (
    <BottomTabScreenWrapper
      title="Chats"
      onSearchCallBack={onSearchCallBack}
      onClearSearch={setSearchKey.bind(this, '')}
      enablePlusButton={allowCreateGroup}
      isLoading={queryResponse?.isLoading}
      onPressPlusButton={onPressCreateGroup}
    >
      <ChatTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={totalUnreadCount}
        groupsCount={groupsCount}
      />
      <CenterLoader visible={false} containerStyle={dashboardStyles.loaderContainer} />
      <BaseList
        ref={listRef}
        data={filteredChatList}
        extraData={filteredChatList}
        renderItem={renderCard}
        renderHiddenItem={(data, rowMap) => renderSwipeButtons(data, rowMap)}
        keyExtractor={item => 'NurseScreen' + item?.groupId?.toString()}
        contentContainerStyle={physicianStyles.listContainerStyle}
        style={[commonStyles.flex]}
        onEndReached={onEndReached}
        ListFooterComponent={
          queryResponse?.hasNextPage && queryResponse?.isFetchingNextPage ? (
            <ListFooterComponent />
          ) : null
        }
        ListEmptyComponent={!queryResponse?.isLoading ? <ListEmptyComponent /> : <></>}
      />
      {!!showDeleteModal && (
        <ConfirmDeleteModal
          modalVisible={showDeleteModal}
          hasTwoButton={true}
          onDeleteForMe={() => onConfirmDelete()}
          onCancel={onCancelPress}
          deleteBtnTxt={isGroupType ? 'Exit Group' : 'Delete'}
          headingTxt="Delete Conversation"
          subHeadingTxt={
            isGroupType
              ? 'Are you sure you want to exit this group?'
              : 'Are you sure you want to delete this conversation?'
          }
        />
      )}
    </BottomTabScreenWrapper>
  );
};
