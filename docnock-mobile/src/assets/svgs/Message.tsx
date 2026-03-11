import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Message = (props: SvgProps) => {
  return (
    <Svg width={18} height={20} viewBox="0 0 18 20" fill="none" {...props}>
      <Path
        d="M14.572 3.872H9.687L7.41.662a.785.785 0 00-1.286.009L3.913 3.872h-.485A2.895 2.895 0 00.533 6.768v6.317a2.896 2.896 0 002.895 2.896H8.86l5.266 3.55c.605.41 1.39-.158 1.196-.86l-.746-2.69a2.896 2.896 0 002.893-2.896V6.768a2.895 2.895 0 00-2.896-2.896zM4.92 10.971a1.185 1.185 0 110-2.371 1.185 1.185 0 010 2.37zm4.08 0A1.185 1.185 0 119 8.6a1.185 1.185 0 010 2.37zm4.08 0a1.184 1.184 0 110-2.369 1.184 1.184 0 010 2.369z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
