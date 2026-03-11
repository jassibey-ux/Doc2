import React from 'react';
import { StatusBar } from 'react-native';
import { Images } from '@assets';
import { useAuthModuleStyles, commonStyles } from '@styles';
import { ScreenWrapper } from './ScreenWrapper';
import { AuthHeader } from '../header';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import { vscale } from '@utils';
import { BaseImage } from '../BaseImage';
import { useAppSelector } from '@hooks';

export type useWrapAuthScreenProps = [isSignUp: boolean, title?: string, disableBack?: boolean];

export const useWrapAuthScreen: (
  ...props: [children: React.ReactNode, ...useWrapAuthScreenProps]
) => JSX.Element = (children = <></>, isSignUp = false, title, disableBack) => {
  const styles = useAuthModuleStyles();
  const theme = useAppSelector(state => state.theme);

  return (
    <>
      <BaseImage
        source={isSignUp ? Images.signup_background_doodles : Images.login_background_doodles}
        containerStyle={[commonStyles.absoluteFill, styles.backgroundImage]}
        resizeMode="contain"
        tintColor={theme.colors.loginGraphicTintColor}
      />
      <ScreenWrapper
        containerStyle={styles.container}
        topSafeAreaViewStyle={styles.topSafeAreaViewStyle}
        bottomSafeAreaViewStyle={styles.bottomSafeAreaViewStyle}
        style={commonStyles.flex}
        edges={['top']}
        enableTopSafeArea={false}
        enableOnAndroid={false}
      >
        {!isSignUp && !!title && (
          <AuthHeader
            title={title}
            containerStyle={styles.authHeaderContainer}
            disableBack={disableBack}
          />
        )}
        {children}
      </ScreenWrapper>
      {/* </KeyboardAwareScrollView> */}
      <StatusBar translucent backgroundColor={'transparent'} />
    </>
  );
};

export const KeyboardAwareWrapper = ({ children, ...otherProps }: KeyboardAwareScrollViewProps) => {
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={commonStyles.flexGrow}
      extraKeyboardSpace={-vscale(30)}
      bounces={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...otherProps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
};
