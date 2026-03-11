import {
  DashBoardHeader,
  ScreenWrapper,
  BottomTabScreenWrapperStyles,
  BaseTouchable,
  BaseImage,
  SvgIconButton,
  SvgIconButtonProps,
  BaseInput,
  BaseButton,
  SelectStatusPopup,
  KeyboardAwareWrapper,
  BaseText,
  BaseInputStyles,
  BaseInputProps,
} from '@components';
import { commonStyles, useAuthModuleStyles } from '@styles';
import React, { useMemo, useRef, useState } from 'react';
import { renderLeftComponent } from './AllNurseList';
import { Alert, Keyboard, TextInput, View } from 'react-native';
import {
  getSingleImage,
  useAppDispatch,
  useAppSelector,
  // useChatSocket,
  useMediaPicker,
  useTheme,
} from '@hooks';
import { Image } from 'react-native-image-crop-picker';
import {
  checkIsLightTheme,
  decryptData,
  extractFilename,
  getImageObjectFromUrl,
  mScale,
  scale,
  SignupSchema,
} from '@utils';
import {
  ChangePasswordPayload,
  UpdateUserPayload,
  useChangePasswordMutation,
  useGetUserInfoMutation,
  useLogoutMutation,
  UserProfileType,
  useUpdateUserMutation,
} from '@api';
import { FontSizes, FontWeights } from '@theme';
import { setLoader, setTheme, updateProfile } from '@store';
import { showMessage } from 'react-native-flash-message';
import { useFormik } from 'formik';
import { AxiosResponse } from 'axios';
import { useCustomNavigation } from '@navigation';
import { Images } from '@assets';

export const ProfilePictureHeight = mScale(101);

export type UpdatedProfileType = {
  profilePicture?: Partial<UpdateUserPayload['profileImage']>;
  status?: UserProfileType['status'];
};

enum InputFields {
  fullName = 'fullName',
  email = 'email',
  address = 'address',
  mobile = 'mobile',
  status = 'status',
  newPassword = 'newPassword',
}

type InputListItem = {
  title: string;
  icon?: SvgIconButtonProps['icon'];
  field: InputFields;
  disabled?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onRequestFail = (response: AxiosResponse<any, any>) => {
  showMessage({
    type: 'danger',
    message: 'Request failed',
    description: response?.data?.message ?? 'Something went wrong',
  });
  setLoader(false);
};

export const AccountSettingsScreen = () => {
  const profile = useAppSelector(state => state.auth.loginDetails?.profile);
  const loginDetails = useAppSelector(state => state.auth.loginDetails);

  const password = useAppSelector(state => state.auth.password);
  const { colors, theme } = useTheme(_t => _t);
  const dispatch = useAppDispatch();
  const navigation = useCustomNavigation();
  console.log('loginDetails<><><><', loginDetails);

  const [updatedProfile, setUpdatedProfile] = useState<UpdatedProfileType>({
    profilePicture: profile?.profilePicture?.savedName
      ? getImageObjectFromUrl(profile?.profilePicture?.savedName) ?? undefined
      : undefined,
    status: profile?.status ?? false,
  });

  // const { emitDisconnection } = useChatSocket();

  const { mutateAsync: updateUser } = useUpdateUserMutation();
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();
  const { mutateAsync: changePassword } = useChangePasswordMutation();

  const { mutateAsync: logout } = useLogoutMutation();

  const { values, handleSubmit, handleChange, handleBlur, errors, touched } = useFormik({
    initialValues: {
      profilePicture: profile?.profilePicture?.savedName
        ? { uri: profile?.profilePicture?.savedName }
        : undefined,
      fullName: profile?.fullName ?? '',
      email: profile?.email ?? '',
      mobile: profile?.mobile?.toString() ?? '',
      address: profile?.address ?? '',
      newPassword: password ?? '',
      status: profile?.status ?? false,
    },
    validationSchema: SignupSchema,
    validateOnChange: true,
    onSubmit: async val => {
      try {
        if (!val?.fullName || !val?.email || !val?.address || !val?.mobile || !val?.newPassword) {
          showMessage({
            type: 'danger',
            message: 'Action needed',
            description: 'Please fill up all details',
          });
          return;
        }
        Keyboard.dismiss();
        const addImage =
          profile?.profilePicture?.savedName && updatedProfile?.profilePicture?.uri
            ? getImageObjectFromUrl(profile?.profilePicture?.savedName)?.uri !==
              updatedProfile?.profilePicture?.uri
            : !!updatedProfile?.profilePicture?.uri;
        const payload: UpdateUserPayload = {
          fullName: val?.fullName,
          email: val?.email,
          address: val?.address,
          mobile: val?.mobile,
          geoLocation: 'true',
          role: profile?.role,
          ...(addImage
            ? {
                profileImage: {
                  uri: updatedProfile?.profilePicture?.uri ?? '',
                  name: updatedProfile?.profilePicture?.name ?? '',
                  type: updatedProfile?.profilePicture?.type ?? '',
                },
              }
            : {}),
          lat: profile?.location.coordinates?.[0]?.toString(),
          long: profile?.location.coordinates?.[1]?.toString(),
          userIds: JSON.stringify(profile?.userIds ?? []),
        };
        setLoader(true);
        const response = await updateUser(payload);
        if (response?.status !== 200) {
          onRequestFail(response);
          return;
        }
        if (values?.newPassword !== password) {
          const changePasswordPayload: ChangePasswordPayload = {
            oldPassword: password ?? '',
            newPassword: values?.newPassword,
          };
          const changePasswordResponse = await changePassword(changePasswordPayload);
          if (changePasswordResponse?.status !== 200) {
            onRequestFail(changePasswordResponse);
            return;
          }
        }
        const newProfile = await getUserInfo();
        console.log('getUserInfo<><><><>', newProfile);

        if (newProfile?.status !== 200) {
          onRequestFail(newProfile);
          return;
        }
        const decryptedProfile = await decryptData(newProfile?.data?.encryptDatauserdata);

        console.log('decryptedProfile<<><><>', decryptedProfile);

        dispatch(updateProfile(decryptedProfile));
        showMessage({
          type: 'success',
          message: 'Updated successfully',
          description: 'Your profile has been updated successfully',
        });
        setLoader(false);
        setTimeout(() => {
          navigation.goBack();
        }, 500);
      } catch (error) {
        setLoader(false);
      }
    },
  });

  const [overridePasswordVis, setOverridePasswordVis] =
    useState<BaseInputProps['overridePasswordVisibility']>('hide');

  const setProfileImage = (result?: Image) => {
    setUpdatedProfile(pre => ({
      ...pre,
      profilePicture: {
        uri: result?.path,
        name: result?.filename ?? extractFilename(result?.path) ?? '',
        type: result?.mime,
      },
    }));
  };

  const onSelectImage = (images: Image | Image[]) => {
    const singleImage = getSingleImage(images);
    setProfileImage(singleImage);
  };

  const { askOptions } = useMediaPicker(onSelectImage, 1 * 1024 * 1024);

  const bottomTabStyles = BottomTabScreenWrapperStyles();
  const authStyles = useAuthModuleStyles();
  const baseInputStyles = BaseInputStyles();
  const styles = AccountSettingStyles();

  const FullNameRef = useRef<TextInput>(null);
  const EmailRef = useRef<TextInput>(null);
  const LocationRef = useRef<TextInput>(null);
  const ContactRef = useRef<TextInput>(null);
  const PasswordRef = useRef<TextInput>(null);

  const [currentItem, setCurrentItem] = useState<InputFields | undefined>(undefined);
  const [showStatusPopup, setShowStatusPopup] = useState<boolean>(false);

  const InputList: InputListItem[] = [
    {
      title: 'Email ID',
      field: InputFields.email,
    },
    { title: 'Location', field: InputFields.address },
    { title: 'Contact', field: InputFields.mobile, disabled: true },
    { title: 'Status', icon: 'ChevronDownGreenBg', field: InputFields.status, disabled: true },
    {
      title: 'Password',
      icon: 'EyeCrossGreenBg',
      field: InputFields.newPassword,
    },
  ];

  const getRef = (field: InputFields) => {
    switch (field) {
      case InputFields.email:
        return EmailRef;
      case InputFields.address:
        return LocationRef;
      case InputFields.mobile:
        return ContactRef;
      case InputFields.newPassword:
        return PasswordRef;
      case InputFields.fullName:
        return FullNameRef;
      default:
        return undefined;
    }
  };

  const onPressRightIcon = (field: InputFields, ref?: typeof EmailRef) => {
    if (field !== InputFields.status) {
      setCurrentItem(field);
      setTimeout(() => {
        ref?.current?.focus();
      }, 200);
    } else {
      setShowStatusPopup(true);
    }
  };

  const onSubmitInput = (field: InputFields) => {
    setCurrentItem(undefined);
    setShowStatusPopup(false);
    setOverridePasswordVis('hide');
    if (field !== InputFields.status) {
      handleBlur(field);
    }
  };

  const renderInput = ({
    title,
    icon = 'PencilGreenBg',
    field,
    disabled = false,
  }: InputListItem) => {
    const itemRef = getRef(field);
    const rawValue = field === InputFields.status ? updatedProfile?.status : values?.[field];
    const value =
      field === InputFields.status ? (rawValue ? 'Online' : 'Offline') : rawValue?.toString();

    const onToggleVisibility = (mode: 'hide' | 'show') => {
      setOverridePasswordVis(pre => (pre === 'show' ? 'hide' : 'show'));
      if (mode !== 'hide') {
        itemRef && onPressRightIcon(field, itemRef);
      }
    };

    return (
      <BaseInput
        inputContainerStyle={[styles.inputContainer]}
        containerStyle={[styles.inputStyle]}
        titleStyle={[styles.titleStyle]}
        ref={itemRef}
        editable={!disabled && currentItem === field}
        key={field}
        isPassword={field === InputFields.newPassword}
        onChangeText={handleChange(field)}
        {...{ title, value }}
        {...(!disabled && field !== InputFields.newPassword
          ? { rightIcon: icon, onPressRightIcon: () => onPressRightIcon(field, itemRef) }
          : {})}
        onBlur={onSubmitInput.bind(this, field)}
        {...(field === InputFields.newPassword
          ? {
              showPasswordIcon: 'EyeCrossGreenBg',
              hidePasswordIcon: 'EyeCrossGreenBg',
              onToggleVisibility,
              overridePasswordVisibility: overridePasswordVis,
            }
          : {})}
        error={touched?.[field] ? errors[field] : ''}
      />
    );
  };

  const onFullNameEdit = () => {
    onPressRightIcon(InputFields.fullName, getRef(InputFields.fullName));
  };

  const onSelectStatus = (value: boolean) => {
    setUpdatedProfile(pre => ({ ...pre, status: value }));
    onSubmitInput(InputFields.status);
  };

  const SelectImageIconProps: SvgIconButtonProps['iconProps'] = useMemo(() => {
    return {
      height: styles.profileImageStyle.height - mScale(4),
      width: styles.profileImageStyle.width - mScale(4),
      color: colors.avatarColor,
    };
  }, [styles.profileImageStyle.height, styles.profileImageStyle.width, colors]);

  const onSubmit = () => {
    if (!updatedProfile.status) {
      Alert.alert(
        'Are you sure?',
        "You are setting your account status to 'Offline'. You will not be able to login after this change.",
        [
          {
            text: 'Yes, Proceed',
            onPress: () => handleSubmit(),
            style: 'destructive',
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
      );
    } else {
      handleSubmit();
    }
  };

  const confirmLogout = () => {
    const onLogout = () => {
      // emitDisconnection();
      const sessionId = loginDetails?.loginsessionid || ''; // Replace with the actual session ID
      const userId = loginDetails?.profile?._id || '';
      logout({ id: sessionId, userId });
    };

    Alert.alert('Are you sure?', 'You want to logout from the App', [
      {
        text: 'Yes, Logout',
        onPress: onLogout,
        style: 'destructive',
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  const themeToSwitch = useMemo(() => {
    return theme === 'dark' ? 'light' : 'dark';
  }, [theme]);

  const onThemeSwitch = () => {
    dispatch(setTheme(themeToSwitch));
  };

  const renderRightComponent = () => {
    return <SvgIconButton icon="Logout" />;
  };

  const isNurse = useMemo(() => profile?.role === 'nurse', [profile]);

  return (
    <>
      <ScreenWrapper
        style={[commonStyles.flex, bottomTabStyles.container]}
        enableBottomSafeArea={false}
        enableTopSafeArea={false}
      >
        <DashBoardHeader
          headerText="Account Settings"
          renderLeftComponent={renderLeftComponent}
          containerStyle={styles.headerContainer}
          renderRightComponent={renderRightComponent}
          onPressRightIcon={confirmLogout}
        />
        <KeyboardAwareWrapper contentContainerStyle={[styles.scrollContainerStyle]}>
          <View style={[commonStyles.itemCenter, styles.detailsContainer]}>
            <BaseTouchable onPress={askOptions}>
              {updatedProfile?.profilePicture?.uri ? (
                <BaseImage
                  source={{ uri: updatedProfile?.profilePicture?.uri }}
                  style={[styles.roundedImage]}
                  containerStyle={[
                    authStyles.uploadProfilePic,
                    styles.profileImageStyle,
                    styles.roundedImage,
                  ]}
                  withShimmer
                  borderRadius={ProfilePictureHeight}
                  defaultSource={
                    checkIsLightTheme()
                      ? Images.avatar_placeholder_light
                      : Images.avatar_placeholder
                  }
                />
              ) : (
                <SvgIconButton
                  icon="AvatarPlaceholder"
                  style={[
                    authStyles.uploadProfilePic,
                    styles.profileImageStyle,
                    styles.roundedImage,
                  ]}
                  iconProps={SelectImageIconProps}
                />
              )}
              <SvgIconButton icon="Camera" style={[styles.cameraIcon]} />
            </BaseTouchable>
            <View style={[commonStyles.rowItemCenterJustifyCenter, styles.fullNameContainer]}>
              <TextInput
                style={[styles.nameInput]}
                ref={getRef(InputFields.fullName)}
                value={values?.fullName}
                onChangeText={handleChange(InputFields.fullName)}
                onBlur={handleBlur(InputFields.fullName)}
                editable={currentItem === InputFields.fullName}
              />

              <SvgIconButton icon="Pencil" onPress={onFullNameEdit} />
            </View>
            {errors?.fullName && touched?.fullName && (
              <BaseText style={baseInputStyles.error}>{errors?.fullName}</BaseText>
            )}
            <View style={[styles.spacer]} />
            {InputList?.map(renderInput)}
          </View>
          <BaseButton title="Update" style={[styles.saveButton]} onPress={onSubmit} />
          <BaseTouchable style={styles.themeButton} onPress={onThemeSwitch}>
            <BaseText style={styles.themeSwitchText}>Switch to {themeToSwitch} Theme</BaseText>
          </BaseTouchable>
        </KeyboardAwareWrapper>
      </ScreenWrapper>
      <SelectStatusPopup
        visible={showStatusPopup}
        selectedValue={updatedProfile?.status}
        onSelect={onSelectStatus}
      />
    </>
  );
};

export const AccountSettingStyles = () =>
  useTheme(({ colors, theme }) => ({
    headerContainer: {
      marginVertical: mScale(16),
    },
    scrollContainerStyle: {
      paddingTop: ProfilePictureHeight / 2 + mScale(4),
    },
    detailsContainer: {
      backgroundColor: theme === 'light' ? colors.white : colors.inputBackground,
      paddingHorizontal: mScale(22),
      paddingBottom: mScale(22),
      borderRadius: mScale(20),
      borderWidth: theme === 'light' ? 1 : 0,
      borderColor: theme === 'light' ? colors.searchInputBackground : 'transparent',
      shadowColor: theme === 'light' ? colors.black : colors.primary,
      shadowOpacity: theme === 'light' ? 0.08 : 0.35,
      shadowOffset: {
        height: 6,
        width: 0,
      },
      shadowRadius: theme === 'light' ? 18 : 10,
      elevation: theme === 'light' ? 4 : 0,
    },
    roundedImage: {
      borderRadius: ProfilePictureHeight,
    },
    profileImageStyle: {
      height: ProfilePictureHeight,
      width: ProfilePictureHeight,
      borderWidth: 3.5,
      borderColor: theme === 'light' ? colors.white : colors.inputBackground,
      marginRight: mScale(0),
      marginTop: -(ProfilePictureHeight / 2),
      shadowColor: colors.black,
      shadowOpacity: theme === 'light' ? 0.12 : 0.45,
      shadowOffset: {
        height: 6,
        width: 0,
      },
      shadowRadius: 12,
      elevation: theme === 'light' ? 4 : 0,
    },
    cameraIcon: {
      position: 'absolute',
      bottom: mScale(6),
      right: mScale(4),
    },
    fullNameContainer: {
      gap: mScale(10),
      marginVertical: mScale(16),
      marginBottom: mScale(8),
    },
    nameInput: {
      fontWeight: FontWeights.bold,
      fontSize: FontSizes.size_20,
      color: colors.text,
      flexShrink: 1,
    },
    inputStyle: {
      marginVertical: mScale(6),
    },
    inputContainer: {
      backgroundColor: colors.searchInputBackground,
      paddingRight: scale(12),
      borderWidth: theme === 'light' ? 1 : 0,
      borderColor: theme === 'light' ? '#E2E8F0' : 'transparent',
    },
    titleStyle: {
      fontWeight: FontWeights.semibold,
    },
    saveButton: {
      alignSelf: 'center',
      marginTop: mScale(26),
      marginBottom: mScale(18),
      minWidth: mScale(170),
    },
    spacer: {
      height: mScale(10),
    },
    themeButton: {
      marginVertical: mScale(10),
      alignSelf: 'center',
      marginBottom: mScale(48),
    },
    themeSwitchText: {
      fontSize: FontSizes.size_16,
      color: colors.tint,
      fontWeight: FontWeights.bold,
    },
  }));
