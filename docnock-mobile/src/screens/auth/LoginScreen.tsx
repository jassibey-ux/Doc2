import { LoginPayload, useLoginMutation } from '@api';
import { Images } from '@assets';
import {
  BaseButton,
  BaseImage,
  BaseText,
  KeyboardAwareWrapper,
  useWrapAuthScreen,
  useWrapAuthScreenProps,
} from '@components';
import { useAppDispatch, useAppSelector, useAuthForm, useLocation } from '@hooks';
import { useCustomNavigation } from '@navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLoader, setLoginDetails, setPassword } from '@store';
import { commonStyles, useAuthModuleStyles } from '@styles';
import { authenticateWithBiometrics, checkBiometricsAvailability, devLogger, LoginInitialValues, LoginSchema, mScale, STORAGE_KEYS } from '@utils';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { GeoPosition } from 'react-native-geolocation-service';
import { useSendFcmToken} from '@api';

export const LoginScreen = () => {
  const styles = useAuthModuleStyles();
  const navigation = useCustomNavigation();
  const dispatch = useAppDispatch();
  const auth = useAppSelector(state => state.auth);
  const { mutateAsync: login } = useLoginMutation();
  const { getCurrentLocation } = useLocation();

  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState('Touch ID');
  const { mutateAsync: saveFcmToken } = useSendFcmToken();
  const { deviceToken, fcmToken } = useAppSelector(state => state.auth);



  useEffect(() => {
    checkBiometricStatus();
    checkStoredCredentials();
  }, []);

  const checkBiometricStatus = async () => {
    try {
      const { isBiometricsAvailable: _isBiometricsAvailable, biometryTypeName } =
        await checkBiometricsAvailability();
      setIsBiometricsAvailable(_isBiometricsAvailable);
      if (_isBiometricsAvailable) {
        setBiometryType(biometryTypeName);
      }
    } catch (error) {
      devLogger('Error checking biometrics availability:', error);
    }
  };

  const checkStoredCredentials = async () => {
    try {
      const storedCredentials = await AsyncStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      setHasStoredCredentials(!!storedCredentials);
    } catch (error) {
      devLogger('Error checking stored credentials:', error);
    }
  };

  const storeCredentials = async (mobile: string, password: string) => {
    try {
      const credentials = JSON.stringify({ mobile, password });
      await AsyncStorage.setItem(STORAGE_KEYS.CREDENTIALS, credentials);
      setHasStoredCredentials(true);
    } catch (error) {
      devLogger('Error storing credentials:', error);
    }
  };

  const performLogin = async (mobile: string, password: string, isBiometricLogin = false) => {
    try {
      setLoader(true);

      let coords: GeoPosition['coords'] | undefined;
      try {
        coords = await getCurrentLocation(false);
      } catch (error) {
        devLogger(`🚀 ~ performLogin ~ error getCurrentLocation:`, error);
      }

      const userCoords =
        !!coords && coords?.latitude && coords?.longitude
          ? {
              lat: coords.latitude,
              long: coords.longitude,
            }
          : {};

      const loginPayload: LoginPayload = {
        mobile,
        password,
        ...userCoords,
      };

      // const fcmTokenPayload : fcmTokenPayload = {
      //   fcm_token: auth?.token
      // }
      console.log(auth, 'loginPayloadauth<><><><');

      const response = await login(loginPayload);
      setLoader(false);

      if (response?.status === 200 && response?.data && Object.keys(response?.data).length) {
        if (!isBiometricLogin) {
          await storeCredentials(mobile, password);
        }

        console.log("response<><><",response)
       
//         const saveFcmTokenresponse = await saveFcmToken(fcmTokenPayload);
// console.log("saveFcmTokenresponse<><><",saveFcmTokenresponse)

// return
        const isVerified = response?.data?.verify;
        showMessage({
          type: 'success',
          message: 'Login successful',
          description: isVerified
            ? `User logged in successfully${isBiometricLogin ? ' with biometrics' : ''}`
            : 'OTP has been sent to your email address',
        });

        dispatch(setPassword(password));

        if (isVerified) {

          dispatch(setLoginDetails(response?.data));
          navigation.reset({
            routes: [
              {
                name: 'BottomTabNavigator',
              },
            ],
          });
        } else {
          navigation.navigate('VerifyOtpScreen', {
            mobile,
          });
        }

        return { success: true };
      } else {
        showMessage({
          type: 'danger',
          message: 'Login failed',
          description: response?.data?.message || 'Please try again',
        });

        return { success: false, error: response?.data?.message };
      }
    } catch (error) {
      devLogger('🚀 ~ performLogin ~ error:', error);
      setLoader(false);

      showMessage({
        type: 'danger',
        message: 'Login error',
        description: 'An error occurred during login',
      });

      return { success: false, error };
    }
  };

  const handleBiometricLogin = async () => {
    try {
      if (!isBiometricsAvailable) {
        showMessage({
          type: 'warning',
          message: `${biometryType} not available`,
          description: `${biometryType} is not available on this device`,
        });
        return;
      }

      if (!hasStoredCredentials) {
        showMessage({
          type: 'warning',
          message: 'No stored credentials',
          description: 'Please login with your credentials first',
        });
        return;
      }

      const { success, error } = await authenticateWithBiometrics(`Sign in with ${biometryType}`);

      if (success) {
        const storedCredentialsJson = await AsyncStorage.getItem(STORAGE_KEYS.CREDENTIALS);
        if (storedCredentialsJson) {
          const { mobile, password } = JSON.parse(storedCredentialsJson);

          await performLogin(mobile, password, true);
        }
      } else if (error) {
        showMessage({
          type: 'danger',
          message: 'Authentication failed',
          description: error || 'Please try again',
        });
      }
    } catch (error) {
      devLogger('🚀 ~ handleBiometricLogin ~ error:', error);
      setLoader(false);
      showMessage({
        type: 'danger',
        message: 'Authentication error',
        description: 'An error occurred during biometric authentication',
      });
    }
  };

  const { renderInput, handleSubmit } = useAuthForm({
    validationSchema: LoginSchema,
    initialValues: LoginInitialValues,
    onSubmit: async values => {
      try {
        devLogger(values);
        await performLogin(values?.mobile, values?.password, false);
      } catch (error) {
        devLogger('🚀 ~ LoginScreen ~ error:', error);
        setLoader(false);
      }
    },
  });

  const onPressLogin =  async () => {
    try {
      handleSubmit();
      await saveFcmToken({
      fcm_token: fcmToken || '',
      device_token: deviceToken || '',
    });
    } catch (error) {
      devLogger('🚀 ~ onPressLogin ~ error:', error);
    }
  };

  const onForgotPasswordPress = () => {
    navigation.navigate('ForgotPasswordScreen');
  };

  const otherWrapperProps: useWrapAuthScreenProps = [false, 'Login', true];

  return useWrapAuthScreen(
    <KeyboardAwareWrapper>
      <View style={[commonStyles.flex, commonStyles.justifyEnd]}>
        <BaseImage
          source={Images.login_top_graphic}
          style={styles.loginGraphic}
          resizeMode="contain"
        />
        <View style={styles.contentContainer}>
          <BaseText style={styles.headingText}>Login to your account</BaseText>
          {renderInput('mobile', 'Mobile Number', 'Enter your Mobile Number', undefined, false, {
            keyboardType: 'phone-pad',
            maxLength: 11,
          })}
          {renderInput(
            'password',
            'Password',
            'Enter Password',
            styles.loginPasswordInputStyle,
            true,
          )}
          <View style={[commonStyles.rowItemCenterJustifyBetween, { marginTop: mScale(4) }]}>
            {hasStoredCredentials && isBiometricsAvailable ? (
              <BaseText style={styles.forgotPasswordText} onPress={handleBiometricLogin}>
                Login with {biometryType}
              </BaseText>
            ) : (
              <View />
            )}
            <BaseText style={styles.forgotPasswordText} onPress={onForgotPasswordPress}>
              Forgot Password
            </BaseText>
          </View>
          <BaseButton title="Login" style={styles.loginButton} onPress={onPressLogin} />
        </View>
      </View>
    </KeyboardAwareWrapper>,
    ...otherWrapperProps,
  );
};
