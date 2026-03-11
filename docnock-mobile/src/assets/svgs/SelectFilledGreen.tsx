import * as React from 'react';
import Svg, { Circle, Path, SvgProps } from 'react-native-svg';

export const SelectFilledGreen = (props: SvgProps) => {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" {...props}>
      <Circle cx={10} cy={10} r={10} fill="#2F936D" />
      <Path
        d="M14.433 6a.76.76 0 00-.54.222l-5.141 5.142L6.45 9.062a.766.766 0 00-1.079 0l-.15.15a.766.766 0 000 1.079l2.953 2.953a.818.818 0 001.154 0l5.793-5.793a.766.766 0 000-1.079l-.15-.15a.76.76 0 00-.54-.222z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
