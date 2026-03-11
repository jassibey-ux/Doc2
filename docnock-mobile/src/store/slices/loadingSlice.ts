import { createSlice } from '@reduxjs/toolkit';

const loadingSlice = createSlice({
  name: 'loading',
  initialState: {
    isLoading: false,
  },
  reducers: {
    setLoading: (state, action) => {
      return { ...state, isLoading: action.payload };
    },
  },
});

// Lazy dispatch helper - defers store import to runtime
const setLoader = (value?: boolean) => {
  const { store } = require('../store');
  store.dispatch(loadingSlice.actions.setLoading(value));
};

export { loadingSlice, setLoader };
export const { setLoading } = loadingSlice.actions;
