import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Pause = (props: SvgProps) => {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path fill="none" d="M0 0H24V24H0z" />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20 5v14a3 3 0 01-3 3h-1a3 3 0 01-3-3V5a3 3 0 013-3h1a3 3 0 013 3zM8 2a3 3 0 013 3v14a3 3 0 01-3 3H7a3 3 0 01-3-3V5a3 3 0 013-3h1z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
