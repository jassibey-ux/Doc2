import React, { forwardRef, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { BaseText } from '@components';
import { useTheme } from '@hooks';
import { mScale } from '@utils';
import { FontSizes, FontWeights } from '@theme';
import { ChatList, ChatListProps } from './ChatList';

type TabType = 'tab1' | 'tab2';

export type TabbedChatListProps = ChatListProps;

export const TabbedChatList = forwardRef<any, TabbedChatListProps>((props, ref) => {
  const [activeTab, setActiveTab] = useState<TabType>('tab1');
  const styles = TabbedChatListStyles();

  const renderTabButton = (tabKey: TabType, title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tabKey && styles.activeTabButton]}
      onPress={() => setActiveTab(tabKey)}
    >
      <BaseText style={[styles.tabText, activeTab === tabKey && styles.activeTabText]}>
        {title}
      </BaseText>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        {renderTabButton('tab1', 'All Chats')}
        {renderTabButton('tab2', 'Groups')}
      </View>

      <ChatList ref={ref} {...props} />
    </View>
  );
});

const TabbedChatListStyles = () =>
  useTheme(({ colors }) => ({
    container: {
      flex: 1,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.inputBackground,
      marginHorizontal: mScale(14),
      borderRadius: mScale(8),
      padding: mScale(4),
      marginBottom: mScale(12),
    },
    tabButton: {
      flex: 1,
      paddingVertical: mScale(8),
      paddingHorizontal: mScale(12),
      borderRadius: mScale(6),
      alignItems: 'center',
    },
    activeTabButton: {
      backgroundColor: colors.tint,
    },
    tabText: {
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.medium,
      color: colors.secondary,
    },
    activeTabText: {
      color: colors.white,
      fontWeight: FontWeights.semibold,
    },
  }));
