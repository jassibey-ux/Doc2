import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { commonStyles } from '@styles';
import { checkIsLightTheme, mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { useAppSelector, useTheme } from '@hooks';
import { BaseTouchable, SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import { BaseImage } from '../BaseImage';
import { ViewStyles } from '@types';
import { useCustomNavigation } from '@navigation';
import { Images } from '@assets';

export type DashBoardHeaderProps = {
  renderCenterComponent?: () => JSX.Element;
  renderLeftComponent?: () => JSX.Element;
  renderRightComponent?: () => JSX.Element;
  headerText?: string;
  disableRightComponent?: boolean;
  containerStyle?: ViewStyles;
  onPressRightIcon?: () => void;
};

export const DashBoardHeader = ({
  renderCenterComponent,
  renderLeftComponent,
  renderRightComponent,
  headerText,
  disableRightComponent = false,
  containerStyle,
  onPressRightIcon,
}: DashBoardHeaderProps) => {
  const styles = Styles();
    const userProfile = useAppSelector(state => state?.auth?.loginDetails)?.profile;
    const notificationCount = useAppSelector(state => state?.auth).notifcationUnreadCont;
    const { colors } = useTheme(theme => theme);

    const navigation = useCustomNavigation(); 

    const onProfilePress = () => {
      navigation.navigate('AccountSettingsScreen');
    };

    const isNurse = useMemo(() => userProfile?.role === 'nurse', [userProfile]);
    // const authToken = store?.getState()?.auth.loginDetails?.token;

    const [count,setCount] = React.useState<number>(0);

    useEffect(() => {
          setCount(notificationCount ?? 0);
    },[notificationCount])

  

  return (
    <View style={[commonStyles.rowItemCenterJustifyCenter, styles.container, containerStyle]}>
      <View style={[styles.svgIcon, styles.leftIcon]}>
        {renderLeftComponent ? (
          renderLeftComponent()
        ) : userProfile?.profilePicture?.savedName ? (
          <BaseTouchable onPress={onProfilePress}>
            <BaseImage
              source={{
                uri: userProfile?.profilePicture?.savedName,
              }}
              containerStyle={styles.avatar}
              borderRadius={mScale(48)}
              defaultSource={
                checkIsLightTheme()
                  ? Images.avatar_placeholder_light
                  : Images.avatar_placeholder
              }
            />
          </BaseTouchable>
        ) : (
          <SvgIconButton
            icon="AvatarPlaceholder"
            iconProps={{ color: colors.avatarColor }}
            onPress={onProfilePress}
          />
        )}
      </View>
      {renderCenterComponent ? (
        renderCenterComponent()
      ) : headerText ? (
        <BaseText style={styles.centerText} numberOfLines={2}>
          {headerText ?? ''}
        </BaseText>
      ) : (
        <></>
      )}
      {!disableRightComponent && (
        <BaseTouchable
          style={[styles.svgIcon, styles.rightIcon]}
          onPress={onPressRightIcon ?? (() => navigation.navigate('NotificationScreen'))}
        >
          {renderRightComponent ? (
            renderRightComponent()
          ) : (
            <SvgIconButton icon="NotificationYellow" style={[styles.svgIcon, styles.rightIcon]} />
              
          )}
          {count > 0 && !renderRightComponent && (
            <View style={styles.countCounter}>
              <BaseText style={styles.countStyle}>{count}</BaseText>
            </View>

          )}
         
        </BaseTouchable>
      )}
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      height: mScale(52),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: mScale(14),
      marginBottom: mScale(12),
      paddingHorizontal: mScale(4),
    },
    svgIcon: {
      position: 'absolute',
    },
    avatar: {
      height: mScale(44),
      width: mScale(44),
      overflow: 'hidden',
      borderRadius: mScale(44),
      borderWidth: 2,
      borderColor: colors.tint,
    },
    leftIcon: {
      left: 0,
      zIndex: 10,
    },
    rightIcon: {
      right: 0,
      backgroundColor: colors.searchInputBackground,
      height: mScale(42),
      width: mScale(42),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: mScale(21),
    },
    centerText: {
      alignSelf: 'center',
      flex: 1,
      maxWidth: '64%',
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_20,
      textAlign: 'center',
      color: colors.text,
    },
    countStyle: {
      color: colors.tint,
      fontSize: FontSizes.size_10,
      fontWeight: FontWeights.bold,
    },
    countCounter: {
      backgroundColor: colors.white,
      position: 'absolute',
      top: -2,
      right: -2,
      minHeight: 16,
      minWidth: 16,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
  }));
