import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { DocumentPickerResponse } from '@react-native-documents/picker';
import {
  BaseScroll,
  BaseText,
  ChatFooter,
  DashBoardHeader,
  ScreenWrapper,
  SvgIconButton,
} from '@components';
import { commonStyles } from '@styles';
import { mScale, wp } from '@utils';
import { useTheme } from '@hooks';
import { useCustomNavigation, useCustomRoute } from '@navigation';
import { FontSizes, FontWeights } from '@theme';
import { renderLeftComponent } from './AllNurseList';
import { ImagesPreviewScreenStyles } from './ImagesPreviewScreen';
import Pdf from 'react-native-pdf';
import { EditDocumentScreenStyles } from './EditDocumentScreen';

export const DocumentPreviewScreen = () => {
  const navigation = useCustomNavigation();
  const route = useCustomRoute<'DocumentPreviewScreen'>();
  const documents = route?.params?.documents;
  const isEdit = route?.params?.isEdit;
  const initialIndex = route?.params?.initialIndex;
  const chatId = route?.params?.chatId;
  const showChatInput = route?.params?.showChatInput;
  const isForm = route?.params?.isForm;

  const [updatedDocuments, setUpdatedDocuments] = useState<typeof documents>(documents ?? []);
  const [currentDocuments, setCurrentDocuments] = useState<number>(initialIndex ?? 0);
  const [singleItemWidth, setSingleItemWidth] = useState<number>(0);

  const styles = DocumentPreviewScreenStyles();
  const imagesPreviewStyles = ImagesPreviewScreenStyles();
  const editDocumentScreen = EditDocumentScreenStyles();

  const ListRef = useRef<ScrollView>(null);

  const onEditDocument = () => {
    navigation.navigate('EditDocumentScreen', {
      document: updatedDocuments[currentDocuments]?.uri ?? '',
    });
  };

  const removeCurrentImage = () => {
    const updatedArr = [...updatedDocuments].filter((_, index) => index !== currentDocuments);
    setUpdatedDocuments(updatedArr);
    const updatedIndex =
      currentDocuments < updatedArr?.length ? currentDocuments : updatedArr?.length - 1;
    setCurrentDocuments(updatedIndex);
    if (updatedIndex !== currentDocuments) {
      ListRef.current?.scrollTo({
        x: updatedIndex ? (updatedIndex + 1) * singleItemWidth : 0,
      });
    }
  };

  const renderRightComponent = () => {
    return <SvgIconButton icon={isEdit ? 'Pencil' : 'Trash'} style={[commonStyles.centerCenter]} />;
  };

  const onLayOut = (props: LayoutChangeEvent) => {
    const singleItemW = props?.nativeEvent?.layout?.width;
    setSingleItemWidth(singleItemW);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const singleItemW = event?.nativeEvent?.contentSize?.width / updatedDocuments?.length;
    const currentIndex = Math.floor(event?.nativeEvent?.contentOffset?.x / singleItemW);
    setCurrentDocuments(currentIndex >= 0 ? currentIndex : 0);
  };

  const headerText = useMemo(
    () => `${currentDocuments + 1} / ${updatedDocuments?.length}`,
    [currentDocuments, updatedDocuments],
  );

  const renderDocumentPreview = (item: Partial<DocumentPickerResponse>) => {
    const isPdf = item?.type?.includes('pdf');
    return isPdf ? (
      <View style={[commonStyles.centerCenter, styles.documentContainer]}>
        <Pdf
          minScale={1.0}
          maxScale={1.0}
          scale={1.0}
          spacing={0}
          fitPolicy={0}
          enablePaging={true}
          trustAllCerts={Platform.OS === 'ios'}
          source={{ uri: item?.uri }}
          style={[editDocumentScreen.pdfCanvas, commonStyles.centerCenter]}
        />{' '}
      </View>
    ) : (
      <View style={[commonStyles.centerCenter, styles.documentContainer]}>
        <SvgIconButton
          iconProps={{
            height: wp(20),
            width: wp(20),
          }}
          icon="ChatDocuments"
        />
        <BaseText style={[styles.documentName]}>{item?.name}</BaseText>
      </View>
    );
  };

  useEffect(() => {
    const updatedIndex = route?.params?.initialIndex;
    if (route?.params?.initialIndex?.toString() && singleItemWidth) {
      ListRef.current?.scrollTo({
        x: updatedIndex ? updatedIndex * singleItemWidth : 0,
      });
    }
  }, [route?.params?.initialIndex, singleItemWidth]);

  return (
    <View style={[commonStyles.flex, imagesPreviewStyles.container]}>
      <ScreenWrapper
        enableTopSafeArea={false}
        enableBottomSafeArea={false}
        style={[commonStyles.flex]}
        edges={['top']}
      >
        <DashBoardHeader
          renderLeftComponent={renderLeftComponent}
          containerStyle={[imagesPreviewStyles.headerContainerStyle]}
          headerText={headerText}
          {...(updatedDocuments?.length > 1 || isEdit
            ? {
                renderRightComponent,
                onPressRightIcon: isEdit ? onEditDocument : removeCurrentImage,
              }
            : { disableRightComponent: true })}
        />
        <View style={[commonStyles.flex]}>
          {updatedDocuments?.length && (
            <BaseScroll
              onLayout={onLayOut}
              onScroll={onScroll}
              horizontal
              pagingEnabled
              ref={ListRef}
            >
              {updatedDocuments?.map(renderDocumentPreview)}
            </BaseScroll>
          )}
        </View>
      </ScreenWrapper>
      {showChatInput && (
        <ChatFooter
          onlyText
          chatId={chatId}
          allowWithoutTextSend
          goBackAfterSend
          selectedMedia={updatedDocuments}
          isForm={isForm}
        />
      )}
    </View>
  );
};

export const DocumentPreviewScreenStyles = () =>
  useTheme(() => ({
    documentName: {
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.size_20,
      paddingHorizontal: mScale(24),
    },
    documentContainer: {
      width: wp(100),
      gap: mScale(14),
    },
  }));
