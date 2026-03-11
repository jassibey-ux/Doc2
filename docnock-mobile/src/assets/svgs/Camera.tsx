import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Camera = (props: SvgProps) => {
  return (
    <Svg width={25} height={22} viewBox="0 0 25 22" fill="none" {...props}>
      <Path
        d="M12.956 16.17a4.284 4.284 0 100-8.567 4.284 4.284 0 000 8.568z"
        fill={props?.color || '#fff'}
      />
      <Path
        d="M22.38 4.177h-2.368a.852.852 0 01-.766-.474l-.767-1.533A2.556 2.556 0 0016.181.75H9.73a2.556 2.556 0 00-2.298 1.42l-.771 1.533a.852.852 0 01-.762.474H3.532a2.57 2.57 0 00-2.57 2.57V18.74a2.57 2.57 0 002.57 2.57H22.38a2.57 2.57 0 002.57-2.57V6.747a2.57 2.57 0 00-2.57-2.57zm-9.424 13.707a5.997 5.997 0 115.997-5.997 6.004 6.004 0 01-5.997 5.997zm8.567-9.424a.856.856 0 110-1.712.856.856 0 010 1.712z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
