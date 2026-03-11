import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet as RNStyleSheet } from 'react-native';
import {
  BaseList,
  BaseListProps,
  BaseScroll,
  BaseText,
  BottomTabScreenWrapper,
  CenterLoader,
  NurseCard,
  NursingHomeCard,
  SearchInputProps,
  SectionHeading,
} from '@components';
import { useTheme } from '@hooks';
import { mScale, vscale } from '@utils';
import { commonStyles } from '@styles';
import { GetUserListUserType, PageType, useGetUserListQuery, axiosAuthClient } from '@api';
import { useCustomNavigation } from '@navigation';
import { FontSizes, FontWeights } from '@theme';
import { useFocusEffect } from '@react-navigation/native';

const AnalyticsSummaryCards = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    axiosAuthClient.get('analytics/dashboard').then(res => {
      if (res.data?.success) setData(res.data.data);
    }).catch(() => {});
  }, []);

  if (!data) return null;

  const criticalCount = data.unacknowledgedCritical?.count || 0;
  const formRate = data.formCompletionRate?.rate || 0;
  const gapCount = data.onCallCoverageGaps?.length || 0;
  const todayMessages = data.messageVolumeByDay?.[data.messageVolumeByDay.length - 1]?.messages || 0;

  return (
    <View style={analyticsStyles.container}>
      <BaseText style={analyticsStyles.sectionTitle}>Quick Stats</BaseText>
      <View style={analyticsStyles.cardRow}>
        <View style={[analyticsStyles.card, criticalCount > 0 && analyticsStyles.cardCritical]}>
          <BaseText style={[analyticsStyles.cardValue, criticalCount > 0 && { color: '#D5281B' }]}>
            {criticalCount}
          </BaseText>
          <BaseText style={analyticsStyles.cardLabel}>Critical Alerts</BaseText>
        </View>
        <View style={analyticsStyles.card}>
          <BaseText style={analyticsStyles.cardValue}>{todayMessages}</BaseText>
          <BaseText style={analyticsStyles.cardLabel}>Messages Today</BaseText>
        </View>
      </View>
      <View style={analyticsStyles.cardRow}>
        <View style={analyticsStyles.card}>
          <BaseText style={analyticsStyles.cardValue}>{formRate}%</BaseText>
          <BaseText style={analyticsStyles.cardLabel}>Form Completion</BaseText>
        </View>
        <View style={[analyticsStyles.card, gapCount > 0 && analyticsStyles.cardWarning]}>
          <BaseText style={[analyticsStyles.cardValue, gapCount > 0 && { color: '#D5600A' }]}>
            {gapCount}
          </BaseText>
          <BaseText style={analyticsStyles.cardLabel}>Coverage Gaps</BaseText>
        </View>
      </View>
    </View>
  );
};

const analyticsStyles = RNStyleSheet.create({
  container: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  cardCritical: {
    borderColor: '#D5281B',
    backgroundColor: '#FFF5F5',
  },
  cardWarning: {
    borderColor: '#D5600A',
    backgroundColor: '#FFF8F0',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#005EB8',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },
});

export const DashBoard = () => {
  const navigation = useCustomNavigation();

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const nurseQuery = useGetUserListQuery({
    limit: 5,
    role: 'nurse',
    searchKey,
    appendId: 'Dashboard',
  });
  const nursingHomeQuery = useGetUserListQuery({
    limit: 5,
    role: 'facility_center',
    searchKey,
    appendId: 'Dashboard',
  });

  const styles = DashboardStyles();

  const nurseListData = useMemo(() => {
    const totalRecords: GetUserListUserType[] = [];
    nurseQuery?.data?.pages?.forEach(page => {
      totalRecords.push(...((page as PageType)?.data ?? []));
    });
    return totalRecords;
  }, [nurseQuery?.data]);

  const nursingHomeListData = useMemo(() => {
    const totalRecords: GetUserListUserType[] = [];
    nursingHomeQuery?.data?.pages?.forEach(page => {
      totalRecords.push(...((page as PageType)?.data ?? []));
    });
    return totalRecords;
  }, [nursingHomeQuery?.data]);

  const onViewAll = (nurse = false) => {
    if (nurse) {
      navigation?.navigate('BottomTabNavigator', {
        screen: nurse ? 'Nurses' : 'Nurses',
      });
    } else {
      navigation?.navigate('NursingHomes');
    }
  };

  const onSearchCallBack: SearchInputProps['onSearchCallBack'] = val => {
    setSearchKey(val);
  };

  const renderNursingHome = ({ item }: { item: GetUserListUserType }) => {
    return <NursingHomeCard data={item} key={item?._id?.toString()} />;
  };

  const renderNurse = ({ item }: { item: GetUserListUserType }) => {
    return <NurseCard data={item} key={item?._id?.toString()} />;
  };

  const renderNoData = (queryRef: typeof nurseQuery) => {
    return (
      <BaseText style={styles.noDataText}>
        {queryRef?.isLoading ? `Please wait ..` : `No data found`}
      </BaseText>
    );
  };

  const onRefresh = () => {
    nursingHomeQuery?.refetch();
    nurseQuery?.refetch();
  };

  useFocusEffect(
    useCallback(() => {
      onRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const isRefreshing = nursingHomeQuery?.isFetching || nurseQuery?.isFetching;

  const refreshProps: BaseListProps = {
    refreshFn: onRefresh,
    refreshing: isRefreshing,
  };

  return (
    <BottomTabScreenWrapper
      dashboard
      onSearchCallBack={onSearchCallBack}
      onClearSearch={setSearchKey.bind(this, '')}
      isSearching={isRefreshing && !!searchKey}
    >
      <CenterLoader
        visible={nursingHomeQuery?.isLoading || nurseQuery?.isLoading}
        containerStyle={styles.loaderContainer}
      />
      <BaseScroll {...refreshProps}>
        <AnalyticsSummaryCards />
        <SectionHeading
          title="Associated Facility Center"
          containerStyle={{ marginBottom: mScale(12) }}
          onViewAll={onViewAll.bind(this, false)}
        />
        <View
          style={[
            !nursingHomeQuery?.isLoading && !nursingHomeListData?.length
              ? {}
              : styles.nursingHomeListContainer,
          ]}
        >
          {nursingHomeListData?.length ? (
            <BaseList
              data={nursingHomeListData}
              renderItem={renderNursingHome}
              keyExtractor={item => 'NH' + item?._id?.toString()}
              horizontal
              style={[commonStyles.flex]}
            />
          ) : (
            renderNoData(nursingHomeQuery)
          )}
        </View>
        <SectionHeading
          title="Nurses"
          containerStyle={{ marginTop: mScale(22), marginBottom: mScale(12) }}
          onViewAll={onViewAll.bind(this, true)}
        />
        <View
          style={[
            !nurseQuery?.isLoading && !nurseListData?.length ? {} : styles.nurseListContainer,
          ]}
        >
          {nurseListData?.length ? (
            <BaseList
              data={nurseListData}
              renderItem={renderNurse}
              keyExtractor={item => 'Nurse' + item?._id.toString()}
              horizontal
              style={[commonStyles.flex]}
            />
          ) : (
            renderNoData(nurseQuery)
          )}
        </View>
      </BaseScroll>
    </BottomTabScreenWrapper>
  );
};

export const DashboardStyles = () =>
  useTheme(({ colors }) => ({
    noDataText: {
      fontSize: FontSizes.size_17,
      fontWeight: FontWeights.semibold,
      color: colors.text,
      opacity: 0.7,
    },
    nursingHomeListContainer: {
      height: vscale(125),
    },
    nurseListContainer: {
      height: vscale(95),
    },
    logoutButton: {
      marginTop: mScale(24),
      alignSelf: 'center',
    },
    loaderContainer: {
      zIndex: 10,
      paddingBottom: '15%',
    },
    swipeItemStyle:{
       alignSelf: 'flex-end', 
       alignItems:'center',
       paddingTop:'4%'
    }
  }));
