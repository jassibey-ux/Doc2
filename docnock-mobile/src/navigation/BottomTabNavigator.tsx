import React, { useCallback, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { EFax, Chats, Nurses, Physicians, DashBoard } from '@screens';
import { renderCustomBottomTab } from '@components';
import { BottomTabParamList } from './types';
import { defaultNavigationOptions, navigationService } from './NavigationService';
import { useAppDispatch, useAppSelector, useChatSocket } from '@hooks';
import { useGetUserPermissions } from '@api';
import { decryptData, devLogger } from '@utils';
import { setPermissions } from '@store';

const BottomTab = createBottomTabNavigator<BottomTabParamList>();

export const BottomTabNavigator = () => {
  const isNurse = useAppSelector(state => state.auth.loginDetails?.role) === 'nurse';
  const userId = useAppSelector(state => state.auth.loginDetails?.profile?._id);
  const dispatch = useAppDispatch();

  const isFocused = useIsFocused();
  const { emitUserRegister } = useChatSocket();

  const { mutateAsync: getPermission } = useGetUserPermissions();

  useEffect(() => {
    if (userId) {
      emitUserRegister();
    }
  }, [emitUserRegister, userId]);

  const init = useCallback(async () => {
    try {
      const response = await getPermission();
      if (response?.data?.status) {
        const decryptedData = await decryptData(response?.data?.encryptDatauserdata);
        if (decryptedData) {
          dispatch(setPermissions(decryptedData));
        }
      }
    } catch (error) {
      devLogger('🚀 ~ init ~ error:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFocused) {
      init();
    }
  }, [isFocused, init]);

  // console.log('getCurrentRoute:xu', navigationService.getCurrentRoute());

  // console.log('isNurse', isNurse);

  return (
    <BottomTab.Navigator
      screenOptions={{ ...defaultNavigationOptions, tabBarShowLabel: false }}
      tabBar={renderCustomBottomTab}
      initialRouteName={isNurse ? 'Physicians' : 'Chats'}
      // initialRouteName={`Chats`}
      // initialRouteName={`Physicians`}
    >
      <BottomTab.Screen name="Physicians" component={Physicians} />
      <BottomTab.Screen name="Nurses" component={Nurses} />
      <BottomTab.Screen name="Dashboard" component={DashBoard} />
      <BottomTab.Screen name="Chats" component={Chats} />
      <BottomTab.Screen name="EFax" component={EFax} />
    </BottomTab.Navigator>
  );
};
