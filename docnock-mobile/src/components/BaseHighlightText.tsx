import React, { FC } from 'react';
import { TextProps } from 'react-native';
import { BaseTextStyles } from './BaseText';
import HighlightText from '@sanar/react-native-highlight-text';
import { useTheme } from '@hooks';
import { FontWeights } from '@theme';

export type BaseHighlightTextProps = {
  searchWords?: string[];
  textToHighlight: string;
  style?: TextProps['style'];
  highlightBGColor?: string;
  highlightTextColor?: string;
};

export const BaseHighlightText: FC<BaseHighlightTextProps> = ({
  searchWords = [''],
  textToHighlight = '',
  style,
  highlightBGColor,
  highlightTextColor,
}) => {
  const baseTextStyles = BaseTextStyles();
  const styles = Styles();

  return (
    <HighlightText
      {...{ searchWords, textToHighlight }}
      style={[baseTextStyles.baseText, style]}
      highlightStyle={{
        ...styles.container,
        ...(highlightBGColor ? { backgroundColor: highlightBGColor } : {}),
        ...(highlightTextColor ? { color: highlightTextColor } : {}),
      }}
    />
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.secondary,
      color: colors.primary,
      fontWeight: FontWeights.bold,
    },
  }));
