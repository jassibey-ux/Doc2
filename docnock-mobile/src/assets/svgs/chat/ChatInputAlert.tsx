import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatInputAlert = (props: SvgProps) => {
  return (
    <Svg width={4} height={18} viewBox="0 0 4 18" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.002 14.671c1.103 0 1.998.746 1.998 1.665C4 17.254 3.105 18 2.002 18 .895 18 0 17.254 0 16.336c0-.919.895-1.665 2.002-1.665zm0-2.97c-.84 0-1.531-.558-1.559-1.254L.046 1.345C.032.98.18.661.484.396A1.673 1.673 0 011.606 0h.788c.439 0 .817.135 1.126.396.305.265.452.584.434.95l-.392 9.101c-.033.696-.72 1.253-1.56 1.253z"
        fill={props.color || '#fff'}
        fillOpacity={props.fillOpacity || 0.5}
      />
    </Svg>
  );
};
