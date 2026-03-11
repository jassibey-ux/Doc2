import { Dimensions, Platform } from 'react-native';

const ROUTES = {};

const STANDARD_HEIGHT = 812;
const STANDARD_WIDTH = 375;

const { height, width } = Dimensions.get('window');

const SCREEN_WIDTH = width;
const SCREEN_HEIGHT = height;

const VERTICAL_BASE_SCALE = 0.35;

const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

export type PermissionMapItemType = {
  id: string;
  name: string;
  showInCreateGroup?: boolean;
};

const USER_PERMISSION_MAPPING: {
  [key: string]: PermissionMapItemType;
} = {
  F: {
    id: 'facility_center',
    name: 'Facility Center',
    showInCreateGroup: true,
  },
  P: {
    id: 'physician',
    name: 'Physicians',
    showInCreateGroup: true,
  },
  N: {
    id: 'nurse',
    name: 'Nurses',
    showInCreateGroup: true,
  },
  S: {
    id: 'subadmin',
    name: 'Sub Admin',
    showInCreateGroup: true,
  },
  O: {
    id: 'other',
    name: 'Other User',
    showInCreateGroup: true,
  },
  V: {
    id: 'video',
    name: 'Video Calling',
  },
  C: {
    id: 'chat',
    name: 'Chat',
  },
  R: {
    id: 'role-permission',
    name: 'Role and Permission',
  },
};

export const SAME_GROUP_EXISTS_ERROR_MESSAGE =
  'A conversation with the same combination of users, group name, and sender already exists.';

const STORAGE_KEYS = {
  CREDENTIALS: '@auth_credentials',
};

export {
  ROUTES,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  STANDARD_HEIGHT,
  STANDARD_WIDTH,
  VERTICAL_BASE_SCALE,
  IS_ANDROID,
  IS_IOS,
  USER_PERMISSION_MAPPING,
  STORAGE_KEYS,
};
