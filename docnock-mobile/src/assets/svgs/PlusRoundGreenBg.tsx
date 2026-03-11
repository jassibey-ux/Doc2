import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const PlusRoundGreenBg = (props: SvgProps) => {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36" fill="none" {...props}>
      <Path
        d="M18 0C8.074 0 0 8.074 0 18s8.074 18 18 18 18-8.074 18-18S27.926 0 18 0zm7.875 19.5H19.5v6.375a1.5 1.5 0 01-3 0V19.5h-6.375a1.5 1.5 0 010-3H16.5v-6.375a1.5 1.5 0 013 0V16.5h6.375a1.5 1.5 0 010 3z"
        fill="#2F936D"
      />
    </Svg>
  );
};
