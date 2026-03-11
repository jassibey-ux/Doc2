import React from 'react';
import { View } from 'react-native';
import { BaseTouchable, SvgIconButton } from '../button';
import { mScale, vscale } from '@utils';
import { useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { BaseText } from '../BaseText';
import { FontSizes, FontWeights } from '@theme';
import { ViewStyles } from '@types';
import { BaseImage } from '../BaseImage';
import { GetUserListUserType } from '@api';
import { Images } from '@assets';
import { useCustomNavigation } from '@navigation';

export type NursingHomeCardProps = {
  containerStyle?: ViewStyles;
  data?: GetUserListUserType;
  fullCard?: boolean;
};

export const NursingHomeCard = ({
  containerStyle,
  data,
  fullCard = false,
}: NursingHomeCardProps) => {
  const navigation = useCustomNavigation();

  const profilePictureUrl = data?.profilePicture?.savedName;
  const fullName = data?.fullName;
  const address = data?.address;
  const mobile = data?.mobile;

  const styles = Styles();

  const onPress = () => {
    navigation.navigate(
      'AllNurseList',
      data
        ? {
            nursingHomeData: data,
          }
        : {},
    );
  };

  return (
    <BaseTouchable
      onPress={onPress}
      style={[
        commonStyles.rowItemsCenter,
        [styles.container, fullCard ? styles.fullCardContainer : {}],
        containerStyle,
      ]}
    >
      {profilePictureUrl ? (
        <BaseImage
          fallbackContainerStyle={[commonStyles.centerCenter]}
          containerStyle={[styles.icon]}
          withShimmer={true}
          source={{ uri: profilePictureUrl }}
          defaultSource={Images.nursing_home_placeholder}
          style={[commonStyles.flex]}
          fallbackImageStyle={[styles.fallbackImageStyle]}
          borderRadius={mScale(86)}
        />
      ) : (
        <SvgIconButton
          icon="NursingHomePlaceHolder"
          style={[commonStyles.centerCenter, styles.icon]}
        />
      )}
      <View style={[commonStyles.flex, styles.detailsContainer]}>
        <BaseText style={styles.name} numberOfLines={3}>
          {fullName ?? `-`}
        </BaseText>
        <BaseText style={styles.address} numberOfLines={3}>
          {address ?? `-`}
        </BaseText>
        <BaseText style={styles.phone} numberOfLines={2}>
          {mobile ?? `-`}
        </BaseText>
      </View>
    </BaseTouchable>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      width: mScale(270),
      padding: mScale(16),
      borderRadius: mScale(14),
      backgroundColor: colors.inputBackground,
      gap: mScale(14),
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
      marginBottom: vscale(10),
    },
    icon: {
      height: mScale(70),
      width: mScale(70),
      borderRadius: mScale(35),
      backgroundColor: colors.nursingHomeIconBackground,
      overflow: 'hidden',
    },
    detailsContainer: {
      flex: 1,
      gap: mScale(4),
    },
    name: {
      fontWeight: FontWeights.bold,
      fontSize: FontSizes.size_14,
      letterSpacing: 0.1,
    },
    address: {
      fontSize: FontSizes.size_11,
      color: colors.text,
      opacity: 0.5,
      lineHeight: mScale(15),
    },
    phone: {
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_12,
      color: colors.tint,
      marginTop: mScale(2),
    },
    fallbackImageStyle: {
      width: 42,
      height: 42,
    },
  }));
