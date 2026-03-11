import * as React from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';

export const MicOn = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <G>
        <Path
          data-name="microphone-Filled"
          d="M7.5 11V7a4.5 4.5 0 019 0v4a4.5 4.5 0 01-9 0zM20 11a1 1 0 00-2 0 6 6 0 01-12 0 1 1 0 00-2 0 8.008 8.008 0 007 7.931V20H8a1 1 0 000 2h8a1 1 0 000-2h-3v-1.069A8.008 8.008 0 0020 11z"
          fill={props?.color ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
};
