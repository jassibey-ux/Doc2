import { createListenerMiddleware } from '@reduxjs/toolkit';

export const chatMiddleware = createListenerMiddleware();

// This middleware will listen for chat unread changes and sync to auth slice
chatMiddleware.startListening({
  predicate: (action) => {
    return [
      'chats/updateChat',
      'chats/updateUnreadChat', 
      'chats/removeUnreadChatById',
      'chats/removeUnreadChat',
    ].includes(action.type);
  },
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as { chats?: { unreadChats?: any[] } };
    const unreadCount = (state.chats?.unreadChats ?? []).length;
    
    // Import dynamically to avoid circular dependency
    const { setNotifcationUnreadCont } = await import('../slices/authSlice');
    listenerApi.dispatch(setNotifcationUnreadCont(unreadCount));
  },
});
