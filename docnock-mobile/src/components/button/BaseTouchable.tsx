import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';

export const BaseTouchable = (props: TouchableOpacityProps) => {
  return <TouchableOpacity activeOpacity={0.5} {...props} />;
};
