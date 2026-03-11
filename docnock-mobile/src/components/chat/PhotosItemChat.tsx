import React from 'react';
import { FlatList, View } from 'react-native';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { commonStyles } from '@styles';
import { FontSizes, FontWeights } from '@theme';
import { BaseTouchable } from '../button';
import { BaseText } from '../BaseText';
import { BaseImage } from '../BaseImage';
import { RootStackParamList, useCustomNavigation } from '@navigation';
import { STATIC_IMAGE_URI } from './DummyChat';
import { ChatItemAttachmentType } from '@store';

export type ImageType = { uri?: string; isFillIn?: boolean };

export const PhotosItemChat = ({
  images,
}: {
  images: RootStackParamList['ImagesPreviewScreen']['images'];
}) => {
  const navigation = useCustomNavigation();

  const styles = PhotosItemChatStyles();
  const isSingle = images.length === 1;

  const remainingCounts = (images?.length ?? 0) - 4;
  const showImagesArray =
    remainingCounts > 0 ? [...images.slice(0, 3), { isFillIn: true }] : images;

  const onPressImage = (index: number) => {
    navigation.navigate('ImagesPreviewScreen', {
      images: images,
      initialIndex: index,
    });
  };

  const renderImage = ({
    item: { isFillIn, isBig, uri },
    index = 0,
  }: {
    item: ChatItemAttachmentType & { isFillIn?: boolean; isBig?: boolean };
    index?: number;
  }) => {
    // console.log('====================================');
    // console.log(uri, 'dfffff');
    // console.log('====================================');
    return !isFillIn ? (
      <BaseTouchable onPress={onPressImage.bind(this, index)}>
        {!uri ? (
          <View style={[styles.image, isBig ? styles.bigImage : {}]} />
        ) : (
          <BaseImage
            source={{
              uri: uri ?? STATIC_IMAGE_URI,
            }}
            style={[styles.image, isBig ? styles.bigImage : {}]}
            withShimmer
          />
        )}
      </BaseTouchable>
    ) : (
      <BaseTouchable
        style={[styles.image, commonStyles.centerCenter, styles.remainingCountBackground]}
        onPress={onPressImage.bind(this, index)}
      >
        <BaseText style={styles.remainingCount}>+{remainingCounts + 1}</BaseText>
      </BaseTouchable>
    );
  };

  return isSingle ? (
    <BaseTouchable onPress={onPressImage.bind(this, 0)}>
      {renderImage({ item: { ...images[0], isBig: true } })}
    </BaseTouchable>
  ) : (
    <View style={[commonStyles.rowItemCenterJustifyCenter]}>
      <FlatList data={showImagesArray} numColumns={2} renderItem={renderImage} />
    </View>
  );
};

export const PhotosItemChatStyles = () =>
  useTheme(({ colors }) => ({
    image: {
      height: mScale(70),
      width: mScale(70),
      margin: mScale(5),
      borderRadius: mScale(10),
    },
    remainingCount: {
      fontSize: FontSizes.size_30,
      fontWeight: FontWeights.bold,
      width: '100%',
      textAlign: 'center',
    },
    remainingCountBackground: {
      backgroundColor: colors.inputPlaceHolder,
      flex: 1,
    },
    bigImage: {
      height: mScale(70) * 2,
      width: '100%',
      alignSelf: 'center',
      minWidth: mScale(70) * 2,
    },
  }));
