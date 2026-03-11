import { createSlice } from '@reduxjs/toolkit';

const callKeepSlice = createSlice({
  name: 'callKeep',
  initialState: {
    callKeepSetup: false,
    callData: null,
    status: 'idle'
  },
  reducers: {
    setCallKeepSetup: (state, action) => {
      state.callKeepSetup = action.payload;
    },
    setCallData: (state, action) => {
      state.callData = action.payload;
      state.status = 'ringing';
    },
    acceptCall: (state) => {
      state.status = 'accepted';
    },
    rejectCall:(state)=> {
       state.status = 'rejected';
    },
    resetCall: (state) => {
      state.callData = null;
      state.status = 'idle';
    },
  },
});

export const { setCallKeepSetup, setCallData, acceptCall, resetCall, rejectCall} = callKeepSlice.actions;
export { callKeepSlice };
