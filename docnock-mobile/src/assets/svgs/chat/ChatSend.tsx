import * as React from 'react';
import Svg, { G, Mask, MaskProps, Path, SvgProps } from 'react-native-svg';

export const maskStyle: MaskProps['style'] = {
  maskType: 'luminance',
};

export const ChatSend = (props: SvgProps) => {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" {...props}>
      <Mask id="a" style={maskStyle} maskUnits="userSpaceOnUse" x={0} y={0} width={20} height={20}>
        <Path d="M0 0h20v20H0V0z" fill={props?.color || '#fff'} />
      </Mask>
      <G mask="url(#a)">
        <Path
          d="M3.415.189a1 1 0 011.1-.046l15 9a1 1 0 010 1.715l-15 9a1.001 1.001 0 01-1.491-1.074L4.753 11H10a1 1 0 000-2H4.753l-1.73-7.783A1 1 0 013.416.189z"
          fill={props?.color || '#fff'}
        />
      </G>
    </Svg>
  );
};
