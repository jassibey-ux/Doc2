import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Pencil = (props: SvgProps) => {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none" {...props}>
      <Path
        d="M11.134 3l-9.92 9.92a.396.396 0 00-.103.182l-1.1 4.413a.392.392 0 00.474.473l4.413-1.1a.39.39 0 00.181-.102L15 6.866 11.134 3zM17.408 1.723L16.263.575c-.765-.767-2.097-.766-2.861 0L12 1.981 16.006 6l1.402-1.406A2.02 2.02 0 0018 3.159a2.02 2.02 0 00-.592-1.436z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
