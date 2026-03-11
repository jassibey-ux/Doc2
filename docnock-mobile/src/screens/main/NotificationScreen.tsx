import {
  BaseScroll,
  DashBoardHeader,
  NotificationCard,
  ScreenWrapper,
  BaseText,
} from '@components';
import { commonStyles } from '@styles';
import React, { useEffect, useState } from 'react';
import { renderLeftComponent } from './AllNurseList';
import { ImagesPreviewScreenStyles } from './ImagesPreviewScreen';
import { mScale } from '@utils';
import { FlatList, View } from 'react-native';
import {
  readNotificationCount,
  useGetUserNotificationList,
  useGetUserUnreadCount,
  useReadNotification,
} from '@api';
import { useDispatch } from 'react-redux';
import { setNotifcationUnreadCont } from '@store';

export const NotificationScreen = () => {
  const dispatch = useDispatch();
  const imagesPreviewStyles = ImagesPreviewScreenStyles();

  const [userNotificationList, setUserNotificationList] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const { mutateAsync: getUserNotificationList } = useGetUserNotificationList();

  const fetchNotifications = async (page: number) => {
    try {
      setIsLoading(true);
      const limit = 10;
      const response = await getUserNotificationList({ limit, page });

      if (response?.data?.data) {
        if (page === 1) {
          setUserNotificationList(response.data.data);
          setTotalRecords(response.data?.totalRecords || 0);
        } else {
          setUserNotificationList(prev => [...prev, ...response.data.data]);
        }
      }
      return response?.data?.data ?? [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(currentPage);
  }, []);

  const fetchMore = async () => {
    if (userNotificationList.length < totalRecords && !isLoading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      await fetchNotifications(nextPage);
    }
  };

  const { mutateAsync: readNotification } = useReadNotification();

  const handleNotificationCount = async () => {
    const payload: readNotificationCount = {
      ids: userNotificationList.map(item => item._id),
    };
    await readNotification(payload);
  };

  const { mutateAsync: getUserNotificationUnreadCount } = useGetUserUnreadCount();

  useEffect(() => {
    if (userNotificationList.length > 0) {
      handleNotificationCount();
    }

    return () => {
      const getCount = async () => {
        const count = await getUserNotificationUnreadCount();
        dispatch(setNotifcationUnreadCont(count.data.count));
      };
      getCount();
    };
  }, [userNotificationList]);

  /* ================= EMPTY UI ================= */

  const renderEmptyComponent = () => {
    if (isLoading) return null;

    return (
      <View style={[commonStyles.flex, commonStyles.center, { paddingTop: mScale(40) }]}>
        <BaseText style={{ fontSize: mScale(16), color: '#888' }}>No notifications found</BaseText>
      </View>
    );
  };

  /* ================= UI ================= */

  return (
    <ScreenWrapper
      enableTopSafeArea={false}
      enableBottomSafeArea={false}
      style={commonStyles.flex}
      edges={['top']}
    >
      <DashBoardHeader
        renderLeftComponent={renderLeftComponent}
        containerStyle={[imagesPreviewStyles.headerContainerStyle]}
        headerText="Notifications"
        disableRightComponent
      />

      <FlatList
        data={userNotificationList}
        renderItem={({ item }) => <NotificationCard item={item} />}
        keyExtractor={item => item._id}
        onEndReached={fetchMore}
        onEndReachedThreshold={0.2}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={userNotificationList.length === 0 ? commonStyles.flex : undefined}
      />
    </ScreenWrapper>
  );
};
