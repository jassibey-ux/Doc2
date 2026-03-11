import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { ChatFooter, DashBoardHeader, ScreenWrapper, SvgIconButton } from '@components';
import { commonStyles } from '@styles';
import { mScale, scale, wp } from '@utils';
import { useAppSelector, useTheme } from '@hooks';
import { useCustomRoute } from '@navigation';
import { renderLeftComponent } from './AllNurseList';

export const ImagesPreviewScreen = () => {
  const styles = ImagesPreviewScreenStyles();
  const route = useCustomRoute<'ImagesPreviewScreen'>();
  const images = route?.params?.images;
  const initialIndex = route?.params?.initialIndex;
  const showChatInput = route?.params?.showChatInput;
  const isEdit = route?.params?.isEdit;
  const chatId = route?.params?.chatId;

  const { colors } = useAppSelector(state => state.theme);

  const [updatedImages, setUpdatedImages] = useState<typeof images>(route?.params?.images ?? []);
  const [currentImage, setCurrentImage] = useState<number>(initialIndex ?? 0);

  const removeCurrentImage = () => {
    const updatedArr = [...updatedImages].filter((_, index) => index !== currentImage);
    setUpdatedImages(updatedArr);
    const updatedIndex =
      currentImage === updatedImages?.length - 1 ? currentImage - 1 : currentImage;
    setCurrentImage(updatedIndex);
  };

  const renderRightComponent = () => {
    return <SvgIconButton icon="Trash" style={[commonStyles.centerCenter]} />;
  };

  const onChangeImage = (index?: number) => setCurrentImage(index ?? 0);

  const imageUrls = useMemo(
    () => updatedImages?.map(_item => ({ url: _item?.path ?? _item?.uri ?? '' })),
    [updatedImages],
  );

  const headerText = useMemo(
    () => `${currentImage + 1} / ${updatedImages?.length}`,
    [currentImage, updatedImages],
  );

  return (
    <View style={[commonStyles.flex, styles.container]}>
      <ScreenWrapper
        enableTopSafeArea={false}
        enableBottomSafeArea={!showChatInput}
        style={[commonStyles.flex]}
        edges={['top']}
      >
        <DashBoardHeader
          renderLeftComponent={renderLeftComponent}
          containerStyle={[styles.headerContainerStyle]}
          headerText={headerText}
          {...(updatedImages?.length > 1 && isEdit
            ? { renderRightComponent, onPressRightIcon: removeCurrentImage }
            : { disableRightComponent: true })}
        />
        <View style={[commonStyles.flex]}>
          {updatedImages?.length && (
            <ImageViewer
              backgroundColor={colors.primary}
              imageUrls={imageUrls}
              saveToLocalByLongPress={false}
              renderIndicator={() => <></>}
              onChange={onChangeImage}
              index={currentImage}
            />
          )}
        </View>
      </ScreenWrapper>
      {showChatInput && (
        <ChatFooter
          onlyText
          chatId={chatId}
          selectedMedia={updatedImages}
          allowWithoutTextSend
          goBackAfterSend
        />
      )}
    </View>
  );
};

export const ImagesPreviewScreenStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.primary,
    },
    headerContainerStyle: {
      marginHorizontal: scale(22),
      marginTop: mScale(16),
      marginBottom: 0,
    },
    imageContainer: {
      width: '100%',
      height: '100%',
    },
    imageStyle: {
      //   flex: 1,
      marginHorizontal: wp(2.5),
      width: 100,
      height: 100,
    },
  }));
