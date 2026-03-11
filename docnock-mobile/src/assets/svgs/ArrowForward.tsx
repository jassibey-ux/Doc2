import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ArrowForward = (props: SvgProps) => {
  return (
    <Svg width={22} height={18} viewBox="0 0 22 18" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M.002 9.15a1.262 1.262 0 011.26-1.261h18.503a1.262 1.262 0 010 2.523H1.263A1.262 1.262 0 01.003 9.15z"
        fill={props?.color || '#fff'}
      />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.304.69a1.262 1.262 0 011.784 0l7.569 7.567a1.262 1.262 0 010 1.784l-7.57 7.57a1.262 1.262 0 11-1.784-1.784L17.98 9.15l-6.677-6.677A1.262 1.262 0 0111.304.69z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
