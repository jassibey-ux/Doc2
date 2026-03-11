/* eslint-disable @typescript-eslint/no-explicit-any */
import { ImageStyle, TextStyle } from 'react-native';
import { ThemeSliceValues } from '@store';
import { ViewStyles } from '@types';
import { useAppSelector } from './reduxHooks';

export type NamedStyles<T> = {
  [P in keyof T]: ViewStyles | TextStyle | ImageStyle;
};

//TODO: Add proper type for func argument and return type
export const useTheme = <T extends (args: ThemeSliceValues) => NamedStyles<T> | NamedStyles<any>>(
  func: T,
): ReturnType<T> => {
  const themeValues = useAppSelector(state => state.theme);
  return func(themeValues) as any;
};
