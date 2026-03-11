import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAppSelector, useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { mScale } from '@utils';
import { ViewStyles } from '@types';

export type CenterLoaderProps = {
  visible?: boolean;
  containerStyle?: ViewStyles;
};

export const CenterLoader = ({ visible = false, containerStyle = {} }: CenterLoaderProps) => {
  const styles = Styles();
  const { secondary } = useAppSelector(state => state.theme.colors);

  return visible ? (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      style={[
        commonStyles.absoluteFill,
        commonStyles.centerCenter,
        styles.container,
        containerStyle,
      ]}
    >
      <View style={[commonStyles.centerCenter, styles.loaderContainer]}>
        <ActivityIndicator size="large" color={secondary} />
      </View>
    </Animated.View>
  ) : null;
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      backgroundColor: colors.primary + '55',
    },
    loaderContainer: {
      backgroundColor: colors.inputBackground,
      borderRadius: mScale(25),
      height: mScale(80),
      width: mScale(80),
    },
  }));
