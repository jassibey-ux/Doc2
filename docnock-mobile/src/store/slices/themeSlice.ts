import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AppColors, ThemeColors, ThemesType } from '@theme';

export type ThemeSliceValues = {
  theme: ThemesType;
  colors: ThemeColors;
};

const DEFAULT_THEME: ThemesType = 'dark';
const InitialThemeState: ThemeSliceValues = {
  theme: DEFAULT_THEME,
  colors: AppColors[DEFAULT_THEME],
};

const themeSlice = createSlice({
  name: 'theme',
  initialState: InitialThemeState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemesType>) => {
      const theme = action.payload ?? DEFAULT_THEME;
      const colors = AppColors?.[action.payload ?? DEFAULT_THEME];

      return {
        ...state,
        theme,
        colors,
      };
    },
  },
});

export { InitialThemeState, themeSlice };
export const { setTheme } = themeSlice.actions;
