import { useTheme } from '@hooks';
import { commonStyles } from '@styles';
import { FontSizes, FontWeights } from '@theme';
import { mScale } from '@utils';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { BaseText } from './BaseText';
import { SvgIconButton, SvgIconButtonProps } from './button';
import moment from 'moment';
import { useCustomNavigation } from '@navigation';

export const NOTIFICATION_USER_AVATAR_SIZE = mScale(56);
interface NotificationCardProps {
  item: {
    _id: string;
    receiverid: string;
    groupid: string;
    is_read: boolean;
    message: string;
    createdAt: string;
    name: string;
  };
}
export const NotificationCard: React.FC<NotificationCardProps> = ({ item }) => {
  const styles = Styles();
  const { colors } = useTheme(theme => theme);

  const iconProps: SvgIconButtonProps['iconProps'] = {
    height: NOTIFICATION_USER_AVATAR_SIZE,
    width: NOTIFICATION_USER_AVATAR_SIZE,
    color: colors.avatarColor,
  };
    const navigation = useCustomNavigation();
  
    const transformChatData = (data) => {
  if (!data) {
    throw new Error("Input data is required.");
  }

  return {
    groupId: data.groupid || '', 
    userIds: data.receiverid ? [{ userid: data.receiverid }] : [], 
    title: data.name || '',
  };
};

  return (
    <TouchableOpacity style={[commonStyles.rowItemsCenter, styles.container, {}]} onPress={()=>{

      navigation.navigate('ChatScreen', {
      isEFax: false,
      isGroup: false,
      data: transformChatData(item),
    });
    }}>
      <SvgIconButton icon="AvatarPlaceholder" iconProps={iconProps} />
      <View style={styles.textContainer}>
        <BaseText>
          {item.message} <BaseText style={styles.boldText}>{item.name}</BaseText>
        </BaseText>
        <BaseText style={styles.time}>
          {moment(item.createdAt).fromNow()}
        </BaseText>
      </View>
      {
        !item.is_read &&
        <View style={{ width: 8, height: 8, borderRadius: 100, backgroundColor: 'yellow' }} />
      }
    </TouchableOpacity>
  );
};

const Styles = () =>
  useTheme(({ colors }) => ({
    container: {
      gap: mScale(14),
      padding: mScale(4),
      borderBottomWidth: 1,
      borderBlockColor: colors.searchInputBackground,
      paddingVertical: mScale(14),
    },
    textContainer: {
      gap: mScale(8),
      flex: 1,
    },
    boldText: {
      fontWeight: FontWeights.bold,
    },
    time: {
      fontSize: FontSizes.size_12,
      fontWeight: FontWeights.medium,
      opacity: 0.6,
    },
  }));
