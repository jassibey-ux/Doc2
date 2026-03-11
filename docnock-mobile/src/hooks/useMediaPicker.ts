import { setLoader } from '@store';
import { compressImage, devLogger } from '@utils';
import { Alert, Linking } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import ImageCropPicker, {
  ImageOrVideo,
  type Image,
  type Options,
} from 'react-native-image-crop-picker';

export const getSingleImage = (response: Image | Image[]) => {
  try {
    if (Array.isArray(response)) {
      return response?.[0];
    } else {
      return response;
    }
  } catch (error) {
    devLogger('🚀 ~ giveSingleImage ~ error:', error);
    return undefined;
  }
};

const shapeImages = (images: Image | Image[]) =>
  Array.isArray(images)
    ? images?.map(item => ({
        ...item,
        uri: item?.path,
        type: item?.mime,
        fileName: item?.filename,
      }))
    : { ...images, uri: images.path, type: images?.mime, fileName: images?.filename };

export const useMediaPicker = (
  onSelectHandler?: (result: Image | Image[]) => unknown,
  sizeLimit = 0,
  disableFixSize = false,
  extraOptions?: Partial<Options>,
) => {
  const commonProps: Options = {
    mediaType: 'photo',
    cropping: true,
    ...(disableFixSize ? {} : { height: 512, width: 512 }),
    ...extraOptions,
  };

  const errorHandler = (error: string) => {
    devLogger('🚀 ~ errorHandler ~ error:', error);
    if (error?.includes('user did not grant') && error?.includes('permission')) {
      Alert.alert('Permission Denied', 'Please enable permission to access Photos from settings', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Settings',
          style: 'default',
          onPress: () => Linking.openSettings(),
        },
      ]);
    }
    return false;
  };

  const compressSelectedImages = async (images: ImageOrVideo) => {
    if (Array.isArray(images)) {
      const compressPromises = images.map(async img => {
        const compressed = await compressImage(img.path);
        if (compressed) {
          return {
            ...img,
            path: compressed.path,
            size: compressed.size,
          };
        }
        return img;
      });
      return Promise.all(compressPromises);
    } else if (images?.path) {
      const compressed = await compressImage(images.path);
      if (compressed) {
        return {
          ...images,
          path: compressed.path,
          size: compressed.size,
        };
      }
      return images;
    }

    return images;
  };

  const launchCamera = async () => {
    try {
      setLoader(true);
      const result = await ImageCropPicker.openCamera(commonProps);

      const compressedResult = await compressSelectedImages(result);

      let sizeOverLimit = false;
      if (Array.isArray(compressedResult)) {
        sizeOverLimit = compressedResult.some(item => item.size > sizeLimit * 1024 * 1024);
      } else {
        sizeOverLimit = compressedResult?.size > sizeLimit * 1024 * 1024;
      }

      if (!sizeLimit || (sizeLimit && !sizeOverLimit)) {
        onSelectHandler && onSelectHandler(shapeImages(compressedResult));
      } else {
        showMessage({
          type: 'warning',
          message: 'Image size is too large',
          description: `Please select an image less than ${sizeLimit / (1024 * 1024)} MB`,
        });
      }
      setLoader(false);
      return compressedResult;
    } catch (error) {
      errorHandler(error?.toString()?.toLowerCase() ?? '');
      setLoader(false);
    }
  };

  const launchImageLibrary = async () => {
    try {
      setLoader(true);
      const result = await ImageCropPicker.openPicker(commonProps);

      const compressedResult = await compressSelectedImages(result);

      let sizeOverLimit = false;
      if (Array.isArray(compressedResult)) {
        sizeOverLimit = compressedResult.some(item => item.size > sizeLimit * 1024 * 1024);
      } else {
        sizeOverLimit = compressedResult?.size > sizeLimit * 1024 * 1024;
      }

      if (!sizeLimit || (sizeLimit && !sizeOverLimit)) {
        onSelectHandler && onSelectHandler(shapeImages(compressedResult));
      } else {
        showMessage({
          type: 'warning',
          message: 'Image size is too large',
          description: `Please capture an image less than ${sizeLimit} MB`,
        });
      }
      setLoader(false);
      return compressedResult;
    } catch (error) {
      errorHandler(error?.toString()?.toLowerCase() ?? '');
      setLoader(false);
    }
  };

  const askOptions = () => {
    Alert.alert('Choose action', 'Please select option to pick image', [
      {
        text: 'Open Camera',
        style: 'default',
        onPress: launchCamera,
      },
      {
        text: 'Choose from Photos',
        style: 'default',
        onPress: launchImageLibrary,
      },
      {
        text: 'Cancel',
        style: 'destructive',
      },
    ]);
  };

  return {
    launchCamera,
    launchImageLibrary,
    askOptions,
  };
};
