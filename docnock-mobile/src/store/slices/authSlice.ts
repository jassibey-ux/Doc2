import { UserProfileType } from '@api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSlice } from '@reduxjs/toolkit';

export type PermissionItemType = {
  _id: string;
  userId: string;
  moduleName: string;
  noOfLimit: number;
  __v: number;
  createdAt: string;
  updatedAt: string;
};

export type AuthSliceType = {
  fcmToken?: string;
  loginDetails?: {
    role?: string;
    token?: string;
    profile: UserProfileType;
    loginsessionid?: string; // Add this line

  };
  password?: string;
  userPermissions?: PermissionItemType[];
  notifcationUnreadCont?: number;
  groupId:string | number
  deviceToken?:string
};

const InitialAuthState: AuthSliceType = {
  fcmToken: '',
  deviceToken: '',
  loginDetails: undefined,
  password: undefined,
  userPermissions: undefined,
  notifcationUnreadCont: 0,
  groupId:''
};

const authSlice = createSlice({
  name: 'auth',
  initialState: InitialAuthState,
  reducers: {
    setFcmToken: (state, action) => {
      AsyncStorage.setItem("fcmToken", action.payload);
      return { ...state, fcmToken: action.payload };
    },
    setDeviceToken: (state, action) => {
      return { ...state, deviceToken: action.payload };
    },
    setNotifcationUnreadCont: (state, action) => {
      return { ...state, notifcationUnreadCont: action.payload };
    },
    setLoginDetails: (state, action) => {
      return { ...state, loginDetails: action.payload };
    },
    clearLoginDetails: () => {
      return InitialAuthState;
    },
    updateProfile: (state, action) => {
      return {
        ...state,
        loginDetails: {
          ...state.loginDetails,
          profile: action.payload,
        },
      };
    },
    setPassword: (state, action) => {
      return {
        ...state,
        password: action.payload,
      };
    },
    setPermissions: (state, action) => {
      return {
        ...state,
        userPermissions: action.payload,
      };
    },
    setAuthGroupId: (state, action) => {
      return { ...state, groupId: action.payload };
    },
  },
});

export { authSlice };
export const {
  setFcmToken,
  setDeviceToken,
  setLoginDetails,
  clearLoginDetails,
  updateProfile,
  setPassword,
  setPermissions,
  setNotifcationUnreadCont,
  setAuthGroupId
} = authSlice.actions;
