import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface VoipCallState {
  callUUID?: string;
  callData?: any;
}

const initialState: VoipCallState = {};

const voipCallSlice = createSlice({
  name: 'voipCall',
  initialState,
  reducers: {
    setIncomingCallData(state, action: PayloadAction<{ uuid: string; data: any }>) {
      state.callUUID = action.payload.uuid;
      state.callData = action.payload.data;
    },
    clearIncomingCallData(state) {
      state.callUUID = undefined;
      state.callData = undefined;
      // Optionally: add more state resets if needed for UI
    },
  },
});

export const { setIncomingCallData, clearIncomingCallData } = voipCallSlice.actions;
export { voipCallSlice };