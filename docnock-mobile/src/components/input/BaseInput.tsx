import React, { useState } from 'react';
import { ActivityIndicator, TextInput, TextInputProps, TextProps, View } from 'react-native';
import { useAppSelector, useTheme } from '@hooks';
import { ViewStyles } from '@types';
import { FontSizes, FontWeights } from '@theme';
import { mScale, scale, vscale } from '@utils';
import { BaseText } from '../BaseText';
import { SvgIconButton, SvgIconButtonProps } from '../button';

export type BaseInputProps = {
  title?: string;
  containerStyle?: ViewStyles;
  inputContainerStyle?: ViewStyles;
  isPassword?: boolean;
  error?: string;
  rightIcon?: SvgIconButtonProps['icon'];
  onPressRightIcon?: () => void;
  loading?: boolean;
  titleStyle?: TextProps['style'];
  showPasswordIcon?: SvgIconButtonProps['icon'];
  hidePasswordIcon?: SvgIconButtonProps['icon'];
  onToggleVisibility?: (newValue: 'hide' | 'show') => void;
  renderInnerRightComponent?: () => JSX.Element;
  overridePasswordVisibility?: 'hide' | 'show';
} & TextInputProps;

export const BaseInput = React.forwardRef<TextInput, BaseInputProps>(
  (
    {
      title,
      containerStyle,
      inputContainerStyle,
      isPassword = false,
      error,
      rightIcon,
      onPressRightIcon,
      loading = false,
      titleStyle,
      showPasswordIcon = 'Eye',
      hidePasswordIcon = 'EyeOff',
      onToggleVisibility,
      renderInnerRightComponent,
      overridePasswordVisibility,
      ...props
    }: BaseInputProps,
    ref,
  ) => {
    const styles = BaseInputStyles();
    const colors = useAppSelector(state => state.theme.colors);

    const [hideText, setHideText] = useState(isPassword);

    const toggleText = () => {
      if (!overridePasswordVisibility) {
        setHideText(pre => !pre);
      }
      onToggleVisibility?.(overridePasswordVisibility === 'show' ? 'hide' : 'show');
    };

    const hidePassword =
      isPassword && (overridePasswordVisibility ? overridePasswordVisibility === 'hide' : hideText);

    return (
      <View style={[styles.containerStyle, containerStyle]}>
        {title && <BaseText style={[styles.title, titleStyle]}>{title}</BaseText>}
        <View style={[styles.inputContainer, error && styles.errorInput, inputContainerStyle]}>
          <TextInput
            placeholderTextColor={colors.inputPlaceHolder}
            secureTextEntry={hidePassword}
            {...props}
            ref={ref}
            style={[styles.inputStyle, props?.style]}
          />
          {isPassword && (
            <SvgIconButton
              icon={hidePassword ? hidePasswordIcon : showPasswordIcon}
              onPress={toggleText}
            />
          )}
          {rightIcon && <SvgIconButton icon={rightIcon} onPress={onPressRightIcon} />}
          {renderInnerRightComponent && renderInnerRightComponent()}
          {loading && <ActivityIndicator size="small" color={colors.secondary} />}
        </View>
        {error && <BaseText style={styles.error}>{error}</BaseText>}
      </View>
    );
  },
);

export const BaseInputStyles = () =>
  useTheme(({ colors }) => ({
    containerStyle: {
      width: '100%',
      gap: vscale(6),
    },
    inputContainer: {
      backgroundColor: colors.inputBackground,
      height: vscale(48),
      borderRadius: mScale(12),
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: scale(16),
      paddingRight: scale(14),
      gap: vscale(8),
    },
    title: {
      color: colors.text,
      fontSize: FontSizes.size_14,
      lineHeight: mScale(20),
      fontWeight: FontWeights.medium,
    },
    inputStyle: {
      fontSize: FontSizes.size_15,
      fontWeight: FontWeights.regular,
      color: colors.text,
      flex: 1,
    },
    eyeIcon: {
      height: mScale(20),
      width: mScale(20),
      opacity: 0.5,
      marginLeft: mScale(8),
    },
    error: {
      color: colors.redOrange,
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
      marginLeft: mScale(12),
    },
    errorInput: {
      borderWidth: 1.5,
      borderColor: colors.redOrange,
    },
  }));
