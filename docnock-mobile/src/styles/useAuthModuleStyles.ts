import { useTheme } from '@hooks';
import { FontSizes, FontWeights } from '@theme';
import { mScale, scale, vscale } from '@utils';
import { StatusBar } from 'react-native';

const StatusBarHeight = StatusBar.currentHeight || 0;

export const useAuthModuleStyles = () =>
  useTheme(({ colors }) => ({
    topSafeAreaViewStyle: {
      backgroundColor: 'transparent',
    },
    bottomSafeAreaViewStyle: {
      backgroundColor: colors.primary,
    },
    backgroundImage: {
      zIndex: -1,
      height: '100%',
      width: '100%',
      backgroundColor: colors.login_image_background,
    },
    authHeaderContainer: {
      marginVertical: mScale(16),
      paddingHorizontal: mScale(22),
    },
    container: {
      backgroundColor: 'transparent',
      justifyContent: 'flex-end',
      paddingTop: StatusBarHeight,
    },
    loginGraphic: {
      width: '100%',
      height: vscale(241.67),
      alignSelf: 'center',
    },
    contentContainer: {
      backgroundColor: colors.primary,
      paddingHorizontal: scale(28),
      borderTopLeftRadius: mScale(43),
      borderTopRightRadius: mScale(43),
    },
    headingText: {
      fontSize: FontSizes.size_20,
      fontWeight: FontWeights.semibold,
      lineHeight: mScale(26),
      marginTop: mScale(24),
      marginBottom: mScale(21),
      alignSelf: 'center',
    },
    signupHeadingText: {
      marginTop: 0,
      marginBottom: 0,
      alignSelf: 'flex-start',
      marginLeft: mScale(8),
    },
    resetPasswordHeadingText: {
      marginBottom: mScale(44),
    },
    emailInput: {
      marginBottom: mScale(24),
    },
    forgotPasswordText: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.regular,
      lineHeight: mScale(18),
      marginTop: mScale(12),
      marginBottom: mScale(28),
      alignSelf: 'flex-end',
      textDecorationLine: 'underline',
    },
    createAccountText: {
      alignSelf: 'center',
      marginTop: mScale(24),
      marginBottom: mScale(16),
      lineHeight: vscale(18),
    },
    noAccountText: {
      opacity: 0.5,
      textDecorationLine: 'none',
    },
    signUpText: {
      color: colors.tint,
      fontWeight: FontWeights.semibold,
    },
    loginButton: {
      marginBottom: mScale(8),
      alignSelf: 'center',
    },
    forgotPasswordEmailInput: {
      marginBottom: mScale(38),
    },
    resetPasswordEmailInput: {
      marginBottom: mScale(42),
    },
    centerGraphic: {
      flex: 1,
    },
    forgotPasswordGraphic: {
      height: vscale(259),
      width: vscale(301),
    },
    resetPasswordGraphic: {
      height: vscale(235),
      width: vscale(315.34),
    },
    uploadProfilePic: {
      height: mScale(80),
      width: mScale(80),
      marginRight: mScale(10),
    },
    roundedImage: {
      borderRadius: mScale(80),
      overflow: 'hidden',
    },
    signupTopGraphic: {
      height: vscale(164.69),
      width: scale(127.62),
    },
    profilePhotoContainer: {
      marginTop: mScale(22),
      marginBottom: -mScale(8),
      marginRight: mScale(36),
      marginLeft: mScale(24),
      height: vscale(164.69),
    },
    loginPasswordInputStyle: {
      marginBottom: mScale(0),
    },
    row: {
      flexDirection: 'row',
    },
  }));
