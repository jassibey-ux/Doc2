import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Search = (props: SvgProps) => {
  return (
    <Svg width={22} height={21} viewBox="0 0 22 21" fill="none" {...props}>
      <Path
        d="M21.496 18.052l-4.89-4.891A8.596 8.596 0 009.322 0 8.596 8.596 0 00.726 8.595a8.595 8.595 0 0013.505 7.055l4.833 4.833c.336.335.776.502 1.216.502a1.716 1.716 0 001.215-2.934zM9.322 14.407a5.81 5.81 0 110-11.621 5.81 5.81 0 010 11.62z"
        fill={props?.color || '#fff'}
        fillOpacity={0.5}
      />
    </Svg>
  );
};
