import React, { FC } from 'react';
import { Text, TextProps } from 'react-native';
import { FontSizes, FontWeights } from '@theme';
import { useTheme } from '@hooks';

export const BaseText: FC<TextProps> = props => {
  const styles = BaseTextStyles();

  return (
    <Text {...props} style={[styles.baseText, props.style]}>
      {props.children}
    </Text>
  );
};

export const BaseTextStyles = () =>
  useTheme(({ colors }) => ({
    baseText: {
      fontSize: FontSizes.size_15,
      color: colors.text,
      fontWeight: FontWeights.regular,
    },
  }));
