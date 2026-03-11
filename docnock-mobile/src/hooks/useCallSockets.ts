import { CallSocketEmitTypes, CallSocketListenerTypes, socketInstance } from '@socket';
import { useCallback } from 'react';
import { useAppSelector } from './reduxHooks';
import { useGenerateAgoraTokenMutation } from '@api';
import { devLogger } from '@utils';
import { CallType, useCallContext } from '@context';
import { navigationRef } from '@navigation';
import { getListener } from './useChatSockets';
import { Alert } from 'react-native';

export type RingerStartedResponseType = {
  groupId: string;
  callerId: string;
  callerName?: string;
  callerImage?: string;
  activegrouuserids?: string[];
  audio: boolean;
  isGroup: boolean;
};
export type RingerSenderResponseType = {
  title: string;
  userid: string;
  image: string;
  userIds: string[];
  group: boolean;
};
export type CallAcceptedResponseType = {
  callerId: string;
  groupId: string;
  loginid: string;
  groupmember?: boolean;
  audio: boolean
};
export type UserLeaveCallResponseType = {
  name: string;
  groupId: string;
  leaveuserid: string;
};
export type CallRejectedResponseType = {
  callerId: string;
  groupId: string;
  groupmember: number;
  loginid: string;
};
export type CallCancelledResponseType = {
  groupId: string;
  groupmember: number;
  loginid: string;
};

export type mutePersonProps = {
  groupId: string;
  senderID: string; 
  isAudioMuted: boolean;  
  uid: string
}
export type muteVideoProps = {
  groupId: string;
  senderID: string; 
  isVideoMuted: boolean;  
  uid: string;
  name: string;
}

export const useCallSockets = () => {
  const profileDetails = useAppSelector(state => state.auth?.loginDetails?.profile);
  const currentUserId = profileDetails?._id;
  const { mutateAsync: generateToken } = useGenerateAgoraTokenMutation();

  const generateAgoraToken = useCallback(
    async (groupId: string, uid?: string) => {
      try {
        if (!groupId || !currentUserId) {
          throw new Error('Required parameters missing for generateAgoraToken');
        }
        const response = await generateToken({ groupId, uid: uid ?? '' });
        devLogger('🚀 ~ generateAgoraToken ~ response:', response);
        return response;
      } catch (error) {
        console.error('Error in generateAgoraToken:', error);
        return false;
      }
    },
    [currentUserId, generateToken],
  );

  const emitRingStart = useCallback(
    async (groupId: string, activegrouuserIds: string[], audio: boolean = false, prpofileDate?: any) => {
      try {
        if (!groupId || !activegrouuserIds || !currentUserId) {
          throw new Error('Required parameters missing for ringstart');
        }
        const payload = {
          groupId,
          loginid: currentUserId,
          callerName: profileDetails?.fullName,
          callerImage: profileDetails?.profilePicture?.savedName,
          activegrouuserids: activegrouuserIds,
          audio,
          isGroup: prpofileDate?.group ??  false
        };
        devLogger('🚀 ~ payload:', payload);
        socketInstance.emit(CallSocketEmitTypes.ringstart, payload);
        // const response = await generateAgoraToken(groupId);

        // return response


        // return true;
      } catch (error) {
        console.error('Error in emitRingStart:', error);
        return false;
      }
    },
    [profileDetails, currentUserId],
  );

  const emitAcceptCall = useCallback(
    async (callerId: string, groupId: string, audio: boolean = false, prpofileDate: any) => {
      try {
        if (!callerId || !groupId || !currentUserId) {
          throw new Error('Required parameters missing for acceptCall');
        }
        socketInstance.emit(CallSocketEmitTypes.acceptCall, {
          callerId,
          groupId,
          loginid: currentUserId,
          audio,
        });
        return true;

        // const response = await generateAgoraToken(groupId);
        // console.log("accept call emit>2>>", response)
        // console.log("accept call emit>prpofileDate>>", prpofileDate)
        // socketInstance.emit('participantinfo', { loginuserdetails: prpofileDate, uid: response?.uid, groupId }, (acknowledgment: any) => {
        //   console.log('Server Response:', acknowledgment);
        //   // Handle the server response here
        // });
        // var response1 = {};
        // socketInstance.emit('getparticipantinfo', { groupId:groupId}, (acknowledgment:any) => {
        //           console.log('Server Response:>>>>>>', acknowledgment);
        //           response1 = acknowledgment

        // });


        // return response;
      } catch (error) {
        console.error('Error in emitAcceptCall:', error);
        throw error;
      }
    },
    [currentUserId, generateAgoraToken],
  );

const emitGetCallStartTime = useCallback(async (groupId: string): Promise<number> => {
  try {
    if (!groupId) {
      throw new Error('GroupId is required for getcallstarttime');
    }
    return await new Promise((resolve, reject) => {
      try {
        socketInstance.emit(
          CallSocketEmitTypes.getcallstarttime,
          { groupId },
          (response: { time: number | string } | string) => {
            devLogger('🚀 ~ emitGetCallStartTime ~ time:', response);
            let parsedResponse: { time?: number | string } = {};
            if (typeof response === 'string') {
              try {
                parsedResponse = JSON.parse(response);
              } catch {
                parsedResponse = {};
              }
            } else {
              parsedResponse = response ?? {};
            }
            const rawTime = parsedResponse?.time;
            const parsedTime = typeof rawTime === 'string' ? Number(rawTime) : rawTime ?? 0;
            const currentTime = Math.floor(Date.now() / 1000);
            const diff = Math.max(currentTime - parsedTime, 0)
            resolve(diff);
          },
        );
      } catch (error) {
        console.error('Error in emitGetCallStartTime:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error in emitGetCallStartTime:', error);
    throw false;
  }
}, []);

  //     return await new Promise((resolve, reject) => {
  //       try {
  //         socketInstance.emit(
  //           CallSocketEmitTypes.getcallstarttime,
  //           { groupId },
  //           (response: { time?: number | string } | string) => {
  //             devLogger('🚀 ~ emitGetCallStartTime ~ time:', response);

  //             const rawTime = parsedResponse?.time;
  //             const parsedTime = typeof rawTime === 'string' ? Number(rawTime) : rawTime;
  //             const normalizedStartTime = Number.isFinite(parsedTime as number)
  //               ? (parsedTime as number) > 1e12
  //                 ? Math.floor((parsedTime as number) / 1000)
  //                 : (parsedTime as number)
  //               : 0;

  //             const currentTime = Math.floor(Date.now() / 1000);
  //             const diff = Math.max(currentTime - normalizedStartTime, 0);
  //             console.log('firstdiff', diff);
  //             resolve(diff);
  //           },
  //         );
  //       } catch (error) {
  //         console.error('Error in emitGetCallStartTime:', error);
  //         reject(error);
  //       }
  //     });
  //   } catch (error) {
  //     console.error('Error in emitGetCallStartTime:', error);
  //     throw false;
  //   }
  // }, []);


  const emitLeaveCall = useCallback(
    (callerId: string, groupId: string, isGroup: boolean, audio: boolean) => {
      try {
        if (!groupId || !callerId || !currentUserId) {
          throw new Error('Required parameters missing for leavecall');
        }
        socketInstance.emit(CallSocketEmitTypes.leavecall, {
          groupId,
          loginid: currentUserId,
          name: profileDetails?.fullName,
          callerID: callerId,
          isGroup: isGroup,
          audio
        });

      } catch (error) {
        console.error('Error in emitLeaveCall:', error);
        throw error;
      }
    },
    [currentUserId, profileDetails],
  );

  const emitRejectCall = useCallback(
    (callerId: string, groupId: string, ) => {
      try {
        if (!callerId || !groupId || !currentUserId) {
          throw new Error('Required parameters missing for rejectCall');
        }
        socketInstance.emit(CallSocketEmitTypes.rejectCall, {
          callerId,
          groupId,
          loginid: currentUserId,
        });
        return true;
      } catch (error) {
        console.error('Error in emitRejectCall:', error);
        throw error;
      }
    },
    [currentUserId],
  );

  const emitCancelCall = useCallback(
    (groupId: string) => {
      try {
        if (!groupId || !currentUserId) {
          throw new Error('Required parameters missing for cancelCall');
        }
        const cancelPayload = {
          callerId: currentUserId,
          callerID: currentUserId,
          groupId,
          loginid: currentUserId,
          userId: currentUserId,
        };

        socketInstance.emit(CallSocketEmitTypes.cancelcall, cancelPayload);
        socketInstance.emit('callcancel', cancelPayload);
        // console.log(groupId,'calling emitCancelCall',currentUserId,);
      } catch (error) {
        console.error('Error in emitCancelCall:', error);
        throw error;
      }
    },
    [currentUserId],
  );

  return {
    emitRingStart,
    emitAcceptCall,
    emitGetCallStartTime,
    emitLeaveCall,
    emitRejectCall,
    emitCancelCall,
    generateAgoraToken
  };
};
