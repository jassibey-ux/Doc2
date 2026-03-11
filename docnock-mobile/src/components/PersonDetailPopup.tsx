import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { checkIsLightTheme, handleDirectChatCreation, mScale } from '@utils';
import { commonStyles } from '@styles';
import { FontSizes, FontWeights } from '@theme';
import { useAppDispatch, useAppSelector, useCallSockets, useChatSocket, useTheme } from '@hooks';
import { BaseText } from './BaseText';
import { BaseButton, SvgIconButton } from './button';
import { resetCall, setCurrentPersonDetailUsage, setViewProfile } from '@store';
import { BaseImage } from './BaseImage';
import { navigationRef } from '@navigation';
import { CallType, useCallContext } from '@context';
import { Images } from '@assets';
import { useCreateUpdateGroupMutation } from '@api';
import { SenderRingCard } from './call';

export const PersonDetailPopup = () => {
  const dispatch = useAppDispatch();
  const {viewProfile, isBusy} = useAppSelector(state => state.temp);
  const currentUsage = useAppSelector(state => state.temp?.currentPersonDetailUsage);
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const loginUserId = useMemo(() => loginDetails?.profile?._id, [loginDetails?.profile]);
  const colors = useTheme(theme => theme.colors);
  const [groupId, setGroupId] = useState('')
  const visible = !!viewProfile && Object.keys(viewProfile).length > 0;
  const profilePictureUrl = viewProfile?.profilePicture?.savedName;

  const isNurse = useMemo(() => viewProfile?.role === 'nurse', [viewProfile]);

  const styles = PersonDetailPopupStyles();

  const { setIsGroup, setType,
    showCallSenderModel,
    setShowCallSenderModel,
    setCallSenderDetails,
    callSenderDetails,
    setAgoraToken
  } = useCallContext();
    const { emitRingStart,emitCancelCall } = useCallSockets();
    const { emitJoinGroup } = useChatSocket();
  const { mutateAsync: createGroup } = useCreateUpdateGroupMutation();

  const onClose = () => {
    dispatch(setCurrentPersonDetailUsage(undefined));
    dispatch(setViewProfile(undefined));
  };

  const onClosePress = () => {
    onClose?.();
  }

  const onPressChat = (efax: boolean = false) => {
    if (!viewProfile || !loginUserId) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navigationCb = (chatData: any) => {
      navigationRef.reset({
        index: 1,
        routes: [
          // { name: 'BottomTabNavigator', params: { screen: efax ? 'EFax' : 'Nurses' } },
          { name: 'BottomTabNavigator', params: { screen: viewProfile.screenName == 'physicians' ? 'physicians' : efax ? 'EFax' : 'Nurses' } },
          {
            name: 'ChatScreen',
            params: { isEFax: false, data: chatData, isGroup: false },
          },
        ],
      });
    };
    handleDirectChatCreation(viewProfile, loginUserId, createGroup, navigationCb);
    onClose?.();
  };

  const onPressCall = () => {
    dispatch(resetCall())
    setType?.(CallType.audio);
    setIsGroup?.(false);
    setAgoraToken(null)
    onClose?.();

    setTimeout(() => {
      if (viewProfile && loginUserId) {
        handleDirectChatCreation(viewProfile, loginUserId, createGroup, async (chatData) => {
          console.log('Callback triggered with chatData:', chatData);
          const userIdss = chatData?.userIds?.map((item: any) => item.userid) || [];
          emitJoinGroup(chatData?.groupId, userIdss);
          const response = await emitRingStart(
            chatData?.groupId,
            userIdss,
            false,
            chatData,
          );
          console.log('emitRingStart response:', response);
          if (chatData?.groupId) {
            setGroupId(chatData.groupId);
            setCallSenderDetails(chatData);
            setShowCallSenderModel(true);
          }
        });
      }
    }, 200);
  };

  return (
    <>
    <Modal transparent visible={visible} animationType="fade">
      {visible && (
        <>
          <Pressable
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.backgroundContainer]}
          >
            <BlurView blurType="dark" blurAmount={100} style={[commonStyles.flex]} />
          </Pressable>
          <View style={styles.foregroundContainer}>
            <View style={styles.container}>
              {profilePictureUrl ? (
                <BaseImage
                  containerStyle={[styles.personAvatarContainer]}
                  withShimmer={true}
                  source={{ uri: profilePictureUrl }}
                  borderRadius={mScale(102)}
                  defaultSource={
                    checkIsLightTheme()
                      ? Images.avatar_placeholder_light
                      : Images.avatar_placeholder
                  }
                />
              ) : (
                <SvgIconButton
                  icon="AvatarPlaceholder"
                  iconProps={styles.personAvatar}
                  style={[commonStyles.centerCenter, styles.personAvatarContainer]}
                />
              )}

              <View style={styles.detailContainer}>
                <BaseText
                  style={[styles.centerText, styles.boldText, styles.personName]}
                  numberOfLines={2}
                >
                  {viewProfile?.fullName ?? `N/A`}
                </BaseText>
                <BaseText
                  style={[styles.centerText, styles.detailText, styles.halfOpacity]}
                  numberOfLines={2}
                >
                  {viewProfile?.email ?? `N/A`}
                </BaseText>
                <BaseText
                  style={[styles.centerText, styles.detailText, styles.boldText]}
                  numberOfLines={1}
                >
                  {viewProfile?.mobile ?? `N/A`}
                </BaseText>
                <BaseText
                  style={[styles.centerText, styles.detailText, styles.halfOpacity]}
                  numberOfLines={1}
                >
                  {viewProfile?.address ?? `N/A`}
                </BaseText>
              </View>
              <View style={[commonStyles.rowItemCenterJustifyCenter, styles.buttonContainer]}>
                {currentUsage !== 'chat' && (
                  <BaseButton
                    title="Message"
                    style={styles.buttonStyle}
                    titleStyle={styles.buttonTitleStyle}
                    onPress={onPressChat.bind(this, false)}
                  />
                )}
                {currentUsage !== 'efax' && (
                  <>
                    <BaseButton
                      title={ isBusy ? "In-Call Busy": "Call"}
                      style={isBusy ? styles.redBtnStyle:  styles.buttonStyle}
                      titleStyle={styles.buttonTitleStyle}
                      onPress={isBusy ? onClosePress : onPressCall}
                    />
                    {/* <SvgIconButton
                      icon="FaxFillWhite"
                      style={styles.faxButtonStyle}
                      onPress={onPressChat.bind(this, true)}
                    /> */}
                  </>
                )}
              </View>
            </View>
          </View>
        </>
      )}
      <StatusBar translucent={true} backgroundColor={colors.inputBackground + '66'} />
    </Modal>
      {showCallSenderModel && (
        <SenderRingCard
          onCancelPress={() => {
            setShowCallSenderModel(false);
            setCallSenderDetails(null);
            emitCancelCall(callSenderDetails?.groupId ?? groupId);
          }}
        />)}
    </>
  );
};

export const PersonDetailPopupStyles = () =>
  useTheme(({ colors }) => ({
    backgroundContainer: {
      position: 'absolute',
      opacity: 0.5,
    },
    foregroundContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    container: {
      width: '88%',
      backgroundColor: colors.inputBackground,
      paddingBottom: mScale(28),
      paddingTop: 0,
      borderRadius: mScale(17),
    },
    personAvatar: {
      height: 92,
      width: 92,
      color: colors.avatarColor,
    },
    personAvatarContainer: {
      height: mScale(102),
      width: mScale(102),
      backgroundColor: colors.inputBackground,
      borderRadius: mScale(102),
      alignSelf: 'center',
      marginTop: -mScale(51),
      marginBottom: mScale(16),
      overflow: 'hidden',
    },
    detailContainer: {
      gap: mScale(8),
      alignItems: 'center',
    },
    centerText: {
      textAlign: 'center',
    },
    boldText: {
      fontWeight: FontWeights.bold,
    },
    personName: {
      fontSize: FontSizes.size_18,
    },
    detailText: {
      fontSize: FontSizes.size_12,
    },
    halfOpacity: {
      opacity: 0.5,
    },
    buttonContainer: {
      gap: mScale(8),
      marginTop: mScale(24),
    },
    buttonStyle: {
      width: mScale(110),
      height: mScale(38),
    },
    redBtnStyle: {
      width: mScale(110),
      height: mScale(38),
      backgroundColor: colors.redOrange
    },
    buttonTitleStyle: {
      textTransform: 'capitalize',
      fontSize: FontSizes.size_14,
    },
    faxButtonStyle: {
      marginLeft: mScale(4),
    },
  }));
