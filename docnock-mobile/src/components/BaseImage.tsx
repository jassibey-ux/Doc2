import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import FastImage, { FastImageProps } from 'react-native-fast-image';
import { createShimmerPlaceholder } from 'react-native-shimmer-placeholder';
import LinearGradient from 'react-native-linear-gradient';
import { ViewStyles } from '@types';
import { useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { Images } from '@assets';
import { checkIsLightTheme } from '@utils';

const Shimmer = createShimmerPlaceholder(LinearGradient);

export type BaseImageProps = FastImageProps & {
  containerStyle?: ViewStyles;
  withShimmer?: boolean;
  fallbackImageStyle?: FastImageProps['style'];
  fallbackContainerStyle?: ViewStyles;
  borderRadius?: number;
};

export const BaseImage = ({
  containerStyle,
  withShimmer = false,
  fallbackImageStyle = {},
  fallbackContainerStyle = {},
  borderRadius,
  ...props
}: BaseImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const styles = Styles();

  const onError = () => {
    setIsError(true);
    setLoaded(true);
  };

  const defaultImageStyle: FastImageProps['style'] = useMemo(() => {
    return {
      borderRadius,
    };
  }, [borderRadius]);

  return (
    <View style={[containerStyle, isError ? fallbackContainerStyle : {}]}>
      <FastImage
        onLoad={setLoaded.bind(this, true)}
        onError={onError}
        // defaultSource={
        //   checkIsLightTheme() ? Images.avatar_placeholder_light : Images.avatar_placeholder
        // }
        {...props}
        style={[
          commonStyles.flex,
          defaultImageStyle,
          isError ? fallbackImageStyle : {},
          props?.style,
        ]}
      />
      {withShimmer && !loaded && <Shimmer shimmerStyle={[styles.shimmer, defaultImageStyle]} />}
    </View>
  );
};

const Styles = () =>
  useTheme(({}) => ({
    shimmer: {
      position: 'absolute',
      zIndex: 1,
      height: '100%',
      width: '100%',
    },
  }));
