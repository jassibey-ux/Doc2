import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Expand = (props: SvgProps) => {
  return (
    <Svg width="20px" height="20px" viewBox="0 0 24 24" {...props}>
      <Path
        d="M2 21V11a1 1 0 012 0v7.586L18.586 4H11a1 1 0 010-2h10a1 1 0 011 1v10a1 1 0 01-2 0V5.414L5.414 20H13a1 1 0 010 2H3a1 1 0 01-1-1z"
        fill={props?.color ?? '#FFFFFF'}
      />
    </Svg>
  );
};
