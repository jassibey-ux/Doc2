import React from 'react';
import { View } from 'react-native';
import { Images } from '@assets';
import {
  BaseButton,
  BaseImage,
  BaseText,
  KeyboardAwareWrapper,
  useWrapAuthScreen,
  useWrapAuthScreenProps,
} from '@components';
import { useAuthModuleStyles, commonStyles } from '@styles';
import { useAuthForm } from '@hooks';
import { devLogger, ResetPasswordInitialValues, ResetPasswordSchema } from '@utils';
import { setLoader } from '@store';
import { useCustomRoute, useCustomNavigation } from '@navigation';
import { showMessage } from 'react-native-flash-message';
import { useResetPasswordMutation } from '@api';

export const ResetPasswordScreen = () => {
  const styles = useAuthModuleStyles();

  const navigation = useCustomNavigation();
  const { params } = useCustomRoute<'ResetPasswordScreen'>();
  const token = params?.token;

  const { mutateAsync } = useResetPasswordMutation();

  const { renderInput, handleSubmit } = useAuthForm({
    validationSchema: ResetPasswordSchema,
    initialValues: ResetPasswordInitialValues,
    onSubmit: async values => {
      devLogger(values);
      setLoader(true);
      const response = await mutateAsync({
        token: token ?? '',
        newPassword: values?.password,
      });
      setLoader(false);
      if (response?.status === 200 && response?.data && Object.keys(response?.data).length) {
        showMessage({
          type: 'success',
          message: 'Password changed successfully',
          description: 'Your password has been changed successfully',
        });
        navigation.reset({
          index: 0,
          routes: [{ name: 'LoginScreen' }],
        });
      } else {
        showMessage({
          type: 'danger',
          message: 'Request failed !!',
          description: response?.data?.message,
        });
      }
      // setTimeout(() => {
      //   setLoader(false);
      //   showMessage({
      //     type: 'success',
      //     message: 'Success',
      //     description: 'Password reset successfully',
      //   });
      //   navigation.reset({
      //     index: 0,
      //     routes: [{ name: 'LoginScreen' }],
      //   });
      // }, 1000);
    },
  });

  const resetPassword = () => {
    handleSubmit();
  };

  const otherWrapperProps: useWrapAuthScreenProps = [false, 'Reset Password'];

  return useWrapAuthScreen(
    <KeyboardAwareWrapper>
      <View style={[commonStyles.flex, commonStyles.justifyEnd]}>
        <BaseImage
          source={Images.reset_top_graphic}
          style={[styles.loginGraphic, styles.centerGraphic, styles.resetPasswordGraphic]}
          resizeMode="contain"
        />
        <View style={styles.contentContainer}>
          <BaseText style={[styles.headingText, styles.resetPasswordHeadingText]}>
            Reset Password
          </BaseText>
          {renderInput('password', 'New Password', 'Enter your Password', styles.emailInput, true)}
          {renderInput(
            'confirmPassword',
            'Confirm Password',
            'Enter your Password',
            styles.resetPasswordEmailInput,
            true,
          )}
          <BaseButton title="Submit" style={[styles.loginButton]} onPress={resetPassword} />
        </View>
      </View>
    </KeyboardAwareWrapper>,
    ...otherWrapperProps,
  );
};
