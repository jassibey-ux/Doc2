import React from 'react';
import { Alert, Modal, ModalProps, Pressable, StyleSheet, View } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { BlurView } from '@react-native-community/blur';
import { commonStyles } from '@styles';
import { useAppSelector, useTheme } from '@hooks';
import { hp, mScale } from '@utils';
import { BaseButton } from './button';

export type SignaturePopupProps = {
  onSignatureSubmit?: (sign: string) => void;
  onClose?: () => void;
} & ModalProps;

export const SignaturePopup = ({ onSignatureSubmit, onClose, ...props }: SignaturePopupProps) => {
  const colors = useAppSelector(state => state.theme.colors);
  const styles = Styles();

  const handleSignature = (signature: string) => {
    onSignatureSubmit?.(signature.replace('data:image/png;base64,', ''));
    onClose?.();
    Alert.alert('To add signature', 'Please tap on the PDF to place the signature you done.');
  };

  return (
    <Modal transparent onRequestClose={onClose} {...props}>
      <Pressable style={[commonStyles.flex, commonStyles.centerCenter]}>
        <BlurView
          blurType="dark"
          blurAmount={100}
          style={[commonStyles.flex, StyleSheet.absoluteFill]}
        />
        <View style={[commonStyles.centerCenter, styles.container]}>
          <Signature
            onOK={sig => handleSignature(sig)}
            clearText="Clear"
            confirmText="Save"
            style={[styles.signatureStyle]}
            webviewContainerStyle={styles.webViewStyle}
            backgroundColor={'transparent'}
            webStyle={colors.inputBackground}
            penColor={'#000000'}
          />
          <BaseButton title="Close" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      width: '90%',
      height: hp(60),
      backgroundColor: colors.primary,
      alignSelf: 'center',
      zIndex: 100,
      borderRadius: mScale(20),
    },
    webViewStyle: {
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signatureStyle: {
      width: '90%',
      maxHeight: hp(47),
      backgroundColor: colors.primary,
    },
  }));
