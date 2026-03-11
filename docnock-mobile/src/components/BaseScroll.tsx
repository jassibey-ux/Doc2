import React, { forwardRef, JSXElementConstructor, ReactElement } from 'react';
import { RefreshControlProps, ScrollView, ScrollViewProps } from 'react-native';
import { BaseListProps, refreshControl as CommonRefreshControl } from './BaseList';

export const BaseScroll = forwardRef<ScrollView, BaseListProps & ScrollViewProps>(
  ({ children, refreshControl, ...props }, ref) => {
    return (
      <ScrollView
        ref={ref}
        refreshControl={
          (CommonRefreshControl({}) as unknown as ReactElement<
            RefreshControlProps,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            string | JSXElementConstructor<any>
          >) ?? refreshControl
        }
        showsVerticalScrollIndicator={false}
        {...props}
      >
        {children}
      </ScrollView>
    );
  },
);
