import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const LinkArrow = (props: SvgProps) => {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.346 2.88l-5.29-.238c-.454.065-.77-.25-.704-.703.065-.453.486-.874.939-.939l7.273-.046c.454-.066.77.25.704.703l-.31 7.01c-.065.453-.486.874-.94.939-.452.065-.768-.25-.703-.703l.026-5.028-7.78 6.99c-.367.366-.887.44-1.162.166-.274-.274-.2-.795.167-1.161l7.78-6.99z"
        fill={props?.color || '#fff'}
      />
    </Svg>
  );
};
