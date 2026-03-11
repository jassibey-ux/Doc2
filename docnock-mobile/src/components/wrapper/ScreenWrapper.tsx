import React from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { ViewStyles } from '@types';
import { commonStyles } from '@styles';
import { useTheme } from '@hooks';
import { UI } from '@theme';
import { SafeAreaView, SafeAreaViewProps } from 'react-native-safe-area-context';

export type ScreenWrapperProps = SafeAreaViewProps & {
  containerStyle?: ViewStyles;
  enableTopSafeArea?: boolean;
  topSafeAreaViewStyle?: ViewStyles;
  enableBottomSafeArea?: boolean;
  bottomSafeAreaViewStyle?: ViewStyles;
  enableStatusBar?: boolean;
  enableOnAndroid?: boolean;
};

export const ScreenWrapper = ({
  enableBottomSafeArea = true,
  enableTopSafeArea = true,
  enableStatusBar = true,
  enableOnAndroid = true,
  ...props
}: ScreenWrapperProps) => {
  const styles = Styles();

  const Component = enableOnAndroid
    ? SafeAreaView
    : Platform.OS === 'android'
    ? View
    : SafeAreaView;

  return (
    <View style={[commonStyles.flex, styles.outerContainer, props?.containerStyle]}>
      {enableTopSafeArea && (
        <SafeAreaView
          edges={['top']}
          style={[styles.topSafeAreaViewStyle, props?.topSafeAreaViewStyle ?? {}]}
        />
      )}
      <Component {...props} style={[props?.style ?? {}]}>
        {props?.children}
      </Component>
      {enableBottomSafeArea && (
        <SafeAreaView
          edges={['bottom']}
          style={[styles.topSafeAreaViewStyle, props?.bottomSafeAreaViewStyle]}
        />
      )}
      {enableStatusBar && <StatusBar translucent backgroundColor={'transparent'} />}
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    outerContainer: {
      backgroundColor: colors.primary,
      paddingHorizontal: UI.screenPadding,
    },
    topSafeAreaViewStyle: {
      flex: 0,
      backgroundColor: colors.primary,
    },
  }));
