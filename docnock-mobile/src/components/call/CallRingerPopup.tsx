import React, { useEffect, useState } from 'react';
import { Modal, StatusBar, StyleSheet, View } from 'react-native';
import { checkIsLightTheme, decryptData, mScale, wp } from '@utils';
import { commonStyles } from '@styles';
import { useAppDispatch, useAppSelector, useCallSockets, useChatSocket, useTheme } from '@hooks';
import { CallType, useCallContext } from '@context';
import { Images } from '@assets';
import { BaseImage } from '../BaseImage';
import { BaseButton, SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import Sound from 'react-native-sound';
import { useGetUserInfoMutation } from '@api';
import { resetCall } from '@store';
import { FontSizes, FontWeights } from '@theme';

export const CallRingerPopup = () => {
  const { emitUserRegister, emitJoinGroup} = useChatSocket();
  const [isSongLoaded, setIsSongLoaded] = useState(false);
  const [loadedSound, setLoadedSound] = useState<Sound | null>(null);
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();
  const [prpofileDate, setPrpofileDate] = useState<any>(null);
  const { status } = useAppSelector(state => state.callKeep);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const getData = async () => {
      const newProfile = await getUserInfo();
      const decryptedProfile = await decryptData(newProfile?.data?.encryptDatauserdata);
      setPrpofileDate(decryptedProfile);
    };
    getData();
  }, []);
  const { emitAcceptCall, emitRejectCall} = useCallSockets();
  const {
    setType,
    callRingerDetails,
    setShowRingerDialogue,
    startCall,
    setCallRingerDetails,
    showRingerDialogue,
    setBackhanduid,
    setAllCallDetails,
  } = useCallContext();

  useEffect(() => {
    if (status == 'accepted' && callRingerDetails) {
      console.log('📞 Call accepted in CallRingerPopup', callRingerDetails);
      onPressAcceptCall();
    }
    else if (status == 'rejected') {
      onPressRejectCall();
    }
  }, [status, callRingerDetails]);

  useEffect(() => {
    if (!showRingerDialogue) return;
    const timer = setTimeout(() => {
      setShowRingerDialogue?.(false);
      setCallRingerDetails?.(null);
      setAllCallDetails([])
      emitUserRegister()
    }, 30000);

    return () => clearTimeout(timer);
  }, [showRingerDialogue]);

  const styles = Styles();

  const onPressAcceptCall = async () => {
    if (!callRingerDetails?.callerId || !callRingerDetails?.groupId) {
      return;
    }

    const success = await emitAcceptCall(
      callRingerDetails?.callerId,
      callRingerDetails?.groupId,
      callRingerDetails?.audio,
      prpofileDate,
    );

    // console.log('success<><<><>>', success);
    // socketInstance.emit(
    //   'getparticipantinfo',
    //   { groupId: callRingerDetails?.groupId },
    //   (acknowledgment: any) => {
    //     console.log('Server Response:>>>>>><<<<<<', acknowledgment);
    //   },
    // );

    if (success) {
      setType?.(callRingerDetails?.audio ? CallType.audio : CallType.video);
      // setIsGroup?.(
      //   !!callRingerDetails?.activegrouuserids && callRingerDetails?.activegrouuserids?.length > 1,
      // );
      const groupId = callRingerDetails?.groupId;
      const userIds = callRingerDetails?.activegrouuserids?.map((item: any) => item.userid) || [];
      emitJoinGroup(groupId, userIds);
       dispatch(resetCall());
      setBackhanduid(null);
      startCall?.(
        callRingerDetails?.groupId,
        callRingerDetails?.audio ? true : false,
        false
      );
    }
  };
  // const acceptCallFromNotification = async () => {
  //   if (!callData?.callerId || !callData?.groupId) {
  //     return;
  //   }
  //   const success = await emitAcceptCall(
  //     callData?.callerId,
  //     callData?.groupId,
  //     callData?.audio,
  //     prpofileDate,
  //   );
  //   if (success) {
  //     setType?.(callData?.audio ? CallType.audio : CallType.video);
  //     setShowRingerDialogue?.(false);
  //     setBackhanduid(null);
  //     startCall?.(
  //       callData?.groupId,
  //       callData?.audio ? true : false,
  //       false
  //     );
  //   }
  // };

  const onPressRejectCall = async () => {
    if (!callRingerDetails?.callerId || !callRingerDetails?.groupId) {
      return;
    }
    const success = await emitRejectCall(callRingerDetails?.callerId, callRingerDetails?.groupId);
    if (success) {
      setShowRingerDialogue?.(false);
      setCallRingerDetails?.(null);
    }
  };

  const initializeSound = async () => {
    Sound.setCategory('Playback');
    const ringSound = new Sound('call_ring.mp3', Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.error('Failed to load sound:', error);
        return;
      }
      console.log('Sound loaded successfully');
      ringSound.setNumberOfLoops(-1);
      ringSound.setVolume(1.0);
      setIsSongLoaded(true);
      setLoadedSound(ringSound);
    });
  };

 useEffect(() => {
   initializeSound();

   return () => {
     if (loadedSound) {
       loadedSound.release();
     }
   };
 }, []);

  // useEffect(() => {
  //   setTimeout(async () => {
  //     console.log('firstcallRingerDetails', callRingerDetails)
  //     if (callRingerDetails) {
  //       await emitRejectCall(callRingerDetails?.callerId, callRingerDetails?.groupId)
  //     }
  //   }, 3000);
  // }, [callRingerDetails])

  useEffect(() => {
    if (showRingerDialogue && isSongLoaded && loadedSound) {
      loadedSound.play(success => {
        if (!success) {
          console.error('Sound playback failed');
        } else {
          console.log('Sound playing successfully');
        }
      });
    }
    return () => {
      if (loadedSound) {
        loadedSound.stop(() => {
        });
      }
    };
  }, [showRingerDialogue, isSongLoaded, loadedSound]);

  return (
    <Modal transparent visible={showRingerDialogue} animationType="fade" statusBarTranslucent>
      {showRingerDialogue && (
        <View style={styles.container}>
          {callRingerDetails?.callerImage ? (
            <BaseImage
              containerStyle={[StyleSheet.absoluteFill, styles.backgroundImageContainer]}
              source={{ uri: callRingerDetails?.callerImage }}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.noImageBackground]} />
          )}
          <View style={[StyleSheet.absoluteFill, styles.dimOverlay]} />

          <View style={styles.topRow}>
            <SvgIconButton icon="ChevronLeft" style={styles.topActionButton} />
            <SvgIconButton icon="Export" style={styles.topActionButton} />
          </View>

          <View style={styles.infoContainer}>
            <BaseText style={styles.callerName} numberOfLines={1}>
              {callRingerDetails?.callerName ?? 'Unknown'}
            </BaseText>
            <BaseText style={styles.callStatus} numberOfLines={1}>
              Ringing...
            </BaseText>
          </View>

          <View style={styles.bottomActionsContainer}>
            <View style={[commonStyles.rowItemsCenter, styles.bottomActionRow]}>
              <BaseButton
                title="Decline"
                style={[styles.actionButton, styles.rejectButtonStyle]}
                titleStyle={styles.actionButtonText}
                onPress={onPressRejectCall}
              />
              <BaseButton
                title="Accept"
                style={[styles.actionButton, styles.acceptButtonStyle]}
                titleStyle={styles.actionButtonText}
                onPress={onPressAcceptCall}
              />
            </View>
          </View>
        </View>
      )}
      <StatusBar translucent={true} barStyle={'light-content'} backgroundColor={'transparent'} />
    </Modal>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      flex: 1,
      backgroundColor: colors.black,
      justifyContent: 'space-between',
      paddingTop: mScale(54),
      paddingBottom: mScale(34),
      paddingHorizontal: mScale(16),
    },
    backgroundImageContainer: {
      opacity: 0.95,
    },
    noImageBackground: {
      backgroundColor: colors.black,
    },
    dimOverlay: {
      backgroundColor: colors.blackOpacity05,
    },
    topRow: {
      zIndex: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    topActionButton: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(38),
    },
    infoContainer: {
      alignItems: 'center',
      marginTop: mScale(20),
      zIndex: 2,
    },
    callerName: {
      color: colors.white,
      fontSize: FontSizes.size_34,
      fontWeight: FontWeights.bold,
      maxWidth: wp(76),
      textAlign: 'center',
    },
    callStatus: {
      marginTop: mScale(4),
      color: colors.white,
      opacity: 0.9,
      fontSize: FontSizes.size_18,
      fontWeight: FontWeights.medium,
    },
    bottomActionsContainer: {
      zIndex: 2,
      alignItems: 'center',
    },
    bottomActionRow: {
      backgroundColor: colors.blackOpacity05,
      borderRadius: mScale(36),
      paddingHorizontal: mScale(12),
      paddingVertical: mScale(10),
      gap: mScale(12),
    },
    actionButton: {
      minWidth: mScale(118),
      borderRadius: mScale(28),
      paddingVertical: mScale(12),
      paddingHorizontal: mScale(20),
      justifyContent: 'center',
    },
    actionButtonText: {
      color: colors.white,
      fontWeight: FontWeights.semibold,
    },
    acceptButtonStyle: {
      backgroundColor: colors.callGreen,
    },
    rejectButtonStyle: {
      backgroundColor: colors.callRed,
    },
  }));
