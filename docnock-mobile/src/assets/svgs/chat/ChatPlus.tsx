import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatPlus = (props: SvgProps) => {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.8 7.8H1.2a1.2 1.2 0 000 2.4h6.6v6.6a1.2 1.2 0 002.4 0v-6.6h6.6a1.2 1.2 0 000-2.4h-6.6V1.2a1.2 1.2 0 00-2.4 0v6.6z"
        fill={props?.color || '#fff'}
        fillOpacity={0.5}
      />
    </Svg>
  );
};
