import { ChatMessageAttachmentType } from '@hooks';
import { GroupDataType } from '@navigation';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { devLogger } from '@utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatItemAttachmentType = ChatMessageAttachmentType & { uri?: string };

export type ChatItemType = {
  _id: string;
  senderID: string;
  message: string;
  conversationId?: string;
  groupId?: string;
  isDeleted?: boolean;
  isImportant: boolean;
  attachments: ChatItemAttachmentType[];
  hiddenBy?: object[];
  timestamp: number;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
  tempId?: string;
  messageId?: number;
  status?: string;
};

export type SenderDetails = {
  _id: string;
  status: boolean;
};

export type newMessageListnerProps = {
  _id: string;
  attachments: any[];
  groupId: string;
  isImportant: boolean;
  message: string;
  messageId: number;
  senderDetails: SenderDetails;
  senderID: string;
  timestamp: number;
};

export type ChatState = {
  chats: Record<string, ChatItemType[]>;
  chatList: GroupDataType[];
  unreadChats: ChatItemType[];
  chatGroupId: string;
  selectedUser: any[];
  onlineUsers: string[];
  typingChats: Record<string, string | false>;
};

const initialState: ChatState = {
  chats: {},
  chatList: [],
  unreadChats: [],
  chatGroupId: '',
  selectedUser: [],
  onlineUsers: [],
  typingChats: {},
};

// Helper to deduplicate messages by messageId
const deduplicateMessages = (messages: ChatItemType[]): ChatItemType[] => {
  const seen = new Map<number, ChatItemType>();
  for (const msg of messages) {
    if (msg?.messageId && !seen.has(msg.messageId)) {
      seen.set(msg.messageId, msg);
    } else if (!msg?.messageId) {
      // Keep messages without messageId (edge case)
      seen.set(Date.now() + Math.random(), msg);
    }
  }
  return Array.from(seen.values());
};

export const chatSlice = createSlice({
  name: 'chats',
  initialState,
  reducers: {
    updateChat: (state, action: PayloadAction<ChatItemType[]>) => {
      try {
        const firstItem = action.payload?.[0];
        const chatId = firstItem?.conversationId || firstItem?.groupId || '';
        if (!chatId) return;
        const existingMessages = state?.chats?.[chatId] || [];
        const existingMessageIds = new Set(
          existingMessages
            .map(item => item?.messageId)
            .filter(messageId => !!messageId),
        );

        const newMessages = (action?.payload ?? []).filter(newMsg => {
          if (!newMsg?.messageId) {
            return true;
          }
          return !existingMessageIds.has(newMsg.messageId);
        });

        if (!newMessages || newMessages.length === 0) return;

        const getTimestamp = (value?: number | string) => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const finalArray = deduplicateMessages([...existingMessages, ...newMessages])?.sort(
          (a, b) => getTimestamp(b?.timestamp) - getTimestamp(a?.timestamp),
        );

        state.chats = {
          ...(state?.chats ?? {}),
          [chatId]: [...finalArray],
        };
        // Save chat to local storage
        AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(finalArray));
        // Note: unread count sync handled by chatMiddleware
      } catch (error) {
        devLogger('updateChat🚀 ~ error:', error);
      }
    },
    loadChatFromStorage: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      if (!chatId) return;
      AsyncStorage.getItem(`chat_${chatId}`).then(data => {
        if (data) {
          try {
            const parsed = JSON.parse(data);
            // Deduplicate messages when loading from storage
            const deduped = deduplicateMessages(parsed);
            state.chats = {
              ...(state.chats ?? {}),
              [chatId]: deduped,
            };
            // Save deduplicated data back to storage
            if (deduped.length !== parsed.length) {
              AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(deduped));
            }
          } catch (e) {
            devLogger('loadChatFromStorage parse error', e);
          }
        }
      });
    },
    editChat: (state, action: PayloadAction<Partial<ChatItemType>>) => {
      const chatId = action.payload?.conversationId || action.payload?.groupId || '';
      if (!chatId) return;
      const oldMessages = state?.chats?.[chatId] || [];
      const newMessages = oldMessages.map(item =>
        item?.messageId == action?.payload?.messageId ? { ...item, ...(action?.payload ?? {}) } : item,
      );
      state.chats = {
        ...(state?.chats ?? {}),
        [chatId]: [...newMessages],
      };
      // Save updated chat to local storage
      AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(newMessages));
    },
    deleteChat: (state, action: PayloadAction<Partial<ChatItemType>>) => {
      const chatId = action.payload?.conversationId || action.payload?.groupId || '';
      if (!chatId || !action.payload?.messageId) return;
      const oldMessages = state?.chats?.[chatId] || [];
      const newMessages = oldMessages.filter(item => item?.messageId != action?.payload?.messageId) || [];
      state.chats = {
        ...(state.chats ?? {}),
        [chatId]: [...newMessages],
      };
      AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(newMessages));
    },
    updateUnreadChat: (state, action: PayloadAction<ChatItemType>) => {
      const oldUnreadChats = [...(state?.unreadChats ?? [])];
      const isIncluded = oldUnreadChats.some(item => item.messageId === action.payload.messageId);
      if (!isIncluded) {
        state.unreadChats = [...oldUnreadChats, action.payload];
      }
      // Note: unread count sync handled by chatMiddleware
    },
    removeUnreadChatById: (state, action: PayloadAction<string>) => {
      state.unreadChats = (state.unreadChats || []).filter(
        item => (item?.conversationId || item?.groupId) !== action.payload,
      );
      // Note: unread count sync handled by chatMiddleware
    },
    // Backwards-compatible name used across the project
    removeUnreadChat: (state, action: PayloadAction<string>) => {
      state.unreadChats = (state.unreadChats || []).filter(
        item => (item?.conversationId || item?.groupId) !== action.payload,
      );
      // Note: unread count sync handled by chatMiddleware
    },
    setChatGroupId: (state, action: PayloadAction<string>) => {
      state.chatGroupId = action.payload;
    },
    setSelectedUser: (state, action: PayloadAction<any[]>) => {
      state.selectedUser = action.payload;
    },
    setOnlineUsers: (state, action: PayloadAction<string[]>) => {
      state.onlineUsers = action.payload;
    },
    addOnlineUser: (state, action: PayloadAction<string>) => {
      state.onlineUsers = [...(state.onlineUsers || []), action.payload];
    },
    removeOnlineUser: (state, action: PayloadAction<string>) => {
      state.onlineUsers = (state.onlineUsers || []).filter(item => item !== action.payload);
    },
    startTypingChat: (state, action: PayloadAction<{ groupId: string; senderID?: string }>) => {
      state.typingChats = {
        ...(state.typingChats ?? {}),
        [action.payload.groupId]: action.payload.senderID || 'unknown',
      };
    },
    stopTypingChat: (state, action: PayloadAction<{ groupId: string }>) => {
      state.typingChats = {
        ...(state.typingChats ?? {}),
        [action.payload.groupId]: false,
      };
    },
    appendChatMessage: (state, action: PayloadAction<ChatItemType>) => {
      const message = action.payload;
      const chatId = message.conversationId || message.groupId || '';
      if (!chatId) return;
      const existingMessages = state.chats[chatId] || [];
      const alreadyExists = existingMessages.some(
        existingMsg => existingMsg?.messageId && existingMsg?.messageId === message?.messageId,
      );
      if (alreadyExists) return;
      state.chats = {
        ...(state.chats ?? {}),
        [chatId]: [message, ...existingMessages],
      };
      AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(state.chats[chatId]));
    },
    updateChatList: (state, action: PayloadAction<GroupDataType[]>) => {
      state.chatList = action.payload;
    },
    updateMessageList: (state, action: PayloadAction<any>) => {
      const message = action.payload;
      const chatId = message.groupId;
      if (!chatId) return;
      const existingMessages = state.chats[chatId] || [];
      const messageIndex = existingMessages.findIndex(msg => msg?.messageId === message?.messageId);
      if (messageIndex !== -1) {
        existingMessages[messageIndex] = {
          ...existingMessages[messageIndex],
          status: message.status,
        };
      } else {
        existingMessages.unshift(message);
      }
      state.chats = {
        ...(state.chats ?? {}),
        [chatId]: existingMessages,
      };
      AsyncStorage.setItem(`chat_${chatId}`, JSON.stringify(existingMessages));
    },
  },
});

export const {
  updateUnreadChat,
  removeUnreadChatById,
  updateChat,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  startTypingChat,
  stopTypingChat,
  editChat,
  deleteChat,
  appendChatMessage,
  updateChatList,
  updateMessageList,
  setSelectedUser,
  setChatGroupId,
  loadChatFromStorage,
} = chatSlice.actions;

export default chatSlice.reducer;
