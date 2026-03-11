import * as React from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';

export const MicOff = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <G>
        <Path
          data-name="microphone-slash-Filled"
          d="M10.275 15.139l-1.129 1.129A5.986 5.986 0 0018 11a1 1 0 012 0 8.008 8.008 0 01-7 7.931V20h3a1 1 0 010 2H8a1 1 0 010-2h3v-1.07a7.972 7.972 0 01-3.313-1.2l-2.98 2.98a1 1 0 01-1.414-1.414l16-16a1 1 0 111.414 1.414L16.5 8.914V11a4.505 4.505 0 01-4.5 4.5 4.443 4.443 0 01-1.725-.361zM7.957 12.38a.507.507 0 00.5-.126l7.179-7.181a.5.5 0 00.058-.637A4.5 4.5 0 007.5 7v4a4.932 4.932 0 00.11 1 .5.5 0 00.347.38zm-2.176 2.84a.985.985 0 00.461-.114 1 1 0 00.425-1.348A5.983 5.983 0 016 11a1 1 0 00-2 0 8 8 0 00.893 3.682 1 1 0 00.888.538z"
          fill={props?.color ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
};
