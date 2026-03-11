import React, { useMemo } from 'react';
import { useAppSelector, useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { hp, mScale, wp } from '@utils';
import { Text, View } from 'react-native';
import { RtcSurfaceView } from 'react-native-agora';
import { ViewStyles } from '@types';
import { SvgIconButton, SvgIconButtonProps } from '../button';
import { BaseText } from '../BaseText';
import { FontSizes, FontWeights } from '@theme';
import { CallMembers, CallType, getAgoraUID, useCallContext } from '@context';
import { socketInstance } from '@socket';

import { UI } from '@theme';

const BIGGEST_AVATAR_SIZE = UI.avatar.big;
const SMALLER_AVATAR_SIZE = UI.avatar.small;

export type VideoProps = {
  uid?: number | null;
  backhanduid?: number | 0;
  videoStyle?: ViewStyles;
  overrideStyle?: ViewStyles;
};

export const Video = ({ uid, backhanduid, videoStyle, overrideStyle }: VideoProps) => {
  const styles = Styles();
  const uidbackhand = backhanduid;
  if (!uid?.toString()) {
    return null;
  }
  return (
    <RtcSurfaceView
      canvas={{ uid, renderMode: 2 }}
      style={overrideStyle || [styles.videoStyle, videoStyle]}
      zOrderOnTop={false}
      zOrderMediaOverlay={false}
      // channelId={videoCallData.receiver_data.roomName}
    />
  );
};

export type CallingCardProps = Omit<VideoProps, 'uid'> & {
  containerStyle?: ViewStyles;
  overrideContainerStyle?: ViewStyles;
  isBig?: boolean;
  joinMembers?: CallMembers[];
  onPressExpand?: (member?: CallMembers | null) => void;
  backhanduid?: number | null;
  member?: CallMembers | null;
};

export const CallingCard = ({
  containerStyle,
  overrideContainerStyle,
  isBig,
  joinMembers,
  onPressExpand,
  backhanduid,
  member,
  ...videoProps
}: CallingCardProps) => {
  const styles = Styles();
  const { remoteUsers, micOn, videoOn, type, isCallOngoing, selfUID } = useCallContext();
  const isVideoCall = type === CallType.video;
  const uid = getAgoraUID(member) === selfUID ? 0 : getAgoraUID(member);
  // const personName = member === profile?.mobile ? 'You' : member?.fullName;
  const profileDetails = useAppSelector(state => state.auth?.loginDetails?.profile);

  function getFullNameByUID(data: any, uid: any) {
      try {
        // 1) direct member provided name
        if (member && (member as any).loginuserdetails?.fullName) return (member as any).loginuserdetails.fullName;
        if (member && ((member as any).fullName || (member as any).name || (member as any).displayName))
          return (member as any).fullName || (member as any).name || (member as any).displayName;

        // 2) look in joinMembers payload (server-side participant info)
        const user = Array.isArray(data) ? data.find((item: any) => item?.uid === uid) : null;
        const nameFromJoin = user && user.loginuserdetails && user.loginuserdetails.fullName
          ? user.loginuserdetails.fullName
          : null;
        if (nameFromJoin) return nameFromJoin;

        // 3) look into remoteUsers state (may contain extra metadata)
        const remoteUser = remoteUsers?.find(u => getAgoraUID(u) === uid);
        if (remoteUser && ((remoteUser as any).loginuserdetails?.fullName || (remoteUser as any).fullName))
          return (remoteUser as any).loginuserdetails?.fullName || (remoteUser as any).fullName;

        // 4) fallback to a readable UID or placeholder
        return uid ? String(uid) : 'Unknown';
      } catch (e) {
        return uid ? String(uid) : 'Unknown';
      }
  }
  // console.log('member<><>', member);
  const isVideoOn = useMemo(() => {
    return (
      isVideoCall &&
      isCallOngoing &&
      ((!!uid && remoteUsers?.some(_user => getAgoraUID(_user) === uid && _user?.isVideoOn)) ||
        (uid === 0 && videoOn))
    );
  }, [uid, remoteUsers, videoOn, isVideoCall, isCallOngoing]);

  const isMicOn = useMemo(() => {
    return (
      isCallOngoing &&
      ((!!uid && remoteUsers?.some(_user => getAgoraUID(_user) === uid && _user?.isMicOn)) ||
        (uid === 0 && micOn))
    );
  }, [uid, remoteUsers, micOn, isCallOngoing]);

  const controlButtonProps: SvgIconButtonProps['iconProps'] = { height: 20, width: 20 };

  const selfUser = [selfUID, 0].includes(getAgoraUID(member));

  return (
    <View
      style={
        overrideContainerStyle || [commonStyles.centerCenter, styles.videoContainer, containerStyle]
      }
      key={uid}
    >
      {!isBig && !!uid?.toString() && (
        <SvgIconButton
          icon="Expand"
          style={[styles.expandIcon]}
          onPress={onPressExpand?.bind(this, member)}
        />
      )}
      {!isVideoOn && (
        <View style={[styles.personContainer]}>
          <SvgIconButton
            icon="AvatarPlaceholder"
            iconProps={{
              height: isBig ? BIGGEST_AVATAR_SIZE : SMALLER_AVATAR_SIZE,
              width: isBig ? BIGGEST_AVATAR_SIZE : SMALLER_AVATAR_SIZE,
            }}
          />
          <View style={[styles.callDetailContainer]}>
              <BaseText style={[styles.name, !isBig ? styles.smallCardName : {}]}>
              {selfUser ? 'You' : getFullNameByUID(joinMembers, member?.uid)}
            </BaseText>
            {!isMicOn && <SvgIconButton icon="MicOff" iconProps={controlButtonProps} />}
          </View>
        </View>
      )}
      {isVideoCall && isVideoOn && !!uid?.toString() && (
        <Video uid={uid} backhanduid={backhanduid} {...videoProps} />
      )}
      {isVideoOn && (
        <View
          style={[
            styles.detailContainer,
            isBig ? styles.bigDetailContainer : styles.smallDetailContainer,
          ]}
        >
          <BaseText numberOfLines={1} style={[styles.nameStyle]}>
            {/* {selfUser ? 'You' : getAgoraUID(member)} */}
            {selfUser ? 'You' : getFullNameByUID(joinMembers, member?.uid)}
          </BaseText>
          {!(isMicOn && isVideoOn) && (
            <View style={[[commonStyles.rowItemsCenter, styles.statusContainer]]}>
              {!isMicOn && <SvgIconButton icon="MicOff" iconProps={controlButtonProps} />}
              {!isVideoOn && isVideoCall && (
                <SvgIconButton icon="VideoOff" iconProps={controlButtonProps} />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    videoContainer: {
      backgroundColor: colors.searchInputBackground,
      height: hp(20),
      width: wp(35),
      borderRadius: mScale(25),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.inputBackground,
      zIndex: 10,
    },
    videoStyle: {
      height: '100%',
      width: '100%',
      zIndex: -1,
    },
    name: {
      fontWeight: FontWeights.bold,
      fontSize: FontSizes.size_24,
      textAlign: 'center',
    },
    personContainer: {
      gap: mScale(8),
      height: '100%',
      width: '100%',
      position: 'absolute',
      zIndex: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callStatus: {
      fontSize: FontSizes.size_16,
      textAlign: 'center',
      fontWeight: FontWeights.semibold,
      opacity: 0.7,
    },
    callDetailContainer: {
      alignItems:'center',
      justifyContent:'center',
      gap: mScale(6),
      flexDirection:'row'
    },
    smallCardName: {
      fontSize: FontSizes.size_18,
    },
    smallCardCallStatus: {
      fontSize: FontSizes.size_14,
    },
    expandIcon: {
      position: 'absolute',
      top: mScale(6),
      right: mScale(6),
      zIndex: 15,
      backgroundColor: colors.inputBackground,
      height: mScale(30),
      width: mScale(30),
      borderRadius: mScale(15),
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailContainer: {
      position: 'absolute',
      zIndex: 20,
      backgroundColor: colors.inputBackground + 'DD',
      alignSelf: 'center',
      padding: mScale(12),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: mScale(10),
    },
    bigDetailContainer: {
      top: mScale(7),
      left: mScale(62),
      paddingHorizontal: mScale(20),
      borderRadius: mScale(66),
      height: mScale(48),
      justifyContent: 'center',
      alignItems: 'center',
      maxWidth: '80%',
      backgroundColor: colors.inputBackground + '99',
      flexShrink: 1,
    },
    smallDetailContainer: {
      bottom: 0,
      width: '100%',
    },
    statusContainer: {
      gap: mScale(4),
    },
    nameStyle: {
      flexShrink: 1,
      fontWeight: FontWeights.semibold,
    },
  }));
