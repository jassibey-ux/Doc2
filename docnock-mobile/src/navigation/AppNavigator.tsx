import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer, NavigationState, PartialState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  AccountSettingsScreen,
  AllNurseList,
  CallingScreen,
  ChatDocumentFormScreen,
  ChatScreen,
  CreateGroupScreen,
  DocumentPreviewScreen,
  EditDocumentScreen,
  ForgotPasswordScreen,
  ImagesPreviewScreen,
  LoginScreen,
  NotificationScreen,
  NursingHomes,
  RecordingPreviewScreen,
  ResetPasswordScreen,
  SignupScreen,
  VerifyOtpScreen,
} from '@screens';
import { commonStyles } from '@styles';
import { useAppSelector, useTheme } from '@hooks';
import { defaultNavigationOptions, navigationRef } from './NavigationService';
import { RootStackParamList } from './types';
import { BottomTabNavigator } from './BottomTabNavigator';
import createAgoraRtcEngine from 'react-native-agora';
import { AGORA_APP_ID } from '@env';
import { navigateToChat } from '../utils/notificationService';

const AppStack = createNativeStackNavigator<RootStackParamList>();

export const findNestedRoute = (
  state: NavigationState | PartialState<NavigationState>,
  path = 'routes',
): string => {
  const currentItem =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    path === 'routes' ? state?.routes?.[state?.index as number] : (state as any)?.state;
  if (currentItem?.routes) {
    return findNestedRoute(currentItem, 'routes');
  } else if (currentItem?.state) {
    return findNestedRoute(currentItem, 'state');
  } else {
    return currentItem?.name;
  }
};

export const AppNavigator = () => {
  const token = useAppSelector(state => state?.auth?.loginDetails?.token);
  const styles = Styles();

  useEffect(() => {
    const response = createAgoraRtcEngine();
    if (response) {
      response.initialize({ appId: AGORA_APP_ID });
      response?.release();
    }
  }, []);

  return (
    <View style={[commonStyles.flex, styles.container]}>
      <NavigationContainer ref={navigationRef}
        onReady={() => {
          console.log('Navigation is ready!');
          navigateToChat();
        }}>
        <AppStack.Navigator
          screenOptions={defaultNavigationOptions}
          initialRouteName={token ? 'BottomTabNavigator' : 'LoginScreen'}
        >
          <AppStack.Screen name="LoginScreen" component={LoginScreen} />
          <AppStack.Screen name="VerifyOtpScreen" component={VerifyOtpScreen} />
          <AppStack.Screen name="SignupScreen" component={SignupScreen} />
          <AppStack.Screen name="ResetPasswordScreen" component={ResetPasswordScreen} />
          <AppStack.Screen name="ForgotPasswordScreen" component={ForgotPasswordScreen} />
          <AppStack.Screen name="BottomTabNavigator" component={BottomTabNavigator} />
          <AppStack.Screen name="NursingHomes" component={NursingHomes} />
          <AppStack.Screen name="AllNurseList" component={AllNurseList} />
          <AppStack.Screen name="AccountSettingsScreen" component={AccountSettingsScreen} />
          <AppStack.Screen name="CreateGroupScreen" component={CreateGroupScreen} />
          <AppStack.Screen name="ChatScreen" component={ChatScreen} />
          <AppStack.Screen name="ImagesPreviewScreen" component={ImagesPreviewScreen} />
          <AppStack.Screen name="DocumentPreviewScreen" component={DocumentPreviewScreen} />
          <AppStack.Screen name="RecordingPreviewScreen" component={RecordingPreviewScreen} />
          <AppStack.Screen name="NotificationScreen" component={NotificationScreen} />
          <AppStack.Screen name="EditDocumentScreen" component={EditDocumentScreen} />
          <AppStack.Screen name="ChatDocumentFormScreen" component={ChatDocumentFormScreen} />
          <AppStack.Screen name="CallingScreen" component={CallingScreen} options={{ gestureEnabled: false }} />
        </AppStack.Navigator>
      </NavigationContainer>
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.primary,
    },
  }));
