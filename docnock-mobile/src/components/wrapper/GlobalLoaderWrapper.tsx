import React from 'react';
import { CenterLoader } from '../loader';
import { useAppSelector } from '@hooks';

export const GlobalLoaderWrapper = ({ children }: React.PropsWithChildren) => {
  const isLoading = useAppSelector(state => state.loading.isLoading);

  return (
    <>
      {children}
      {isLoading && <CenterLoader visible={isLoading} />}
    </>
  );
};
