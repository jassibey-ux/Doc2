import { Alert, Linking } from 'react-native';
import { checkMultiple, PERMISSIONS, requestMultiple } from 'react-native-permissions';

export const requestLocationPermissionForAndroid = async (
  action?: () => void,
  isAlert?: boolean,
) => {
  const status = await requestMultiple([
    PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
    PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  ]);
  if (
    status[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'denied' ||
    status[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'denied' ||
    status[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'blocked' ||
    status[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'blocked'
  ) {
    if (isAlert) {
      Alert.alert(
        'DockNock',
        'You need to enable the location permission from your device setting for this app',
        [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'OK',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ],
      );
      return false;
    } else {
      if (action) {
        action();
      }
      return true;
    }
  } else if (
    status[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'granted' &&
    status[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'granted'
  ) {
    if (action) {
      action();
    }
    return true;
  }
};

export const requestLocationPermissionForIOS = async (action?: () => void, isAlert?: boolean) => {
  const status = await requestMultiple([PERMISSIONS.IOS.LOCATION_WHEN_IN_USE]);
  if (
    status[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'denied' ||
    status[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'blocked'
  ) {
    if (isAlert) {
      Alert.alert(
        'DockNock',
        'You need to enable the location permission from your device setting for this app',
        [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'OK',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ],
      );
      return false;
    } else {
      if (action) {
        action();
      }
      return true;
    }
  } else if (status[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'granted') {
    if (action) {
      action();
    }
    return true;
  }
};

export const checkIOSLocationPermission = async (action?: () => void, isAlert: boolean = false) => {
  const statuses = await checkMultiple([PERMISSIONS.IOS.LOCATION_WHEN_IN_USE]);
  if (
    statuses[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'denied' ||
    statuses[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'blocked'
  ) {
    return await requestLocationPermissionForIOS(action, isAlert);
  } else if (statuses[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === 'granted') {
    if (action) {
      action();
    }
    return true;
  } else {
    return false;
  }
};

export const checkAndroidLocationPermission = async (
  action?: () => void,
  isAlert: boolean = false,
) => {
  const statuses = await checkMultiple([
    PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
    PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  ]);
  if (
    statuses[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'denied' ||
    statuses[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'denied' ||
    statuses[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'blocked' ||
    statuses[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'blocked'
  ) {
    return await requestLocationPermissionForAndroid(action, isAlert);
  } else if (
    statuses[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === 'granted' &&
    statuses[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === 'granted'
  ) {
    if (action) {
      action();
    }
    return true;
  }
};
