import { persistStore } from 'redux-persist';
import persistReducer from 'redux-persist/es/persistReducer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authSlice, loadingSlice, tempSlice, themeSlice, chatSlice, voipCallSlice,callKeepSlice } from './slices';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { chatMiddleware } from './middleware/chatMiddleware';

const combinedReducer = combineReducers({
  theme: themeSlice.reducer,
  auth: authSlice.reducer,
  loading: loadingSlice.reducer,
  temp: tempSlice.reducer,
  chats: chatSlice.reducer,
  voipCall: voipCallSlice.reducer,
  callKeep: callKeepSlice.reducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  blacklist: ['loading', 'temp', 'chats', 'voipCall'],
};
export const persistedReducer = persistReducer(persistConfig, combinedReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).prepend(chatMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const PersistStore = persistStore(store);
