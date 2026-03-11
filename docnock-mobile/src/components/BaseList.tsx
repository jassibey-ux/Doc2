import React, { ComponentProps, forwardRef } from 'react';
import { RefreshControl } from 'react-native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { store } from '@store';
import { AppColors } from '@theme';

export type BaseListProps = {
  refreshFn?: () => Promise<void> | void;
  refreshing?: boolean;
  renderHiddenItem?: ComponentProps<typeof SwipeListView>['renderHiddenItem'];
  leftOpenValue?: number;
};

export const refreshControl = (props: BaseListProps) => {
  const tintColor = store?.getState()?.theme?.colors?.inputPlaceHolder ?? AppColors.dark.secondary;

  return (
    <RefreshControl
      refreshing={!!props?.refreshing}
      onRefresh={props?.refreshFn}
      tintColor={tintColor}
    />
  );
};

export const BaseList = forwardRef(
  <T extends unknown>(
    props: Omit<ComponentProps<typeof SwipeListView<T>>, 'renderHiddenItem' | 'getItemLayout'> &
      BaseListProps & {
        renderHiddenItem?: ComponentProps<typeof SwipeListView<T>>['renderHiddenItem'];
        getItemLayout?: (
          data: ArrayLike<T> | null | undefined,
          index: number,
        ) => { length: number; offset: number; index: number };
      },
    ref: React.Ref<SwipeListView<T>>,
  ) => {
    const { renderHiddenItem, getItemLayout, refreshFn, refreshing, leftOpenValue, ...restProps } =
      props;

    return (
      <SwipeListView
        ref={ref}
        disableLeftSwipe={!renderHiddenItem}
        disableRightSwipe={true}
        rightOpenValue={-50}
        previewOpenDelay={3000}
        renderHiddenItem={renderHiddenItem}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        refreshControl={refreshFn ? refreshControl(props) : undefined}
        {...restProps}
      />
    );
  },
) as <T extends unknown>(
  props: Omit<ComponentProps<typeof SwipeListView<T>>, 'renderHiddenItem' | 'getItemLayout'> &
    BaseListProps & {
      renderHiddenItem?: ComponentProps<typeof SwipeListView<T>>['renderHiddenItem'];
      getItemLayout?: (
        data: ArrayLike<T> | null | undefined,
        index: number,
      ) => { length: number; offset: number; index: number };
    } & { ref?: React.Ref<SwipeListView<T>> },
) => React.ReactElement;
