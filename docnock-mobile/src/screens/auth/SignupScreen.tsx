import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Images } from '@assets';
import {
  BaseButton,
  BaseImage,
  BaseInputProps,
  BaseText,
  BaseTouchable,
  KeyboardAwareWrapper,
  SvgIconButton,
  useWrapAuthScreen,
  useWrapAuthScreenProps,
} from '@components';
import { useAuthModuleStyles, commonStyles } from '@styles';
import { useCustomNavigation, useCustomRoute } from '@navigation';
import { useAuthForm, useMediaPicker } from '@hooks';
import { decryptData, devLogger, mScale, SignupInitialValues, SignupSchema } from '@utils';
import { useGetUserByIdMutation, useResetPasswordMutation, ResetPasswordPayload } from '@api';
import { setLoader } from '@store';
import { showMessage } from 'react-native-flash-message';

export const SignupScreen = () => {
  const styles = useAuthModuleStyles();
  const navigation = useCustomNavigation();
  const { params } = useCustomRoute<'SignupScreen'>();
  const token = params?.token;

  const { mutateAsync: resetPassword } = useResetPasswordMutation();
  const { mutateAsync: getUserById } = useGetUserByIdMutation();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const { askOptions } = useMediaPicker(setSelectedImage);

  const { renderInput, handleSubmit, setValues } = useAuthForm({
    validationSchema: SignupSchema,
    initialValues: SignupInitialValues,
    validateOnChange: true,
    onSubmit: async values => {
      try {
        devLogger(values);
        if (!values.newPassword || !token) {
          return;
        }
        setLoader(true);
        // const coords = {
        //   latitude: fetchedCoords?.lat,
        //   longitude: fetchedCoords?.long,
        // };
        // TODO: get coords from getUserById response
        const payload: ResetPasswordPayload = {
          token,
          newPassword: values.newPassword,
        };
        const response = await resetPassword(payload);
        setLoader(false);
        if (response?.data?.success) {
          showMessage({
            type: 'success',
            message: 'Setup successful',
            description: 'User updated successfully',
          });
          navigation.reset({
            routes: [
              {
                name: 'LoginScreen',
              },
            ],
          });
        } else {
          showMessage({
            type: 'danger',
            message: 'Setup failed !!',
            description: response?.data?.message,
          });
        }
      } catch (error) {
        devLogger('🚀 ~ SignupScreen ~ error:', error);
        setLoader(false);
      }
    },
  });

  const onBackPress = () => {
    navigation.goBack();
  };

  const onPressContinue = () => {
    try {
      handleSubmit();
    } catch (error) {
      devLogger('🚀 ~ onPressContinue ~ error:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoader(true);
        const response = await getUserById({ token });
        if (response?.data?.success && response?.data?.encryptDatauserdata) {
          const profile = await decryptData(response?.data?.encryptDatauserdata);
          setValues({
            // profileImage: profile?.profilePicture?.savedName,
            fullName: profile?.fullName,
            email: profile?.email,
            address: profile?.address,
            mobile: profile?.mobile?.toString(),
          });
          if (profile?.profilePicture?.savedName) {
            setSelectedImage({ path: profile?.profilePicture?.savedName });
          }
        }
        // TODO: decrypt data and set into formik
        setLoader(false);
      } catch (error) {
        devLogger('🚀 ~ init ~ error:', error);
        setLoader(false);
      }
    };

    if (token) {
      init();
    }
  }, [token, getUserById, setValues]);

  const otherWrapperProps: useWrapAuthScreenProps = [true];

  const disabledInputProps: BaseInputProps = { editable: false };

  return useWrapAuthScreen(
    <>
      <View style={[commonStyles.row, styles.profilePhotoContainer]}>
        <View style={[commonStyles.flex]}>
          <View style={[commonStyles.rowItemsCenter]}>
            <SvgIconButton icon="ChevronLeft" onPress={onBackPress} />
            <BaseText style={[styles.headingText, styles.signupHeadingText]}>
              Set up your profile
            </BaseText>
          </View>
          <View style={[commonStyles.rowItemsCenter, commonStyles.flex]}>
            {selectedImage?.path ? (
              <BaseTouchable disabled onPress={askOptions}>
                <BaseImage
                  source={{ uri: selectedImage?.path }}
                  containerStyle={[styles.uploadProfilePic, styles.roundedImage]}
                  withShimmer
                  borderRadius={mScale(80)}
                />
              </BaseTouchable>
            ) : (
              <SvgIconButton icon="UploadProfilePic" style={styles.uploadProfilePic} />
            )}
            <BaseText>Profile Picture</BaseText>
          </View>
        </View>
        <BaseImage
          source={Images.signup_top_graphic}
          containerStyle={styles.signupTopGraphic}
          resizeMode="contain"
        />
      </View>
      <KeyboardAwareWrapper>
        <View style={[commonStyles.flex, styles.contentContainer]}>
          <BaseText style={styles.headingText}>Personal Details</BaseText>
          {renderInput('fullName', 'Name', 'Enter your Name', undefined, false, disabledInputProps)}
          {renderInput('email', 'Email ID', 'Enter your Email ID', undefined, false, {
            keyboardType: 'email-address',
            ...disabledInputProps,
          })}
          {renderInput(
            'address',
            'Location',
            'Enter your Location',
            undefined,
            false,
            disabledInputProps,
          )}
          {renderInput('mobile', 'Contact Number', 'Enter your Contact No.', undefined, false, {
            keyboardType: 'phone-pad',
            ...disabledInputProps,
          })}
          {renderInput('newPassword', 'Create Password', 'Enter Password', undefined, true)}
          <BaseButton title="Continue" style={[styles.loginButton]} onPress={onPressContinue} />
        </View>
      </KeyboardAwareWrapper>
    </>,
    ...otherWrapperProps,
  );
};
