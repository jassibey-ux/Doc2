import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatCall = (props: SvgProps) => {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" {...props}>
      <Path
        d="M14.326 9.884a8.55 8.55 0 01-2.685-.428 1.227 1.227 0 00-1.194.252l-1.693 1.278A9.357 9.357 0 014.547 6.78l1.241-1.649a1.217 1.217 0 00.3-1.233 8.563 8.563 0 01-.429-2.689A1.21 1.21 0 004.45 0H1.684A1.21 1.21 0 00.476 1.208a13.866 13.866 0 0013.85 13.85 1.21 1.21 0 001.208-1.208v-2.757a1.21 1.21 0 00-1.208-1.209z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
