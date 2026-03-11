import React from 'react';
import { TouchableOpacity, ScrollView } from 'react-native';
import { BaseText } from '@components';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';

export type ChatFilterType = 'all' | 'unread' | 'groups';

interface ChatTabsProps {
  activeTab: ChatFilterType;
  onTabChange: (tab: ChatFilterType) => void;
  unreadCount?: number;
  groupsCount?: number;
}

interface FilterChip {
  id: ChatFilterType;
  label: string;
  count?: number;
}

export const ChatTabs: React.FC<ChatTabsProps> = ({
  activeTab,
  onTabChange,
  unreadCount = 0,
  groupsCount = 0,
}) => {
  const styles = ChatTabsStyles();

  const filters: FilterChip[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'groups', label: 'Groups', count: groupsCount },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {filters.map(filter => {
        const isActive = activeTab === filter.id;
        const showCount = filter.count !== undefined && filter.count > 0;

        return (
          <TouchableOpacity
            key={filter.id}
            style={[styles.chip, isActive && styles.activeChip]}
            onPress={() => onTabChange(filter.id)}
            activeOpacity={0.7}
          >
            <BaseText style={[styles.chipText, isActive && styles.activeChipText]}>
              {filter.label}
              {showCount ? ` ${filter.count}` : ''}
            </BaseText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const ChatTabsStyles = () =>
  useTheme(({ colors }) => ({
    scrollView: {
      flexGrow: 0,
      maxHeight: mScale(50),
    },
    container: {
      flexDirection: 'row',
      paddingHorizontal: mScale(16),
      paddingVertical: mScale(8),
      gap: mScale(8),
      alignItems: 'center',
    },
    chip: {
      paddingHorizontal: mScale(14),
      paddingVertical: mScale(7),
      borderRadius: mScale(18),
      backgroundColor: colors.searchInputBackground,
    },
    activeChip: {
      backgroundColor: colors.tint,
    },
    chipText: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.medium,
      color: colors.inputPlaceHolder,
    },
    activeChipText: {
      color: colors.white,
      fontWeight: FontWeights.semibold,
    },
  }));
