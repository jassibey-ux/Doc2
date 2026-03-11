import React from 'react';
import { Modal, ModalProps, Pressable, StyleSheet, View, ScrollView } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { getProfileImageUrlFromImageName, mScale } from '@utils';
import { commonStyles } from '@styles';
import { useTheme } from '@hooks';
import { BaseButton, BaseTouchable, SvgIconButton, SvgIconButtonProps } from './button';
import { BaseImage } from './BaseImage';
import { PersonDetailPopupStyles } from './PersonDetailPopup';
import { SelectStatusPopupStyles } from './SelectStatusPopup';
import { GroupDataType, useCustomNavigation } from '@navigation';
import { BaseText } from './BaseText';
import { AccountSettingStyles } from '@screens';
import { FontSizes, FontWeights } from '@theme';

export type GroupDetailPopupProps = {
  onCancel?: () => void;
  groupData?: GroupDataType;
  onUpdateGroupDetails?: () => void;
  onAddUserInGroup?: () => void;
  onAudioCall?: () => void;
  onVideoCall?: () => void;
} & ModalProps;

export const GROUP_AVATAR_SIZE = mScale(120);

const GroupAvatarProps: SvgIconButtonProps['iconProps'] = {
  height: GROUP_AVATAR_SIZE,
  width: GROUP_AVATAR_SIZE,
};

// Action button component for Audio/Video/Add/Search
const ActionButton = ({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  colors: any;
}) => {
  const styles = ActionButtonStyles();
  return (
    <BaseTouchable style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionIconContainer}>
        <SvgIconButton
          icon={icon as any}
          iconProps={{ color: colors.tint, width: mScale(22), height: mScale(22) }}
        />
      </View>
      <BaseText style={styles.actionLabel}>{label}</BaseText>
    </BaseTouchable>
  );
};

const ActionButtonStyles = () =>
  useTheme(({ colors }) => ({
    actionButton: {
      alignItems: 'center',
      flex: 1,
    },
    actionIconContainer: {
      backgroundColor: colors.searchInputBackground,
      width: mScale(50),
      height: mScale(50),
      borderRadius: mScale(12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: mScale(6),
    },
    actionLabel: {
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
      color: colors.tint,
    },
  }));

export const GroupDetailPopup = ({
  groupData,
  onCancel,
  onUpdateGroupDetails,
  onAddUserInGroup,
  onAudioCall,
  onVideoCall,
  ...props
}: GroupDetailPopupProps) => {
  const navigation = useCustomNavigation();
  const { colors } = useTheme(theme => theme);

  const styles = Styles();
  const personDetailPopupStyles = PersonDetailPopupStyles();
  const selectStatusPopupStyles = SelectStatusPopupStyles();

  const groupImage = groupData?.image ? getProfileImageUrlFromImageName(groupData?.image) : '';
  const memberCount =
    groupData && groupData?.userIds && groupData?.userIds?.length > 0
      ? groupData?.userIds?.length - 1
      : 0;

  const onPressGroupIcon = () => {
    onCancel?.();
    navigation.navigate('ImagesPreviewScreen', {
      images: [{ path: groupImage }],
    });
  };

  return (
    <Modal transparent onRequestClose={onCancel} {...props}>
      <Pressable
        onPress={onCancel}
        style={[StyleSheet.absoluteFill, personDetailPopupStyles.backgroundContainer]}
      >
        <BlurView blurType="dark" blurAmount={100} style={[commonStyles.flex]} />
      </Pressable>
      <View style={personDetailPopupStyles.foregroundContainer}>
        <View style={[personDetailPopupStyles.container, styles.container]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Avatar */}
            <BaseTouchable onPress={onPressGroupIcon} style={styles.avatarContainer}>
              {groupImage ? (
                <BaseImage
                  containerStyle={[styles.personAvatarContainer]}
                  withShimmer={true}
                  source={{ uri: groupImage }}
                  borderRadius={GROUP_AVATAR_SIZE}
                />
              ) : (
                <SvgIconButton
                  icon="GroupPlaceholder"
                  style={[commonStyles.centerCenter, styles.personAvatarContainer]}
                  iconProps={GroupAvatarProps}
                />
              )}
            </BaseTouchable>

            {/* Group Name */}
            <BaseText style={styles.groupName}>{groupData?.title ?? 'Group Name'}</BaseText>

            {/* Member Count */}
            <BaseText style={styles.memberInfo}>
              Group · <BaseText style={styles.memberCount}>{memberCount} members</BaseText>
            </BaseText>

            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              <ActionButton icon="Phone" label="Audio" onPress={onAudioCall} colors={colors} />
              <ActionButton icon="Video" label="Video" onPress={onVideoCall} colors={colors} />
              <ActionButton
                icon="PlusRoundGreenBg"
                label="Add"
                onPress={onAddUserInGroup}
                colors={colors}
              />
              <ActionButton icon="Search" label="Search" colors={colors} />
            </View>

            {/* Edit Group Link */}
            <BaseTouchable style={styles.editLink} onPress={onUpdateGroupDetails}>
              <BaseText style={styles.editLinkText}>Edit group info</BaseText>
            </BaseTouchable>

            {/* Close Button */}
            <BaseButton
              title="Close"
              style={[commonStyles.center, selectStatusPopupStyles.buttonOutline, styles.closeBtn]}
              onPress={onCancel}
              fixWidth
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      paddingHorizontal: mScale(24),
      paddingBottom: mScale(24),
      paddingTop: mScale(32),
      maxHeight: '80%',
    },
    avatarContainer: {
      alignSelf: 'center',
      marginBottom: mScale(16),
    },
    personAvatarContainer: {
      height: GROUP_AVATAR_SIZE,
      width: GROUP_AVATAR_SIZE,
      backgroundColor: colors.inputBackground,
      borderRadius: GROUP_AVATAR_SIZE,
    },
    groupName: {
      fontSize: FontSizes.size_22,
      fontWeight: FontWeights.bold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: mScale(4),
    },
    memberInfo: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.regular,
      color: colors.inputPlaceHolder,
      textAlign: 'center',
      marginBottom: mScale(20),
    },
    memberCount: {
      color: colors.tint,
      fontWeight: FontWeights.medium,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: mScale(24),
      paddingHorizontal: mScale(8),
    },
    editLink: {
      alignSelf: 'center',
      marginBottom: mScale(20),
    },
    editLinkText: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.medium,
      color: colors.tint,
    },
    closeBtn: {
      marginTop: mScale(8),
    },
  }));
