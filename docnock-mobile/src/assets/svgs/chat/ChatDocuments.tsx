import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatDocuments = (props: SvgProps) => {
  return (
    <Svg width={22} height={25} viewBox="0 0 22 25" fill="none" {...props}>
      <Path
        d="M17.472 7.124a1.433 1.433 0 01-1.433-1.433V.888c.173.131.331.281.47.447l4.723 5.434c.09.114.175.232.252.355h-4.012z"
        fill={'#8DA3EA'}
      />
      <Path
        d="M1.722 1.163A3.084 3.084 0 013.945.246H14.32v5.445a3.153 3.153 0 003.152 3.153H22V21.74a3.152 3.152 0 01-3.152 3.152H3.945A3.153 3.153 0 01.793 21.74V3.399a3.141 3.141 0 01.929-2.236zm8.872 16.851h4.585a.86.86 0 100-1.72h-4.585a.86.86 0 100 1.72zM6.01 13.43h9.17a.86.86 0 100-1.72H6.01a.86.86 0 100 1.72z"
        fill={'#8DA3EA'}
      />
    </Svg>
  );
};
