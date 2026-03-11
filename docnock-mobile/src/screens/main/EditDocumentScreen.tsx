import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import RNFS, { readFile } from 'react-native-fs';
import Pdf from 'react-native-pdf';
import { PDFDocument } from 'pdf-lib';
import {
  BaseButton,
  DashBoardHeader,
  ScreenWrapper,
  SignaturePopup,
  SvgIconButton,
} from '@components';
import { useCustomRoute } from '@navigation';
import { useTheme } from '@hooks';
import { devLogger, mScale, scale, wp } from '@utils';
import { setLoader } from '@store';
import { commonStyles } from '@styles';
import { renderLeftComponent } from './AllNurseList';

type DimensionType = {
  width: number;
  height: number;
};

const generateId = () => {
  const length = 5;
  const randomNo = Math.floor(Math.pow(10, length) + Math.random() * 9 * Math.pow(10, length));
  return randomNo;
};

export const EditDocumentScreen = () => {
  const params = useCustomRoute<'EditDocumentScreen'>().params;
  const document = params?.document;

  const [filePath, setFilePath] = useState(document);
  const [pdfDimensions, setPdfDimensions] = useState<DimensionType>({ width: 0, height: 0 });
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer>();
  const [showSignModal, setShowSignModal] = useState(false);

  const [signature, setSignature] = useState<string>('');

  const styles = EditDocumentScreenStyles();

  const _base64ToArrayBuffer = useCallback((base64: string) => {
    try {
      const binary_string = atob(base64);
      const len = binary_string.length;
      const chunkSize = 1024 * 1024; // 1MB chunks (adjust as needed)
      const chunks = [];
      let offset = 0;

      while (offset < len) {
        const end = Math.min(offset + chunkSize, len);
        const chunk = binary_string.slice(offset, end);
        const bytes = new Uint8Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          bytes[i] = chunk.charCodeAt(i);
        }
        chunks.push(bytes);
        offset = end;
      }

      // Combine the chunks into a single Uint8Array
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let resultOffset = 0;
      for (const chunk of chunks) {
        result.set(chunk, resultOffset);
        resultOffset += chunk.length;
      }

      return result.buffer;
    } catch (error) {
      devLogger('🚀 ~ const_base64ToArrayBuffer=useCallback ~ error:', error);
    }
  }, []);

  useEffect(() => {
    if (filePath) {
      const path = `${RNFS.DocumentDirectoryPath}/${generateId()}.pdf`;
      RNFS.downloadFile({ fromUrl: filePath, toFile: path }).promise.then(() => {
        readFile(path, 'base64')
          .then(contents => {
            setPdfArrayBuffer(_base64ToArrayBuffer(contents));
          })
          .catch(err => {
            devLogger('🚀 ~ useEffect ~ err:', err);
          });
      });
    }
  }, [_base64ToArrayBuffer, filePath]);

  const onShowSignModal = () => {
    setShowSignModal(true);
  };

  const handleCloseSignaturePopup = () => {
    setShowSignModal(false);
  };

  const renderRightComponent = () => {
    return <SvgIconButton icon="Signature" />;
  };

  const onSignatureSubmit = (sign: string) => {
    setSignature(sign);
  };

  const _uint8ToBase64 = (u8Arr: Uint8Array<ArrayBufferLike>) => {
    const CHUNK_SIZE = 0x8000;
    let index = 0;
    const length = u8Arr.length;
    let result = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let slice: any;
    while (index < length) {
      slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length));
      result += String?.fromCharCode?.apply(null, slice);
      index += CHUNK_SIZE;
    }
    return btoa(result);
  };

  const handleSingleTap = async (page: number, x: number, y: number) => {
    try {
      setLoader(true);
      const pageWidth = pdfDimensions?.width;
      const pageHeight = pdfDimensions?.height;
      const pdfDoc = await PDFDocument.load(pdfArrayBuffer ?? '');
      const pages = pdfDoc.getPages();
      const firstPage = pages[page - 1];
      const signatureImage = await pdfDoc.embedPng(_base64ToArrayBuffer(signature) ?? '');
      const sigDimensions = signatureImage.scale(0.1);
      if (Platform.OS === 'ios') {
        firstPage.drawImage(signatureImage, {
          x: (pageWidth * (x - 12)) / wp(100),
          y: pageHeight - (pageHeight * (y + 12)) / 540,
          width: sigDimensions.width,
          height: sigDimensions.height,
        });
      } else {
        firstPage.drawImage(signatureImage, {
          x: (firstPage.getWidth() * x) / pageWidth,
          y: firstPage.getHeight() - (firstPage.getHeight() * y) / pageHeight - 25,
          width: sigDimensions.width,
          height: sigDimensions.height,
        });
      }
      const pdfBytes = await pdfDoc.save();
      const _pdfBase64 = _uint8ToBase64(pdfBytes);
      const path = `${RNFS.DocumentDirectoryPath}/react-native_signed_${generateId()}.pdf`;

      RNFS.writeFile(path, _pdfBase64, 'base64')
        .then(async () => {
          setLoader(false);
          setFilePath(path);
          Alert.alert('done !!');
          // const contents = await readFile(path);
          // setPdfBase64(contents);
          // setPdfArrayBuffer(_base64ToArrayBuffer(contents));
          // if (signatureBase64) {
          //   setSignatureArrayBuffer(_base64ToArrayBuffer(signatureBase64));
          // }
          // setFilePath(path);
          // setPdfArrayBuffer(_base64ToArrayBuffer(contents));
          // setPdfBase64(_pdfBase64);
        })
        .catch(err => {
          setLoader(false);
          devLogger('err writeFile', err.message);
          Alert.alert('Failed to save edited file');
        });
    } catch (error) {
      setLoader(false);
      devLogger('🚀 ~ handleSingleTap ~ error:', error);
    }
  };

  return (
    <>
      <ScreenWrapper
        enableBottomSafeArea={false}
        enableTopSafeArea={false}
        style={[commonStyles.flex]}
      >
        <DashBoardHeader
          renderLeftComponent={renderLeftComponent}
          renderRightComponent={renderRightComponent}
          containerStyle={[styles.headerContainerStyle]}
          headerText="Edit Document"
          onPressRightIcon={onShowSignModal}
        />
        <View style={[commonStyles.flex]}>
          <Pdf
            minScale={1.0}
            maxScale={1.0}
            scale={1.0}
            spacing={0}
            fitPolicy={0}
            enablePaging={true}
            trustAllCerts={Platform.OS === 'ios'}
            source={{ uri: filePath }}
            onLoadComplete={(_, __, size) => {
              setPdfDimensions(size);
            }}
            onPageSingleTap={(page, x, y) => {
              handleSingleTap(page, x, y);
            }}
            style={styles.pdfCanvas}
          />
        </View>
        <BaseButton title="Update" style={styles.submitButton} />
      </ScreenWrapper>
      <SignaturePopup
        visible={showSignModal}
        onClose={handleCloseSignaturePopup}
        onSignatureSubmit={onSignatureSubmit}
      />
    </>
  );
};

export const EditDocumentScreenStyles = () =>
  useTheme(({ colors }) => ({
    pdfCanvas: {
      backgroundColor: colors.primary,
      height: '90%',
      width: wp(90),
      alignSelf: 'center',
    },
    headerContainerStyle: {
      marginHorizontal: scale(22),
      marginTop: mScale(16),
      marginBottom: mScale(8),
    },
    submitButton: {
      alignSelf: 'center',
      // marginVertical: mScale(24),
    },
  }));
