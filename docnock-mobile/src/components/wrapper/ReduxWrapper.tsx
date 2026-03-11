import React from 'react';
import { Provider } from 'react-redux';
import { PersistStore, store } from '@store';
import { PersistGate } from 'redux-persist/integration/react';

export const ReduxWrapper = ({ children }: React.PropsWithChildren) => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={PersistStore}>
        {children}
      </PersistGate>
    </Provider>
  );
};
