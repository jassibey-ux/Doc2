import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Play = (props: SvgProps) => {
  return (
    <Svg width={20} height={20} viewBox="-1 0 12 12" {...props}>
      <Path
        d="M18.074 3650.733l-5.766 3.898c-1.405.95-3.308-.047-3.308-1.733v-7.796c0-1.686 1.903-2.683 3.308-1.733l5.766 3.898a2.088 2.088 0 010 3.466"
        transform="translate(-65 -3803) translate(56 160)"
        fill={props?.color || '#FFFFFF'}
        stroke="none"
        strokeWidth={1}
        fillRule="evenodd"
      />
    </Svg>
  );
};
