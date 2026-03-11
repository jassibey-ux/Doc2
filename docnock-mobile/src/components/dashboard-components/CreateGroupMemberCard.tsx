import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BaseTouchable, SvgIconButton } from '../button';
import { commonStyles } from '@styles';
import { BaseText } from '../BaseText';
import { BaseImage } from '../BaseImage';
import { GetUserListUserType } from '@api';
import { avatarProps, CHAT_AVATAR_SIZE } from './ChatCard';
import { useTheme } from '@hooks';
import { FontSizes, FontWeights } from '@theme';
import { getProfileImageUrlFromImageName, mScale } from '@utils';

export type CreateGroupMemberCard = {
  selectionMode?: boolean;
  onSelectPress?: () => void;
  isGroup?: boolean;
  selected?: boolean;
  item: GetUserListUserType;
  isEFax?: boolean;
};

export const CreateGroupMemberCard = ({
  selectionMode = false,
  onSelectPress,
  isGroup = false,
  selected = false,
  item,
}: CreateGroupMemberCard) => {
  const styles = CreateGroupMemberCardStyles();
  const { colors } = useTheme(_t => _t);
  const [hasImageError, setHasImageError] = useState(false);
  const profileImageUri = useMemo(
    () => getProfileImageUrlFromImageName(item?.profilePicture?.savedName || ''),
    [item?.profilePicture?.savedName],
  );
  const shouldShowImage = !!profileImageUri && !hasImageError;

  return (
    <BaseTouchable
      activeOpacity={0.9}
      onPress={onSelectPress}
      style={styles.container}
    >
      {shouldShowImage ? (
        <BaseImage
          source={{ uri: profileImageUri }}
          borderRadius={CHAT_AVATAR_SIZE}
          containerStyle={styles.avatar}
          onError={setHasImageError.bind(this, true)}
        />
      ) : (
        <SvgIconButton
          icon={isGroup ? 'GroupPlaceholder' : 'AvatarPlaceholder'}
          iconProps={{
            ...avatarProps,
            color: isGroup ? colors.iconContrast : colors.avatarColor,
          }}
          style={styles.avatarPlaceholder}
        />
      )}
      <View style={styles.contentContainer}>
        <View style={styles.infoRow}>
          <View style={styles.detailContainer}>
            <BaseText style={styles.chatName} numberOfLines={1}>
              {item?.fullName ?? `N/A`}
            </BaseText>
            <BaseText style={styles.chatText} numberOfLines={1}>
              {item?.mobile ?? ``}
            </BaseText>
          </View>
          {selectionMode && (
            <SvgIconButton
              iconProps={{ color: selected ? colors.white : colors.secondary }}
              style={styles.selectIcon}
              icon={selected ? 'SelectFilledGreen' : 'SelectOutline'}
              onPress={onSelectPress}
            />
          )}
        </View>
        <View style={styles.divider} />
      </View>
    </BaseTouchable>
  );
};

const CreateGroupMemberCardStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: mScale(12),
      paddingVertical: mScale(12),
    },
    avatar: {
      height: CHAT_AVATAR_SIZE,
      width: CHAT_AVATAR_SIZE,
    },
    avatarPlaceholder: {
      borderRadius: mScale(999),
      backgroundColor: colors.searchInputBackground,
    },
    contentContainer: {
      flex: 1,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: mScale(10),
      minHeight: mScale(48),
    },
    detailContainer: {
      flex: 1,
      justifyContent: 'center',
      gap: mScale(2),
      paddingRight: mScale(4),
    },
    chatName: {
      fontSize: FontSizes.size_15,
      fontWeight: FontWeights.semibold,
      color: colors.text,
    },
    chatText: {
      fontSize: FontSizes.size_13,
      fontWeight: FontWeights.regular,
      color: colors.inputPlaceHolder,
    },
    selectIcon: {
      ...commonStyles.center,
      marginRight: mScale(2),
    },
    divider: {
      height: 0.5,
      backgroundColor: colors.searchInputBackground,
      marginTop: mScale(10),
    },
  }));
