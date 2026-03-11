import { GetUserListUserType, PageType, useGetUserListQuery } from '@api';
import {
  BaseList,
  BottomTabScreenWrapper,
  NurseCard,
  SearchInputProps,
  SvgIconButton,
  SvgIconButtonProps,
} from '@components';
import { commonStyles } from '@styles';
import React, { useCallback, useMemo, useState } from 'react';
import {
  getRefreshControlProps,
  ListEmptyComponent,
  PhysicianStyles,
  SearchResultText,
} from './bottom-tabs';
import { navigationRef, useCustomRoute } from '@navigation';
import { useFocusEffect } from '@react-navigation/native';

export const renderLeftComponent = (props?: Omit<SvgIconButtonProps, 'icon'>) => {
  return <SvgIconButton icon="ChevronLeft" onPress={navigationRef.goBack} {...props} />;
};

export const AllNurseList = () => {
  // const dispatch = useDispatch();
  const route = useCustomRoute<'AllNurseList'>();
  const nursingHomeData = route?.params?.nursingHomeData;

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const queryResponse = useGetUserListQuery({
    limit: 10,
    role: 'nurse',
    searchKey,
    userId: nursingHomeData?.userIds || [],
  });

  const styles = PhysicianStyles();

  const listData = useMemo(() => {
    const totalRecords: GetUserListUserType[] = [];
    queryResponse?.data?.pages?.forEach(page => {
      totalRecords.push(...((page as PageType)?.data ?? []));
    });
    return totalRecords;
  }, [queryResponse?.data]);

  const onEndReached = () => {
    if (queryResponse?.hasNextPage) {
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
      headerProps={{
        renderLeftComponent,
        disableRightComponent: true,
        containerStyle: styles.headerContainer,
      }}
    >
      {!queryResponse?.isLoading && !!searchKey && <SearchResultText {...{ searchKey }} />}

      {listData && (
        <BaseList
          data={listData}
          renderItem={renderCard}
          keyExtractor={item => 'NurseScreen' + item?._id?.toString()}
          contentContainerStyle={styles.listContainerStyle}
          style={[commonStyles.flex]}
          onEndReached={onEndReached}
          ListEmptyComponent={!queryResponse?.isLoading ? <ListEmptyComponent /> : <></>}
          {...getRefreshControlProps(queryResponse)}
        />
      )}
    </BottomTabScreenWrapper>
  );
};
