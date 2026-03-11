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
import { devLogger, ForgotPasswordInitialValues, ForgotPasswordSchema } from '@utils';
import { ForgotPasswordPayload, useForgotPasswordMutation } from '@api';
import { setLoader } from '@store';
import { useCustomNavigation } from '@navigation';
import { showMessage } from 'react-native-flash-message';

export const ForgotPasswordScreen = () => {
  const styles = useAuthModuleStyles();

  const navigation = useCustomNavigation();

  const { mutateAsync: forgotPassword } = useForgotPasswordMutation();

  const { renderInput, handleSubmit } = useAuthForm({
    validationSchema: ForgotPasswordSchema,
    initialValues: ForgotPasswordInitialValues,
    onSubmit: async values => {
      try {
        devLogger(values);
        const payload: ForgotPasswordPayload = {
          email: values?.email,
        };
        setLoader(true);
        const response = await forgotPassword(payload);
        setLoader(false);
        if (response?.status === 200) {
          showMessage({
            type: 'success',
            message: 'Request sent successfully',
            description: 'Reset password link has been sent to your email',
          });
          navigation.navigate('LoginScreen');
        } else {
          showMessage({
            type: 'danger',
            message: 'Request failed !!',
            description: response?.data?.message,
          });
        }
      } catch (error) {
        setLoader(false);
        devLogger('🚀 ~ ForgotPasswordScreen ~ error:', error);
      }
    },
  });

  const onSubmitPress = () => {
    handleSubmit();
  };

  const otherWrapperProps: useWrapAuthScreenProps = [false, 'Forgot Password'];

  return useWrapAuthScreen(
    <KeyboardAwareWrapper>
      <View style={[commonStyles.flex, commonStyles.justifyEnd]}>
        <BaseImage
          source={Images.forgot_top_graphic}
          style={[styles.loginGraphic, styles.centerGraphic, styles.forgotPasswordGraphic]}
          resizeMode="contain"
        />
        <View style={styles.contentContainer}>
          <BaseText style={styles.headingText}>Forgot Password</BaseText>
          {renderInput('email', 'Email ID', 'Enter your Email ID', styles.forgotPasswordEmailInput)}
          <BaseButton title="Submit" style={[styles.loginButton]} onPress={onSubmitPress} />
        </View>
      </View>
    </KeyboardAwareWrapper>,
    ...otherWrapperProps,
  );
};
