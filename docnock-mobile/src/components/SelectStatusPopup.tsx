import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { mScale } from '@utils';
import { commonStyles } from '@styles';
import { useTheme } from '@hooks';
import { BaseButton } from './button';
import { PersonDetailPopupStyles } from './PersonDetailPopup';
import { UpdatedProfileType } from '@screens';

export type SelectStatusPopupProps = {
  visible?: boolean;
  selectedValue?: UpdatedProfileType['status'];
  onSelect?: (value: boolean) => void;
};

export const SelectStatusPopup = ({ visible, selectedValue, onSelect }: SelectStatusPopupProps) => {
  const styles = SelectStatusPopupStyles();
  const personDetailPopupStyles = PersonDetailPopupStyles();

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onSelect?.bind(this, !!selectedValue)}
      style={commonStyles.flex}
    >
      <Pressable
        onPress={onSelect?.bind(this, !!selectedValue)}
        style={[StyleSheet.absoluteFill, personDetailPopupStyles.backgroundContainer]}
      >
        <BlurView blurType="dark" blurAmount={100} style={[commonStyles.flex]} />
      </Pressable>
      <View style={personDetailPopupStyles.foregroundContainer}>
        <View style={styles.container}>
          <BaseButton
            title="Online"
            style={!selectedValue ? styles.buttonOutline : []}
            titleStyle={styles.buttonTitleStyle}
            onPress={onSelect?.bind(this, true)}
          />
          <BaseButton
            title="Offline"
            style={selectedValue ? styles.buttonOutline : []}
            titleStyle={styles.buttonTitleStyle}
            onPress={onSelect?.bind(this, false)}
          />
        </View>
      </View>
    </Modal>
  );
};

export const SelectStatusPopupStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      width: '88%',
      backgroundColor: colors.inputBackground,
      paddingVertical: mScale(24),
      borderRadius: mScale(17),
      alignItems: 'center',
      justifyContent: 'center',
      gap: mScale(10),
    },
    buttonTitleStyle: {
      textTransform: 'capitalize',
    },
    faxButtonStyle: {
      marginLeft: mScale(4),
    },
    buttonOutline: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: colors.text,
    },
  }));
