import React, { useState } from 'react';
import { Modal, ModalProps, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { getProfileImageUrlFromImageName, mScale } from '@utils';
import { commonStyles } from '@styles';
import { getSingleImage, useMediaPicker, useTheme } from '@hooks';
import { BaseButton, BaseTouchable, SvgIconButton } from './button';
import { BaseImage } from './BaseImage';
import { BaseInput } from './input';
import { PersonDetailPopupStyles } from './PersonDetailPopup';
import { SelectStatusPopupStyles } from './SelectStatusPopup';
import { Image } from 'react-native-image-crop-picker';
import { GroupDataType } from '@navigation';
import { FontSizes } from '@theme';

export type NewGroupResponseType = {
  groupName: string;
  groupImage?: Partial<Image>;
} & GroupDataType;

export type NewGroupDetailPopupProps = {
  onChangeText?: (text: string) => void;
  onSubmitEditing?: (groupData: NewGroupResponseType) => void;
  onCancel?: () => void;
  update?: boolean;
  groupData?: GroupDataType;
} & ModalProps;

export const GROUP_NAME_ERROR = 'Please enter a group name';

export const NewGroupDetailPopup = ({
  onChangeText,
  onSubmitEditing,
  onCancel,
  update = false,
  groupData,
  ...props
}: NewGroupDetailPopupProps) => {
  const styles = Styles();
  const personDetailPopupStyles = PersonDetailPopupStyles();
  const selectStatusPopupStyles = SelectStatusPopupStyles();
  const colors = useTheme(({ colors: _c }) => _c);

  const [groupName, setGroupName] = useState<string>(update ? groupData?.title ?? '' : '');
  const [selectedImage, setSelectedImage] = useState<Partial<Image> | undefined>(
    update
      ? groupData?.image
        ? { path: getProfileImageUrlFromImageName(groupData?.image) }
        : undefined
      : undefined,
  );
  const [error, setError] = useState<string>();

  const onSelectImage = (image: Image | Image[]) => {
    const singleImage = getSingleImage(image);
    setSelectedImage(singleImage);
  };

  const { askOptions } = useMediaPicker(onSelectImage);

  const onChangeTextHandler = (text: string) => {
    setGroupName(text);
    onChangeText?.(text);
    setError(text ? '' : GROUP_NAME_ERROR);
  };

  const onSubmit = () => {
    if (!groupName) {
      setError(GROUP_NAME_ERROR);
      return;
    }
    onSubmitEditing?.({ groupName, groupImage: selectedImage });
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
          <BaseTouchable onPress={askOptions}>
            {selectedImage?.path ? (
              <View style={[commonStyles.center]}>
                <BaseImage
                  containerStyle={[styles.personAvatarContainer]}
                  withShimmer={true}
                  source={{ uri: selectedImage?.path }}
                  borderRadius={mScale(104)}
                />
                <SvgIconButton icon="Camera" style={[styles.absoluteCameraIcon]} />
              </View>
            ) : (
              <SvgIconButton
                icon="SelectGroupImage"
                iconProps={{ fill: colors.searchInputBackground }}
                style={[commonStyles.centerCenter, styles.personAvatarContainer]}
              />
            )}
          </BaseTouchable>

          <BaseInput
            title="Group Name"
            inputContainerStyle={styles.inputContainer}
            placeholder="Enter Group Name"
            onChangeText={onChangeTextHandler}
            value={groupName}
            error={error}
          />

          <View style={[commonStyles.rowItemCenterJustifyCenter, styles.buttonContainer]}>
            <BaseButton
              title="Cancel"
              style={[styles.buttonStyle, selectStatusPopupStyles.buttonOutline]}
              titleStyle={styles.buttonTextStyle}
              onPress={onCancel}
            />
            <BaseButton
              title={update ? 'Update Group' : 'Create Group'}
              style={styles.buttonStyle}
              titleStyle={styles.buttonTextStyle}
              onPress={onSubmit}
            />
          </View>
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
    },
    personAvatar: {
      height: 101,
      width: 101,
    },
    personAvatarContainer: {
      height: mScale(104),
      width: mScale(104),
      backgroundColor: colors.inputBackground,
      borderRadius: mScale(104),
      alignSelf: 'center',
      marginTop: -mScale(51),
      marginBottom: mScale(16),
    },
    buttonContainer: {
      marginTop: mScale(24),
      justifyContent: 'space-between',
      gap: mScale(16),
    },
    buttonStyle: {
      flex: 1,
    },
    inputContainer: {
      backgroundColor: colors.searchInputBackground,
    },
    buttonTextStyle: {
      fontSize: FontSizes.size_14,
      color: colors.secondary,
    },
    absoluteCameraIcon: {
      position: 'absolute',
      bottom: mScale(16),
      right: mScale(6),
    },
  }));
