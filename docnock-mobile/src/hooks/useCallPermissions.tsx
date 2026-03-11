import { CallType } from '@context';
import { devLogger } from '@utils';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import {
  checkMultiple,
  Permission,
  PERMISSIONS,
  PermissionStatus,
  requestMultiple,
} from 'react-native-permissions';

export const useCallPermissions = () => {
  //TODO: Add Permissions
  const [hasFullPermissions, setHasFullPermissions] = useState<boolean>(false);

  const getRequiredPermissionArray = useCallback((type: CallType) => {
    const permissionRequired: Permission[] = [];
    const isIOS = Platform.OS === 'ios';
    permissionRequired.push(isIOS ? PERMISSIONS.IOS.MICROPHONE : PERMISSIONS.ANDROID.RECORD_AUDIO);
    if (type === CallType.video) {
      permissionRequired.push(PERMISSIONS[isIOS ? 'IOS' : 'ANDROID'].CAMERA);
    }
    return permissionRequired;
  }, []);

  const getDeniedPermissionArray = useCallback(
    (permissions: Record<Permission, PermissionStatus>) => {
      const deniedPermissions = Object.entries(permissions)
        .filter(([_, value]) => value !== 'granted')
        ?.map(([key]) => key as Permission);
      return deniedPermissions;
    },
    [],
  );

  const checkCallPermissions = useCallback(
    async (type: CallType) => {
      const permissionRequired: Permission[] = getRequiredPermissionArray(type);
      return await checkMultiple(permissionRequired);
    },
    [getRequiredPermissionArray],
  );

  const requestCallPermissions = useCallback(
    async (type: CallType = CallType.video) => {
      const response = await checkCallPermissions(type);
      devLogger('🚀 ~ requestCallPermissions ~ response:', response);
      const permissionRequired: Permission[] = [];
      const deniedPermissions = getDeniedPermissionArray(response);
      permissionRequired.push(...deniedPermissions);
      if (permissionRequired.length) {
        const permission = await requestMultiple(permissionRequired);
        const finalDeniedPermissions = getDeniedPermissionArray(permission);
        setHasFullPermissions(!finalDeniedPermissions?.length);
        return !finalDeniedPermissions?.length;
      }
      setHasFullPermissions(true);
      return true;
    },
    [checkCallPermissions, getDeniedPermissionArray],
  );

  return {
    hasFullPermissions,
    requestCallPermissions,
    checkCallPermissions,
    getRequiredPermissionArray,
  };
};
