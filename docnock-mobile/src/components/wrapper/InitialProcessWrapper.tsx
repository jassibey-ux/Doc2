import { FC, PropsWithChildren, useEffect, useState, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import branch from 'react-native-branch';
import { decryptData, devLogger } from '@utils';
import {
  CallAcceptedResponseType,
  CallCancelledResponseType,
  getListener,
  RingerStartedResponseType,
  useAppDispatch,
  useAppSelector,
  useCallSockets,
  useChatSocket,
  useLocation,
  useCallPermissions,
} from '@hooks';
import {
  acceptCall,
  addOnlineUser,
  appendChatMessage,
  ChatItemType,
  clearIncomingCallData,
  deleteChat,
  editChat,
  rejectCall,
  removeOnlineUser,
  setDeviceToken,
  setFcmToken,
  setNotifcationUnreadCont,
  startTypingChat,
  stopTypingChat,
  updateChatList,
  updateProfile,
  updateUnreadChat,
  updateMessageList,
  resetCall,
} from '@store';
import { setIncomingCallData } from '@store';
import { navigationRef } from '@navigation';
import {
  API_ENDPOINTS,
  axiosAuthClient,
  useGetUserInfoMutation,
  useGetUserUnreadCount,
} from '@api';
import { focusManager } from '@tanstack/react-query';
import { CallSocketEmitTypes, CallSocketListenerTypes, ChatSocketListenerTypes, socketInstance } from '@socket';
import { useCallContext, CallType } from '@context';
import { showMessage } from 'react-native-flash-message';
import RNVoipCall, { RNVoipPushKit } from 'react-native-voips-calls';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const InitialProcessWrapperState: FC<PropsWithChildren> = ({ children }) => {
  const dispatch = useAppDispatch();

  const { loginDetails } = useAppSelector(state => state.auth);
  const { callData } = useAppSelector(state => state.voipCall);
  const chatList = useAppSelector(state => state.chats?.chatList);
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();
  const { emitUserRegister } = useChatSocket();
  const { generateAgoraToken } = useCallSockets();

  const {
    type,
    setAdditionalData,
    setCallRingerDetails,
    setShowRingerDialogue,
    leaveChannel,
    callRingerDetails,
    callSenderDetails,
    setAllCallDetails,
    setCallingValue,
    showCallSenderModel,
    setShowCallSenderModel,
    startCall,
    isCallOngoing,
    setCallSenderDetails,
    setAgoraToken,
    showCallRibbon,
    setShowCallRibbon,
    setFocusedUser,
    setSelfUID,
  } = useCallContext();
  const { emitRejectCall} = useCallSockets();

  // Keep refs to context functions so socket listeners always call the latest versions,
  // avoiding stale-closure issues (startCall, leaveChannel change frequently).
  const startCallRef = useRef(startCall);
  const leaveChannelRef = useRef(leaveChannel);
  useEffect(() => { startCallRef.current = startCall; }, [startCall]);
  useEffect(() => { leaveChannelRef.current = leaveChannel; }, [leaveChannel]);

  const { requestPermission: requestLocationPermission } = useLocation();

  const { requestCallPermissions } = useCallPermissions();

  //* fcmToken
  useEffect(() => {
    const requestUserPermission = async () => {
      try {
        await requestLocationPermission();
      } catch (error) {
        devLogger('🚀 ~ requestUserPermission ~ error:', error);
      }
    };

    requestUserPermission();
  }, [dispatch, requestLocationPermission]);

  // Proactively request call (mic/camera) permissions once after login so
  // first incoming/outgoing calls from background don't get blocked on iOS.
  useEffect(() => {
    const ensureCallPermissions = async () => {
      if (!loginDetails?.token) return;
      try {
        await requestCallPermissions(CallType.video);
      } catch (error) {
        devLogger('🚀 ~ ensureCallPermissions ~ error:', error);
      }
    };

    // Only run on real devices (not web) and primarily needed on iOS.
    if (Platform.OS !== 'web') {
      ensureCallPermissions();
    }
  }, [loginDetails?.token, requestCallPermissions]);

  const pendingOutgoingGroupIdRef = useRef<string | null>(null);
  const callRingerDetailsRef = useRef<any>(callRingerDetails);
  const showCallSenderModelRef = useRef<boolean>(!!showCallSenderModel);
  const callSenderDetailsRef = useRef<any>(callSenderDetails);
  const loginIdRef = useRef<any>(loginDetails?.profile?._id);
  const isAuthenticatedRef = useRef<boolean>(
    !!loginDetails?.token && !!loginDetails?.profile?._id,
  );
  const lastAcceptedKeyRef = useRef<string>('');
  const outgoingFallbackStartedRef = useRef<boolean>(false);
  const outgoingCallAudioRef = useRef<boolean>(false);
  const outgoingRingStartedAtRef = useRef<number>(0);
  useEffect(() => {
    loginIdRef.current = loginDetails?.profile?._id;
    isAuthenticatedRef.current = !!loginDetails?.token && !!loginDetails?.profile?._id;
  }, [loginDetails?.profile?._id]);
  useEffect(() => {
    isAuthenticatedRef.current = !!loginDetails?.token && !!loginDetails?.profile?._id;
  }, [loginDetails?.token, loginDetails?.profile?._id]);
  useEffect(() => {
    showCallSenderModelRef.current = !!showCallSenderModel;
  }, [showCallSenderModel]);
  useEffect(() => {
    if (callSenderDetails?.groupId) {
      pendingOutgoingGroupIdRef.current = callSenderDetails.groupId;
    }
    callSenderDetailsRef.current = callSenderDetails;
  }, [callSenderDetails]);
  useEffect(() => {
    callRingerDetailsRef.current = callRingerDetails;
  }, [callRingerDetails]);

  useEffect(() => {
    const onCallAccepted = async (data: any) => {
      const callerId = data?.callerId ?? data?.callerID ?? data?.callerid;
      const acceptedGroupId = data?.groupId ?? data?.groupid;
      const hasAudioInPayload = data?.audio !== undefined && data?.audio !== null;
      const payloadAudio = data?.audio === true || data?.audio === 'true' || data?.audio === 1;
      const acceptedAudio = hasAudioInPayload ? payloadAudio : outgoingCallAudioRef.current;

      if (!acceptedGroupId) return;

      const acceptedGroupKey = String(acceptedGroupId);
      const pendingGroupKey = String(pendingOutgoingGroupIdRef.current ?? '');
      const senderGroupKey = String(callSenderDetailsRef.current?.groupId ?? '');
      const ringerGroupKey = String(callRingerDetailsRef.current?.groupId ?? '');

      const dedupeKey = `${acceptedGroupId}_${callerId}_${acceptedAudio}`;
      const now = Date.now();
      const sameAsLast = lastAcceptedKeyRef.current === dedupeKey;
      const lastAt = (onCallAccepted as any).__lastHandledAt || 0;
      if (sameAsLast && now - lastAt < 1500) {
        return;
      }
      (onCallAccepted as any).__lastHandledAt = now;
      lastAcceptedKeyRef.current = dedupeKey;

      if (outgoingRingStartedAtRef.current) {
        const latency = now - outgoingRingStartedAtRef.current;
        devLogger('📞 callAccepted latency(ms):', latency);
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            acceptedAt: now,
            acceptedLatencyMs: latency,
          },
        }));
      }

      const isPendingOutgoingGroup = pendingOutgoingGroupIdRef.current === acceptedGroupId;
      const isSenderDetailsGroup = callSenderDetailsRef.current?.groupId === acceptedGroupId;
      const isMatchedByGroupKey =
        acceptedGroupKey === pendingGroupKey ||
        acceptedGroupKey === senderGroupKey ||
        acceptedGroupKey === ringerGroupKey;
      const isOutgoingRingingState =
        !!showCallSenderModelRef.current ||
        !!callSenderDetailsRef.current?.groupId ||
        !!pendingOutgoingGroupIdRef.current;
      const shouldStartCallerSide =
        String(loginIdRef.current) === String(callerId) ||
        isPendingOutgoingGroup ||
        isSenderDetailsGroup ||
        showCallSenderModelRef.current ||
        isMatchedByGroupKey ||
        isOutgoingRingingState;

      if (!shouldStartCallerSide) {
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            acceptedSkipReason: 'caller-mismatch-no-group-match',
            acceptedGroupId: acceptedGroupKey,
            acceptedCallerId: String(callerId ?? ''),
            outgoingRingingState: isOutgoingRingingState,
          },
        }));
        return;
      }

      setAdditionalData((prev: any) => ({
        ...(prev || {}),
        callDebug: {
          ...((prev || {})?.callDebug || {}),
          startRequestedAt: Date.now(),
          acceptedGroupId: acceptedGroupKey,
          acceptedCallerId: String(callerId ?? ''),
          outgoingRingingState: isOutgoingRingingState,
        },
      }));

      const effectiveGroupId =
        acceptedGroupId ||
        callSenderDetailsRef.current?.groupId ||
        pendingOutgoingGroupIdRef.current;

      if (!effectiveGroupId) {
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            acceptedSkipReason: 'missing-effective-groupId',
          },
        }));
        return;
      }

      pendingOutgoingGroupIdRef.current = null;
      outgoingFallbackStartedRef.current = true;
      startCallRef.current?.(
        effectiveGroupId,
        acceptedAudio,
        false,
        (data?.groupmember ?? data?.isGroup) || false,
      );
    };

    socketInstance.on(CallSocketListenerTypes.callAccepted, onCallAccepted);
    return () => {
      socketInstance.off(CallSocketListenerTypes.callAccepted, onCallAccepted);
    };
  }, [setShowCallSenderModel, setShowRingerDialogue, setCallRingerDetails]);

  useEffect(() => {
    if (!showCallSenderModel || !callSenderDetails?.groupId) {
      outgoingFallbackStartedRef.current = false;
      return;
    }

    const groupId = callSenderDetails.groupId;
    const myId = String(loginIdRef.current ?? '');

    const checkParticipantAndStart = () => {
      if (outgoingFallbackStartedRef.current) {
        return;
      }

      socketInstance.emit(
        CallSocketEmitTypes.getparticipantinfo,
        { groupId },
        (ack: any) => {
          try {
            const parsed = typeof ack === 'string' ? JSON.parse(ack) : ack;
            const participants = parsed?.participant || [];
            const hasOtherParticipant = participants.some((p: any) => {
              const participantId = String(
                p?.loginid ?? p?.userId ?? p?._id ?? p?.userid ?? p?.id ?? '',
              );
              return participantId && participantId !== myId;
            });

            if (hasOtherParticipant && !outgoingFallbackStartedRef.current) {
              outgoingFallbackStartedRef.current = true;
              pendingOutgoingGroupIdRef.current = null;
              setAdditionalData((prev: any) => ({
                ...(prev || {}),
                callDebug: {
                  ...((prev || {})?.callDebug || {}),
                  fallbackStartAt: Date.now(),
                  fallbackTriggered: true,
                },
              }));
              startCallRef.current?.(
                groupId,
                outgoingCallAudioRef.current,
                false,
                !!callSenderDetails?.group,
              );
            }
          } catch (e) {
            // ignore malformed ack; next poll tick will retry
          }
        },
      );
    };

    // Run immediately once, then at a balanced interval to avoid JS-thread pressure.
    checkParticipantAndStart();
    const interval = setInterval(checkParticipantAndStart, 1200);

    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 20000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      outgoingFallbackStartedRef.current = false;
    };
  }, [showCallSenderModel, callSenderDetails?.groupId, callSenderDetails?.group, type]);

  useEffect(() => {
    iosPushKit();
  }, []);

  const fetchGroupList = async ({ limit = 20, userId = '', page = 1, searchKey = '' }) => {
    const params = {
      page,
      limit,
      userId,
      name: searchKey,
    };

    const response = await axiosAuthClient.get(API_ENDPOINTS.GROUP_LIST, { params });

    if (response?.data?.success) {
      const data = await decryptData(response?.data?.encryptDatagroupdata);
      const pagination: any = response?.data?.pagination;
      return { data: [...(data ?? [])], pagination };
    }

    return null;
  };

  const iosPushKit = () => {
    if (Platform.OS === 'ios') {
      //For Push Kit
      RNVoipPushKit.requestPermissions(); // --- optional, you can use another library to request permissions

      //Ios PushKit device token Listner
      RNVoipPushKit.getPushKitDeviceToken((res: any) => {
        if (res.platform === 'ios') {
          if (res?.deviceToken) {
            dispatch(setDeviceToken(res?.deviceToken));
          }
        }
      });

      // On Remote Push notification Received in Foreground or when app wakes
      RNVoipPushKit.RemotePushKitNotificationReceived((notification: any) => {
        console.log('RemotePushKitNotificationReceived ->', notification);
        if (!isAuthenticatedRef.current) {
          return;
        }
        try {
          const uuid = notification?.uuid || notification?.callerId || notification?.id || '';
          // Save incoming call data to redux so other parts can consume
          dispatch(setIncomingCallData({ uuid: uuid, data: notification }));
          // Also set UI ringer details so user sees incoming call
          setCallRingerDetails?.(notification);
          setAllCallDetails?.(pre => [notification, ...(pre || [])]);
          setShowRingerDialogue?.(true);
        } catch (err) {
          devLogger('Error handling PushKit notification:', err);
        }
      });
    }
  };
  useEffect(() => {
    let options = {
      appName: 'DocNock', // Required
      imageName: 'logo', //string (optional) in ios Resource Folder
      ringtoneSound: '', //string (optional) If provided, it will be played when incoming calls received
      includesCallsInRecents: false, // boolean (optional) If provided, calls will be shown in the recent calls
      supportsVideo: true, //boolean (optional) If provided, whether or not the application supports video calling (Default: true)
    };
    RNVoipCall.initializeCall(options)
      .then(() => {
        console.log('VOIP IntializedSuccessfully======');
      })
      .catch((e: string) => console.log(e));

    RNVoipCall.addEventListener('answerCall', async (data: any) => {
      console.log('answerCall data log == ', data);
      if (!isAuthenticatedRef.current) {
        return;
      }
      // Use payload from the event if available, else fall back to stored callData
      const payload = data?.payload || data || callData;
      setCallRingerDetails?.(payload);
      dispatch(acceptCall());
    });
    
    const onPressRejectCall = async () => {
      {console.log('reject call is calling', callData)}
      if (!callData?.callerId || !callData?.groupId) {
        return;
      }
      const success = await emitRejectCall(callData?.callerId, callData?.groupId);
      if (success) {
        setShowRingerDialogue?.(false);
        setCallRingerDetails?.(null);
        dispatch(clearIncomingCallData());
      }
    };

    RNVoipCall.addEventListener('endCall', async (data: any) => {
      console.log('📴 VoIP endCall event:', data);

      // 1) Try to leave the Agora channel and close any in-app call UI.
      try {
        await leaveChannelRef.current?.();
      } catch (e) {
        devLogger('Error calling leaveChannel from endCall event:', e);
      }

      // 2) Inform backend that call was rejected/ended if we still have payload.
      try {
        const payload = data?.payload || data || callData;
        if (payload?.callerId && payload?.groupId) {
          await emitRejectCall(payload?.callerId, payload?.groupId);
        }
      } catch (e) {
        devLogger('Error handling endCall payload cleanup:', e);
      }

      // 3) Clear any remaining local VOIP redux state and ringer UI.
      dispatch(resetCall());
      setShowRingerDialogue?.(false);
      setCallRingerDetails?.(null);
      dispatch(clearIncomingCallData());
      dispatch(setIsBusy(false));
    });
    // const handleAnswerCall = () => {
    //   console.log('✅ Accept call from InitialWrapper');
    //   dispatch(acceptCall());
    // };

    // handle resume from background
    RNVoipCall.getInitialNotificationActions().then((data: any) => {
      console.log('🔔 Initial notification data:', data);
      if (data?.name === 'answerCall' || data?.action === 'answerCall') {
        // Open call screen directly
          const payload = data?.payload || callData;
          setCallRingerDetails?.(payload);
          dispatch(acceptCall());
      }
    });

    return () => {
      RNVoipCall.removeEventListener('answerCall');
      RNVoipCall.removeEventListener('endCall');
    };
  }, []);

  // BranchIO listener for deep linking
  useEffect(() => {
    const branchListener = branch.subscribe({
      onOpenComplete: e => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = e?.params?.custom_data as any;
        const token = data?.token;
        const type = data?.type;
        if (token && type) {
          if (type === 'forgot_password') {
            navigationRef?.navigate('ResetPasswordScreen', { token });
          } else if (type === 'setup_profile') {
            navigationRef?.navigate('SignupScreen', { token });
          }
        }
      },
    });

    return () => {
      branchListener();
    };
  }, []);

  // Set user's info from encrypted data and set to redux store
  useEffect(() => {
    const getAndSetUserInfo = async () => {
      try {
        const response = await getUserInfo();
        if (response?.data?.success && response?.data?.encryptDatauserdata) {
          const profile = await decryptData(response?.data?.encryptDatauserdata);
          dispatch(updateProfile(profile));
        }
      } catch (error) {
        devLogger('🚀 ~ getAndSetUserInfo ~ error:', error);
      }
    };

    if (loginDetails?.token && !loginDetails?.profile?._id) {
      getAndSetUserInfo();
    }
  }, [loginDetails?.token, loginDetails?.profile?._id, getUserInfo, dispatch]);

  // Preload cached chat list and per-chat messages from AsyncStorage to speed up loading
  useEffect(() => {
    const preloadChats = async () => {
      try {
        const raw = await AsyncStorage.getItem('chat_list');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            dispatch(updateChatList(parsed));
            // load per-chat cached messages
            for (const g of parsed) {
              const chatId = g?.groupId || g?.conversationId || g?.id;
              if (chatId) {
                dispatch({ type: 'chats/loadChatFromStorage', payload: chatId });
              }
            }
          }
        }
      } catch (e) {
        devLogger('preloadChats error', e);
      }
    };

    preloadChats();
  }, [dispatch]);

  // Refresh the query when app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
    });

    return () => subscription.remove();
  }, []);

  // Defensive recovery: if app becomes active and there is stale call UI/state, try to clean it up
  useEffect(() => {
    const handleAppActiveRecovery = async (nextState: string) => {
      if (nextState !== 'active') return;
      if (isCallOngoing) return;

      try {
        // If we have voip call data, call ringer UI, or callkeep state active, attempt cleanup
        const voip = store.getState()?.voipCall;
        const callKeepStatus = store.getState()?.callKeep?.status;
        const hasIncoming = !!(voip?.callUUID || callRingerDetails || callKeepStatus !== 'idle');
        if (hasIncoming) {
          // Try to end any native call UI first
          try {
            await RNVoipCall.endAllCalls();
          } catch (e) {
            devLogger('RNVoipCall.endAllCalls error', e);
          }
          try {
            // RNCallKeep may not be available on web builds
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const RNCallKeep = require('react-native-callkeep');
            RNCallKeep.endAllCalls && RNCallKeep.endAllCalls();
          } catch (e) {
            devLogger('RNCallKeep.endAllCalls not available', e);
          }

          // Ask the server whether the call is still active; if not, perform full cleanup.
          // We don't block on the server check — perform local cleanup defensively.
          try {
            await leaveChannelRef.current?.();
          } catch (e) {
            devLogger('leaveChannel error during recovery', e);
          }

          // Clear redux call state to avoid stuck UI
          try {
            dispatch(resetCall());
            dispatch(clearIncomingCallData());
            dispatch(setNotifcationUnreadCont?.(store.getState()?.chats?.unreadChats?.length ?? 0));
            setShowRingerDialogue?.(false);
            setCallRingerDetails?.(null);
            setShowCallSenderModel?.(false);
            setAllCallDetails?.([]);
            setShowCallRibbon?.(false);
          } catch (e) {
            devLogger('Failed clearing call state during recovery', e);
          }

          // If app is still showing the CallingScreen, navigate back to Chats
          try {
            const state = navigationRef.getState?.();
            const current = state ? findNestedRoute(state) : null;
            if (current === 'CallingScreen') {
              navigationRef.navigate('BottomTabNavigator', { screen: 'Chats' });
            }
          } catch (e) {
            devLogger('Navigation recovery error', e);
          }
        }
      } catch (err) {
        devLogger('Error in app active recovery handler', err);
      }
    };

    const sub = AppState.addEventListener('change', handleAppActiveRecovery);
    return () => sub.remove();
  }, [callRingerDetails, isCallOngoing, leaveChannel, dispatch, setShowRingerDialogue, setCallRingerDetails, setShowCallSenderModel, setAllCallDetails, setShowCallRibbon]);

  // Chat and Call Related Global Listener
  useEffect(() => {
    if (!loginDetails?.token || !loginDetails?.profile?._id) {
      return;
    }

    // Chat Related Listener
    const { cleanUp: cleanupUserOnline, listener: userOnlineListener } = getListener(
      ChatSocketListenerTypes.userOnline,
      (data: string) => {
        dispatch(addOnlineUser(data));
      },
    );

    userOnlineListener();

    const { cleanUp: cleanupUserOffline, listener: userOfflineListener } = getListener(
      ChatSocketListenerTypes.userOffline,
      (data: string) => {
        dispatch(removeOnlineUser(data));
      },
    );

    userOfflineListener();

    const { cleanUp: cleanupUserTyping, listener: userTypingListener } = getListener(
      ChatSocketListenerTypes.userTyping,
      (data: string) => {
        dispatch(startTypingChat(data));
      },
    );

    userTypingListener();

    const { cleanUp: cleanupMessageRead, listener: MessageReadListener } = getListener(
      ChatSocketListenerTypes.messageRead,
      (data: any) => {
        devLogger('🚀 ~ messageRead');

        dispatch(
          updateMessageList({
            messageId: data.messageId,
            groupId: data.conversationId,
            status: 'READ',
          } as any),
        );
      },
    );

    MessageReadListener();
    const { cleanUp: cleanupMessageDeliver, listener: MessageDeliverListener } = getListener(
      ChatSocketListenerTypes.messageDelivered,
      (data: any) => {
      devLogger('🚀 ~ messageDelivered');
        dispatch(
          updateMessageList({
            messageId: data.messageId,
            groupId: data.conversationId,
            status: 'DELIVERED',
          } as any),
        );
      },
    );

    MessageDeliverListener();

    const { cleanUp: cleanupUserStopTyping, listener: userStopTypingListener } = getListener(
      ChatSocketListenerTypes.userStopTyping,
      (data: string) => {
        dispatch(stopTypingChat(data));
      },
    );

    userStopTypingListener();

    const { cleanUp: newMessageListenerCleanUp, listener: newMessageListener } = getListener(
      ChatSocketListenerTypes.newMessage,
      (data: any) => {
        dispatch(updateUnreadChat(data));
        dispatch(setNotifcationUnreadCont((prev: number) => prev + 1));
        if (data?.senderDetails?._id !== loginDetails?.profile?._id) {
          emitUserRegister();
          dispatch(appendChatMessage(data));
        }
      },
    );

    newMessageListener();

    const { cleanUp: editMessageListenerCleanup, listener: editMessageListener } = getListener(
      ChatSocketListenerTypes.editMessage,
      (data: ChatItemType) => {
        dispatch(editChat(data));
      },
    );

    editMessageListener();

    const { cleanUp: deleteMessageListenerCleanup, listener: deleteMessageListener } = getListener(
      ChatSocketListenerTypes.messageDeleted,
      (data: ChatItemType) => {
        dispatch(deleteChat(data));
        dispatch(updateUnreadChat(data));
      },
    );

    deleteMessageListener();

    // Call Related Listener
    const { cleanUp: callRingerStartCleanup, listener: callRingerStartListener } = getListener(
      CallSocketListenerTypes.ringerstarted,
      (data: RingerStartedResponseType) => {
        if (!isAuthenticatedRef.current || !loginIdRef.current) {
          return;
        }
        const ringingGroupId = (data as any)?.groupId ?? (data as any)?.groupid;
        const ringingAudio =
          (data as any)?.audio === true ||
          (data as any)?.audio === 'true' ||
          (data as any)?.audio === 1;
        setCallRingerDetails(data);
        setAllCallDetails?.(pre => [data, ...(pre || [])]);
        if (data?.callerId !== loginDetails?.profile?._id && !showCallRibbon) {
          setShowRingerDialogue?.(true);
        } else {
          pendingOutgoingGroupIdRef.current = ringingGroupId ?? null;
          outgoingCallAudioRef.current = ringingAudio;
          outgoingRingStartedAtRef.current = Date.now();
          setAdditionalData((prev: any) => ({
            ...(prev || {}),
            callDebug: {
              ...((prev || {})?.callDebug || {}),
              ringStartedAt: outgoingRingStartedAtRef.current,
              ringAudio: ringingAudio,
            },
          }));

          if (ringingGroupId) {
            generateAgoraToken(ringingGroupId)
              .then((response: any) => {
                const token = response?.token;
                const uid = Number(response?.uid ?? 0);
                setAdditionalData((prev: any) => ({
                  ...(prev || {}),
                  callDebug: {
                    ...((prev || {})?.callDebug || {}),
                    tokenPrefetchAt: Date.now(),
                    prefetchUid: uid || null,
                    tokenPrefetchOk: !!token,
                  },
                }));
                if (token) {
                  setAgoraToken(token);
                }
                if (uid) {
                  setSelfUID(uid);
                }
              })
              .catch((error: any) => {
                devLogger('token prefetch failed:', error);
                setAdditionalData((prev: any) => ({
                  ...(prev || {}),
                  callDebug: {
                    ...((prev || {})?.callDebug || {}),
                    tokenPrefetchAt: Date.now(),
                    tokenPrefetchOk: false,
                  },
                }));
              });
          }

          setCallingValue('Ringing');
        }
      },
    );

    callRingerStartListener();

    const { cleanUp: callUserLeaveCallCleanup, listener: callUserLeaveCallListener } = getListener(
      CallSocketListenerTypes.userleaveCall,
      (data: any) => {
        devLogger('🚀 ~ useEffect ~ data: userLeaveCall', data);
        setAgoraToken(null);
        if (data?.leaveuserid !== loginDetails?.profile?._id) {
          const isSameGroup = callRingerDetailsRef.current?.groupId === data?.groupId;
          if (isSameGroup || showCallRibbon) {
            if (!data?.isGroup) {
              leaveChannelRef.current?.();
              setShowRingerDialogue?.(false);
              setCallRingerDetails?.(null);
            }
            showMessage({
              message: `${data.name} participant left the call`,
              type: 'warning',
              duration: 7000,
            });
          }
          setAllCallDetails(pre =>
            [...(pre || [])]?.filter(_item => _item.groupId !== data?.groupId),
          );
        }
      },
    );

    callUserLeaveCallListener();

    const resetRejectCallStates = () => {
      dispatch(clearIncomingCallData());
      setShowCallRibbon?.(false);
      setCallRingerDetails(null);
      setShowRingerDialogue(false);
      setFocusedUser(null);
      setSelfUID(null);
    }

    const { cleanUp: callRejectedCleanup, listener: callRejectedListener } = getListener(
      CallSocketListenerTypes.callRejected,
      (data: CallAcceptedResponseType) => {
        devLogger('🚀 ~ useEffect ~ data: callRejected', data);
        pendingOutgoingGroupIdRef.current = null;
        if (data?.loginid == loginDetails?.profile?._id) {
          resetRejectCallStates()
          setShowCallSenderModel(false);
          setCallSenderDetails(null);
          setAllCallDetails(pre =>
            [...(pre || [])]?.filter(_item => _item.groupId !== data?.groupId),
          );
        } else {
          if (data.groupmember) {
          } else {
            resetRejectCallStates()
            setShowCallSenderModel(false);
            setCallSenderDetails(null);
            showMessage({
              message: 'User has rejected the call',
              type: 'warning',
              duration: 7000,
            });
            setAllCallDetails(pre =>
              [...(pre || [])]?.filter(_item => _item.groupId !== data?.groupId),
            );
          }
        }
      },
    );

    callRejectedListener();

    const { cleanUp: callCancelledCleanup, listener: callCancelledListener } = getListener(
      CallSocketListenerTypes.callcancelled,
      (data: CallCancelledResponseType) => {
        devLogger('🚀 ~ useEffect ~ data: callCancelled', data);
        pendingOutgoingGroupIdRef.current = null;
        if (data?.loginid !== loginDetails?.profile?._id) {
        leaveChannelRef.current?.();
        dispatch(resetCall());
        setShowRingerDialogue?.(false);
        setCallRingerDetails?.(null);
        setAllCallDetails([])
        }
        else {
          if (!showCallRibbon) {
            leaveChannelRef.current?.();
            dispatch(resetCall());
            setShowRingerDialogue?.(false);
            setCallRingerDetails?.(null);
            setAllCallDetails([])
          }
        }
      },
    );
    callCancelledListener();

    const { cleanUp: unreadCountUpdatedCleanup, listener: unreadCountUpdatedListener } =
      getListener(ChatSocketListenerTypes.unreadCountUpdated, (data: any) => {
        devLogger(chatList, '🚀 ~ unreadCountUpdated', data);

        const countValue = Number(data?.count ?? data?.unreadCount ?? 0);
        const groupIndex = chatList.findIndex((g: any) => g.groupId === data.groupId);

        if (groupIndex !== -1) {
          const updatedChatList = (chatList ?? []).map((group: any) =>
            group?.groupId === data?.groupId && data?.userId === loginDetails?.profile?._id
              ? { ...group, count: countValue }
              : group,
          );
          dispatch(updateChatList(updatedChatList));
          // persist updated chat list
          AsyncStorage.setItem('chat_list', JSON.stringify(updatedChatList)).catch(e =>
            devLogger('Failed to save chat_list', e),
          );
        }
      });
    unreadCountUpdatedListener();

    const { cleanUp: groupUpdatedCleanup, listener: groupUpdatedListener } = getListener(
      ChatSocketListenerTypes.groupUpdated,
      async (data: any) => {
        try {
          const result = await fetchGroupList({
            limit: 20,
            userId: '',
            page: 1,
            searchKey: '',
          });
          if (result?.data?.length) {
            dispatch(updateChatList(result.data));
            AsyncStorage.setItem('chat_list', JSON.stringify(result.data)).catch(e =>
              devLogger('Failed to save chat_list', e),
            );
          }
        } catch (err) {
          console.error('Error fetching groups in socket listener:', err);
        }
      },
    );
    groupUpdatedListener();

    const { cleanUp: groupJoinedCleanup, listener: groupJoinedListener } = getListener(
      ChatSocketListenerTypes.groupJoined,
      async (data: any) => {
        devLogger('🚀 ~ groupJoined', data);
        try {
          const result = await fetchGroupList({
            limit: 20,
            userId: '',
            page: 1,
            searchKey: '',
          });
          if (result?.data?.length) {
            dispatch(updateChatList(result.data));
            AsyncStorage.setItem('chat_list', JSON.stringify(result.data)).catch(e =>
              devLogger('Failed to save chat_list', e),
            );
          }
        } catch (err) {
          console.error('Error fetching groups in socket listener:', err);
        }
      },
    );
    groupJoinedListener();

    return () => {
      // Chat related clearup
      cleanupUserOnline();
      cleanupUserOffline();
      cleanupUserTyping();
      cleanupMessageRead();
      cleanupMessageDeliver();
      cleanupUserStopTyping();
      newMessageListenerCleanUp();
      editMessageListenerCleanup();
      deleteMessageListenerCleanup();
      groupUpdatedCleanup();
      groupJoinedCleanup();

      // Call related clearup
      callRingerStartCleanup();
      callUserLeaveCallCleanup();
      callRejectedCleanup();
      callCancelledCleanup();
      unreadCountUpdatedCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, loginDetails]);

  return children;
};
