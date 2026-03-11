import React from 'react';
import { ViewStyle } from 'react-native';
import { FormikConfig, FormikValues, useFormik } from 'formik';
import { BaseInput, BaseInputProps } from '@components';
import { useAuthModuleStyles } from '@styles';
import { mScale } from '@utils';

export type AuthFormProps = FormikConfig<FormikValues>;
export type RenderInputProps = [
  field: string,
  title?: string,
  placeholder?: string,
  inputStyle?: ViewStyle,
  isPassword?: boolean,
  keyboardProps?: BaseInputProps,
];

export const useAuthForm = (props: AuthFormProps) => {
  const formikValues = useFormik(props);
  const styles = useAuthModuleStyles();

  const renderInput = (...inputProps: RenderInputProps) => {
    const [field, title, placeholder, inputStyle, isPassword = false, keyboardProps = {}] =
      inputProps;

    const error = formikValues?.touched?.[field]
      ? formikValues?.errors?.[field]?.toString()
      : undefined;

    const style = {
      ...styles.emailInput,
      ...(inputStyle ? inputStyle : {}),
    };
    const errorStyle = {
      marginBottom: style.marginBottom ? Number(style.marginBottom) - mScale(10) : 0,
    };

    return (
      <BaseInput
        title={title ?? field}
        placeholder={placeholder ?? 'Enter detail'}
        value={formikValues.values[field]}
        onChangeText={formikValues.handleChange(field)}
        onBlur={formikValues.handleBlur(field)}
        error={error}
        isPassword={isPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        {...keyboardProps}
        containerStyle={[style, error ? errorStyle : {}]}
      />
    );
  };

  return { ...formikValues, renderInput };
};
