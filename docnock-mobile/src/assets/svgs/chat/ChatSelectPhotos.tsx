import * as React from 'react';
import Svg, { G, Mask, Path, SvgProps } from 'react-native-svg';
import { maskStyle } from './ChatSend';

export const ChatSelectPhotos = (props: SvgProps) => {
  return (
    <Svg width={28} height={29} viewBox="0 0 28 29" fill="none" {...props}>
      <Mask id="a" style={maskStyle} maskUnits="userSpaceOnUse" x={0} y={0} width={28} height={29}>
        <Path d="M0 .625h28v28H0v-28z" fill="#fff" />
      </Mask>
      <G mask="url(#a)" fill={'#56C186'}>
        <Path d="M5.95 15.091a1.983 1.983 0 113.967 0 1.983 1.983 0 01-3.967 0z" />
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12.03 2.233a4.375 4.375 0 00-5.358 3.093l-.242.905a.875.875 0 101.69.453l.243-.905a2.625 2.625 0 013.215-1.856l11.269 3.02a2.625 2.625 0 011.856 3.215l-2.416 9.015a2.62 2.62 0 01-.412.865v-6.58A4.375 4.375 0 0017.5 9.083H5.834a4.375 4.375 0 00-4.375 4.375v9.333a4.375 4.375 0 004.374 4.375H17.5a4.375 4.375 0 004.375-4.375v-.472c1-.555 1.783-1.5 2.103-2.693l2.415-9.016A4.375 4.375 0 0023.3 5.253l-11.27-3.02zm-6.196 8.6a2.625 2.625 0 00-2.625 2.625v9.14c.155-.303.37-.586.616-.832l1.938-1.937a1.75 1.75 0 012.475 0l2.029 2.029 4.829-4.83a1.75 1.75 0 012.475 0l2.554 2.555v-6.125a2.625 2.625 0 00-2.625-2.625H5.834z"
        />
      </G>
    </Svg>
  );
};
