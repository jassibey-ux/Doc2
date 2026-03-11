import RNFS from 'react-native-fs';
import { ChatItemType } from '@store';
import { Platform } from 'react-native';
import { ChatAttachmentTypeRaw, ChatMessageAttachmentType } from '@hooks';
import { devLogger, getValidMediaFileName } from './helpers';

const getReadableFilePath = async (uri: string) => {
  let formattedUri = decodeURI(uri);

  if (formattedUri.startsWith('file://')) {
    formattedUri = formattedUri.replace('file://', '');
  }

  if (Platform.OS === 'android' && formattedUri.startsWith('content://')) {
    const fileInfo = await RNFS.stat(formattedUri);
    return fileInfo?.originalFilepath || formattedUri;
  }

  return formattedUri;
};

export const getChatMediaUri = async (attachment: ChatItemType['attachments']) => {
  const shapedMedia: ChatItemType['attachments'] = [];
  await Promise.all(
    attachment?.map(async item => {
      try {
        if (item?.data) {
          const base64 = item?.data?.split('base64,')?.reverse()?.[0];
          const mime = item?.type == 'mp3'? 'mp4a' : item?.type;
          const ext = mime?.split('/')?.[1];
          const fileName = item?.name || `Media__${Date.now()}.${ext}`;
          const filePath =
            Platform.OS === 'ios'
              ? `${RNFS.CachesDirectoryPath}/${fileName}`
              : `${RNFS.CachesDirectoryPath}/${fileName}`;
          const formattedFilePath = (
            Platform.OS === 'android'
              ? fileName?.includes('file://')
                ? filePath
                : `file://${filePath}`
              : filePath
          )?.replace(/ /g, '');
          await RNFS.writeFile(formattedFilePath, base64, 'base64');
          if (base64) {
            shapedMedia.push({
              ...item,
              name: item?.name || fileName,
              uri: formattedFilePath,
            });
          }
        }
      } catch (error) {
        devLogger('🚀 ~ getChatMediaUri ~ error:', error);
      }
    }),
  );
  return shapedMedia;
};

export const shapeChatMedia = async (attachment: ChatAttachmentTypeRaw[], fileName?: string) => {
  const processedMedia: ChatMessageAttachmentType[] = [];
  await Promise.all(
    attachment?.map(async item => {
      try {
        const type = item?.type || item?.mime;
        if (!item?.uri || !type) {
          return;
        }

        const readPath = await getReadableFilePath(item.uri);
        const base64 = await RNFS.readFile(readPath, 'base64');
        if (base64) {
          const mediaType =
            type == 'mp3' || type == 'mp4a' || type == 'm4a' ? 'mp3' : type;
          const ext = mediaType?.split('/')?.[1] ?? mediaType;
          processedMedia.push({
            name: getValidMediaFileName(fileName || item?.fileName, ext),
            type: mediaType,
            data: `data:${type};base64,${base64}`,
          });
        }
      } catch (error) {
        devLogger('🚀 ~ shapeChatMedia ~ error:', error);
      }
    }),
  );
  return processedMedia;
};
