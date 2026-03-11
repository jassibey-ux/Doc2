import React from 'react';
import { View } from 'react-native';
import { commonStyles } from '@styles';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { useTheme } from '@hooks';
import { ViewStyles } from '@types';
import { BaseText } from '../BaseText';
import { BaseTouchable, SvgIconButton } from '../button';

export type SectionHeadingProps = {
  title: string;
  containerStyle?: ViewStyles;
  onViewAll?: () => void;
};

export const SectionHeading = (props: SectionHeadingProps) => {
  const styles = Styles();
  return (
    <View style={[commonStyles.rowItemsCenter, styles.container, props?.containerStyle]}>
      <BaseText style={[styles.titleText]} numberOfLines={2}>
        {props?.title ?? 'Section Heading'}
      </BaseText>
      <BaseTouchable
        style={[commonStyles.rowItemsCenter, styles.container]}
        onPress={props?.onViewAll}
      >
        <BaseText style={[styles.viewAllText]}>View All</BaseText>
        <SvgIconButton icon="LinkArrow" style={[commonStyles.centerCenter, styles.arrowIcon]} />
      </BaseTouchable>
    </View>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      gap: mScale(8),
    },
    titleText: {
      flex: 1,
      fontSize: FontSizes.size_17,
      fontWeight: FontWeights.bold,
      color: colors.text,
      letterSpacing: 0.15,
    },
    viewAllText: {
      fontSize: FontSizes.size_12,
      color: colors.tint,
      fontWeight: FontWeights.medium,
    },
    arrowIcon: {
      height: mScale(30),
      width: mScale(30),
      backgroundColor: colors.iconButtonBackground,
      borderRadius: mScale(15),
    },
  }));
