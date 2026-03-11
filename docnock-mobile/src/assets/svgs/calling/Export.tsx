import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const Export = (props: SvgProps) => {
    return (
        <Svg width="20px" height="20px" viewBox="0 0 24 24" {...props}>
            <Path
                d="M5 20a1 1 0 001 1h12a1 1 0 001-1v-6a1 1 0 112 0v6a3 3 0 01-3 3H6a3 3 0 01-3-3v-6a1 1 0 112 0v6zm7-17a1 1 0 00-1 1v8.586l-2.293-2.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l4-4a1 1 0 10-1.414-1.414L13 12.586V4a1 1 0 00-1-1z"
                fill={props?.color ?? '#FFFFFF'}
            />
        </Svg>
    );
};
