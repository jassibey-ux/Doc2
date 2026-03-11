import React, { useEffect } from 'react';
import { useAppSelector, useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { BaseInput, BaseInputProps } from './BaseInput';

export type SearchInputProps = {
  onChangeText: (text: string) => void;
  value: string;
  placeholder?: string;
  onSearchCallBack?: (value?: string) => Promise<void> | void;
  containerStyle?: BaseInputProps['containerStyle'];
  onClearSearch?: () => void;
  loading?: boolean;
} & BaseInputProps;

export const SearchInput = ({
  onChangeText,
  value,
  placeholder = 'Search...',
  onSearchCallBack,
  containerStyle,
  onClearSearch,
  loading,
  ...otherProps
}: SearchInputProps) => {
  const styles = Styles();
  const { colors } = useAppSelector(state => state.theme);

  useEffect(() => {
    let interval = null;
    if (value && onSearchCallBack) {
      interval = setTimeout(() => {
        onSearchCallBack(value);
      }, 400);
    }

    if (onClearSearch && !value) {
      onClearSearch();
    }

    return () => {
      interval && clearTimeout(interval);
    };
  }, [value, onSearchCallBack, onClearSearch]);

  return (
    <BaseInput
      placeholder={placeholder}
      onChangeText={onChangeText}
      value={value}
      placeholderTextColor={colors.inputPlaceHolder}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      rightIcon="Search"
      containerStyle={containerStyle}
      loading={loading}
      {...otherProps}
      style={[styles.searchInput, otherProps?.style]}
      inputContainerStyle={[styles.searchInputContainer, otherProps?.inputContainerStyle]}
    />
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    searchInputContainer: {
      backgroundColor: colors.searchInputBackground,
      borderRadius: mScale(10),
    },
    searchInput: {
      color: colors.text,
      fontSize: FontSizes.size_15,
      fontWeight: FontWeights.regular,
    },
  }));
