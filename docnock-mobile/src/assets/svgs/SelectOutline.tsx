import * as React from 'react';
import Svg, { Circle, SvgProps } from 'react-native-svg';

export const SelectOutline = (props: SvgProps) => {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" {...props}>
      <Circle cx={10} cy={10} r={9.5} stroke={props?.color || '#fff'} strokeOpacity={0.5} />
    </Svg>
  );
};
