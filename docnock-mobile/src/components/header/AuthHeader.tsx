import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@hooks';
import { FontSizes, FontWeights } from '@theme';
import { ViewStyles } from '@types';
import { commonStyles } from '@styles';
import { BaseText } from '../BaseText';
import { SvgIconButton } from '../button';
import { mScale } from '@utils';
import { useCustomNavigation } from '@navigation';

export type AuthHeaderProps = {
  title?: string;
  containerStyle?: ViewStyles;
  disableBack?: boolean;
};

export const AuthHeader = ({
  title,
  disableBack = false,
  containerStyle = {},
}: AuthHeaderProps) => {
  const styles = Styles();
  const navigation = useCustomNavigation();

  const onBackPress = () => {
    navigation.goBack();
  };

  // const onInfoPress = () => {
  //   navigation.navigate('ResetPasswordScreen');
  // };

  return (
    <View style={[commonStyles.rowItemCenterJustifyBetween, containerStyle]}>
      {!disableBack && (
        <SvgIconButton
          icon="ChevronLeft"
          style={[styles.buttonStyle, styles.leftButton]}
          onPress={onBackPress}
        />
      )}
      {title && <BaseText style={styles.title}>{title}</BaseText>}
    </View>
  );
};

const Styles = () =>
  useTheme(() => ({
    title: {
      fontSize: FontSizes.size_20,
      fontWeight: FontWeights.semibold,
      position: 'absolute',
      alignSelf: 'center',
      textAlign: 'center',
      top: 0,
      left: '20%',
      right: '20%',
    },
    buttonStyle: {
      position: 'absolute',
      top: 0,
    },
    leftButton: {
      left: mScale(24),
    },
    rightButton: {
      right: mScale(24),
    },
  }));
