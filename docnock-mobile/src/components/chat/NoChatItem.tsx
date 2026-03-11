import React from 'react';
import { View } from 'react-native';
import { SvgIconButton } from '../button';
import { BaseText } from '../BaseText';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';

export const NoChatItem = () => {
  const styles = Styles();
  return (
    <View style={[styles.container]}>
      <SvgIconButton icon="Chats" style={styles.icon} />
      <BaseText style={[styles.textCenter, styles.title]}>No Messages yet ...</BaseText>
      <BaseText
        style={[styles.textCenter, styles.subText]}
      >{`Send a message\nor make a call`}</BaseText>
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.inputBackground,
      paddingVertical: mScale(22),
      width: mScale(245),
      borderRadius: mScale(17),
      gap: mScale(10),
      alignItems: 'center',
    },
    icon: {
      opacity: 0.5,
    },
    textCenter: {
      textAlign: 'center',
    },
    title: {
      fontSize: FontSizes.size_18,
      fontWeight: FontWeights.bold,
    },
    subText: {
      fontSize: FontSizes.size_16,
      opacity: 0.5,
      marginHorizontal: mScale(64),
    },
  }));
