import {
  verticalScale,
  scale as sizeMaterScale,
  moderateScale,
} from 'react-native-size-matters/extend';
import cryptoJS from 'crypto-js';
import { CRYPTO_KEY } from '@env';
import { Alert, Dimensions } from 'react-native';
import {
  BASE_USER_UPLOAD_PROFILE_URL,
  CreateGroupPayload,
  CreateGroupUser,
  GetUserListUserType,
} from '@api';
import dayjs from 'dayjs';
import { SAME_GROUP_EXISTS_ERROR_MESSAGE } from './constants';
import { Image as ImageCompressor, Audio as AudioCompressor } from 'react-native-compressor';
import { stat } from 'react-native-fs';

export const vscale = (size: number) => verticalScale(size);

export const mScale = (size: number) => moderateScale(size);

export const scale = (size: number) => sizeMaterScale(size);

export const dimensions = Dimensions.get('window');

export const hp = (size: number) => dimensions.height * ((size ?? 100) / 100);

export const wp = (size: number) => dimensions.width * ((size ?? 100) / 100);

export const devLogger = (...messages: unknown[]) => {
  if (__DEV__) {
    console.log(...messages);
  }
  return null;
};

export const decryptData = async (encryptedText: string) => {
  const key = CRYPTO_KEY ?? '';
  const bytes = cryptoJS.AES.decrypt(encryptedText, key);
  const string = bytes.toString(cryptoJS.enc.Utf8);
  if (string) {
    const json = await JSON.parse(string);
    return json;
  } else {
    return null;
  }
};

export const getImageObjectFromUrl = (uri: string) => {
  if (!uri) {
    return null;
  }
  const filename = uri.split('/').pop() ?? '';
  const type = filename.split('.').pop();
  return {
    uri,
    name: filename,
    type: `image/${type}`,
  };
};

export const getProfileImageUrlFromImageName = (imageName: string) => {
  if (!imageName) {
    return '';
  }
  if (imageName?.includes('http')) {
    return imageName;
  }
  return `${BASE_USER_UPLOAD_PROFILE_URL}${imageName}`;
};

export const formatChatDate = (date: number) => {
  const dayjsDate = dayjs(date);
  const today = dayjs().startOf('day');
  const yesterday = dayjs().subtract(1, 'day').startOf('day');
  const startOfWeek = dayjs().startOf('week');

  if (dayjsDate.isSame(today, 'day')) {
    return 'Today';
  }

  if (dayjsDate.isSame(yesterday, 'day')) {
    return 'Yesterday';
  }

  if (dayjsDate.isAfter(startOfWeek) || dayjsDate.isSame(startOfWeek, 'day')) {
    return dayjsDate.format('dddd');
  }

  return dayjsDate.format('DD MMMM YYYY');
};

export const extractFilename = (path?: string) => {
  if (!path) {
    return '';
  }

  // Split the path by '/' and get the last element
  const parts = path.split('/');
  return parts[parts.length - 1];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const transformChatData = (sourceData: any, loginUserId: any) => {
  const firstUser =
    sourceData.userlist && sourceData.userlist.length > 0 ? sourceData.userlist[0] : null;

  let image = 'No Members';

  if (sourceData.groupPicture) {
    image = sourceData.groupPicture;
  } else if (sourceData.senderprofilePicture && sourceData.senderprofilePicture.savedName) {
    image = sourceData.senderprofilePicture.savedName;
  }

  const userid = firstUser ? firstUser.userid : null;

  const removeId = ['679924d6559788ad4a3a88fb', loginUserId];
  const filteredUserList = sourceData.userlist.filter(
    (user: any) => !removeId.includes(user.userid),
  );

  return {
    groupId: sourceData._id || null,
    title: sourceData.groupName.includes('ABC') ? filteredUserList[0].name : sourceData.groupName,
    image: image,
    latestMessage: sourceData.latestMessage || '',
    userIds: sourceData.userlist || [],
    group: sourceData.isGroup || false,
    userid: userid,
    names: '',
  };
};

export const handleDirectChatCreation = async (
  userData: GetUserListUserType,
  loginUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createGroup: (payload: CreateGroupPayload) => Promise<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess: (chatData: any) => void,
) => {
  try {
    console.log('Starting handleDirectChatCreation...');
    if (!userData) {
      console.log('No userData provided.');
      return;
    }

    const userlist: CreateGroupUser[] = [
      {
        userid: userData._id || '',
        name: userData.fullName || '',
        profilePicture: userData.profilePicture || {},
        status:
          userData.status !== undefined && userData.status !== null
            ? !!userData.status
            : true,
      },
    ];

    const payload: CreateGroupPayload = {
      groupName: '',
      userlist,
      senderID: loginUserId || '',
    };

    const res = await createGroup(payload);
    console.log('Response from createGroup:', res);

    if (typeof onSuccess !== 'function') {
      console.log('onSuccess is not a function!');
      return;
    }

    if (res?.success && res?.conversation) {
      const chatData = transformChatData(res.conversation, loginUserId);
      console.log('New conversation created:', chatData);
      onSuccess(chatData);
    } else if (
      res?.success === false &&
      res?.message === SAME_GROUP_EXISTS_ERROR_MESSAGE &&
      res?.data
    ) {
      const chatData = transformChatData(res.data, loginUserId);
      console.log('Existing conversation reused:', chatData);
      onSuccess(chatData);
    } else {
      console.error('Unexpected response:', res);
      Alert.alert('Error', 'Something went wrong while opening chat!');
    }
  } catch (error) {
    console.error('Error in handleDirectChatCreation:', error);
    Alert.alert('Error', 'Something went wrong while opening chat!');
  }
};

export const compressImage = async (image: string) => {
  try {
    const result = await ImageCompressor.compress(image, { quality: 0.4 });
    const { size } = await stat(result);
    return { size: size / 1024, path: result }; // Returns Size in KB
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const compressAudio = async (audio: string) => {
  try {
    const result = await AudioCompressor.compress(audio, { quality: 'low' });
    const { size } = await stat(result);
    return { size: size / 1024, path: result }; // Returns Size in KB
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getValidMediaFileName = (fileName?: string, ext?: string) => {
  if (!fileName || !ext) {
    return '';
  }
  console.log(fileName,'fileName',ext)

  return (
    fileName && fileName.includes(':') === false
      ? `${fileName}${Date.now()}.${ext}`
      : `Media__${Date.now()}.${ext}`
  )?.replace(/\//g, '');
};
