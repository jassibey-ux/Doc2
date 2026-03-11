import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@hooks';
import { UI } from '@theme';

export const ChatListSkeleton = () => {
  const { colors } = useTheme(t => t);

  return (
    <View style={{ padding: UI.screenPadding }}>
      {[0, 1, 2, 3, 4].map(i => (
        <View
          key={i}
          style={{
            height: 70,
            backgroundColor: colors.inputBackground,
            borderRadius: UI.radii.small,
            marginBottom: UI.spacing.md,
            opacity: 0.8,
          }}
        />
      ))}
    </View>
  );
};
