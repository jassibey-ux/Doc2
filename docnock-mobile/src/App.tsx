if (__DEV__) {
  require('../ReactotronConfig');
}

import React, { useEffect } from 'react';
import SplashScreen from 'react-native-splash-screen';
import { AppNavigator, navigationRef } from '@navigation';
import { AppWrapper } from '@components';
import { LogBox } from 'react-native';
import { handleForegroundNotifications, navigateToChat, notificationListener, requestUserNotificationPermission } from './utils/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setFcmToken } from '@store';
LogBox.ignoreAllLogs();

const App = () => {
  useEffect(() => {
    SplashScreen.hide();
    requestUserNotificationPermission();
    notificationListener();
    handleForegroundNotifications();
    getNotificationToken();
  }, []);


  useEffect(() => {
    const interval = setInterval(() => {
      if (navigationRef.isReady()) {
        navigateToChat();
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, []);

    const getNotificationToken = async () => {
    try {
      await AsyncStorage.getItem('fcmToken').then(cb => {
      console.log(cb, 'FCM_TOKEN getItem');
      if (cb != null) {
        setFcmToken(cb);
      }
    });
    } catch (error) {
      console.log('Error storing the fcm token:', error);
    }
  };

  return (
    <AppWrapper>
      <AppNavigator />
    </AppWrapper>
  );
};

export default App;
