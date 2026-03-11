import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  ScreenWrapper,
  SvgIconButton,
  SvgIconButtonProps,
  CallingCard,
  BaseScroll,
  BaseText,
} from '@components';
import { commonStyles } from '@styles';
import { useAppSelector, useTheme } from '@hooks';
import { hp, mScale, wp } from '@utils';
import { renderLeftComponent } from './AllNurseList';
import { CallMembers, CallType, getAgoraUID, useCallContext } from '@context';
import { CallSocketEmitTypes, socketInstance } from '@socket';
import { FontSizes, FontWeights, UI } from '@theme';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';

const getDisplayName = (value?: string | null) => {
  if (!value?.trim()) {
    return '';
  }
  return value.trim();
};

const getFirstLetter = (value?: string | null) => {
  const cleanName = getDisplayName(value);
  if (!cleanName) {
    return '?';
  }
  return cleanName.charAt(0).toUpperCase();
};

const normalizeName = (value?: string | null) => getDisplayName(value).toLowerCase();

type ParticipantMember = {
  isVideoOn: boolean;
  isMicOn: boolean;
  isJoined: boolean;
  uid: number;
  loginuserdetails?: {
    _id?: string;
    fullName?: string;
  };
};

export const CallingScreen = ({ route, navigation: _navigation }: { route: any; navigation: any }) => {
  const {
    leaveChannel,
    type,
    videoOn,
    micOn,
    toggleMic,
    toggleVideo,
    toggleSpeaker,
    onSpeaker,
    remoteUsers,
    toggleCamera,
    focusedUser,
    setFocusedUser,
    selfUID,
    callDuration,
    isReconnecting,
  } = useCallContext();

  const [joinMembers, setJoinMembers] = useState<ParticipantMember[] | null>(null);
  const [otherUsers, setOtherUsers] = useState<CallMembers[]>([]);

  const getParticipateINfo = () => {
    socketInstance.emit(
      CallSocketEmitTypes.getparticipantinfo,
      { groupId: route?.params?.groupId },
      (acknowledgment: string) => {
        const parsedAcknowledgment = JSON.parse(acknowledgment || '{}') as {
          participant?: ParticipantMember[];
        };
        setJoinMembers(parsedAcknowledgment?.participant || null);
      },
    );
  };

  useEffect(() => {
    if (!route?.params?.groupId) return;

    const intervalId = setInterval(() => {
      if (!joinMembers) {
        getParticipateINfo();
      } else {
        clearInterval(intervalId);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [route?.params?.groupId, joinMembers]);


  useKeepAwake()

  const isVideoCall = type === CallType.video;

  const multiLayout = remoteUsers && remoteUsers?.length > 1;

  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const colors = useAppSelector(state => state.theme.colors);

  const onIconProps: SvgIconButtonProps['iconProps'] = {
    color: colors.tint,
  };

  const styles = Styles();

  const onPressExpand = (uid?: CallMembers | null) => {
    setFocusedUser(uid);
  };

  const selfAsMember: CallMembers | null = useMemo(() => {
    return loginDetails?.profile
      ? {
        uid: selfUID || 0,
        isJoined: true,
        isVideoOn: !!videoOn,
        isMicOn: !!micOn,
      }
      : null;
  }, [selfUID, videoOn, micOn, loginDetails?.profile]);

  const activeFocusedMember: CallMembers | null = useMemo(() => {
    return focusedUser || remoteUsers?.[0] || selfAsMember || null;
  }, [focusedUser, remoteUsers, selfAsMember]);

  const getOtherUsers = useCallback(() => {
    const uniqueUsers: CallMembers[] = [];
    [...(remoteUsers || []), ...(selfAsMember ? [selfAsMember] : [])]?.map(item => {
      if (
        !uniqueUsers.some(_item => getAgoraUID(_item) === getAgoraUID(item)) &&
        getAgoraUID(item) !== getAgoraUID(activeFocusedMember)
      ) {
        uniqueUsers.push(item);
      }
    });
    return uniqueUsers;
  }, [remoteUsers, activeFocusedMember, selfAsMember]);

  useEffect(() => {
    setOtherUsers(getOtherUsers());
  }, [getOtherUsers]);

  const remoteUidKey = useMemo(
    () =>
      [...(remoteUsers || [])]
        .map(user => String(getAgoraUID(user)))
        .sort()
        .join(','),
    [remoteUsers],
  );

  useEffect(() => {
    if (!route?.params?.groupId) return;
    getParticipateINfo();
  }, [route?.params?.groupId, remoteUidKey]);

  const selfFocused = getAgoraUID(activeFocusedMember) === getAgoraUID(selfAsMember);
  const localUserName = getDisplayName(loginDetails?.profile?.fullName) || 'You';

  const resolvedRemoteUserName = useMemo(() => {
    const participants: ParticipantMember[] = Array.isArray(joinMembers) ? joinMembers : [];
    const currentUserId = loginDetails?.profile?._id;
    const localNameKey = normalizeName(localUserName);

    const participantName = participants.find(item => {
      const participantUserId = item?.loginuserdetails?._id;
      const participantUid = item?.uid;
      const participantFullName = getDisplayName(item?.loginuserdetails?.fullName);
      const participantNameKey = normalizeName(participantFullName);

      const isSameByUserId = !!participantUserId && !!currentUserId && participantUserId === currentUserId;
      const isSameByUid = !!participantUid && !!selfUID && participantUid === selfUID;
      const isSameByName = !!participantNameKey && participantNameKey === localNameKey;

      return !isSameByUserId && !isSameByUid && !isSameByName;
    })?.loginuserdetails?.fullName;

    const cleanParticipantName = getDisplayName(participantName);
    if (cleanParticipantName) {
      return cleanParticipantName;
    }

    const routeName = getDisplayName(route?.params?.name);
    if (routeName && normalizeName(routeName) !== localNameKey) {
      return routeName;
    }

    return '';
  }, [joinMembers, loginDetails?.profile?._id, localUserName, route?.params?.name, selfUID]);

  const [stableRemoteName, setStableRemoteName] = useState(() => {
    const initialRouteName = getDisplayName(route?.params?.name);
    if (initialRouteName && normalizeName(initialRouteName) !== normalizeName(localUserName)) {
      return initialRouteName;
    }
    return 'Connecting...';
  });

  useEffect(() => {
    if (
      resolvedRemoteUserName &&
      normalizeName(resolvedRemoteUserName) !== normalizeName(localUserName)
    ) {
      setStableRemoteName(resolvedRemoteUserName);
    }
  }, [resolvedRemoteUserName, localUserName]);

  const callTitle = stableRemoteName;
  const callStatus = isReconnecting
    ? 'Reconnecting...'
    : remoteUsers?.length
      ? callDuration
      : 'Ringing...';

  return (
    <ScreenWrapper
      enableBottomSafeArea={false}
      enableTopSafeArea={false}
      style={[commonStyles.flex]}
    >
      <View style={[commonStyles.flex, commonStyles.centerCenter, styles.container]}>
        {renderLeftComponent({
          style: styles.backIcon,
          iconProps: { height: UI.iconPadding * 2, width: UI.iconPadding * 2 },
        })}
        <View style={styles.topRightIcon}>
          <SvgIconButton icon="Export" style={styles.topIconButton} />
        </View>
        {isVideoCall ? (
          <CallingCard
            member={activeFocusedMember}
            containerStyle={styles.focusedViewContainerStyle}
            isBig
            joinMembers={joinMembers || []}
          />
        ) : (
          <View style={[commonStyles.centerCenter, styles.audioLayoutContainer]}>
            <View style={[commonStyles.centerCenter, styles.remoteAvatar]}>
              <BaseText style={styles.remoteAvatarText}>{getFirstLetter(stableRemoteName)}</BaseText>
            </View>
            <View style={styles.localAudioCard}>
              <View style={[commonStyles.centerCenter, styles.localAvatar]}>
                <BaseText style={styles.localAvatarText}>{getFirstLetter(localUserName)}</BaseText>
              </View>
              <BaseText numberOfLines={1} style={styles.localUserText}>
                You
              </BaseText>
            </View>
          </View>
        )}
        <View style={styles.callInfoContainer}>
          <BaseText numberOfLines={1} style={styles.nameStyle}>
            {callTitle}
          </BaseText>
          <BaseText numberOfLines={1} style={styles.statusStyle}>
            {callStatus}
          </BaseText>
        </View>
        {isVideoCall && !multiLayout && !!getAgoraUID(selfAsMember) && (
          <CallingCard
            member={selfFocused ? remoteUsers?.[0] : selfAsMember}
            containerStyle={styles.ownFloatingVideoContainer}
            onPressExpand={onPressExpand}
            backhanduid={route?.params?.uid}
            joinMembers={joinMembers || []}
          />
        )}
      </View>
      {isVideoCall && multiLayout && (
        <BaseScroll horizontal={true} style={styles.remoteViewContainerStyle}>
          {[...(otherUsers || [])]?.map(item => (
            <CallingCard
              key={String(getAgoraUID(item))}
              member={item}
              containerStyle={[{ marginRight: wp(2) }]}
              isBig={false}
              onPressExpand={onPressExpand}
              backhanduid={route?.params?.uid}
              joinMembers={joinMembers || []}
            />
          ))}
        </BaseScroll>
      )}
      <View style={[commonStyles.rowItemsCenter, styles.controllerContainer]}>
        <View style={[commonStyles.rowItemsCenter, styles.controlGroup]}>
          <SvgIconButton
            icon={micOn ? 'MicOn' : 'MicOff'}
            style={[styles.iconContainer]}
            onPress={() => {
              const params = {
                groupId: route?.params?.groupId ?? '',
                senderID: loginDetails?.profile?._id ?? '',
                isAudioMuted: micOn ?? false,
                uid: route?.params?.uid ?? ''
              }
              toggleMic?.(params)
            }
            }
            {...(micOn ? { iconProps: onIconProps } : {})}
          />
          {isVideoCall && (
            <SvgIconButton
              icon={videoOn ? 'VideoOn' : 'VideoOff'}
              style={[styles.iconContainer]}
              onPress={() => {
                const params = {
                  groupId: route?.params?.groupId ?? '',
                  senderID: loginDetails?.profile?._id ?? '',
                  isVideoMuted: videoOn ?? false,
                  uid: route?.params?.uid ?? '',
                  name: route?.params?.name  ?? ''
                }
                toggleVideo?.(params)
              }}
              {...(videoOn ? { iconProps: onIconProps } : {})}
            />
          )}
          <SvgIconButton
            icon="Call2"
            style={[styles.iconContainer, styles.callIcon]}
            onPress={leaveChannel}
            iconProps={{ color: colors.callRed }}
          />
          {isVideoCall && (
            <SvgIconButton
              icon="CameraSwitch"
              style={[styles.iconContainer]}
              onPress={toggleCamera}
            />
          )}
          <SvgIconButton
            icon="Speaker"
            style={[styles.iconContainer]}
            onPress={toggleSpeaker}
            {...(onSpeaker ? { iconProps: onIconProps } : {})}
          />
        </View>
      </View>
    </ScreenWrapper>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.black,
      overflow: 'hidden',
    },
    callIcon: {
      transform: [{ rotate: '135deg' }],
      width: mScale(74),
      height: mScale(74),
      overflow: 'hidden',
    },
    iconContainer: {
      width: mScale(58),
      height: mScale(58),
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    controllerContainer: {
      position: 'absolute',
      bottom: mScale(22),
      gap: mScale(12),
      alignSelf: 'center',
    },
    ownFloatingVideoContainer: {
      position: 'absolute',
      bottom: mScale(116),
      right: mScale(8),
    },
    backIcon: {
      position: 'absolute',
      top: mScale(54),
      left: mScale(16),
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(40),
      zIndex: 4,
    },
    topRightIcon: {
      position: 'absolute',
      right: mScale(16),
      top: mScale(54),
      zIndex: 4,
    },
    topIconButton: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(40),
    },
    controlGroup: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(40),
      paddingHorizontal: mScale(12),
      paddingVertical: mScale(10),
      gap: mScale(18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    onlySelfViewStyle: {
      height: '100%',
      width: '100%',
      zIndex: -1,
    },
    remoteViewContainerStyle: {
      margin: hp(1),
      maxHeight: hp(20.5),
    },
    focusedViewContainerStyle: {
      height: '100%',
      width: '100%',
      position: 'absolute',
      zIndex: -1,
    },
    callInfoContainer: {
      position: 'absolute',
      top: mScale(58),
      alignItems: 'center',
      maxWidth: wp(72),
      zIndex: 4,
    },
    nameStyle: {
      fontSize: FontSizes.size_34,
      fontWeight: FontWeights.semibold,
      color: colors.white,
      textAlign: 'center',
    },
    audioLayoutContainer: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: mScale(96),
    },
    remoteAvatar: {
      width: mScale(168),
      height: mScale(168),
      borderRadius: mScale(84),
      backgroundColor: colors.inputBackground,
    },
    remoteAvatarText: {
      fontSize: FontSizes.size_42,
      fontWeight: FontWeights.bold,
      color: colors.white,
      textTransform: 'uppercase',
    },
    localAudioCard: {
      position: 'absolute',
      right: mScale(16),
      bottom: mScale(120),
      paddingVertical: mScale(10),
      paddingHorizontal: mScale(12),
      borderRadius: mScale(14),
      backgroundColor: colors.blackOpacity05,
      borderWidth: 1,
      borderColor: colors.inputBackground,
      alignItems: 'center',
      gap: mScale(6),
    },
    localAvatar: {
      width: mScale(46),
      height: mScale(46),
      borderRadius: mScale(23),
      backgroundColor: colors.inputBackground,
    },
    localAvatarText: {
      fontSize: FontSizes.size_18,
      fontWeight: FontWeights.bold,
      color: colors.white,
      textTransform: 'uppercase',
    },
    localUserText: {
      color: colors.white,
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.semibold,
    },
    statusStyle: {
      marginTop: mScale(4),
      color: colors.white,
      fontSize: FontSizes.size_18,
      opacity: 0.9,
    },
  }));
