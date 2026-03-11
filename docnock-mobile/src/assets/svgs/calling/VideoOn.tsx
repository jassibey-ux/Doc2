import * as React from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';

export const VideoOn = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <G>
        <Path
          data-name="video-Filled"
          d="M16.25 10v4a4.505 4.505 0 01-4.5 4.5h-5a4.505 4.505 0 01-4.5-4.5v-4a4.505 4.505 0 014.5-4.5h5a4.505 4.505 0 014.5 4.5zm4.6-2.261a1.689 1.689 0 00-1.736.085l-1.14.76A.5.5 0 0017.75 9v6a.5.5 0 00.223.416l1.138.759a1.7 1.7 0 002.639-1.415V9.24a1.7 1.7 0 00-.901-1.501z"
          fill={props?.color ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
};
