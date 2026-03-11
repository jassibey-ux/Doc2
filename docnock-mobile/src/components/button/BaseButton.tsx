import React from 'react';
import { TextProps, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { mScale, scale, vscale } from '@utils';
import { useTheme } from '@hooks';
import { FontSizes, FontWeights } from '@theme';
import { BaseText } from '../BaseText';

export type BaseButtonProps = {
  title: string;
  titleProps?: Omit<TextProps, 'children' | 'style'>;
  titleStyle?: TextProps['style'];
  fixWidth?: boolean;
} & TouchableOpacityProps;

export const BaseButton = ({ title, fixWidth = true, titleStyle, ...props }: BaseButtonProps) => {
  const styles = Styles();

  return (
    <TouchableOpacity
      activeOpacity={0.5}
      {...props}
      style={[styles.container, fixWidth ? styles.fixWidth : {}, props?.style]}
    >
      <BaseText style={[styles.title, titleStyle]}>{title}</BaseText>
    </TouchableOpacity>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.tint,
      height: vscale(48),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: mScale(24),
    },
    fixWidth: {
      width: scale(152),
    },
    title: {
      fontSize: FontSizes.size_16,
      textTransform: 'uppercase',
      color: colors.baseButtonColor,
      width: '100%',
      textAlign: 'center',
      fontWeight: FontWeights.semibold,
    },
  }));
