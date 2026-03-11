import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChevronLeft = (props: SvgProps) => {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M10.256 12.254l6.172-6.172a.9.9 0 000-1.276l-.54-.54a.901.901 0 00-1.277 0l-7.348 7.347a.911.911 0 000 1.281l7.342 7.341a.899.899 0 001.276 0l.541-.54a.9.9 0 000-1.277l-6.166-6.164z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
