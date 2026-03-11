import React, { useMemo } from 'react';
import { View } from 'react-native';
import { checkIsLightTheme, handleDirectChatCreation, mScale } from '@utils';
import { useAppDispatch, useAppSelector, useChatSocket, useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { FontSizes, FontWeights } from '@theme';
import { ViewStyles } from '@types';
import { BaseTouchable, SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import { BaseImage } from '../BaseImage';
import { GetUserListUserType, useCreateUpdateGroupMutation } from '@api';
import { setCurrentPersonDetailUsage, setViewProfile } from '@store';
import { useCustomNavigation } from '@navigation';
import { Images } from '@assets';
import { useCallContext } from '@context';

export type NursingCardProps = {
  containerStyle?: ViewStyles;
  fullCard?: boolean;
  data?: GetUserListUserType;
  screenName?:string
};

export const NurseCard = ({ containerStyle, fullCard = false, data,screenName }: NursingCardProps) => {
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const colors = useTheme(({ colors: _c }) => _c);
  const loginUserId = useMemo(() => loginDetails?.profile?._id, [loginDetails?.profile]);

  const profilePictureUrl = data?.profilePicture?.savedName;
  const fullName = data?.fullName;
  const email = data?.email;
  const mobile = data?.mobile;
  const navigation = useCustomNavigation();
  const dispatch = useAppDispatch();
  const { emitUserRegister } = useChatSocket();
  const styles = Styles();

  const { mutateAsync: createGroup } = useCreateUpdateGroupMutation();
  const {
      getCallPariticipantInfo
  } = useCallContext();

  const onPress = () => {
    dispatch(setViewProfile({ ...data, screenName: "physicians" }));
    // dispatch(setViewProfile(data));
    emitUserRegister();
    getCallPariticipantInfo(data?._id ?? '')
    dispatch(setCurrentPersonDetailUsage('users'));
  };

  const onPressChat = async () => {
    if (!data || !loginUserId) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navigationCb = (chatData: any) => {
      navigation.navigate('ChatScreen', {
        isEFax: false,
        isGroup: false,
        data: chatData,
      });
    };

    handleDirectChatCreation(data, loginUserId, createGroup, navigationCb);
  };

  const isNurse = useMemo(() => data?.role === 'nurse', [data]);

  return (
    <BaseTouchable
      style={[
        commonStyles.rowItemsCenter,
        styles.container,
        fullCard ? styles.fullCardContainer : {},
        containerStyle,
      ]}
      onPress={onPress}
    >
      {profilePictureUrl ? (
        <BaseImage
          containerStyle={styles.nurseProfilePic}
          withShimmer={true}
          source={{ uri: profilePictureUrl }}
          borderRadius={mScale(60)}
          defaultSource={
            checkIsLightTheme()
              ? Images.avatar_placeholder_light
              : Images.avatar_placeholder
          }
        />
      ) : (
        <SvgIconButton
          icon="AvatarPlaceholder"
          iconProps={styles.nurseProfilePic}
        />
      )}

      <View
        style={[
          commonStyles.flex,
          styles.detailsContainer,
          fullCard ? styles.fullCardDetailsContainer : {},
        ]}
      >
        <BaseText style={[styles.name, fullCard ? styles.fullCardName : {}]} numberOfLines={1}>
          {fullName ?? `N/A`}
        </BaseText>
        <BaseText style={[styles.email, fullCard ? styles.fullCardEmail : {}]} numberOfLines={1}>
          {email ?? `N/A`}
        </BaseText>
        {fullCard && (
          <BaseText
            style={[styles.metaText, fullCard ? styles.fullCardMetaText : {}]}
            numberOfLines={1}
          >
            {mobile ?? `N/A`}
          </BaseText>
        )}
      </View>

      <View style={styles.actionsContainer}>
        <SvgIconButton
          icon="Call"
          style={[commonStyles.centerCenter, styles.callIcon]}
          iconProps={{ color: colors.white }}
        />
        {fullCard && (
          <SvgIconButton
            icon="Message"
            style={[commonStyles.centerCenter, styles.callIcon, styles.messageIcon]}
            onPress={onPressChat}
            iconProps={{ color: colors.white }}
          />
        )}
      </View>
    </BaseTouchable>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      width: mScale(220),
      paddingVertical: mScale(14),
      paddingHorizontal: mScale(14),
      borderRadius: mScale(14),
      backgroundColor: colors.inputBackground,
      gap: mScale(10),
      marginRight: mScale(10),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    fullCardContainer: {
      width: '100%',
      marginRight: 0,
      marginBottom: mScale(12),
    },
    detailsContainer: {
      flex: 1,
      gap: mScale(4),
    },
    fullCardDetailsContainer: {
      gap: mScale(8),
    },
    name: {
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_16,
    },
    fullCardName: {
      fontSize: FontSizes.size_18,
    },
    email: {
      fontSize: FontSizes.size_12,
      color: colors.inputPlaceHolder,
    },
    fullCardEmail: {
      opacity: 0.9,
    },
    metaText: {
      fontSize: FontSizes.size_12,
      color: colors.text,
    },
    fullCardMetaText: {
      opacity: 0.8,
    },
    actionsContainer: {
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: mScale(8),
      marginLeft: mScale(8),
    },
    callIcon: {
      height: mScale(34),
      width: mScale(34),
      backgroundColor: colors.tint,
      borderRadius: mScale(17),
    },
    messageIcon: {
      backgroundColor: colors.messageIconBackground,
    },
    nurseProfilePic: {
      height: mScale(48),
      width: mScale(48),
      borderRadius: mScale(24),
      overflow: 'hidden',
      color: colors.avatarColor,
    },
  }));
