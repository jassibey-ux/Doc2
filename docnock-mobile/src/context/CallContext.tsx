import React, { useCallback, useEffect, useRef, useState } from 'react';
import createAgoraRtcEngine, {
  CameraDirection,
  ChannelMediaOptions,
  ChannelProfileType,
  ClientRoleType,
  ConnectionChangedReasonType,
  ConnectionStateType,
  IRtcEngine,
  RtcConnection,
  VideoSourceType,
} from 'react-native-agora';
import { AGORA_APP_ID } from '@env';
import { decryptData, devLogger } from '@utils';
import {
  mutePersonProps,
  muteVideoProps,
  RingerSenderResponseType,
  RingerStartedResponseType,
  useAppDispatch,
  useAppSelector,
  useCallPermissions,
  useCallSockets,
} from '@hooks';
import { findNestedRoute, navigationRef } from '@navigation';
import { GroupUserIdType, useGetUserInfoMutation } from '@api';
import { Alert, AppState, Linking, NativeModules, Platform } from 'react-native';
import { CallSocketEmitTypes, socketInstance } from '@socket';
import { clearIncomingCallData, resetCall, setIsBusy } from '@store';
import RNVoipCall from 'react-native-voips-calls';
import RNCallKeep from 'react-native-callkeep';

export enum CallType {
  audio = 'audio',
  video = 'video',
}

export type CallMembers = {
  isVideoOn: boolean;
  isMicOn: boolean;
  isJoined: boolean;
  uid: number;
};

export type InitialMembers = GroupUserIdType;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawMemberObjectType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAgoraUID = (item: any) => item?.uid;

export type CallContextType = {
  type: CallType;
  agoraEngine?: React.Ref<IRtcEngine | undefined>;
  setType?: (type: CallType) => void;
  setAdditionalData: React.Dispatch<React.SetStateAction<any>>;
  startCall?: (
    groupId: string,
    callType?: boolean,
    isJoin?:boolean,
    isGroup?: boolean,
    isFromRibbon?: boolean
  ) => Promise<boolean>;
  leaveChannel?: () => void;
  isCallOngoing?: boolean;
  isGroup?: boolean;
  setIsGroup?: (isGroup: boolean) => void;
  showCallRibbon?: boolean;
  setShowCallRibbon?: React.Dispatch<React.SetStateAction<boolean>>;
  micOn?: boolean;
  setMicOn?: React.Dispatch<React.SetStateAction<boolean>>;
  videoOn?: boolean;
  setVideoOn?: React.Dispatch<React.SetStateAction<boolean>>;
  onSpeaker?: boolean;
  setOnSpeaker?: React.Dispatch<React.SetStateAction<boolean>>;
  isFrontCamera?: boolean;
  toggleCamera?: () => void;
  toggleMic?: (params: mutePersonProps) => void;
  toggleVideo?: (params: muteVideoProps) => void;
  toggleSpeaker?: () => void;
  remoteUsers?: CallMembers[];
  focusedUser: CallMembers | null | undefined;
  setFocusedUser: React.Dispatch<React.SetStateAction<CallMembers | null | undefined>>;
  callRingerDetails: RingerStartedResponseType | null;
  setCallRingerDetails: React.Dispatch<React.SetStateAction<RingerStartedResponseType | null>>;
  callSenderDetails: RingerSenderResponseType | null;
  setCallSenderDetails: React.Dispatch<React.SetStateAction<RingerSenderResponseType | null>>;
  callingValue:string;
  setCallingValue:  React.Dispatch<React.SetStateAction<string>>
  setAgoraToken: React.Dispatch<React.SetStateAction<string | null>>;
  showRingerDialogue: boolean;
  setShowRingerDialogue: React.Dispatch<React.SetStateAction<boolean>>;
  showCallSenderModel: boolean;
  setShowCallSenderModel: React.Dispatch<React.SetStateAction<boolean>>;
  setInitialUsers: (userIds: InitialMembers[]) => void;
  setSelfUID: React.Dispatch<React.SetStateAction<number | null>>;
  selfUID: number | null;
  allCallDetails: RingerStartedResponseType[] | null;
  setAllCallDetails: React.Dispatch<React.SetStateAction<RingerStartedResponseType[] | null>>;
  currentCallStartTime: number;
  backhanduid: number | null;
  setBackhanduid: React.Dispatch<React.SetStateAction<number | null>>;
  additionalData: any;
  callDuration: string;
  getCallPariticipantInfo: (participantId: string) => void;
  isScreenSharing?: boolean;
  startScreenShare?: () => Promise<boolean>;
  stopScreenShare?: () => Promise<boolean>;
  toggleScreenShare?: () => Promise<void>;
  isReconnecting?: boolean;
};

export const InitialCallContext: CallContextType = {
  type: CallType.audio,
  agoraEngine: undefined,
  additionalData: {},
  setType: () => { },
  setAdditionalData: () => { },
  startCall: async () => false,
  leaveChannel: () => { },
  isCallOngoing: false,
  isGroup: false,
  setIsGroup: () => { },
  showCallRibbon: false,
  setShowCallRibbon: () => { },
  micOn: true,
  setMicOn: () => { },
  videoOn: true,
  setVideoOn: () => { },
  onSpeaker: true,
  setOnSpeaker: () => { },
  remoteUsers: [],
  focusedUser: null,
  setFocusedUser: () => { },
  callRingerDetails: null,
  callSenderDetails: null,
  setCallRingerDetails: () => { },
  setCallSenderDetails:() => {},
  setAgoraToken: () => { },
  showRingerDialogue: false,
  setShowRingerDialogue: () => { },
  showCallSenderModel: false,
  setShowCallSenderModel:() => { },
  setInitialUsers: () => { },
  setSelfUID: () => { },
  selfUID: null,
  allCallDetails: [],
  isScreenSharing: false,
  setAllCallDetails: () => { },
  currentCallStartTime: 0,
  setBackhanduid: () => { },
  backhanduid: null,
  callingValue: 'Calling',
  setCallingValue: () => {},
  callDuration: '00:00:00',
  getCallPariticipantInfo: () => {},
  isReconnecting: false,
};

export const CallContext = React.createContext<CallContextType>(InitialCallContext);

const CommonCallConfiguration: ChannelMediaOptions = {
  // Set channel profile to live broadcast
  channelProfile: ChannelProfileType.ChannelProfileCommunication,
  // Set user role to broadcaster
  clientRoleType: ClientRoleType.ClientRoleBroadcaster,
  // Publish audio collected by the microphone
  publishMicrophoneTrack: true,

  // Automatically subscribe to all audio streams
  autoSubscribeAudio: true,
};
const VideoCallConfiguration: ChannelMediaOptions = {
  ...CommonCallConfiguration,
  // Automatically subscribe to all video streams
  autoSubscribeVideo: true,
  // Publish video collected by the camera
  publishCameraTrack: true,
};

export const CallContextProvider = ({ children }: { children: React.ReactNode }) => {
  const loginDetails = useAppSelector(state => state.auth.loginDetails);
  const incomingCallData = useAppSelector(state => state.voipCall.callData);
  const [isGroup, setIsGroup] = useState<CallContextType['isGroup']>(false);
  const [type, setType] = React.useState<CallContextType['type']>(CallType.audio);
  const [additionalData, setAdditionalData] = useState<any>(null);
  const [isCallOngoing, setIsCallOngoing] = useState<boolean>(false);
  const [showCallRibbon, setShowCallRibbon] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [callDuration, setCallDuration] = useState('00:00:00');
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const [micOn, setMicOn] = useState<boolean>(true);
  const [videoOn, setVideoOn] = useState<boolean>(true);
  const [onSpeaker, setOnSpeaker] = useState<boolean>(false);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(true);

  const [remoteUsers, setRemoteUsers] = useState<CallMembers[]>([]);
  const [focusedUser, setFocusedUser] = useState<CallMembers | null | undefined>(null);
  const [selfUID, setSelfUID] = useState<number | null>(null);
  const [backhanduid, setBackhanduid] = useState<number | null>(null);
  // console.log('backhanduid<><><><>', backhanduid);
  const [agoraToken, setAgoraToken] = useState<string | null>(null);
  const { mutateAsync: getUserInfo } = useGetUserInfoMutation();

  const [callRingerDetails, setCallRingerDetails] = useState<RingerStartedResponseType | null>(
    null,
  );
    const [callSenderDetails, setCallSenderDetails] = useState<RingerSenderResponseType | null>(
    null,
  );
    const [callingValue, setCallingValue] = useState<string>('Calling');

  const [allCallDetails, setAllCallDetails] = useState<RingerStartedResponseType[] | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  const [showRingerDialogue, setShowRingerDialogue] = useState<boolean>(false);
  const [showCallSenderModel, setShowCallSenderModel] = useState<boolean>(false);
  const [currentCallStartTime, _setter] = useState<number>(0);
  const hadRemoteParticipantRef = useRef<boolean>(false);
  const remoteDisconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionLostTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const remoteUsersRef = useRef<CallMembers[]>([]);
  const activeCallGroupIdRef = useRef<string>('');
  const timerSyncedOnConnectRef = useRef<boolean>(false);
  const isCallOngoingRef = useRef<boolean>(false);
  const isGroupRef = useRef<boolean>(false);
  const lastSignalRef = useRef<{ groupId?: string; callerId?: string; isGroup?: boolean; audio?: boolean } | null>(null);

  const { emitCancelCall, emitGetCallStartTime, emitLeaveCall, generateAgoraToken, emitAcceptCall } =
    useCallSockets();

  const { hasFullPermissions, requestCallPermissions } = useCallPermissions();
  const { callUUID } = useAppSelector(state => state.voipCall);
  const currentUserId = loginDetails?.profile?._id;

  const agoraEngine = useRef<IRtcEngine>();
  const startCallInProgressRef = useRef<boolean>(false);
  const dispatch = useAppDispatch();

  // Screen sharing functions - defined at component level
  const startScreenShare = useCallback(async () => {
    if (!agoraEngine?.current) {
      showMessage({ message: 'Screen sharing not available', type: 'warning' });
      return false;
    }
    try {
      if (typeof (agoraEngine.current as any).startScreenCapture === 'function') {
        await (agoraEngine.current as any).startScreenCapture();
      } else if (typeof (agoraEngine.current as any).startScreenShare === 'function') {
        await (agoraEngine.current as any).startScreenShare();
      } else if (typeof (agoraEngine.current as any).startScreenCaptureByDisplayId === 'function') {
        await (agoraEngine.current as any).startScreenCaptureByDisplayId(0, {});
      } else {
        showMessage({ message: 'Screen sharing not implemented on this platform', type: 'warning' });
        return false;
      }
      setIsScreenSharing(true);
      showMessage({ message: 'Screen sharing started', type: 'success' });
      return true;
    } catch (e) {
      devLogger('startScreenShare error', e);
      showMessage({ message: 'Failed to start screen sharing', type: 'danger' });
      return false;
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    try {
      if (!agoraEngine?.current) {
        setIsScreenSharing(false);
        return true;
      }
      if (typeof (agoraEngine.current as any).stopScreenCapture === 'function') {
        await (agoraEngine.current as any).stopScreenCapture();
      } else if (typeof (agoraEngine.current as any).stopScreenShare === 'function') {
        await (agoraEngine.current as any).stopScreenShare();
      }
      setIsScreenSharing(false);
      showMessage({ message: 'Screen sharing stopped', type: 'success' });
      return true;
    } catch (e) {
      devLogger('stopScreenShare error', e);
      showMessage({ message: 'Failed to stop screen sharing', type: 'danger' });
      return false;
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  const changeState = useCallback(
    (
      userId: number,
      stateKey: ('isJoined' | 'isVideoOn' | 'isMicOn')[],
      state: boolean[],
      addIfNotExist = false,
    ) => {
      setRemoteUsers(pre => {
        const isIncluded = pre?.some(item => getAgoraUID(item) === userId);
        if (!isIncluded && userId !== selfUID && addIfNotExist) {
          return [
            ...pre,
            {
              uid: userId,
              isJoined: !!state?.[0],
              isVideoOn: !!state?.[1],
              isMicOn: !!state?.[2],
            },
          ];
        }
        return [
          ...(pre || []).map(_user => {
            const obj: Pick<CallMembers, 'isJoined' | 'isVideoOn' | 'isMicOn'> = {
              isJoined: _user?.isJoined,
              isVideoOn: _user?.isVideoOn,
              isMicOn: _user?.isMicOn,
            };
            stateKey.forEach((key, index) => {
              obj[key] = !!state?.[index];
            });
            return getAgoraUID(_user) === userId ? { ..._user, ...obj } : _user;
          }),
        ];
      });
    },
    [selfUID],
  );

  useEffect(() => {
    remoteUsersRef.current = remoteUsers || [];
  }, [remoteUsers]);

  useEffect(() => {
    isCallOngoingRef.current = !!isCallOngoing;
  }, [isCallOngoing]);

  useEffect(() => {
    isGroupRef.current = !!isGroup;
  }, [isGroup]);

  const setInitialUsers = useCallback((userIds: RawMemberObjectType[]) => {
    setRemoteUsers(
      (userIds || [])
        ?.filter(item => getAgoraUID(item))
        ?.map(item => ({
          uid: getAgoraUID(item),
          ...item,
          isJoined: false,
          isVideoOn: false,
          isMicOn: false,
        })),
    );
  }, []);

  const getData = async () => {
    const newProfile = await getUserInfo();
    const decryptedProfile = await decryptData(newProfile?.data?.encryptDatauserdata);
    return decryptedProfile;
  };

  const addListeners = useCallback(() => {
    const startConnectionLossTimer = () => {
      if (connectionLostTimeoutRef.current) {
        return;
      }
      connectionLostTimeoutRef.current = setTimeout(() => {
        connectionLostTimeoutRef.current = null;
        if (isCallOngoingRef.current) {
          leaveChannel?.();
        }
      }, 12000);
    };

    const clearConnectionLossTimer = () => {
      if (connectionLostTimeoutRef.current) {
        clearTimeout(connectionLostTimeoutRef.current);
        connectionLostTimeoutRef.current = null;
      }
    };

    agoraEngine?.current?.addListener(
      'onConnectionStateChanged',
      (
        connection: RtcConnection,
        state: ConnectionStateType,
        reason: ConnectionChangedReasonType,
      ) => {
        devLogger('Connection state changed:', { connection, state, reason });
        const losingConnection =
          state === ConnectionStateType.ConnectionStateReconnecting ||
          state === ConnectionStateType.ConnectionStateDisconnected;
        setIsReconnecting(losingConnection);
        if (losingConnection) {
          startConnectionLossTimer();
        }
        if (state === ConnectionStateType.ConnectionStateConnected) {
          setIsReconnecting(false);
          clearConnectionLossTimer();
        }
      },
    );

    agoraEngine?.current?.addListener('onUserJoined', (_: RtcConnection, remoteUid: number) => {
      // console.log('remoteUid<><><><>', remoteUid);
      hadRemoteParticipantRef.current = true;
      if (remoteDisconnectTimeoutRef.current) {
        clearTimeout(remoteDisconnectTimeoutRef.current);
        remoteDisconnectTimeoutRef.current = null;
      }
      changeState(remoteUid, ['isJoined', 'isMicOn', 'isVideoOn'], [true, true, true], true);

      if (!timerSyncedOnConnectRef.current) {
        timerSyncedOnConnectRef.current = true;
        const activeGroupId = activeCallGroupIdRef.current;
        if (activeGroupId) {
          emitGetCallStartTime(activeGroupId)
            .then(response => {
              startCallTimer(Number(response));
            })
            .catch(() => {
              startCallTimer(0);
            });
        } else {
          startCallTimer(0);
        }
      }
    });

    agoraEngine?.current?.addListener('onUserOffline', (_: RtcConnection, remoteUid: number) => {
      setRemoteUsers(pre => [...pre].filter(item => getAgoraUID(item) !== remoteUid));
    });

    agoraEngine?.current?.addListener('onRemoteVideoStateChanged', (_, remoteUid, state) => {
      changeState(remoteUid, ['isVideoOn'], [state !== 0]);
    });

    agoraEngine?.current?.addListener('onRemoteAudioStateChanged', (_, remoteUid, state) => {
      changeState(remoteUid, ['isMicOn'], [state !== 0]);
    });

    agoraEngine?.current?.addListener('onJoinChannelSuccess', (channel, elapsed) => {
      devLogger('Successfully joined channel:', { channel, elapsed });
      socketInstance.emit(
        CallSocketEmitTypes.getparticipantinfo,
        { groupId: channel?.channelId },
        (acknowledgment: any) => {
          const acknowledgment1 = JSON.parse(acknowledgment);
          // console.log('firstacknowledgment1', acknowledgment1)
          // setJoinMembers(acknowledgment1.participant);
        },
      );
    });

    agoraEngine?.current?.addListener('onError', err => {
      devLogger('Agora error:', err);
    });

    agoraEngine?.current?.addListener('onTokenPrivilegeWillExpire', () => {
      devLogger('Token will expire');
    });
  }, [changeState]);

  const onJoinCall = useCallback(
    async (passedCallType: boolean) => {
      setAdditionalData((prev: any) => ({
        ...(prev || {}),
        callDebug: {
          ...((prev || {})?.callDebug || {}),
          joinSuccessAt: Date.now(),
          connected: true,
        },
      }));
      setType(passedCallType ? CallType.audio : CallType.video );
      setShowCallSenderModel(false);
      setShowRingerDialogue(false);
      setIsCallOngoing(true);
      setMicOn(true);
      addListeners();
      if (!passedCallType) {
        await agoraEngine?.current?.setEnableSpeakerphone(true);
        setVideoOn(true);
        setOnSpeaker(true);
      } else {
        // Audio call: default to earpiece/Bluetooth, not speaker.
        await agoraEngine?.current?.setEnableSpeakerphone(false);
        (agoraEngine.current as any)?.setDefaultAudioRouteToSpeakerphone?.(false);
        setVideoOn(false);
        setOnSpeaker(false);
      }
    },
    [addListeners],
  );

  const checkAndGoBack = useCallback(() => {
    const navigationState = navigationRef.getState();
    const currentScreen = findNestedRoute(navigationState);
    if (currentScreen === 'CallingScreen') {
      navigationRef.reset({
        index: 0,
        routes: [{ name: 'BottomTabNavigator', params: { screen: 'Chats' } }],
      });
    }
  }, []);

  const emitJoinParticipant = (groupId: string, type: boolean, isGroup: boolean) => {
    if (isGroup) {
      const ringerData = {
        callerId: loginDetails?.profile?._id ?? '',
        groupId: groupId,
        isGroup: isGroup,
        audio: type
      };
      setCallRingerDetails(ringerData);
      lastSignalRef.current = ringerData;
    }
    socketInstance.emit(CallSocketEmitTypes.joinparticipant,
      { groupId: groupId, loginid: loginDetails?.profile?._id, audio: type },
      (res: any) => {
        console.log('Join emit response:', res);
      });
  }
  const getCallPariticipantInfo = (participantId: string) => {
    if (!participantId) {
      dispatch(setIsBusy(false));
      return;
    }

    socketInstance.emit(
      CallSocketEmitTypes.getCallParticipant,
      { participantId },
      (res: any) => {
        // Normalize busy flag from server response
        const busyValue = res?.isBusy ?? res?.busy ?? res;
        const busy = busyValue === true || busyValue === 'true';
        const isOtherUser = participantId !== loginDetails?.profile?._id;
        if (isOtherUser) {
          dispatch(setIsBusy(!!busy));
        } else {
          // Never mark self busy from this probe
          dispatch(setIsBusy(false));
        }
      },
    );
  };
const startCallTimer = (startTimeInSeconds: number) => {
  const safeStartTime = Number.isNaN(startTimeInSeconds) ? 0 : startTimeInSeconds;

  if (timerInterval.current) {
    clearInterval(timerInterval.current);
  }

  setTotalSeconds(safeStartTime);
  const initialHours = Math.floor(safeStartTime / 3600).toString().padStart(2, '0');
  const initialMinutes = Math.floor((safeStartTime % 3600) / 60).toString().padStart(2, '0');
  const initialSeconds = (safeStartTime % 60).toString().padStart(2, '0');
  setCallDuration(`${initialHours}:${initialMinutes}:${initialSeconds}`);

  timerInterval.current = setInterval(() => {
    setTotalSeconds(prev => {
      const updated = prev + 1;

      const hours = Math.floor(updated / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((updated % 3600) / 60).toString().padStart(2, '0');
      const seconds = (updated % 60).toString().padStart(2, '0');

      setCallDuration(`${hours}:${minutes}:${seconds}`);
      return updated;
    });
  }, 1000);
};

  const startCall = useCallback(
    async (
      groupId: string,
      passedCallType?: boolean,
      isJoin?: boolean,
      isGroup?: boolean,
      isFromRibbon?: boolean
    ) => {
      const debugAttemptAt = Date.now();
      setAdditionalData((prev: any) => ({
        ...(prev || {}),
        callDebug: {
          ...((prev || {})?.callDebug || {}),
          startAttemptAt: debugAttemptAt,
        },
      }));

      if (startCallInProgressRef.current) {
        devLogger('startCall skipped: call start already in progress');
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            startSkippedReason: 'in-progress',
          },
        }));
        return false;
      }

      if (isCallOngoing || agoraEngine?.current) {
        devLogger('startCall detected stale ongoing call state; forcing cleanup before restart');
        try {
          if (timerInterval.current) {
            clearInterval(timerInterval.current);
            timerInterval.current = null;
          }
          setTotalSeconds(0);
          setCallDuration('00:00:00');
          setRemoteUsers([]);
          setFocusedUser(null);
          hadRemoteParticipantRef.current = false;
          if (remoteDisconnectTimeoutRef.current) {
            clearTimeout(remoteDisconnectTimeoutRef.current);
            remoteDisconnectTimeoutRef.current = null;
          }
          setShowCallRibbon(false);
          setIsCallOngoing(false);

          if (agoraEngine?.current) {
            try {
              await agoraEngine.current.leaveChannel();
            } catch (leaveError) {
              devLogger('stale leaveChannel cleanup failed:', leaveError);
            }
            try {
              agoraEngine.current.release?.();
            } catch (releaseError) {
              devLogger('agora release during stale cleanup failed:', releaseError);
            }
            agoraEngine.current = undefined;
          }

          setAdditionalData((prev: any) => ({
            ...(prev || {}),
            callDebug: {
              ...((prev || {})?.callDebug || {}),
              staleResetAt: Date.now(),
            },
          }));
        } catch (staleCleanupError) {
          devLogger('stale cleanup before startCall failed:', staleCleanupError);
        }
      }

      if (!hasFullPermissions) {
        const permissionResponse = await requestCallPermissions();
        if (!permissionResponse) {
          setAdditionalData((prev: any) => ({
            ...(prev || {}),
            callDebug: {
              ...((prev || {})?.callDebug || {}),
              startSkippedReason: 'permission-denied',
            },
          }));
          if (__DEV__) {
            // In development (Simulator), camera/mic hardware is absent so
            // permissions always fail.  Log a warning but proceed with the
            // call so the UI flow can be tested end-to-end.
            console.warn(
              '⚠️ startCall: permissions not granted (expected on Simulator). Proceeding anyway.',
            );
          } else {
            Alert.alert(
              'Permission Denied',
              'Please enable permission to access Camera and Microphone from settings',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Open Settings',
                  style: 'default',
                  onPress: () => Linking.openSettings(),
                },
              ],
            );
            checkAndGoBack();
            return false;
          }
        }
      }

      if (!groupId) {
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            startSkippedReason: 'missing-groupId',
          },
        }));
        return false;
      }

      activeCallGroupIdRef.current = groupId;
      timerSyncedOnConnectRef.current = false;

      const debugStartAt = Date.now();
      setAdditionalData((prev: any) => ({
        ...(prev || {}),
        callDebug: {
          ringStartedAt: null,
          acceptedAt: null,
          acceptedLatencyMs: null,
          startCallAt: debugStartAt,
          joinSuccessAt: null,
          fallbackStartAt: null,
          fallbackTriggered: false,
          tokenPrefetchAt: null,
          tokenPrefetchOk: null,
          prefetchUid: null,
          startAudio: !!passedCallType,
          connected: false,
        },
      }));

      startCallInProgressRef.current = true;
      try {
        setAdditionalData((prev: any) => ({
          ...(prev || {}),
          callDebug: {
            ...((prev || {})?.callDebug || {}),
            startCallAt: Date.now(),
            startAudio: !!passedCallType,
          },
        }));
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
          timerInterval.current = null;
        }
        setTotalSeconds(0);
        setCallDuration('00:00:00');
        setRemoteUsers([]);
        setFocusedUser(null);
        hadRemoteParticipantRef.current = false;
        timerSyncedOnConnectRef.current = false;
        if (remoteDisconnectTimeoutRef.current) {
          clearTimeout(remoteDisconnectTimeoutRef.current);
          remoteDisconnectTimeoutRef.current = null;
        }

        const fallbackProfile = loginDetails?.profile || {};
        navigationRef.navigate('CallingScreen', {
          uid: selfUID ?? null,
          groupId: groupId,
          name: fallbackProfile?.fullName ?? callRingerDetails?.callerName ?? '',
        });
        if(isJoin){
          emitJoinParticipant(
            groupId,
            passedCallType ?? false,
            isGroup ?? false
          )
          setIsCallOngoing(true);
        }

        // Store last signaling meta so leave events always have ids.
        lastSignalRef.current = {
          groupId,
          callerId: currentUserId,
          isGroup: isGroup ?? false,
          audio: !!passedCallType,
        };
        let token = agoraToken;
        let uid = selfUID;
        let backhandUID = backhanduid;
        const resp = await getData().catch(() => fallbackProfile);
        console.log(agoraToken,'firstselfUID', selfUID)

        if (!agoraToken) {
          const response = await generateAgoraToken(groupId, selfUID?.toString() ?? '' );
          token = response?.token;
          uid = response?.uid;
          socketInstance.emit(CallSocketEmitTypes.participantinfo, { loginuserdetails: resp, uid: response?.uid, groupId }, (acknowledgment: any) => {
            // console.log('Server Response:', acknowledgment);
        });
        }

        if (!token || !uid) {
          return false;
        }

        if (!agoraToken) {
          setAgoraToken(token);
        }
        if (!selfUID) {
          setSelfUID(uid);
        }
        if (!backhanduid) {
          setBackhanduid(backhandUID);
        }

        agoraEngine.current = createAgoraRtcEngine();

        let startSucceeded = false;
        try {
          const initializeResponse = agoraEngine?.current?.initialize({
            appId: AGORA_APP_ID,
          });
          devLogger('� ~ CallContextProvider ~ initializeResponse:', {
            initializeResponse,
            groupId,
          });

          agoraEngine?.current?.enableAudio();
          setType(passedCallType ? CallType.audio : CallType?.video);
          if (!passedCallType) {
            agoraEngine?.current?.startPreview();
            agoraEngine?.current?.enableVideo();

            agoraEngine?.current?.startCameraCapture(VideoSourceType.VideoSourceCameraPrimary, {
              cameraDirection: CameraDirection.CameraFront,
            });
          } else {
            agoraEngine?.current?.stopPreview();
            agoraEngine?.current?.disableVideo();
            agoraEngine?.current?.stopCameraCapture(VideoSourceType.VideoSourceCameraPrimary);
          }

          const joinResponse = await agoraEngine?.current?.joinChannel(
            // token,
            (token),
            groupId,
            uid || Math.floor(Math.random() * 100000),
            passedCallType ? CommonCallConfiguration : VideoCallConfiguration,
          );

          if (joinResponse === 0) {
            onJoinCall(passedCallType ?? false);
            startSucceeded = true;
          }

          devLogger('🚀 ~ CallContextProvider ~ joinResponse:', joinResponse);
          setIsCallOngoing(true);
        } catch (error) {
          devLogger('🚀 ~ startCall ~ error:', error);
          startSucceeded = false;
        }
        return startSucceeded;
      } finally {
        startCallInProgressRef.current = false;
      }
    },
    [
      onJoinCall,
      selfUID,
      agoraToken,
      generateAgoraToken,
      emitGetCallStartTime,
      hasFullPermissions,
      requestCallPermissions,
      isCallOngoing,
      checkAndGoBack,
      currentUserId,
    ],
  );

  const toggleMic = async (params: mutePersonProps) => {
    setMicOn(prev => {
      const next = !prev;
      const targetMute = !next;

      updateAudioMute({
        ...params,
        isAudioMuted: params?.isAudioMuted ?? targetMute,
      });
      agoraEngine?.current?.muteLocalAudioStream(targetMute);
      return next;
    });
  };
  
  const updateAudioMute = (params: mutePersonProps) => {
    socketInstance.emit(
      CallSocketEmitTypes.audioMute,
      {
        groupId: params?.groupId,
        senderID: params?.senderID,
        isAudioMuted: params?.isAudioMuted,
        uid: params?.uid
      },
      (acknowledgment: any) => {
        // console.log('firstacknowledgment', acknowledgment)
      },
    );
  };
    const updateVideoIcon = (params: muteVideoProps) => {
    socketInstance.emit(
      CallSocketEmitTypes.videoMute,
      {
        groupId: params?.groupId,
        senderID: params?.senderID,
        isVideoMuted: params?.isVideoMuted,
        uid: params?.uid,
        name: params?.name ?? ''
      },
      (acknowledgment: any) => {
        // console.log('firstacknowledgment', acknowledgment)
      },
    );
  };

  const toggleVideo = async (params: muteVideoProps) => {
    setVideoOn(prev => {
      const next = !prev;
      const targetMute = !next;

      updateVideoIcon({
        ...params,
        isVideoMuted: params?.isVideoMuted ?? targetMute,
      });
      agoraEngine?.current?.muteLocalVideoStream(targetMute);
      return next;
    });
  };

  const toggleSpeaker = async () => {
    setOnSpeaker(prev => {
      const next = !prev;
      // Speaker on: explicitly route to loudspeaker.
      if (next) {
        agoraEngine.current?.setEnableSpeakerphone(true);
        (agoraEngine.current as any)?.setDefaultAudioRouteToSpeakerphone?.(true);
        return next;
      }

      // Speaker off: prefer Bluetooth/wired/earpiece.
      try {
        agoraEngine.current?.setEnableSpeakerphone(false);
        (agoraEngine.current as any)?.setDefaultAudioRouteToSpeakerphone?.(false);
      } catch (routeError) {
        devLogger('toggleSpeaker route error:', routeError);
      }
      return next;
    });
  };

  const toggleCamera = async () => {
    setIsFrontCamera(pre => !pre);
    agoraEngine?.current?.switchCamera();
  };

  const leaveChannel = useCallback(async () => {
    try {
      // Identify call for signaling before any async teardown to avoid delay.
      const signal = callRingerDetails || lastSignalRef.current || null;
      const leaveGroupId = signal?.groupId || activeCallGroupIdRef.current;
      const leaveCallerId = signal?.callerId || currentUserId;
      const leaveIsGroup = signal?.isGroup ?? isGroupRef.current ?? false;
      const leaveAudio = signal?.audio ?? (type === CallType.audio);

      // Emit leave first so peers drop promptly even if local teardown is slow.
      if (leaveCallerId && leaveGroupId) {
        emitLeaveCall(leaveCallerId, leaveGroupId, leaveIsGroup, leaveAudio);
      }

      // Always close native VoIP/CallKit UI first, even if agora state is already cleaned up.
      try {
        const nativeVoipCallModule = NativeModules?.RNVoipCall;
        if (callUUID) {
          console.log('📴 leaveChannel endCall uuid:', callUUID);
          await RNVoipCall.endCall(callUUID);
          // Some iOS states require explicit reporting to dismiss the CallKit sheet.
          nativeVoipCallModule?.reportEndCallWithUUID?.(callUUID, 2);
        }
        await RNVoipCall.endAllCalls();
        RNCallKeep.endAllCalls();
      } catch (voipError) {
        console.log('🚀 ~ VoIP endCall error:', voipError);
      }
      if (agoraEngine?.current) {
        if (leaveCallerId && leaveGroupId && leaveCallerId === currentUserId) {
          setAllCallDetails(pre => [
            ...(pre || []).filter(item => item.groupId !== leaveGroupId),
          ]);
        }
        setAgoraToken(null);
        setShowCallRibbon(false);
        setCallRingerDetails(null);
        lastSignalRef.current = null;
        setShowRingerDialogue(false);
        setRemoteUsers([]);
        setFocusedUser(null);
        hadRemoteParticipantRef.current = false;
        activeCallGroupIdRef.current = '';
        timerSyncedOnConnectRef.current = false;
        if (remoteDisconnectTimeoutRef.current) {
          clearTimeout(remoteDisconnectTimeoutRef.current);
          remoteDisconnectTimeoutRef.current = null;
        }
        if (connectionLostTimeoutRef.current) {
          clearTimeout(connectionLostTimeoutRef.current);
          connectionLostTimeoutRef.current = null;
        }
        setSelfUID(null);
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
          timerInterval.current = null;
        }
        setTotalSeconds(0);
        setCallDuration('00:00:00');
        setIsReconnecting(false);
        const response = await agoraEngine?.current?.leaveChannel();
        try {
          // Clean listeners to avoid accumulation across calls.
          // Safe no-op if method absent on platform binding.
          (agoraEngine.current as any)?.removeAllListeners?.();
        } catch (listenerError) {
          devLogger('🚀 ~ leaveChannel ~ removeAllListeners error:', listenerError);
        }
        try {
          // Release native resources even if leaveChannel returns a non-zero code.
          agoraEngine?.current?.release?.();
        } catch (releaseError) {
          devLogger('🚀 ~ leaveChannel ~ release error:', releaseError);
        }
        setIsCallOngoing(false);
        devLogger('🚀 ~ leaveChannel ~ response:', response);
        dispatch(resetCall());
        dispatch(clearIncomingCallData());
        dispatch(setIsBusy(false));
        agoraEngine.current = undefined;
        checkAndGoBack();
      } else {
        // Emit leave even if Agora instance already cleaned up.
        if (leaveCallerId && leaveGroupId) {
          emitLeaveCall(leaveCallerId, leaveGroupId, leaveIsGroup, leaveAudio);
        }
        setShowCallRibbon(false);
        setCallRingerDetails(null);
        lastSignalRef.current = null;
        setShowRingerDialogue(false);
        setRemoteUsers([]);
        setFocusedUser(null);
        hadRemoteParticipantRef.current = false;
        if (remoteDisconnectTimeoutRef.current) {
          clearTimeout(remoteDisconnectTimeoutRef.current);
          remoteDisconnectTimeoutRef.current = null;
        }
        setSelfUID(null);
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
          timerInterval.current = null;
        }
        setTotalSeconds(0);
        setCallDuration('00:00:00');
        setIsCallOngoing(false);
        dispatch(resetCall());
        dispatch(clearIncomingCallData());
        dispatch(setIsBusy(false));
        setIsReconnecting(false);
        checkAndGoBack();
      }
    } catch (error) {
      console.error('🚀 ~ leaveChannel ~ error:', error);
    }
  }, [
    callRingerDetails,
    loginDetails?.profile?._id,
    emitCancelCall,
    emitLeaveCall,
    checkAndGoBack,
    callUUID,
    currentUserId,
    type,
  ]);

  useEffect(() => {
    if (!isCallOngoing || !!isGroup || remoteUsers?.length > 0) {
      if (remoteDisconnectTimeoutRef.current) {
        clearTimeout(remoteDisconnectTimeoutRef.current);
        remoteDisconnectTimeoutRef.current = null;
      }
      return;
    }

    if (!hadRemoteParticipantRef.current || remoteDisconnectTimeoutRef.current) {
      return;
    }

    remoteDisconnectTimeoutRef.current = setTimeout(() => {
      remoteDisconnectTimeoutRef.current = null;
      const shouldAutoEnd =
        isCallOngoingRef.current &&
        !isGroupRef.current &&
        hadRemoteParticipantRef.current &&
        (remoteUsersRef.current?.length ?? 0) === 0;

      if (shouldAutoEnd) {
        leaveChannel?.();
      }
    }, 5000);

    return () => {
      if (remoteDisconnectTimeoutRef.current) {
        clearTimeout(remoteDisconnectTimeoutRef.current);
        remoteDisconnectTimeoutRef.current = null;
      }
    };
  }, [isCallOngoing, isGroup, remoteUsers, leaveChannel]);

  // // Handle app termination/backgrounding during calls
  // Handle app backgrounding during calls: show mini call ribbon
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' && isCallOngoing) {
        setShowCallRibbon?.(true);
      } else if (nextAppState === 'active' && isCallOngoing) {
        setShowCallRibbon?.(false);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isCallOngoing]);

  useEffect(() => {
    let navListener;
    if (isCallOngoing) {
      navListener = navigationRef?.addListener('state', state => {
        devLogger('🚀 ~ CallContextProvider ~ state:', state);
        const currentScreen = state?.data?.state
          ? findNestedRoute(state?.data?.state, 'routes')
          : '';
        devLogger('🚀 ~ CallContextProvider ~ currentScreen:', currentScreen);
        if (currentScreen === 'CallingScreen') {
          setShowCallRibbon?.(false);
        } else if (currentScreen) {
          setShowCallRibbon?.(true);
        } else {
          setShowCallRibbon?.(false);
        }
      });
    } else {
      setShowCallRibbon?.(false);
    }
    return navListener;
  }, [isCallOngoing]);
  // Ensure ribbon and call state are cleared on call disconnect
  useEffect(() => {
    if (!isCallOngoing) {
      setShowCallRibbon?.(false);
      // Optionally clear call state here if needed
    }
  }, [isCallOngoing]);

  useEffect(() => {
    const selfPresent = !remoteUsers?.length || !remoteUsers;
    if (selfPresent && isCallOngoing) {
      setFocusedUser(null);
      return;
    }
    const focusedUID = getAgoraUID(focusedUser);
    const isTruthyUser = !!focusedUID?.toString();
    const isSelfUser = focusedUID && focusedUID === selfUID;
    const isIncluded = focusedUID && remoteUsers?.some(user => getAgoraUID(user) === focusedUID);
    if ((!isTruthyUser || !isIncluded) && !isSelfUser && getAgoraUID(remoteUsers?.[0])) {
      setFocusedUser(remoteUsers[0]);
    }
  }, [remoteUsers, focusedUser, selfUID, videoOn, micOn, isCallOngoing]);

  // If participant names/details are missing, request them from server
  useEffect(() => {
    if (!remoteUsers || !remoteUsers.length) return;
    remoteUsers.forEach(u => {
      const uid = getAgoraUID(u);
      if (uid && !u?.name) {
        getCallPariticipantInfo?.(String(uid));
      }
    });
  }, [remoteUsers]);

  useEffect(() => {
  }, [isCallOngoing, callRingerDetails, callSenderDetails]);

  // Auto-join call when user answers from native CallKit / VoIP UI (iOS)
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const handleAnswer = async () => {
      const payload = incomingCallData || callRingerDetails;
      const groupId = payload?.groupId;
      const callerId = payload?.callerId || payload?.callerID || payload?.loginid;
      const isAudio = !!payload?.audio;
      const isGroupCall = !!payload?.isGroup;

      if (!groupId) {
        return;
      }

      try {
        // Notify backend that call is accepted so the caller/peers stop ringing and join.
        if (callerId) {
          await emitAcceptCall(callerId, groupId, isAudio, payload);
        }
        // Keep ringer details in context for proper teardown.
        if (payload) {
          setCallRingerDetails(prev => prev ?? (payload as any));
          lastSignalRef.current = {
            groupId: payload?.groupId,
            callerId: payload?.callerId || payload?.callerID || payload?.loginid,
            isGroup: payload?.isGroup,
            audio: payload?.audio,
          };
        }
        await startCall?.(groupId, isAudio, true, isGroupCall, false);
      } catch (error) {
        devLogger('🚀 ~ VoIP answer handler error:', error);
      }
    };

    const handleEnd = async () => {
      try {
        await leaveChannel?.();
      } catch (error) {
        devLogger('🚀 ~ VoIP end handler error:', error);
      }
    };

    RNVoipCall.onCallAnswer(handleAnswer);
    RNVoipCall.onEndCall(handleEnd);

    return () => {
      RNVoipCall.removeEventListener?.('answerCall');
      RNVoipCall.onRemoveEndCallListener?.();
    };
  }, [incomingCallData, callRingerDetails, startCall, leaveChannel]);

  const value = {
    type,
    agoraEngine,
    setType,
    setAdditionalData,
    additionalData,
    startCall,
    leaveChannel,
    isCallOngoing,
    setIsGroup,
    isGroup,
    showCallRibbon,
    setShowCallRibbon,
    micOn,
    setMicOn,
    videoOn,
    setVideoOn,
    onSpeaker,
    setOnSpeaker,
    toggleMic,
    toggleVideo,
    toggleSpeaker,
    isFrontCamera,
    toggleCamera,
    remoteUsers,
    focusedUser,
    setFocusedUser,
    callRingerDetails,
    setCallRingerDetails,
    callSenderDetails,
    setCallSenderDetails,
    setAgoraToken,
    showRingerDialogue,
    setShowRingerDialogue,
    showCallSenderModel,
    setShowCallSenderModel,
    setInitialUsers,
    setSelfUID,
    selfUID,
    allCallDetails,
    setAllCallDetails,
    currentCallStartTime,
    setBackhanduid,
    backhanduid,
    callingValue,
    setCallingValue,
    totalSeconds,
    callDuration,
    startCallTimer,
    getCallPariticipantInfo
    ,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    isReconnecting
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCallContext = () => React.useContext(CallContext);
