import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const CheckBold = (props: SvgProps) => {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" {...props}>
      <Path
        d="M16.972 6.251a1.999 1.999 0 00-2.72.777l-3.713 6.682-2.125-2.125a2 2 0 10-2.828 2.828l4 4c.378.379.888.587 1.414.587l.277-.02a2 2 0 001.471-1.009l5-9a2 2 0 00-.776-2.72z"
        fill={props?.color || '#2F936D'}
      />
    </Svg>
  );
};
