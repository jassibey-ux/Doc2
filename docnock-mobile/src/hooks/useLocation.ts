import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { checkAndroidLocationPermission, checkIOSLocationPermission } from '@utils';

export const useLocation = (requestPermissionOnMount = false) => {
  const [checkedPermissions, setCheckedPermissions] = useState(false);
  const [allowPermissions, setAllowPermissions] = useState(false);

  const getCurrentLocation: (
    showAlertOnError?: boolean,
  ) => Promise<Geolocation.GeoPosition['coords'] | undefined> = useCallback(
    async (showAlertOnError = true) => {
      return await new Promise((res, rej) =>
        Geolocation.getCurrentPosition(
          async position => {
            return res(position?.coords);
          },
          error => {
            showAlertOnError && Alert.alert(error.message.toString());
            return rej(undefined);
          },
        ),
      );
    },
    [],
  );

  const requestPermission = useCallback(async () => {
    const onPermissionGrant = () => {
      setAllowPermissions(true);
    };

    if (Platform.OS === 'ios') {
      await checkIOSLocationPermission(onPermissionGrant);
    } else {
      await checkAndroidLocationPermission(onPermissionGrant);
    }

    setCheckedPermissions(true);
  }, []);

  useEffect(() => {
    if (requestPermissionOnMount) {
      requestPermission();
    }
  }, [requestPermissionOnMount, requestPermission]);

  return {
    getCurrentLocation,
    allowPermissions,
    checkedPermissions,
    requestPermission,
  };
};
