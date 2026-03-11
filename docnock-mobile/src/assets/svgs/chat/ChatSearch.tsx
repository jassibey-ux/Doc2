import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatSearch = (props: SvgProps) => {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none" {...props}>
      <Path
        d="M17.892 15.553l-4.212-4.212a7.406 7.406 0 10-2.044 2.144l4.162 4.162a1.48 1.48 0 102.094-2.094zm-10.487-3.14a5 5 0 110-10 5 5 0 010 10z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
