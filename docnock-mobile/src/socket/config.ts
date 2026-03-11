import { io } from 'socket.io-client';
import { SOCKET_URL } from '@api';
import { devLogger } from '@utils';

export const socketInstance = io(SOCKET_URL);

socketInstance.onAnyOutgoing((event, ...args) => {
  devLogger(`SOCKET EVENT SENT:  ${event} with args: `, args);
});

export enum ChatSocketEmitTypes {
  register = 'register',
  createGroup = 'createGroup',
  getMessages = 'getMessages',
  sendMessage = 'sendMessage',
  typing = 'typing',
  stopTyping = 'stopTyping',
  getOnlineUsers = 'getOnlineUsers',
  getUnreadCount = 'getUnreadCount',
  disconnection = 'disconnection',
  editMessage = 'editMessage',
  deleteMessage = 'deleteMessage',
  updateGroup = 'updatedgroup',
  markAsRead = 'markAsRead',
  editGroup = 'editGroup',
  deleteConversation = 'delete-conversation',
  getMessageStatus = 'getMessageStatus',
}

export enum ChatSocketListenerTypes {
  userOnline = 'userOnline',
  userTyping = 'userTyping',
  userStopTyping = 'userStopTyping',
  newMessage = 'newMessage',
  userOffline = 'userOffline',
  editMessage = 'editMessage',
  messageDeleted = 'messageDeleted',
  unReadNotification = 'unreadnoti',
  unreadCountUpdated = 'unreadCountUpdated',
  groupUpdated = 'groupUpdated',
  groupJoined = 'groupJoined',
  messageRead = 'messageRead',
  messageDelivered = 'messageDelivered',
}

export enum CallSocketEmitTypes {
  ringstart = 'ringstart',
  acceptCall = 'acceptCall',
  getcallstarttime = 'getcallstarttime',
  leavecall = 'leavecall',
  rejectCall = 'rejectCall',
  cancelcall = 'cancelcall',
  audioMute = 'mute-audio',
  videoMute = 'mute-video',
  getcallstart = 'getcallstart',
  joinparticipant = 'joinparticipant',
  getCallParticipant = 'getcallingparticipantinfo',
  participantinfo = 'participantinfo',
  getparticipantinfo = 'getparticipantinfo'
}

export enum CallSocketListenerTypes {
  ringerstarted = 'ringerstarted',
  callAccepted = 'callAccepted',
  userleaveCall = 'user-leave-call',
  callRejected = 'callRejected',
  callcancelled = 'callcancelled',
}

export type SocketListenerOptions = ChatSocketListenerTypes | CallSocketListenerTypes;
