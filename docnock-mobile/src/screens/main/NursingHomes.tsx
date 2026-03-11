import { GetUserListUserType, PageType, useGetUserListQuery } from '@api';
import {
  BaseList,
  BottomTabScreenWrapper,
  NursingHomeCard,
  SearchInputProps,
  SvgIconButton,
} from '@components';
import { commonStyles } from '@styles';
import React, { useCallback, useMemo, useState } from 'react';
import {
  getRefreshControlProps,
  ListEmptyComponent,
  ListFooterComponent,
  SearchResultText,
} from './bottom-tabs';
import { useCustomNavigation } from '@navigation';
import { useFocusEffect } from '@react-navigation/native';

export const NursingHomes = () => {
  const navigation = useCustomNavigation();

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const queryResponse = useGetUserListQuery({ limit: 10, role: 'facility_center', searchKey });

  const listData = useMemo(() => {
    const totalRecords: GetUserListUserType[] = [];
    queryResponse?.data?.pages?.forEach(page => {
      totalRecords.push(...((page as PageType)?.data ?? []));
    });
    return totalRecords;
  }, [queryResponse?.data]);

  const onEndReached = () => {
    if (
      queryResponse?.hasNextPage &&
      !queryResponse?.isLoading &&
      !queryResponse?.isFetchingNextPage
    ) {
      queryResponse?.fetchNextPage();
    }
  };

  const onSearchCallBack: SearchInputProps['onSearchCallBack'] = val => {
    setSearchKey(val);
  };

  const renderCard = ({ item }: { item: GetUserListUserType }) => (
    <NursingHomeCard fullCard data={item} />
  );

  const renderLeftComponent = () => {
    return <SvgIconButton icon="ChevronLeft" onPress={navigation.goBack} />;
  };

  useFocusEffect(
    useCallback(() => {
      queryResponse?.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryResponse?.refetch]),
  );

  return (
    <BottomTabScreenWrapper
      title="Facility Center"
      searchPlaceholder="Search Facility Center..."
      isLoading={queryResponse?.isLoading}
      onSearchCallBack={onSearchCallBack}
      onClearSearch={setSearchKey.bind(this, '')}
      isSearching={queryResponse?.isFetching && !!searchKey && !queryResponse?.isFetchingNextPage}
      headerProps={{
        renderLeftComponent,
        disableRightComponent: true,
      }}
    >
      {!queryResponse?.isLoading && !!searchKey && <SearchResultText {...{ searchKey }} />}

      {listData && (
        <BaseList
          data={listData}
          renderItem={renderCard}
          keyExtractor={item => 'NurseScreen' + item?._id?.toString()}
          style={[commonStyles.flex]}
          onEndReached={onEndReached}
          ListFooterComponent={
            queryResponse?.hasNextPage && queryResponse?.isFetchingNextPage ? (
              <ListFooterComponent />
            ) : null
          }
          ListEmptyComponent={!queryResponse?.isLoading ? <ListEmptyComponent /> : <></>}
          {...getRefreshControlProps(queryResponse)}
        />
      )}
    </BottomTabScreenWrapper>
  );
};
