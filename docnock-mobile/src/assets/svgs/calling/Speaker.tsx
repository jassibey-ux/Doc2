import * as React from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';

export const Speaker = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <G>
        <Path
          data-name="volume-up-Filled"
          d="M13.5 6.511v10.978a2.976 2.976 0 01-1.749 2.732 3.016 3.016 0 01-1.261.279 2.972 2.972 0 01-1.941-.727l-2.594-2.225a.5.5 0 00-.324-.121h-.738a2.4 2.4 0 01-2.393-2.4V8.975a2.4 2.4 0 012.392-2.4h.739a.5.5 0 00.323-.12l2.6-2.226A3 3 0 0113.5 6.511zM16.8 8.4a1 1 0 10-1.6 1.2 4 4 0 010 4.792 1 1 0 001.6 1.208 6 6 0 000-7.208zm2.646-3.065a1 1 0 10-1.486 1.338 7.977 7.977 0 010 10.662 1 1 0 101.486 1.338 9.975 9.975 0 000-13.338z"
          fill={props?.color ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
};
