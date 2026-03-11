import { GetUserListUserType, PageType, useGetUserListQuery } from '@api';
import {
  BaseList,
  BaseListProps,
  BaseText,
  BottomTabScreenWrapper,
  NurseCard,
  SearchInputProps,
  SvgIconButton,
} from '@components';
import { useTheme } from '@hooks';
import { useFocusEffect } from '@react-navigation/native';
import { store } from '@store';
import { commonStyles } from '@styles';
import { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { FontSizes, FontWeights } from '@theme';
import { mScale, vscale } from '@utils';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, TextProps, View } from 'react-native';

export const ListFooterComponent = () => {
  return <ActivityIndicator size="small" color={store.getState().theme.colors.secondary} />;
};

export const ListEmptyComponent = () => {
  const styles = PhysicianStyles();
  const { colors } = useTheme(theme => theme);

  return (
    <View style={styles.emptyContainer}>
      <SvgIconButton
        icon="Chats"
        iconProps={{
          width: mScale(70),
          height: mScale(70),
          color: colors.inputPlaceHolder,
        }}
        style={styles.emptyIcon}
      />
      <BaseText style={styles.emptyText}>No chats found</BaseText>
      <BaseText style={styles.emptySubText}>Start a new conversation</BaseText>
    </View>
  );
};

export const SearchResultText = ({
  searchKey,
  style,
}: {
  searchKey: string;
  style?: TextProps['style'];
}) => {
  const styles = PhysicianStyles();

  return (
    <BaseText
      style={[styles.searchAnnouncement, style]}
    >{`Search results for "${searchKey}"`}</BaseText>
  );
};

export const getRefreshControlProps = (
  queryRef: UseInfiniteQueryResult<InfiniteData<unknown, unknown>, Error>,
) => {
  const refreshProps: BaseListProps = {
    refreshFn: () => {
      queryRef?.refetch();
    },
    refreshing: queryRef?.isFetching,
  };

  return refreshProps;
};

export const Physicians = () => {
  // const dispatch = useDispatch();

  const [searchKey, setSearchKey] = useState<string | undefined>('');
  const listRef = React.useRef<any>(null);

  const styles = PhysicianStyles();

  const queryResponse = useGetUserListQuery({ limit: 10, role: 'physician', searchKey });

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
    listRef.current?._listView?._listRef?.scrollToOffset?.({ offset: 0, animated: false });
  }, [queryResponse?.refetch]),
);

  const renderCard = ({ item }: { item: GetUserListUserType }) => (
    <NurseCard fullCard data={item} screenName="Physicians" />
  );

  return (
    <BottomTabScreenWrapper
      title="Physicians"
      searchPlaceholder="Search Physicians..."
      isLoading={queryResponse?.isLoading}
      onSearchCallBack={onSearchCallBack}
      onClearSearch={setSearchKey.bind(this, '')}
      isSearching={queryResponse?.isFetching && !!searchKey && !queryResponse?.isFetchingNextPage}
    >
      {!queryResponse?.isLoading && !!searchKey && <SearchResultText {...{ searchKey }} />}

      {listData && (
        <BaseList
          data={listData}
          ref={listRef}
          renderItem={renderCard}
          keyExtractor={item => 'PhysicianScreen' + item?._id?.toString()}
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

export const PhysicianStyles = () =>
  useTheme(({ colors }) => ({
    searchAnnouncement: {
      color: colors.text,
      fontSize: FontSizes.size_17,
      fontWeight: FontWeights.semibold,
      marginHorizontal: mScale(15),
      marginBottom: vscale(15),
    },
    listContainerStyle: {
      paddingBottom: '40%',
    },
    headerContainer: {
      marginVertical: mScale(16),
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: vscale(120),
    },
    emptyIcon: {
      marginBottom: mScale(16),
      opacity: 0.5,
    },
    emptyText: {
      color: colors.text,
      fontSize: FontSizes.size_18,
      fontWeight: FontWeights.semibold,
      marginBottom: mScale(8),
    },
    emptySubText: {
      color: colors.inputPlaceHolder,
      fontSize: FontSizes.size_14,
      fontWeight: FontWeights.regular,
    },
  }));
