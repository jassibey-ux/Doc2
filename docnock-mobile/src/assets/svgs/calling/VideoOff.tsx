import * as React from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';

export const VideoOff = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <G>
        <Path
          data-name="video-slash-Filled"
          d="M3.134 16.579A4.451 4.451 0 012.312 14v-4a4.505 4.505 0 014.5-4.5h5a4.278 4.278 0 011.867.42.5.5 0 01.137.8L3.9 16.644a.505.505 0 01-.354.146h-.042a.5.5 0 01-.37-.211zM20.853 7.85a1.561 1.561 0 00-1.608.078l-1.141.76a.377.377 0 00-.167.312v6a.377.377 0 00.167.312l1.14.759a1.572 1.572 0 002.443-1.311V9.24a1.57 1.57 0 00-.834-1.39zm-.333-3.143a1 1 0 00-1.415-1.414l-16 16a1 1 0 001.415 1.414l2.215-2.216c.028 0 .05.009.077.009h5a4.5 4.5 0 004.5-4.5v-4a4.507 4.507 0 00-.108-.977z"
          fill={props?.color ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
};
