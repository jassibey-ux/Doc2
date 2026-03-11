import RNCallKeep from 'react-native-callkeep';
import { useAppDispatch } from './reduxHooks';
import { setCallKeepSetup } from '@store';
import { useCallback } from 'react';

const options = {
  ios: {
    appName: 'My app name',
  },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'This application needs to access your phone accounts',
    cancelButton: 'Cancel',
    okButton: 'Allow',
    // imageName: 'phone_account_icon',
    additionalPermissions: [],
    // Required to get audio in background when using Android 11
    foregroundService: {
      channelId: 'com.company.my',
      channelName: 'Foreground service for my app',
      notificationTitle: 'My app is running on background',
      notificationIcon: 'Path to the resource icon of the notification',
    },
  },
};

export const useCallKeep = () => {
  const dispatch = useAppDispatch();

  const setup = useCallback(async () => {
    const response = await RNCallKeep.setup(options);
    dispatch(setCallKeepSetup(!!response));
  }, [dispatch]);

  return {
    setup,
  };
};
