import * as React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export const ChatVoiceNote = (props: SvgProps) => {
  return (
    <Svg width={15} height={24} viewBox="0 0 15 24" fill="none" {...props}>
      <Path
        d="M0 11.966a.817.817 0 111.634 0 5.783 5.783 0 0011.565 0 .817.817 0 111.635 0 7.425 7.425 0 01-6.6 7.37v2.179h2.972a.817.817 0 010 1.634H3.628a.817.817 0 010-1.634H6.6v-2.179a7.425 7.425 0 01-6.6-7.37z"
        fill={'#DBDD7A'}
      />
      <Path
        d="M7.417 0a4.557 4.557 0 014.557 4.557v7.378a4.562 4.562 0 01-4.557 4.557 4.562 4.562 0 01-4.557-4.557V4.557A4.557 4.557 0 017.417 0z"
        fill={'#DBDD7A'}
      />
    </Svg>
  );
};
