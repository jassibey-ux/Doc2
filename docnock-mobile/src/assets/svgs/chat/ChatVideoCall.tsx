import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatVideoCall = (props: SvgProps) => {
  return (
    <Svg width={24} height={16} viewBox="0 0 24 16" fill="none" {...props}>
      <Path
        d="M23.384 13.055V2.945a.857.857 0 00-1.394-.668l-2.463 1.977a.341.341 0 00-.128.267v6.958a.342.342 0 00.127.267l2.464 1.977a.857.857 0 001.394-.668zm-5.693-9.61v9.11a3.019 3.019 0 01-3.415 3.415H4.029a3.02 3.02 0 01-3.416-3.416V3.446A3.02 3.02 0 014.03.03h10.247a3.02 3.02 0 013.415 3.416z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
