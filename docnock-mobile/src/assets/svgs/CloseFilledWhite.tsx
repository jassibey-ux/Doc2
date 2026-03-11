import * as React from 'react';
import Svg, { Defs, G, Path, SvgProps } from 'react-native-svg';

export const CloseFilledWhite = (props: SvgProps) => {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26" fill="none" {...props}>
      <G filter="url(#filter0_d_298_709)">
        <Path
          d="M6.636 15.364A9 9 0 1019.363 2.636 9 9 0 006.636 15.364zm3.15-8.64a.643.643 0 010-.938.643.643 0 01.907 0L13 8.094l2.275-2.308a.643.643 0 011.094.453c0 .17-.068.333-.187.453L13.907 9l2.276 2.276a.643.643 0 01-.907.906l-2.275-2.276-2.276 2.276a.651.651 0 01-1.076-.692.652.652 0 01.137-.214L12.094 9 9.786 6.724z"
          fill={props?.color || '#fff'}
        />
      </G>
      <Defs />
    </Svg>
  );
};
