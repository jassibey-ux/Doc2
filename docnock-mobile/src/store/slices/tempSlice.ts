import { GetUserListUserType } from '@api';
import { createSlice } from '@reduxjs/toolkit';

export type TempSliceType = {
  viewProfile?: GetUserListUserType;
  currentPersonDetailUsage?: 'users' | 'chat' | 'efax';
  isBusy: boolean;
};

const InitialTempState: TempSliceType = {
  viewProfile: undefined,
  currentPersonDetailUsage: 'users',
  isBusy: false
};

const tempSlice = createSlice({
  name: 'temp',
  initialState: InitialTempState,
  reducers: {
    setViewProfile: (state, action) => {
      return { ...state, viewProfile: action.payload };
    },
    setCurrentPersonDetailUsage: (state, action) => {
      return { ...state, currentPersonDetailUsage: action.payload };
    },
    setIsBusy: (state, action) => {
      return { ...state, isBusy: action.payload };
    },
  },
});

export { tempSlice };
export const { setViewProfile, setCurrentPersonDetailUsage, setIsBusy } = tempSlice.actions;
