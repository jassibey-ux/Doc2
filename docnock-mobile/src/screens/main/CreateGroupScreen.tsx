import {
  avatarProps,
  BaseList,
  BaseText,
  BottomTabScreenWrapper,
  CenterLoader,
  CHAT_AVATAR_SIZE,
  NewGroupDetailPopup,
  SvgIconButton,
  BaseTouchable,
  BaseImage,
  BaseScroll,
  SearchInputProps,
  CreateGroupMemberCard,
  NewGroupResponseType,
} from '@components';
import React, { useMemo, useState } from 'react';
import { Images } from '@assets';
import { renderLeftComponent } from './AllNurseList';
import {
  DashboardStyles,
  getRefreshControlProps,
  ListEmptyComponent,
  ListFooterComponent,
  PhysicianStyles,
  SearchResultText,
} from './bottom-tabs';
import { commonStyles } from '@styles';
import { View } from 'react-native';
import { useAppDispatch, useAppSelector, useChatSocket, useTheme } from '@hooks';
import { devLogger, getProfileImageUrlFromImageName, mScale, USER_PERMISSION_MAPPING } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { navigationRef, useCustomNavigation, useCustomRoute } from '@navigation';
import {
  GetUserListUserType,
  PageType,
  useCreateUpdateGroupMutation,
  useGetUserListQuery,
  useUpdateGroupMemberMutation,
} from '@api';
import { setSelectedUser, store } from '@store';
import { showMessage } from 'react-native-flash-message';

type MemberArrayItemType = {
  id: string;
  name: string;
  showInCreateGroup?: boolean;
  _id: string;
  userId: string;
  moduleName: string;
  noOfLimit: number;
  __v: number;
  createdAt: string;
  updatedAt: string;
};

type MemberType = Partial<GetUserListUserType>;

type SelectedMemberChipProps = {
  item: MemberType;
  onRemove: (member: MemberType) => void;
};

const SelectedMemberChip = ({ item, onRemove }: SelectedMemberChipProps) => {
  const { colors } = useTheme(theme => theme);
  const styles = Styles();
  const [hasImageError, setHasImageError] = useState(false);

  const imageName =
    typeof item?.profilePicture === 'object' && item?.profilePicture !== null
      ? item?.profilePicture?.savedName
      : '';
  const profileImageUri = getProfileImageUrlFromImageName(imageName || '');
  const shouldShowAvatar = !!profileImageUri && !hasImageError;
  const displayName = item?.fullName || item?.name || 'N/A';

  return (
    <View style={styles.selectedMemberContainer}>
      <View style={styles.selectedMemberAvatarWrap}>
        {shouldShowAvatar ? (
          <BaseImage
            source={{ uri: profileImageUri }}
            borderRadius={mScale(22)}
            containerStyle={styles.selectedAvatar}
            defaultSource={Images.avatar_placeholder}
            onError={setHasImageError.bind(this, true)}
          />
        ) : (
          <SvgIconButton
            icon="AvatarPlaceholder"
            iconProps={{ ...avatarProps, color: colors.avatarColor, height: mScale(44), width: mScale(44) }}
            style={styles.selectedMemberAvatarFallback}
          />
        )}
        <SvgIconButton
          icon="CloseFilledWhite"
          iconProps={{ height: mScale(20), width: mScale(20) }}
          style={styles.closeIcon}
          onPress={onRemove.bind(this, item)}
        />
      </View>
      <BaseText style={styles.selectedMemberName} numberOfLines={1}>
        {displayName}
      </BaseText>
    </View>
  );
};

export const getMemberTypes = () => {
  const userPermissions = store.getState().auth?.userPermissions;
  devLogger('🚀 ~ getMemberTypes ~ userPermissions:', userPermissions);
  const filteredArray = userPermissions
    ? userPermissions
        ?.map(item => ({
          ...item,
          ...(USER_PERMISSION_MAPPING?.[item?.moduleName] ?? {}),
        }))
        ?.filter(item => item?.showInCreateGroup)
    : [];
  devLogger('🚀 ~ getMemberTypes ~ filteredArray:', filteredArray);
  return filteredArray ?? [];
};

export const CreateGroupScreen = () => {
  const params = useCustomRoute<'CreateGroupScreen'>()?.params ?? {};
  const { goBack } = useCustomNavigation<'CreateGroupScreen'>();

  const { groupData, update, isFrom } = params;

  const [selectedTab, setSelectedTab] = useState<MemberArrayItemType | undefined>();
  const [selectedMembers, setSelectedMembers] = useState<MemberType[]>(
    update && isFrom != 'GroupChat' ? groupData?.userIds ?? [] : [],
  );
    const { emitEditGroupMember, emitJoinGroup } = useChatSocket();
  const [showGroupNamePopup, setShowGroupNamePopup] = useState<boolean>(false);
  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const dispatch = useAppDispatch();
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const selectedUser = useAppSelector(state => state.chats.selectedUser);
  const { colors } = useTheme(theme => theme);

  const userId = useMemo(() => loginDetails?.profile?._id, [loginDetails?.profile]);

  const physicianStyles = PhysicianStyles();
  const dashboardStyles = DashboardStyles();
  const styles = Styles();

  const queryResponse = useGetUserListQuery({
    limit: 10,
    role: selectedTab?.id ?? 'physician',
    searchKey,
  });

  const { mutateAsync: createGroup } = useCreateUpdateGroupMutation();
  const {mutateAsync: updateGroupMembers} = useUpdateGroupMemberMutation();

  const toggleSelection = (member: MemberType) => {
    if (isFrom === 'GroupChat') {
      const exists = selectedUser.find(user => user.userid === member._id);

      if (exists) {
        dispatch(setSelectedUser(selectedUser.filter(user => user.userid !== member._id)));
      } else {
        const newUser = {
          userid: member._id,
          name: member.fullName,
          profilePicture: member.profilePicture,
          status: member.status,
        };
        dispatch(setSelectedUser([...selectedUser, newUser]));
      }
    } else {
      const exists = selectedMembers.find(item => item?._id === member._id);
      if (exists) {
        setSelectedMembers(prev => prev.filter(item => item?._id !== member?._id));
      } else {
        setSelectedMembers(prev => [...prev, member]);
      }
    }
  };

  const renderSelectedMembers = ({ item }: { item: MemberType }) => (
    <SelectedMemberChip item={item} onRemove={toggleSelection} />
  );

  const renderSearchTopComponent = () => {
    return (
      <View style={styles.selectedMemberListContainer}>
        <BaseList
          data={selectedMembers}
          renderItem={renderSelectedMembers}
          keyExtractor={item => 'NurseScreen' + item?._id?.toString()}
          horizontal
          // onEndReached={onEndReached}
        />
      </View>
    );
  };
  const selectedIdSet = useMemo(() => {
    return new Set(
      isFrom === 'GroupChat'
        ? selectedUser.map(user => user.userid)
        : selectedMembers.map(user => user._id)
    );
  }, [selectedUser, selectedMembers, isFrom]);

  const renderCard = ({ item }: { item: GetUserListUserType }) => {
    const isUserSelected = selectedIdSet.has(item._id);
    return (
      <CreateGroupMemberCard
        key={item?._id?.toString()}
        selectionMode
        selected={isUserSelected}
        onSelectPress={toggleSelection.bind(this, item)}
        item={item}
      />
    );
  };

  const memberTypes: MemberArrayItemType[] = useMemo(() => {
    const allTypes = getMemberTypes();
    const filteredTypes =
      isFrom === 'GroupChat'
        ? allTypes.filter(item => ['N', 'P','F'].includes(item.moduleName))
        : allTypes;
    if (filteredTypes && filteredTypes.length > 0) {
      setSelectedTab(filteredTypes[0])
    }
    return filteredTypes ?? [];
  }, []);

  const renderMemberTypes = (item: MemberArrayItemType) => {
    const isSelected = selectedTab?.moduleName === item?.moduleName;

    const onTabPress = () => {
      setSelectedTab(item);
    };

    return (
      <BaseTouchable
        style={[
          commonStyles.itemCenter,
          styles.tabStyle,
          isSelected ? styles.selectedTabStyle : {},
        ]}
        onPress={onTabPress}
        key={item?.moduleName?.toString()}
      >
        <BaseText style={[styles.tabText, isSelected ? styles.selectedTabText : {}]}>
          {item?.name}
        </BaseText>
      </BaseTouchable>
    );
  };

  const listData = useMemo(() => {
    const totalRecords: GetUserListUserType[] = [];
    queryResponse?.data?.pages?.forEach(page => {
      totalRecords.push(...((page as PageType)?.data ?? []));
    });
    return totalRecords;
  }, [queryResponse?.data]);

  const onEndReached = () => {
    if (
      queryResponse?.hasNextPage &&
      !queryResponse?.isLoading &&
      !queryResponse?.isFetchingNextPage
    ) {
      queryResponse?.fetchNextPage();
    }
  };

  const onSearchCallBack: SearchInputProps['onSearchCallBack'] = val => {
    setSearchKey(val);
  };

  const handleCreateGroup = async (data: NewGroupResponseType) => {
    const { groupName, groupImage } = data;

    const userlist = selectedMembers.map(item => ({
      userid: item._id || '',
      name: item.fullName || '',
      profilePicture: item.profilePicture || {},
      status: item.status !== undefined && item.status !== null ? !!item.status : true,
    }));

    try {
      const res = await createGroup({
        groupName,
        userlist,
        senderID: userId || '',
        grouppicture: groupImage?.path,
      });

      if (res?.success) {
        const groupId = res?.conversation?._id;
        const userIds = res?.conversation?.userlist?.map((item: any) => item.userid) || [];
        emitJoinGroup(groupId, userIds);
        showMessage({ type: 'success', message: 'Group created successfully' });
        goBack();
      } else {
        showMessage({ type: 'danger', message: 'Group creation failed' });
      }
    } catch (error) {
      devLogger('🚀 ~ handleOnCreateGroup ~ error:', error);
    }
  };

  const handleOnPressCreateGroup = async () => {
    const userlist = selectedMembers.map(item => ({
      userid: item._id || '',
      name: item.fullName || '',
      profilePicture: item.profilePicture || {},
      status: item.status !== undefined && item.status !== null ? !!item.status : true,
    }));

    try {
      if (userlist.length > 1) {
        // Show Group Name & Profile Image Popup
        setShowGroupNamePopup(true);
      } else {
        // Create One to One Chat
        await createGroup({ groupName: '', userlist, senderID: userId || '' });
        showMessage({ type: 'success', message: 'Chat created successfully' });
        goBack();
      }
    } catch (error) {
      devLogger('🚀 ~ handleOnCreateGroup ~ error:', error);
    }
  };

  const updateGroup = async () => {
    const payload = {
      members: selectedUser ?? [],
      groupID: groupData?.groupId ?? 0
    };
    try {
      const res = await updateGroupMembers(payload);
      if (res?.data) {
        emitEditGroupMember(groupData?.groupId ?? '')
         navigationRef.reset({ routes: [{ name: 'BottomTabNavigator', path: 'Chats' }] });
      } else {
        showMessage({ type: 'danger', message: 'Group creation failed' });
      }
    } catch (error) {
      devLogger('🚀 ~ updateGroup ~ error:', error);
    }
  }
  
  return (
    <>
      <BottomTabScreenWrapper
        title={update ? 'Update Group' : 'Create Group'}
        searchPlaceholder="Search..."
        headerProps={{
          renderLeftComponent,
          disableRightComponent: true,
          containerStyle: physicianStyles.headerContainer,
        }}
        onSearchCallBack={onSearchCallBack}
        onClearSearch={setSearchKey.bind(this, '')}
        isSearching={queryResponse?.isFetching && !!searchKey && !queryResponse?.isFetchingNextPage}
        {...(selectedMembers ? { renderSearchTopComponent } : {})}
      >
        <CenterLoader visible={false} containerStyle={dashboardStyles.loaderContainer} />
        <View>
          <BaseScroll horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
            {memberTypes?.map(renderMemberTypes)}
          </BaseScroll>
        </View>
        {!queryResponse?.isLoading && !!searchKey && (
          <SearchResultText {...{ searchKey }} style={[styles.searchText]} />
        )}

        <BaseList
          data={listData}
          renderItem={renderCard}
          keyExtractor={item => item?._id?.toString() ?? ''}
          contentContainerStyle={[physicianStyles.listContainerStyle, styles.listContainerStyle]}
          style={[commonStyles.flex]}
          onEndReached={onEndReached}
          ListFooterComponent={
            queryResponse?.hasNextPage && queryResponse?.isFetchingNextPage ? (
              <ListFooterComponent />
            ) : null
          }
          ListEmptyComponent={!queryResponse?.isLoading ? <ListEmptyComponent /> : <></>}
          {...getRefreshControlProps(queryResponse)}
        />
        <SvgIconButton
          icon="ArrowForward"
          iconProps={{ color: colors.white }}
          style={[commonStyles.centerCenter, styles.arrowButton]}
          onPress={ isFrom === 'GroupChat' ? updateGroup :  handleOnPressCreateGroup}
        />
      </BottomTabScreenWrapper>
      <NewGroupDetailPopup
        visible={showGroupNamePopup}
        onCancel={setShowGroupNamePopup.bind(this, false)}
        onSubmitEditing={handleCreateGroup}
      />
    </>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    selectedMemberListContainer: {
      marginBottom: mScale(12),
    },
    selectedMemberContainer: {
      marginRight: mScale(12),
      gap: mScale(6),
      width: mScale(64),
      alignItems: 'center',
    },
    selectedMemberAvatarWrap: {
      position: 'relative',
    },
    selectedMemberName: {
      fontSize: FontSizes.size_12,
      textAlign: 'center',
      maxWidth: mScale(64),
      color: colors.text,
      opacity: 0.95,
    },
    closeIcon: {
      position: 'absolute',
      bottom: -mScale(4),
      right: -mScale(4),
      zIndex: 5,
    },
    selectedAvatar: {
      height: mScale(44),
      width: mScale(44),
    },
    selectedMemberAvatarFallback: {
      height: mScale(44),
      width: mScale(44),
      backgroundColor: colors.searchInputBackground,
      borderRadius: mScale(999),
    },
    arrowButton: {
      backgroundColor: colors.tint,
      alignSelf: 'center',
      position: 'absolute',
      bottom: mScale(12),
      height: mScale(72),
      width: mScale(72),
      borderRadius: mScale(72),
      borderWidth: mScale(4),
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      shadowOpacity: 0.35,
      shadowRadius: mScale(16),
      elevation: 4,
    },
    tabsContainer: {
      borderBottomWidth: 1,
      borderBottomColor: colors.searchInputBackground,
      marginBottom: mScale(6),
    },
    tabStyle: {
      paddingVertical: mScale(10),
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      paddingHorizontal: mScale(14),
      minWidth: mScale(124),
      alignItems: 'center',
    },
    selectedTabStyle: {
      borderBottomWidth: 2,
      borderBottomColor: colors.tint,
    },
    tabText: {
      fontSize: FontSizes.size_16,
      fontWeight: FontWeights.medium,
      color: colors.inputPlaceHolder,
    },
    selectedTabText: {
      fontWeight: FontWeights.semibold,
      color: colors.text,
    },
    listContainerStyle: {
      paddingTop: mScale(8),
      paddingBottom: mScale(110),
    },
    avatar: {
      height: CHAT_AVATAR_SIZE,
      width: CHAT_AVATAR_SIZE,
    },
    searchText: {
      marginTop: mScale(8),
      marginBottom: mScale(6),
    },
  }));
