import { NavigatorScreenParams } from '@react-navigation/native';
import { Image } from 'react-native-image-crop-picker';
import { GetUserListUserType, GroupListItemType } from '@api';
import { ChatAttachmentTypeRaw } from '@hooks';

export type BottomTabParamList = {
  Dashboard: undefined;
  Nurses: undefined;
  Physicians: undefined;
  Chats: undefined;
  EFax: undefined;
};

export type GroupDataType = Partial<GroupListItemType>;

export type RootStackParamList = {
  LoginScreen: undefined;
  VerifyOtpScreen: { mobile: string };
  SignupScreen: { token: string };
  ResetPasswordScreen: { token?: string };
  ForgotPasswordScreen: undefined;
  BottomTabNavigator: NavigatorScreenParams<BottomTabParamList>;
  NursingHomes: undefined;
  AllNurseList?: {
    nursingHomeData?: GetUserListUserType;
  };
  AccountSettingsScreen: undefined;
  CreateGroupScreen: {
    update?: boolean;
    groupData?: GroupDataType;
    isFrom?: string
  };
  ChatScreen?: {
    isEFax?: boolean;
    isGroup?: boolean;
    data?: GroupDataType;
  };
  ImagesPreviewScreen: {
    images: (Partial<Image> & Partial<ChatAttachmentTypeRaw> & { uri?: string })[];
    showChatInput?: boolean;
    initialIndex?: number;
    isEdit?: boolean;
    chatId?: string;
  };
  DocumentPreviewScreen: {
    documents: (Partial<ChatAttachmentTypeRaw> & { uri?: string })[];
    isEdit?: boolean;
    initialIndex?: number;
    chatId?: string;
    showChatInput?: boolean;
    isForm?: boolean;
  };
  RecordingPreviewScreen: {
    recording: string;
    chatId?: string;
    showChatInput?: boolean;
  };
  NotificationScreen: undefined;
  EditDocumentScreen: {
    document: string;
  };
  ChatDocumentFormScreen: {
    chatId?: string;
  };
  CallingScreen: {
    uid: number | null;
    groupId: string;
    name: string;
  };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
