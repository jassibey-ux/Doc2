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
import { useCustomRoute, useCustomNavigation } from '@navigation';
import { devLogger, VerifyOtpSchema } from '@utils';
import { useAppDispatch, useAuthForm } from '@hooks';
import { setLoader, setLoginDetails } from '@store';
import { useVerifyOtpMutation, VerifyOtpPayload } from '@api';
import { showMessage } from 'react-native-flash-message';

export const VerifyOtpScreen = () => {
  const styles = useAuthModuleStyles();

  const navigation = useCustomNavigation();
  const { params } = useCustomRoute<'VerifyOtpScreen'>();
  const mobile = params?.mobile;

  const dispatch = useAppDispatch();
  const { mutateAsync: verifyOtp } = useVerifyOtpMutation();

  const { renderInput, handleSubmit } = useAuthForm({
    validationSchema: VerifyOtpSchema,
    initialValues: VerifyOtpSchema,
    onSubmit: async values => {
      try {
        devLogger(values);
        setLoader(true);
        const payload: VerifyOtpPayload = {
          mobile,
          otp: values?.otp,
        };
        const response = await verifyOtp(payload);
        setLoader(false);
        if (response?.status === 200 && response?.data && Object.keys(response?.data).length > 0) {
          showMessage({
            type: 'success',
            message: 'Verification successful',
            description: 'OTP verified successfully',
          });
          dispatch(setLoginDetails(response?.data));
          navigation.reset({
            routes: [
              {
                name: 'BottomTabNavigator',
                state: {
                  routes: [
                    {
                      name: 'DashBoard',
                    },
                  ],
                },
              },
            ],
          });
        } else {
          showMessage({
            type: 'danger',
            message: 'Verification failed !!',
            description: response?.data?.message,
          });
        }
        // setTimeout(() => {
        //   setLoader(false);
        //   const failure = values?.otp === '0000';
        //   showMessage({
        //     type: failure ? 'danger' : 'success',
        //     message: failure ? 'Verification Failed' : 'Success',
        //     description: failure
        //       ? 'Please enter correct OTP'
        //       : 'OTP verified successfully',
        //   });
        //   !failure && navigation.navigate('LoginScreen');
        // }, 1000);
      } catch (error) {
        devLogger('🚀 ~ LoginScreen ~ error:', error);
        setLoader(false);
      }
    },
  });

  const onPressLogin = () => {
    try {
      handleSubmit();
    } catch (error) {
      devLogger('🚀 ~ onPressLogin ~ error:', error);
    }
  };

  const otherWrapperProps: useWrapAuthScreenProps = [false, 'Verify OTP'];

  return useWrapAuthScreen(
    <KeyboardAwareWrapper>
      <View style={[commonStyles.flex, commonStyles.justifyEnd]}>
        <BaseImage
          source={Images.login_top_graphic}
          style={styles.loginGraphic}
          resizeMode="contain"
        />
        <View style={styles.contentContainer}>
          <BaseText style={styles.headingText}>Verify OTP</BaseText>
          {renderInput('otp', 'OTP', 'Enter your OTP', undefined, false, {
            keyboardType: 'number-pad',
          })}
          <BaseButton title="Verify OTP" style={styles.loginButton} onPress={onPressLogin} />
        </View>
      </View>
    </KeyboardAwareWrapper>,
    ...otherWrapperProps,
  );
};
