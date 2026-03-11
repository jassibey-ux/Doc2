import { GetUserListUserType, PageType, useGetUserListQuery } from '@api';
import { BaseList, BottomTabScreenWrapper, NurseCard, SearchInputProps } from '@components';
import { commonStyles } from '@styles';
import React, { useCallback, useMemo, useState } from 'react';
import {
  getRefreshControlProps,
  ListEmptyComponent,
  ListFooterComponent,
  PhysicianStyles,
  SearchResultText,
} from './Physicians';
import { useFocusEffect } from '@react-navigation/native';

export const Nurses = () => {
  // const dispatch = useDispatch();

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const listRef = React.useRef<any>(null);
  const queryResponse = useGetUserListQuery({ limit: 10, role: 'nurse', searchKey });

  const styles = PhysicianStyles();

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

  useFocusEffect(
    useCallback(() => {
      queryResponse?.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
       listRef.current?._listView?._listRef?.scrollToOffset?.({ offset: 0, animated: false });
    }, [queryResponse?.refetch]),
  );

  const renderCard = ({ item }: { item: GetUserListUserType }) => (
    <NurseCard fullCard data={item} />
  );

  return (
    <BottomTabScreenWrapper
      title="Nurses"
      searchPlaceholder="Search Nurses..."
      isLoading={queryResponse?.isLoading}
      onSearchCallBack={onSearchCallBack}
      onClearSearch={setSearchKey.bind(this, '')}
      isSearching={queryResponse?.isFetching && !!searchKey && !queryResponse?.isFetchingNextPage}
    >
      {!queryResponse?.isLoading && !!searchKey && <SearchResultText {...{ searchKey }} />}

      {listData && (
        <BaseList<GetUserListUserType>
          ref={listRef}
          data={listData}
          renderItem={renderCard}
          keyExtractor={item => 'NurseScreen' + item?._id?.toString()}
          contentContainerStyle={styles.listContainerStyle}
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
