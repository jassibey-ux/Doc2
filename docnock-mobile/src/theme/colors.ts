export type ThemeColors = {
  primary: string;
  secondary: string;
  tint: string;
  tintDark: string;
  tintLight: string;
  text: string;
  login_image_background: string;
  inputBackground: string;
  inputPlaceHolder: string;
  iconButtonBackground: string;
  searchInputBackground: string;
  nursingHomeIconBackground: string;
  messageIconBackground: string;
  messageBackground: string;
  ownMessageBackground: string;
  callGreen: string;
  callRed: string;
  loginGraphicTintColor: string;
  iconContrast: string;
  white: string;
  black: string;
  gray: string;
  grayLight: string;
  avatarColor: string;
  baseButtonColor: string;
  blackOpacity05: string;
  lavender: string;
  redOrange: string;
  smokeWhite: string;
};

export type AppColorsType = {
  dark: ThemeColors;
  light: ThemeColors;
};

export type ThemesType = 'light' | 'dark';

export const STATIC_COLORS = {
  // WhatsApp-like teal green
  tint: '#00A884',
  tintDark: '#008069',
  tintLight: '#25D366',
  callGreen: '#00A884',
  callRed: '#EF4444',
  messageIconBackground: '#00A884',
  white: '#FFFFFF',
  black: '#000000',
  blackOpacity05: 'rgba(0,0,0,0.5)',
  gray: '#8696A0',
  grayLight: '#667781',
  redOrange:'#EF4444',
  lavender:'#FFF5F5',
  smokeWhite:'#F0F2F5',
};

export const DarkThemeCoreColors = {
  primary: STATIC_COLORS.black,
  secondary: STATIC_COLORS.white,
  text: STATIC_COLORS.white,
};

export const LightThemeCoreColors = {
  primary: STATIC_COLORS.white,
  secondary: STATIC_COLORS.black,
  text: STATIC_COLORS.black,
};

export const AppColors: AppColorsType = {
  dark: {
    ...STATIC_COLORS,
    ...DarkThemeCoreColors,
    login_image_background: '#1F2C34',
    inputBackground: '#1F2C34',
    inputPlaceHolder: '#8696A0',
    iconButtonBackground: '#2A3942',
    searchInputBackground: '#2A3942',
    nursingHomeIconBackground: '#1F2C34',
    messageBackground: '#1F2C34',
    ownMessageBackground: '#005C4B',
    loginGraphicTintColor: '#1F2C34',
    iconContrast: DarkThemeCoreColors.secondary,
    avatarColor: '#8696A0',
    baseButtonColor: STATIC_COLORS.white,
  },
  light: {
    ...STATIC_COLORS,
    ...LightThemeCoreColors,
    login_image_background: '#F0F2F5',
    inputBackground: '#F0F2F5',
    inputPlaceHolder: '#667781',
    iconButtonBackground: '#F0F2F5',
    searchInputBackground: '#F0F2F5',
    nursingHomeIconBackground: '#F0F2F5',
    messageBackground: '#F3F4F6',
    ownMessageBackground: '#D9FDD3',
    loginGraphicTintColor: '#E8E8E8',
    iconContrast: LightThemeCoreColors.secondary,
    avatarColor: '#667781',
    baseButtonColor: STATIC_COLORS.white,
  },
};
