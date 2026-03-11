import React, { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useAppSelector, useTheme } from '@hooks';
import { FontSizes, FontWeights } from '@theme';
import { mScale, scale, vscale } from '@utils';
import { BaseText } from '../BaseText';
import { SvgIconButton } from '../button';
import { commonStyles } from '@styles';
import { BaseInputProps, BaseInputStyles } from './BaseInput';

export type FormInputProps = {
  renderOuterRightComponent?: () => JSX.Element;
  prefix?: string;
  suffix?: string;
} & BaseInputProps;

export const FormInput = React.forwardRef<TextInput, FormInputProps>(
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
      renderOuterRightComponent,
      overridePasswordVisibility,
      prefix,
      suffix,
      ...props
    }: FormInputProps,
    ref,
  ) => {
    const baseInputStyles = BaseInputStyles();
    const styles = FormInputStyles();
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
      <View style={[baseInputStyles.containerStyle, containerStyle]}>
        {title && <BaseText style={[baseInputStyles.title, titleStyle]}>{title}</BaseText>}
        <View style={[commonStyles.rowItemsCenter, commonStyles.flex]}>
          <View
            style={[
              styles.inputContainer,
              props?.multiline ? styles.multilineInputContainerStyle : {},
              error && baseInputStyles.errorInput,
              inputContainerStyle,
            ]}
          >
            {!!prefix && <BaseText style={[styles.inputTextStyle]}>{prefix}</BaseText>}
            <TextInput
              placeholderTextColor={colors.inputPlaceHolder}
              secureTextEntry={hidePassword}
              {...props}
              ref={ref}
              style={[
                styles.inputTextStyle,
                styles.inputStyle,
                props?.multiline ? styles.multilineInputStyle : {},
                props?.style,
              ]}
            />
            {!!suffix && <BaseText style={[styles.inputTextStyle]}>{suffix}</BaseText>}
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
          {renderOuterRightComponent && renderOuterRightComponent()}
        </View>
        {error && <BaseText style={baseInputStyles.error}>{error}</BaseText>}
      </View>
    );
  },
);

export const FormInputStyles = () =>
  useTheme(({ colors }) => ({
    inputContainer: {
      backgroundColor: colors.inputBackground,
      height: vscale(48),
      borderRadius: mScale(24),
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: scale(24),
      paddingRight: scale(18),
      gap: vscale(5),
      flex: 1,
    },
    inputTextStyle: {
      fontSize: FontSizes.size_16,
      fontWeight: FontWeights.regular,
      color: colors.text,
    },
    inputStyle: {
      flex: 1,
    },
    multilineInputStyle: {
      alignSelf: 'flex-start',
      marginVertical: mScale(8),
    },
    multilineInputContainerStyle: {
      minHeight: mScale(120),
    },
  }));
