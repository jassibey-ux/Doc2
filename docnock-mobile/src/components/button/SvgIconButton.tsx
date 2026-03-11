import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { SvgProps } from 'react-native-svg';
import { SvgIcons } from '@assets';
import { useTheme } from '@hooks';
import { UI } from '@theme';

export type SvgIconButtonProps = {
  icon: keyof typeof SvgIcons;
  iconProps?: SvgProps;
} & TouchableOpacityProps;

export const SvgIconButton = ({ icon, iconProps, ...props }: SvgIconButtonProps) => {
  const Icon = SvgIcons[icon];
  const { colors } = useTheme(theme => theme);

  // Guard against undefined icons to avoid runtime "Element type is invalid" errors.
  if (!Icon) {
    console.warn('SvgIconButton: missing icon for key', icon);
    return null;
  }

  const defaultStyle = {
    padding: UI.iconPadding,
    borderRadius: UI.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  } as any;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel || icon}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      disabled={!props?.onPress}
      {...props}
      style={[defaultStyle, props?.style]}
    >
      <Icon color={colors.iconContrast} {...iconProps} />
    </TouchableOpacity>
  );
};
