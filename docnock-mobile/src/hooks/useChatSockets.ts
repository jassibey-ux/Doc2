import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CallSocketEmitTypes, ChatSocketEmitTypes, socketInstance, SocketListenerOptions } from '@socket';
import { devLogger } from '@utils';
import { useAppDispatch, useAppSelector } from './reduxHooks';
import {
  appendChatMessage,
  ChatItemType,
  editChat,
  updateChat,
  updateChatList,
} from '@store';
import { UploadImagePayload, useUploadImageMutation } from '@api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

export type ChatAttachmentTypeRaw = {
  fileName?: string;
  type?: string;
  uri?: string;
  mime?: string;
};

export type ChatMessageAttachmentType = {
  name?: string;
  type?: string;
  data?: string | null;
};

type UploadResponseType = {
  data?: {
    imageUrls?: string[];
  } | string[];
};

type SelectedMediaItem = ChatAttachmentTypeRaw & {
  path?: string;
  filename?: string;
  name?: string;
};

type QueuedMessagePayload = {
  groupId: string;
  senderID: string;
  message: string;
  timestamp: number;
  attachment: ChatMessageAttachmentType[];
  isImportant: boolean;
  messageId: number;
};

const OFFLINE_MESSAGE_QUEUE_KEY = 'offline_message_queue_v1';

const isRemoteAsset = (value?: string | null) => {
  const uri = value ?? '';
  return uri.startsWith('http://') || uri.startsWith('https://');
};

const isLocalAsset = (value?: string | null) => {
  const uri = value ?? '';
  return !!uri && !isRemoteAsset(uri);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getListener = <T extends (...args: any[]) => any>(
  type: SocketListenerOptions,
  eventCallback: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { listener: any; cleanUp: any } => {
  const listener = () => {
    // Remove only this exact callback to avoid removing other listeners
    // registered by other features/components for the same event type.
    socketInstance.off(type, eventCallback);
    socketInstance.on(type, eventCallback);
  };
  const cleanUp = () => socketInstance.off(type, eventCallback);

  return { listener, cleanUp };
};

export const useChatSocket = () => {
  const dispatch = useAppDispatch();
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const chatList = useAppSelector(state => state.chats?.chatList);
  const { mutateAsync: uploadImage } = useUploadImageMutation();
  const isFlushingQueueRef = useRef(false);

  const userId = useMemo(() => loginDetails?.profile?._id, [loginDetails?.profile]);

  const emitUserRegister = useCallback(() => {
    try {
      if (!userId) {
        return false;
      }
      if (!socketInstance.connected) {
        socketInstance.connect();
      }
      socketInstance.emit(ChatSocketEmitTypes.register, userId);
      return true;
    } catch (error) {
      devLogger('🚀 ~ emitUserRegister ~ error:', error);
      return false;
    }
  }, [userId]);

  const emitSetpagename = useCallback((loginid: string,groupid: string) => {
    try {
      // if (!userId) {
      //   throw new Error('Please provide all the required parameters');
      // }
      socketInstance.emit('setpagename', {loginid,groupid});
      return true;
    } catch (error) {
      devLogger('🚀 ~ emitUserRegister ~ error:', error);
      return false;
    }
  }, [userId]);

  const emitLeavepagename = useCallback((loginid: string,groupid: string) => {
    try {
      if (!userId) {
        throw new Error('Please provide all the required parameters');
      }
      socketInstance.emit('leavepagename', {loginid,groupid});
      return true;
    } catch (error) {
      devLogger('🚀 ~ emitUserRegister ~ error:', error);
      return false;
    }
  }, [userId]);

  const emitJoinGroup = useCallback((groupId: string, userIds: string[]) => {
    if (!groupId) {
      throw new Error('Please provide all the required parameters');
    } else {
      try {
        socketInstance.emit(ChatSocketEmitTypes.createGroup, groupId, userIds);
        return true;
      } catch (error) {
        devLogger('🚀 ~ emitJoinGroup ~ error:', error);
        return false;
      }
    }
  }, []);


  const emitGetCallStarted = useCallback(async (groupId: string) => {
    if (!groupId) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
          try {
            socketInstance.emit(
              CallSocketEmitTypes.getcallstart,
              { groupId },
              (messages: any) => {
                const response = JSON.parse(messages)
                devLogger('🚀 ~ emitGetMessagesCall ~ messages:', response);
                resolve(response);
              },
            );
          } catch (error) {
            devLogger('🚀 ~ emitGetMessagesCall ~ error:', error);
            reject(error);
          }
        });
    }
  }, []);

  const emitGetMessages = useCallback(
    async (
      groupId: string,
      page: number = 1,
      pageSize: number = 30,
      onGetMessages?: (more?: boolean) => void,
    ) => {
      if (!page || !pageSize || !groupId || !userId) {
        throw new Error('Please provide all the required parameters');
      } else {
        return await new Promise((resolve, reject) => {
          try {
            socketInstance.emit(
              ChatSocketEmitTypes.getMessages,
              { groupId, page, pageSize },
              (messages: ChatItemType[]) => {
                // devLogger('🚀 ~ emitGetMessages ~ messages:', messages);
                dispatch(updateChat(messages));
                onGetMessages?.(!!messages?.length);
                resolve(messages);
              },
            );
          } catch (error) {
            devLogger('🚀 ~ emitGetMessages ~ error:', error);
            reject(error);
          }
        });
      }
    },
    [userId, dispatch],
  );

  const getQueuedMessages = useCallback(async (): Promise<QueuedMessagePayload[]> => {
    try {
      const rawQueue = await AsyncStorage.getItem(OFFLINE_MESSAGE_QUEUE_KEY);
      const parsedQueue = rawQueue ? JSON.parse(rawQueue) : [];
      return Array.isArray(parsedQueue) ? parsedQueue : [];
    } catch (error) {
      devLogger('🚀 ~ getQueuedMessages ~ error:', error);
      return [];
    }
  }, []);

  const saveQueuedMessages = useCallback(async (messages: QueuedMessagePayload[]) => {
    try {
      await AsyncStorage.setItem(OFFLINE_MESSAGE_QUEUE_KEY, JSON.stringify(messages));
    } catch (error) {
      devLogger('🚀 ~ saveQueuedMessages ~ error:', error);
    }
  }, []);

  const upsertQueuedMessage = useCallback(
    async (messagePayload: QueuedMessagePayload) => {
      const queuedMessages = await getQueuedMessages();
      const existingIndex = queuedMessages.findIndex(item => item?.messageId === messagePayload?.messageId);
      if (existingIndex !== -1) {
        queuedMessages[existingIndex] = messagePayload;
      } else {
        queuedMessages.push(messagePayload);
      }
      await saveQueuedMessages(queuedMessages);
    },
    [getQueuedMessages, saveQueuedMessages],
  );

  const removeQueuedMessage = useCallback(
    async (messageId: number) => {
      const queuedMessages = await getQueuedMessages();
      const updatedQueue = queuedMessages.filter(item => item?.messageId !== messageId);
      await saveQueuedMessages(updatedQueue);
    },
    [getQueuedMessages, saveQueuedMessages],
  );

  const uploadAttachmentIfNeeded = useCallback(
    async (attachments: ChatMessageAttachmentType[] = []): Promise<ChatMessageAttachmentType[]> => {
      if (!attachments?.length) {
        return [];
      }

      const localAttachments = attachments.filter(item => isLocalAsset(item?.data));
      if (!localAttachments.length) {
        return attachments;
      }

      const uploadPayload: UploadImagePayload = localAttachments.map((item, index) => ({
        uri: item?.data ?? '',
        name: item?.name || `Media_${index + 1}`,
        type: item?.type || 'application/octet-stream',
      }));

      const response = (await uploadImage(uploadPayload)) as UploadResponseType;
      const uploadedUrls = Array.isArray(response?.data)
        ? response?.data
        : response?.data?.imageUrls ?? [];

      if (!uploadedUrls.length) {
        return attachments;
      }

      let uploadedIndex = 0;
      return attachments.map(item => {
        if (!isLocalAsset(item?.data)) {
          return item;
        }
        const uploadedUrl = uploadedUrls[uploadedIndex] ?? item?.data;
        uploadedIndex += 1;
        return {
          ...item,
          data: uploadedUrl,
        };
      });
    },
    [uploadImage],
  );

  const flushQueuedMessages = useCallback(async () => {
    if (!userId || !socketInstance.connected || isFlushingQueueRef.current) {
      return;
    }

    isFlushingQueueRef.current = true;

    try {
      const queuedMessages = await getQueuedMessages();
      const ownQueuedMessages = queuedMessages
        .filter(item => item?.senderID === userId)
        .sort((a, b) => Number(a?.timestamp) - Number(b?.timestamp));

      for (const queuedMessage of ownQueuedMessages) {
        if (!socketInstance.connected) {
          break;
        }

        try {
          const finalAttachment = await uploadAttachmentIfNeeded(queuedMessage?.attachment ?? []);
          socketInstance.emit(ChatSocketEmitTypes.sendMessage, {
            ...queuedMessage,
            attachment: finalAttachment,
          });

          dispatch(
            editChat({
              groupId: queuedMessage.groupId,
              messageId: queuedMessage.messageId,
              status: 'SENT',
              attachments: finalAttachment,
            }),
          );

          await removeQueuedMessage(queuedMessage.messageId);
        } catch (error) {
          devLogger('🚀 ~ flushQueuedMessages ~ error:', error);
          dispatch(
            editChat({
              groupId: queuedMessage.groupId,
              messageId: queuedMessage.messageId,
              status: 'QUEUED',
            }),
          );
        }
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [dispatch, getQueuedMessages, removeQueuedMessage, uploadAttachmentIfNeeded, userId]);

  const emitSendMessage = useCallback(
    async (
      message: string,
      groupId: string,
      attachment?: ChatMessageAttachmentType[],
      isImportant?: boolean,
      selectedMedia?: ChatAttachmentTypeRaw[],
      onProgress?: (percent: number) => void,
    ) => {
      if (!(attachment?.length || message || selectedMedia?.length) || !groupId || !userId) {
        throw new Error('Please provide all the required parameters');
      } else {
        const timestamp = new Date().getTime();
        const uid = Math.floor(Math.random() * 10000);
        const messageId = uid + timestamp;

        const mediaForUpload = (selectedMedia ?? []).filter(item => {
          const mediaItem = item as SelectedMediaItem;
          return !!(mediaItem?.path || mediaItem?.uri);
        });

        const localAttachment = mediaForUpload.map((item, index) => {
          const mediaItem = item as SelectedMediaItem;
          const fallbackName = `Media_${index + 1}`;
          return {
            name: mediaItem?.fileName || mediaItem?.filename || mediaItem?.name || fallbackName,
            type: mediaItem?.type || mediaItem?.mime || 'application/octet-stream',
            data: mediaItem?.uri || mediaItem?.path || '',
          };
        });

        const sanitizedAttachment = (
          localAttachment?.length > 0 ? localAttachment : attachment ?? []
        ).map(item => ({
          name: item?.name,
          type: item?.type,
          data: item?.data,
        }));

        const localParams: any = {
          groupId,
          senderID: userId,
          message,
          timestamp,
          attachment: sanitizedAttachment,
          isImportant: !!isImportant,
          messageId,
          status: 'SENDING',
        };

        const payload = {
          ...localParams,
          attachments: localParams.attachment,
        };
        dispatch(appendChatMessage(payload as ChatItemType));

        // Upload and emit in background so preview/screen transition does not wait.
        (async () => {
          let attachmentForSocket = sanitizedAttachment;
          try {
            if (mediaForUpload?.length) {
              const uploadPayload: UploadImagePayload = mediaForUpload.map(item => {
                const mediaItem = item as SelectedMediaItem;
                if (mediaItem?.path) {
                  return mediaItem as UploadImagePayload[number];
                }
                return {
                  uri: mediaItem?.uri ?? '',
                  name: mediaItem?.fileName || mediaItem?.name,
                  type: mediaItem?.type || mediaItem?.mime,
                };
              });

              const response = (await uploadImage(uploadPayload, onProgress)) as UploadResponseType;
              const uploadedUrls = Array.isArray(response?.data)
                ? response?.data
                : response?.data?.imageUrls ?? [];

              attachmentForSocket = uploadedUrls.map((url, index) => {
                const selectedItem = mediaForUpload[index] as SelectedMediaItem | undefined;
                const fallbackName = `Media_${index + 1}`;
                return {
                  name:
                    selectedItem?.fileName ||
                    selectedItem?.filename ||
                    selectedItem?.name ||
                    fallbackName,
                  type: selectedItem?.type || selectedItem?.mime || 'application/octet-stream',
                  data: url,
                };
              });

              dispatch(
                editChat({
                  groupId,
                  messageId,
                  attachments: attachmentForSocket,
                }),
              );
            }

            const netInfo = await NetInfo.fetch();
            const canSendNow = !!netInfo?.isConnected && socketInstance.connected;

            const queuePayload: QueuedMessagePayload = {
              groupId,
              senderID: userId,
              message,
              timestamp,
              attachment: attachmentForSocket,
              isImportant: !!isImportant,
              messageId,
            };

            if (!canSendNow) {
              await upsertQueuedMessage(queuePayload);
              dispatch(
                editChat({
                  groupId,
                  messageId,
                  status: 'QUEUED',
                  attachments: attachmentForSocket,
                }),
              );
              return;
            }

            const socketParams: any = {
              ...localParams,
              attachment: attachmentForSocket,
            };
            socketInstance.emit(ChatSocketEmitTypes.sendMessage, socketParams);
            dispatch(
              editChat({
                groupId,
                messageId,
                status: 'SENT',
                attachments: attachmentForSocket,
              }),
            );
            await removeQueuedMessage(messageId);
            emitUserRegister();
          } catch (error) {
            devLogger('🚀 ~ emitSendMessage ~ background upload/send error:', error);
            await upsertQueuedMessage({
              groupId,
              senderID: userId,
              message,
              timestamp,
              attachment: attachmentForSocket,
              isImportant: !!isImportant,
              messageId,
            });
            dispatch(
              editChat({
                groupId,
                messageId,
                status: 'QUEUED',
                attachments: attachmentForSocket,
              }),
            );
          }
        })();

        return true;
      }
    },
    [dispatch, emitUserRegister, removeQueuedMessage, uploadImage, upsertQueuedMessage, userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state?.isConnected && socketInstance.connected) {
        flushQueuedMessages();
      }
    });

    const onSocketConnect = () => {
      flushQueuedMessages();
    };

    socketInstance.on('connect', onSocketConnect);
    flushQueuedMessages();

    return () => {
      unsubscribeNetInfo();
      socketInstance.off('connect', onSocketConnect);
    };
  }, [flushQueuedMessages, userId]);

  const emitTyping = useCallback(
    async (groupId: string) => {
      if (!groupId || !userId) {
        throw new Error('Please provide all the required parameters');
      } else {
        return await new Promise((resolve, reject) => {
          try {
            socketInstance.emit(
              ChatSocketEmitTypes.typing,
              { groupId, senderID: userId },
              (response: object) => {
                devLogger('🚀 ~ emitTyping ~ response:', response);
                resolve(response);
              },
            );
          } catch (error) {
            devLogger('🚀 ~ emitTyping ~ error:', error);
            reject(error);
          }
        });
      }
    },
    [userId],
  );

  const emitStopTyping = useCallback(
    async (groupId: string) => {
      if (!groupId || !userId) {
        throw new Error('Please provide all the required parameters');
      } else {
        return await new Promise((resolve, reject) => {
          try {
            socketInstance.emit(
              ChatSocketEmitTypes.stopTyping,
              { groupId, senderID: userId },
              (response: object) => {
                devLogger('🚀 ~ emitStopTyping ~ response:', response);
                resolve(response);
              },
            );
          } catch (error) {
            devLogger('🚀 ~ emitStopTyping ~ error:', error);
            reject(error);
          }
        });
      }
    },
    [userId],
  );

  const emitGetUserOnline = async () => {
    if (!userId) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(
            ChatSocketEmitTypes.getOnlineUsers,
            { userId },
            (response: object) => {
              devLogger('🚀 ~ emitGetUserOnline ~ response:', response);
              resolve(response);
            },
          );
        } catch (error) {
          devLogger('🚀 ~ emitGetUserOnline ~ error:', error);
          reject(error);
        }
      });
    }
  };

  const getUnreadCount = async (groupId: string) => {
    if (!userId && !groupId) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(
            ChatSocketEmitTypes.getUnreadCount,
            { userId, groupId },
            (response: object) => {
              devLogger('🚀 ~ getUnreadCount ~ response:', response);
              resolve(response);
            },
          );
        } catch (error) {
          devLogger('🚀 ~ getUnreadCount ~ error:', error);
          reject(error);
        }
      });
    }
  };

  const emitDisconnection = async () => {
    if (!userId) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(ChatSocketEmitTypes.disconnection, (response: object) => {
            devLogger('🚀 ~ emitDisconnection ~ response:', response);
            resolve(response);
          });
        } catch (error) {
          devLogger('🚀 ~ emitDisconnection ~ error:', error);
          reject(error);
        }
      });
    }
  };

  const emitEditMessage = async (groupId: string, messageId: string, message: string) => {
    if (!groupId || !messageId || !message) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(ChatSocketEmitTypes.editMessage, { groupId, messageId, message });
          resolve(true);
        } catch (error) {
          devLogger('🚀 ~ emitEditMessage ~ error:', error);
          reject(false);
        }
      });
    }
  };
  const emitEditGroupMember = async (groupId: string) => {
    if (!groupId) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(ChatSocketEmitTypes.editGroup, { groupId });
          resolve(true);
        } catch (error) {
          devLogger('🚀 ~ emitEditGroupMember ~ error:', error);
          reject(false);
        }
      });
    }
  };

  const emitDeleteMessage = async (groupId: string, messageId: string, userIds: string[]) => {
    if (!groupId || !messageId || !userIds) {
      throw new Error('Please provide all the required parameters');
    } else {
      return await new Promise((resolve, reject) => {
        try {
          socketInstance.emit(ChatSocketEmitTypes.deleteMessage, { groupId, messageId, userIds });
          resolve(true);
        } catch (error) {
          devLogger('🚀 ~ emitDeleteMessage ~ error:', error);
          reject(false);
        }
      });
    }
  };

  const emitMarkAsRead = (groupId: string, userId: string): Promise<void> => {
    return new Promise((resolve) => {
      socketInstance.emit(ChatSocketEmitTypes.markAsRead, { groupId, userId }, () => {
        const updatedChatList = (chatList ?? []).map((group: any) =>
          group?.groupId === groupId ? { ...group, count: 0 } : group,
        );
        dispatch(updateChatList(updatedChatList));
        resolve();
      });
    });
  };
  
  const emitDeleteConversation = (conversationId: string, userId: string): Promise<any> => {
    return new Promise((resolve) => {
      socketInstance.emit(ChatSocketEmitTypes.deleteConversation, { conversationId, userId }, (response: any) => {
        devLogger('🚀 ~ emitDeleteConversation ~ response:', response);
        resolve(response);
      });
    });
  };
  return {
    emitUserRegister,
    emitJoinGroup,
    emitGetMessages,
    emitSendMessage,
    emitTyping,
    emitStopTyping,
    emitGetUserOnline,
    emitDisconnection,
    emitEditMessage,
    emitDeleteMessage,
    emitSetpagename,
    emitLeavepagename,
    emitGetCallStarted,
    emitMarkAsRead,
    emitEditGroupMember,
    emitDeleteConversation,
    getUnreadCount,
    flushQueuedMessages,
  };
};
