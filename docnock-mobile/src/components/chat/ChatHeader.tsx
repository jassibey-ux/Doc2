import {
  RingerSenderResponseType,
  useAppDispatch,
  useAppSelector,
  useCallSockets,
  useChatSocket,
  useTheme,
} from '@hooks';
import LottieView from 'lottie-react-native';
import { LottieFiles } from '@assets';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { BaseButton, BaseTouchable, SvgIconButton } from '../button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkIsLightTheme,
  decryptData,
  devLogger,
  getProfileImageUrlFromImageName,
  mScale,
} from '@utils';
import { commonStyles } from '@styles';
import { BaseText } from '../BaseText';
import { FontSizes, FontWeights } from '@theme';
import { BlurView } from '@react-native-community/blur';
import { RootStackParamList, useCustomNavigation } from '@navigation';
import { resetCall, setCurrentPersonDetailUsage, setLoader, setSelectedUser, setViewProfile } from '@store';
import { GroupDetailPopup } from '../GroupDetailPopup';
import { BaseImage } from '../BaseImage';
import { NewGroupDetailPopup, NewGroupResponseType } from '../NewGroupDetailPopup';
import { BaseInput } from '../input';
import { CallType, useCallContext } from '@context';
import {
  useCreateUpdateGroupMutation,
  useExportChat,
  useGenerateAgoraTokenMutation,
  useGetUserInfoMutation,
} from '@api';
import { Images } from '@assets';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { SenderRingCard } from '../call/SenderRingCard';
import { useFocusEffect } from '@react-navigation/native';
import { getTimeZone, getLocales } from "react-native-localize";
import { PatientContextSheet } from '../PatientContextSheet';
import { axiosAuthClient } from '../../api/client/axiosClient';

const CHAT_HEADER_AVATAR_SIZE = mScale(48);

export const BackDropComponent = Platform.OS === 'ios' ? BlurView : View;

export type ChatHeaderProps = {
  searchCallback: (text: string) => void;
  searchText: string;
  callStatusDetails: any;
  status?: 'online' | 'offline';
  data: RingerSenderResponseType;
} & RootStackParamList['ChatScreen'];

export const ChatHeader = ({
  isEFax = false,
  isGroup = false,
  data,
  searchCallback,
  callStatusDetails,
  searchText,
  status,
}: ChatHeaderProps) => {
  const image = data?.group
    ? data?.image
    : data?.actualgroupmemberid?.[0]?.profilePicture?.savedName;

  const dispatch = useAppDispatch();
  const navigation = useCustomNavigation();
  const { top } = useSafeAreaInsets();

  const chatId = data?.groupId ?? '';
  const isReceiverTyping = useAppSelector(state => state.chats.typingChats?.[chatId]);
  const { isBusy} = useAppSelector(state => state.temp);

  const profile = useAppSelector(state => state.auth?.loginDetails?.profile);
  const selectedUser = useAppSelector(state => state.chats.selectedUser);
  const { theme, colors } = useTheme(_t => _t);
  const avatarColor = colors.avatarColor;
  const locale = getLocales()?.[0]?.languageTag ?? 'en-IN';
  const timezone = getTimeZone() ?? 'Asia/Kolkata';

  const { emitRingStart } = useCallSockets();
  const { emitUserRegister, emitJoinGroup } = useChatSocket();
  const { mutateAsync: getExportChatInfo } = useExportChat(data?.groupId ?? '' , locale, timezone);
  const {
    setIsGroup,
    setType,
    showCallRibbon,
    setCallRingerDetails,
    isCallOngoing,
    callRingerDetails,
    allCallDetails,
    setShowCallSenderModel,
    setCallSenderDetails,
    startCall,
  } = useCallContext();
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();
  const [prpofileDate, setPrpofileDate] = useState<any>(null);
  useEffect(() => {
    const getData = async () => {
      const newProfile = await getUserInfo();
      const decryptedProfile = await decryptData(newProfile?.data?.encryptDatauserdata);
      setPrpofileDate(decryptedProfile);
    };
    getData();
  }, []);

  const [showGroupDetails, setShowGroupDetails] = useState<boolean>(false);
  const [showUpdateDetails, setShowUpdateDetails] = useState<boolean>(false);
  const [showSearchBar, setShowSearchBar] = useState<boolean>(false);
  const [shouldShowJoin, setShouldShowJoin] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const moreButtonRef = useRef<View>(null);
  const [showPatientContext, setShowPatientContext] = useState<boolean>(false);
  const [showAiSummary, setShowAiSummary] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState<boolean>(false);

  const { mutateAsync: updateGroup } = useCreateUpdateGroupMutation();

  const isNonJoinedCallGoing = allCallDetails?.find(item => item.groupId === data?.groupId);

  const styles = ChatHeaderStyle();

  const onPressBack = () => {
    navigation.goBack();
  };

  const onPressName = () => {
    if (isGroup) {
      setShowGroupDetails(true);
    } else {
      // TODO: This is disabled for now as it's causing missing data
      dispatch(setViewProfile(data));
      dispatch(setCurrentPersonDetailUsage(isEFax ? 'efax' : 'chat'));
    }
  };

  const onUpdateGroupDetails = () => {
    setShowGroupDetails(false);
    setShowUpdateDetails(true);
  };
  const onAddPress = () => {
    setShowGroupDetails(false);
    const updatedUsers = [...selectedUser];
    data &&
      data.actualgroupmemberid &&
      data.actualgroupmemberid.forEach(user => {
        const object = {
          userid: user?._id,
          name: user?.fullName,
          profilePicture: user?.profilePicture,
          status: user?.status,
        };

        const exists = updatedUsers.some(u => u.userid === object.userid);

        if (!exists) {
          updatedUsers.push(object);
        } else {
          const index = updatedUsers.findIndex(u => u.userid === object.userid);
          if (index !== -1) {
            updatedUsers.splice(index, 1);
          }
        }
      });

    dispatch(setSelectedUser(updatedUsers));
    navigation.navigate('CreateGroupScreen', {
      update: true,
      isFrom: 'GroupChat',
      groupData: data,
    });
  };

  const onCancelUpdate = () => {
    setShowUpdateDetails(false);
    setShowGroupDetails(true);
  };

  const profileUri = getProfileImageUrlFromImageName(image || '');

  const onPressCall = async (type: CallType, isJoin: boolean, joinCallId: string) => {
    if (!data?.groupId || !data?.userIds || !data?.actualgroupmemberid) {
      return;
    }
    const userIds = data?.actualgroupmemberid?.map(item => item?._id ?? '') ?? [];
    setType?.(type);
    setIsGroup?.(isGroup);
    // console.log("isGroup:ChatHeader", isGroup)

    if (isJoin) {
      startCall?.(data?.groupId, callStatusDetails?.audio, isJoin, isGroup);
      // const callItem = allCallDetails?.find(item => item.groupId === data?.groupId);
      // if (callItem) {
      //   setCallRingerDetails?.(callItem);
      // }
    }
    const isSuccess = true;

    // console.log('isSuccess<><><><><>', isSuccess);
    if (!isSuccess) {
      return;
    }

    if (isSuccess && !isJoin) {
      const userIdss = data?.actualgroupmemberid[0]?.userIds || [];
      emitUserRegister();
      emitJoinGroup(data?.groupId, userIds);
      const response = await emitRingStart(data?.groupId, userIdss, type === CallType.audio, data);
      setShowCallSenderModel(true);
      setCallSenderDetails(data);
    }
  };

  const confirmCallStart = (type: CallType, isJoin: boolean, joinCallId: string) => {
    Alert.alert(
      'Are you sure',
      isJoin ? "You're about to join a call" : "You're about to start a call",
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: isJoin ? 'Join Call' : 'Start Call',
          onPress: () => {
            dispatch(resetCall())
            onPressCall?.(type, isJoin, joinCallId);
          },
        },
      ],
    );
  };

  // Resolve the typing user's first name from group members
  const typingUserName = React.useMemo(() => {
    if (!isReceiverTyping || !isGroup || !data?.actualgroupmemberid?.length) return '';
    const typingSenderId = typeof isReceiverTyping === 'string' ? isReceiverTyping : '';
    if (!typingSenderId) return '';
    const member = data.actualgroupmemberid.find((m: any) => m?._id === typingSenderId);
    return member?.fullName?.split(' ')?.[0] || '';
  }, [isReceiverTyping, isGroup, data?.actualgroupmemberid]);

  const SubtitleComponent = useCallback(() => {
    if (isReceiverTyping) {
      if (isGroup && typingUserName) {
        return (
          <BaseText style={styles.typingText} numberOfLines={1}>
            {typingUserName} is typing...
          </BaseText>
        );
      }
      return (
        <BaseText style={styles.typingText} numberOfLines={1}>
          typing...
        </BaseText>
      );
    }
    if (!isGroup && status) {
      return (
        <BaseText
          style={[
            styles.subtitleText,
            status === 'online' && styles.onlineText,
          ]}
          numberOfLines={1}
        >
          {status}
        </BaseText>
      );
    }
    return null;
  }, [isReceiverTyping, status, isGroup, typingUserName]);

  const closeSearch = () => {
    if (searchText) {
      searchCallback?.('');
      return;
    }
    setShowSearchBar(false);
  };

  const renderInnerRightComponent = () => {
    return <SvgIconButton icon="ChatPlus" style={styles.closeIcon} onPress={closeSearch} />;
  };

  const onSubmitEditing = async (groupData: NewGroupResponseType) => {
    if (!groupData?.groupName) {
      Alert.alert('Group Name is required');
      return;
    }
    try {
      setLoader(true);
      const params = {
        groupId: data?.groupId,
        groupName: groupData?.groupName,
        ...(groupData?.groupImage?.path &&
        (groupData?.groupImage?.path !== profileUri || !profileUri)
          ? { grouppicture: groupData?.groupImage?.path }
          : {}),
        isEdit: true,
      };
      const response = await updateGroup(params);
      setLoader(false);

      if (response?.success) {
        navigation.reset({ routes: [{ name: 'BottomTabNavigator', path: 'Chats' }] });
      }
    } catch (error) {
      devLogger('🚀 ~ onSubmitEditing ~ error:', error);
      setLoader(false);
    }
  };

  const downloadBase64File = async (base64String: string, fileName: string) => {
    try {
      const cleanBase64 = base64String.replace(/^data:.*;base64,/, '');
      const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

      await RNFS.writeFile(filePath, cleanBase64, 'base64');
      
      const result = await Share.open({
        url: `file://${filePath}`,
        saveToFiles: Platform.OS === 'ios',
        failOnCancel: false,
      });
      
      if (result.success) {
        Alert.alert('Success', 'File saved successfully');
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to save file');
      }
    }
  };
  useFocusEffect(
    useCallback(() => {
      if (
        Array.isArray(callStatusDetails?.participant) &&
        callStatusDetails.participant.length > 0 &&
        profile?._id
      ) {
        const notJoined = !callStatusDetails.participant.includes(profile._id);
        setShouldShowJoin(notJoined);
      } else {
        setShouldShowJoin(false);
      }
    }, [callStatusDetails?.participant, profile?._id]),
  );

  // const shouldShowJoin =
  //   Array.isArray(callStatusDetails?.participant) &&
  //   callStatusDetails.participant.length > 0 &&
  //   !callStatusDetails.participant.includes(profile?._id);

  useFocusEffect(
    useCallback(() => {
      if (
        Array.isArray(callStatusDetails?.participant) &&
        callStatusDetails.participant.length > 0 &&
        profile?._id
      ) {
        const notJoined = !callStatusDetails.participant.includes(profile._id);
        setShouldShowJoin(notJoined);
      } else {
        setShouldShowJoin(false);
      }
    }, [callStatusDetails?.participant, profile?._id]),
  );

  return (
    <>
      <View style={[styles.container, { paddingTop: top + mScale(10) }]}>
        <View style={[commonStyles.rowItemsCenter, styles.headerContainer]}>
          <SvgIconButton icon="ChevronLeft" onPress={onPressBack} />
          <BaseTouchable style={styles.profileSection} onPress={onPressName} disabled={!isGroup}>
            <View style={styles.avatarContainer}>
              {profileUri ? (
                <BaseImage
                  source={{ uri: profileUri }}
                  containerStyle={styles.avatar}
                  borderRadius={CHAT_HEADER_AVATAR_SIZE}
                  defaultSource={
                    checkIsLightTheme() ? Images.avatar_placeholder_light : Images.avatar_placeholder
                  }
                />
              ) : (
                <SvgIconButton icon="AvatarPlaceholder" iconProps={{ color: avatarColor }} />
              )}
            </View>
            <View style={styles.nameContainer}>
              <BaseText style={styles.chatName} numberOfLines={1}>
                {data?.title ?? 'Unknown'}
              </BaseText>
              <SubtitleComponent />
            </View>
          </BaseTouchable>
          <View style={[commonStyles.rowItemsCenter, styles.buttonContainer]}>
            {isBusy ?
              <View style={styles.busyBtnStyle}>
                <BaseText>
                  {'In-Call Busy'}
                </BaseText>
              </View>
              : null}
            {!isEFax && !isCallOngoing && !isNonJoinedCallGoing && !shouldShowJoin && (
                <>
                  <SvgIconButton
                    icon="ChatCall"
                    onPress={confirmCallStart.bind(this, CallType.audio, false, data?.groupId ?? '')}
                  />
                  <SvgIconButton
                    icon="ChatVideoCall"
                    onPress={confirmCallStart.bind(this, CallType.video, false, data?.groupId ?? '')}
                  />
                </>
            )}
            {
              shouldShowJoin && (
                <BaseButton
                  title="Join call"
                  style={styles.joinCallButton}
                  fixWidth={false}
                  titleStyle={styles.joinCallButtonText}
                  onPress={confirmCallStart.bind(
                    this,
                    callRingerDetails?.audio ? CallType.audio : CallType.video,
                    true,
                    data?.groupId ?? '',
                  )}
                />
              )
            }
            <View ref={moreButtonRef} collapsable={false}>
              <TouchableOpacity
                onPress={() => {
                  moreButtonRef.current?.measureInWindow((x, y, width, height) => {
                    setMenuPosition({ top: y + height + mScale(4), right: mScale(10) });
                    setShowMoreMenu(true);
                  });
                }}
                style={styles.moreButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <BaseText style={styles.moreDotsText}>⋮</BaseText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {showSearchBar && (
          <BaseInput
            containerStyle={styles.searchContainer}
            inputContainerStyle={styles.inputContainer}
            renderInnerRightComponent={renderInnerRightComponent}
            value={searchText}
            onChangeText={searchCallback}
            placeholder="Search .."
          />
        )}
        <BackDropComponent blurType={theme} style={styles.backgroundBlur} />
      </View>
      <GroupDetailPopup
        visible={showGroupDetails}
        onCancel={setShowGroupDetails.bind(this, false)}
        groupData={data}
        onUpdateGroupDetails={onUpdateGroupDetails}
        onAddUserInGroup={onAddPress}
      />
      <NewGroupDetailPopup
        onCancel={onCancelUpdate}
        visible={showUpdateDetails}
        update={true}
        groupData={data}
        onSubmitEditing={onSubmitEditing}
      />
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMoreMenu(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuContainer, { top: menuPosition.top, right: menuPosition.right }]}>  
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  setShowSearchBar(true);
                }}
              >
                <BaseText style={styles.menuItemText}>Search</BaseText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  getExportChatInfo()
                    .then(res => {
                      downloadBase64File(res.data.base64, res.data.fileName);
                    })
                    .catch(() => {
                      Alert.alert('Error', 'Failed to export chat');
                    });
                }}
              >
                <BaseText style={styles.menuItemText}>Export Chat</BaseText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  setShowPatientContext(true);
                }}
              >
                <BaseText style={styles.menuItemText}>Patient Context</BaseText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  if (!data?.groupId || aiSummaryLoading) return;
                  setAiSummaryLoading(true);
                  setShowAiSummary(true);
                  setAiSummary('');
                  axiosAuthClient
                    .post('ai/summarize-conversation', { conversationId: data.groupId, lastN: 50 })
                    .then((res) => {
                      setAiSummary(res.data?.summary || 'Unable to generate summary.');
                    })
                    .catch(() => {
                      setAiSummary('Failed to generate summary. Please try again.');
                    })
                    .finally(() => setAiSummaryLoading(false));
                }}
              >
                <BaseText style={styles.menuItemText}>Catch Me Up</BaseText>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <PatientContextSheet
        visible={showPatientContext}
        onClose={() => setShowPatientContext(false)}
        conversationId={data?.groupId ?? ''}
      />
      {/* AI Summary Modal */}
      <Modal visible={showAiSummary} transparent animationType="slide" onRequestClose={() => setShowAiSummary(false)}>
        <TouchableWithoutFeedback onPress={() => setShowAiSummary(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                maxHeight: '50%',
                padding: 20,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <BaseText style={{ fontSize: 16, fontWeight: '600', color: '#005EB8' }}>AI Summary</BaseText>
                  <TouchableOpacity onPress={() => setShowAiSummary(false)}>
                    <BaseText style={{ fontSize: 20, color: '#757575' }}>x</BaseText>
                  </TouchableOpacity>
                </View>
                {aiSummaryLoading ? (
                  <BaseText style={{ textAlign: 'center', color: '#757575', padding: 24 }}>Generating summary...</BaseText>
                ) : (
                  <BaseText style={{ fontSize: 14, lineHeight: 22, color: '#212121' }}>{aiSummary}</BaseText>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

export const ChatHeaderStyle = () =>
  useTheme(({ colors, theme }) => ({
    container: {
      width: '100%',
      paddingBottom: mScale(12),
      paddingHorizontal: mScale(6),
      borderBottomLeftRadius: mScale(20),
      borderBottomRightRadius: mScale(20),
      overflow: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 15,
    },
    headerContainer: {
      gap: mScale(2),
    },
    profileSection: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: mScale(8),
      marginRight: mScale(4),
    },
    avatarContainer: {
      position: 'relative',
    },
    nameContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    backgroundBlur: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      zIndex: -1,
      ...(Platform.OS === 'android'
        ? { backgroundColor: colors.nursingHomeIconBackground }
        : { backgroundColor: theme === 'light' ? colors.white : 'transparent' }),
    },
    chatName: {
      fontSize: FontSizes.size_16,
      fontWeight: FontWeights.semibold,
      lineHeight: mScale(20),
    },
    buttonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: mScale(4),
    },
    avatar: {
      height: CHAT_HEADER_AVATAR_SIZE,
      width: CHAT_HEADER_AVATAR_SIZE,
    },
    searchBarContainer: {
      marginTop: mScale(12),
      gap: mScale(10),
      alignSelf: 'center',
      marginHorizontal: mScale(10),
    },
    searchContainer: {
      width: '95%',
      alignSelf: 'center',
      marginTop: mScale(12),
    },
    inputContainer: {
      backgroundColor: colors.searchInputBackground,
    },
    closeIcon: {
      transform: [{ rotate: '45deg' }],
    },
    offlineBadge: {
      height: mScale(14),
      width: mScale(14),
      backgroundColor: 'red',
      position: 'absolute',
      borderRadius: mScale(9),
      bottom: 0,
      right: 0,
    },
    onlineBadge: {
      backgroundColor: 'green',
    },
    joinCallButton: {
      paddingHorizontal: mScale(10),
      paddingVertical: 0,
      height: mScale(35),
      marginBottom: 0,
    },
    joinCallButtonText: {
      fontSize: FontSizes.size_12,
      textTransform: 'capitalize',
    },
    lottieStyle: {
      width: mScale(40),
      height: mScale(30),
    },
    typingText: {
      fontSize: FontSizes.size_12,
      color: '#25D366',
      fontStyle: 'italic',
      lineHeight: mScale(16),
    },
    subtitleText: {
      fontSize: FontSizes.size_12,
      color: colors.textSecondary ?? '#8696A0',
      lineHeight: mScale(16),
    },
    onlineText: {
      color: '#25D366',
    },
    busyBtnStyle:{
      backgroundColor: colors.redOrange,
      paddingHorizontal: mScale(5),
      paddingVertical: mScale(10),
      borderRadius: mScale(5),
    },
    moreButton: {
      paddingHorizontal: mScale(6),
      paddingVertical: mScale(2),
      justifyContent: 'center',
      alignItems: 'center',
    },
    moreDotsText: {
      fontSize: mScale(22),
      fontWeight: '700',
      color: colors.white,
      lineHeight: mScale(24),
    },
    menuOverlay: {
      flex: 1,
    },
    menuContainer: {
      position: 'absolute',
      backgroundColor: theme === 'dark' ? '#2C2C2E' : '#FFFFFF',
      borderRadius: mScale(8),
      paddingVertical: mScale(4),
      minWidth: mScale(150),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    menuItem: {
      paddingHorizontal: mScale(16),
      paddingVertical: mScale(12),
    },
    menuItemText: {
      fontSize: mScale(15),
      color: theme === 'dark' ? '#FFFFFF' : '#1C1C1E',
    },
  }));
