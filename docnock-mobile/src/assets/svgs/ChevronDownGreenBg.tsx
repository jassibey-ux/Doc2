import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChevronDownGreenBg = (props: SvgProps) => {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14 0c7.732 0 14 6.268 14 14s-6.268 14-14 14S0 21.732 0 14 6.268 0 14 0zM9.649 11.727a.875.875 0 10-1.238 1.238l4.95 4.95c.158.157.36.242.567.255h.141a.872.872 0 00.567-.255l4.95-4.95a.875.875 0 00-1.237-1.238l-4.35 4.35-4.35-4.35z"
        fill={props?.color || '#2F936D'}
      />
    </Svg>
  );
};
