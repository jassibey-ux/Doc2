import { Injectable } from '@angular/core';
import io from 'socket.io-client';
import { environment } from 'src/environments/environment';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  typingTimeout: any;
  private socket = io(environment.socketURl,{reconnection:true,reconnectionAttempts:5,reconnectionDelay:1000, autoConnect: false});
  private isRegisterConnectListenerBound = false;

  constructor() {
    console.log(environment.socketURl, 'test', this.socket);
    window.addEventListener('app-logout', () => {
      this.disconnect();
    });
  }

  loginuserId() {
    return localStorage.getItem('userId');
  }
  joinGroup(data: any) {
    console.log(data.groupId, 'check joingroup', data.userId);
    const userIds = data?.userId?.map((item: any) => item.userid);
    this.socket.emit('createGroup', data.groupId, userIds);
  }

registerUser() {
  const userId = this.loginuserId();
  if (!userId) {
    return;
  }

  if (!this.socket.connected) {
    this.socket.connect();
  }

  console.log('Connected to server with socket ID:', this.socket.id);
  this.emitRegister();

  if (this.isRegisterConnectListenerBound) {
    return;
  }

  this.isRegisterConnectListenerBound = true;
  this.socket.on('connect', () => {
    const currentSocketId = this.socket.id;
    console.log('Connected to server with socket ID:', currentSocketId);
    this.emitRegister();
  });
}

  private emitRegister() {
    const userId = this.loginuserId();
    console.log(userId, 'this.loginuserId()');
    if (userId) {
      this.socket.emit('register', userId);
    }
  }
  //  disconnect(){

  //     this.socket.emit('disconnect');
  //  }
  getmessage(groupId: any, page: any, pageSize: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getMessages',
        { groupId: groupId, page, pageSize,'userId':this.loginuserId() },
        (messages: any) => {
          console.log('userId',this.loginuserId(), 'messages');

          observer.next(messages);
        }
      );
      return () => {
        console.log('endcalllllllllll');

        // this.socket.disconnect();
      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }

  getcallstart(groupId: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getcallstart',
        { groupId: groupId },
        (callstart: any) => {
          observer.next(callstart);
        }
      );
      return () => {

      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }
  //  onUserJoined(callback: (data: any) => void) {
  //   console.log("888");

  //   this.socket.on('groupJoined', (data) => {
  //     console.log(`Joined group ${data.groupId} with members`, data.members);
  //     });

  // }

  getcallingparticipantinfo(participantId: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getcallingparticipantinfo',
        { participantId: participantId },
        (callstart: any) => {
          observer.next(callstart);
        }
      );
      return () => {

      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }

  onUserJoined() {
    const observable = new Observable<{ user: String }>((observer: any) => {
      const listener = (data: any) => {
        console.log('testtttttttt', data);
        observer.next(data);
      };
  
      this.socket.on('groupJoined', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('groupJoined', listener); // ✅ proper cleanup
      };
    });
  
    return observable;
  }
  

  // prashant code start
  // onUnreadCountUpdated() {
  //   return new Observable((observer) => {
  //     this.socket.on('unreadCountUpdated', (data: any) => {
  //       console.log('Unread count updated:', data);
  //       observer.next(data);
  //     });
  //   });
  // }

  unreadCountUpdated(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        console.log('Unread count updated:', data);
        observer.next(data);
      };

      this.socket.on('unreadCountUpdated', listener);
      return () => {
        this.socket.off('unreadCountUpdated', listener);
      };
    });
  }
  tickon(event: string) {
  return new Observable(observer => {
    const listener = (data: any) => observer.next(data);
    this.socket.on(event, listener);
    return () => {
      this.socket.off(event, listener);
    };
  });
  }
    getMessageStatus(messageId: string,statusdb:any): Observable<number> {
    return new Observable((observer) => {
      this.socket.emit('getMessageStatus', { messageId }, (status: any) => {
        if(status===null){
        observer.next(statusdb); // Emit the unread count received
        }
        else{
        observer.next(status); // Emit the unread count received
        }
      });
    });
  }

  markAsRead(groupId: string, userId: string): Observable<void> {
    return new Observable((observer) => {
      this.socket.emit('markAsRead', { groupId, userId }, () => {
        observer.next();
        observer.complete();
      });
    });
  }

  joinChat(userId: string, groupId: string) {
    console.log(`test fucntion==========`);
    this.socket.emit('joinChat', { userId, groupId });
  }

  //  Leave chat
  leaveChat(userId: string) {
    this.socket.emit('leaveChat', { userId });
  }
  getUnreadCount(groupId: string, userId: string): Observable<number> {
    return new Observable((observer) => {
      this.socket.emit('getUnreadCount', { groupId, userId }, (count: number) => {
        observer.next(count); // Emit the unread count received
      });
    });
  }


  
  // prashant code end
  sendMessage(
    message: any,
    groupId: any,
    timestamp: any,
    attachment: any,
    isImportant:any,
    messageId:any,
    priority: string = 'ROUTINE'
  ) {
    this.socket.emit('sendMessage', {
      groupId: groupId,
      senderID: this.loginuserId(),
      message: message,
      timestamp: timestamp,
      attachment: attachment,
      isImportant,
      messageId,
      priority
    });
  }

  
  startcall(groupId: any, loginid: any) {
    console.log('channelName', groupId,loginid);

    // this.socket.emit('callstart', {
    //   groupId: groupId,
    //   loginid: loginid,
    // });
  }
  
 
  joinparticipant(
    groupId: any,
    loginid: any,
    audio:any
  ) {
    this.socket.emit('joinparticipant', {
      groupId: groupId,
      loginid: loginid,
      audio:audio
    });
  }

  ringstart(
    groupId: any,
    loginid: any,
    name: any,
    image: any,
    activegrouuserids: any,
    audio:any,
    isGroup:any
  ) {
    console.log('channelName', {
      groupId: groupId,
      loginid: loginid,
      callerName: name,
      callerImage: image,
      activegrouuserids: activegrouuserids,
      audio:audio,
      isGroup:isGroup
    });

    this.socket.emit('ringstart', {
      groupId: groupId,
      loginid: loginid,
      callerName: name,
      callerImage: image,
      activegrouuserids: activegrouuserids,
      audio:audio,
      isGroup:isGroup
    });
  }

  newMessage() {
    console.log('check111');
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        console.log(`New message from ${data.senderID}:`, data.message);
        observer.next(data);
      };
  
      this.socket.on('newMessage', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('newMessage', listener); // ✅ just remove the listener
      };
    });
  
    return observable;
  }
  
  // Accept Call Event
 acceptCall(callId: string, groupId: any,loginid:any='',audio:any) {
    console.log(callId, 'ddddd');

    this.socket.emit('acceptCall', { callerId: callId, groupId,loginid,audio });
  }
  participantinfo(loginuserdetails:any,uid:any,groupId:any) {

    this.socket.emit('participantinfo', { loginuserdetails,uid,groupId });
  }

  
  getparticipantinfo(groupId: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getparticipantinfo',
        { groupId: groupId },
        (getparticipantinfo: any) => {
          observer.next(getparticipantinfo);
        }
      );
      return () => {

      };
    });
    return observable;
  }

  // Reject Call Event
  rejectCall(callId: string, groupId: any,loginid:any) {
    this.socket.emit('rejectCall', { callerId: callId, groupId,loginid:loginid });
  }

  cancelcall(callId: string, groupId: any,loginid:any) {
    this.socket.emit('cancelcall', { callerId: callId, groupId,loginid:loginid });
  }
  leavecall(groupId: any,loginid:any,name:any='',callerID:any='',isGroup:any,audio:any) {
    this.socket.emit('leavecall', {groupId,loginid:loginid,name:name,callerID:callerID,isGroup:isGroup,audio:audio });
  }

  leaveCallOnWindowExit(groupId: any, loginid: any, name: any = '', callerID: any = '', isGroup: any, audio: any) {
    try {
      this.leavecall(groupId, loginid, name, callerID, isGroup, audio);
    } catch {}

    const isGroupCall = isGroup === true || isGroup === 'true' || isGroup === 1 || isGroup === '1';
    if (isGroupCall) {
      return;
    }

    try {
      if (this.socket.connected) {
        this.socket.emit('disconnection');
      }
    } catch {}

    try {
      this.socket.disconnect();
    } catch {}

    this.isRegisterConnectListenerBound = false;
  }

  userleavecall(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };

      this.socket.on('user-leave-call', listener);
      return () => {
        this.socket.off('user-leave-call', listener);
      };
    });
  }
  onCallRinging(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };

      this.socket.on('ringerstarted', listener);
      return () => {
        this.socket.off('ringerstarted', listener);
      };
    });
  }

  onCallAccepted(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };

      this.socket.on('callAccepted', listener);
      return () => {
        this.socket.off('callAccepted', listener);
      };
    });
  }

  onCallRejected(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };

      this.socket.on('callRejected', listener);
      return () => {
        this.socket.off('callRejected', listener);
      };
    });
  }

  CallCancelled(): Observable<any> {
    return new Observable((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };

      this.socket.on('callcancelled', listener);
      return () => {
        this.socket.off('callcancelled', listener);
      };
    });
  }

  muteAudio(groupId: any, senderID: any,isAudioMuted:any,uid:any) {
    this.socket.emit('mute-audio', {groupId:groupId,senderID:senderID,isAudioMuted:isAudioMuted,uid:uid});
  }

  getaudiomuteinfo(groupId: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getmutedinfo',
        { groupId: groupId },
        (getmutedinfo: any) => {
          observer.next(getmutedinfo);
        }
      );
      return () => {

      };
    });
    return observable;
  }

  Audiomute() {
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };
  
      this.socket.on('mute-audio-on', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('mute-audio-on', listener); // ✅ cleanup listener only
      };
    });
  
    return observable;
  }
  

  // emitCallCancelled(callId: string) {
  //   this.socket.emit('call-cancelled', { callId });
  // }
  ringerstarted() {
    console.log('channelName2');
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        console.log(`channelName ${data}`);
        observer.next(data);
      };
  
      this.socket.on('ringerstarted', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('ringerstarted', listener); // ✅ proper cleanup
      };
    });
  
    return observable;
  }
  

  callstarted() {
    console.log('channelName2');
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        console.log(`channelName ${data}`);
        observer.next(data);
      };
  
      this.socket.on('callstarted', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('callstarted', listener); // ✅ properly cleans up
      };
    });
  
    return observable;
  }

  socketgrouplist() {
    const observable = new Observable<{ user: String }>((observer: any) => {
      const listener = (data: any) => {
        console.log('testtttttttt', data);
        observer.next(data);
      };
  
      this.socket.on('updatedgroup', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('updatedgroup', listener); // ✅ properly removes the listener
      };
    });
  
    return observable;
  }
  

  typing(groupId: any, senderID: any) {
    console.log('llllllll');

    this.socket.emit('typing', { groupId: groupId, senderID: senderID });

    // Clear previous timeout and start a new one
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      // console.log('dhgjhkjhkjkkhkhjhkj');

      this.socket.emit('stopTyping', { groupId: groupId, senderID: senderID });
    }, 1000); // stopTyping after 2 seconds of inactivity
  }

  disconnect() {
    console.log('getOnlineUsers iii');
    if (this.socket.connected) {
      this.socket.emit('disconnection');
    }
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.isRegisterConnectListenerBound = false;
  }

  userTyping() {
    const observable = new Observable<{ user: String }>((observer) => {
      console.log('ddddddddddddddddddddlllllllllll');

      const listener = (data: any) => {
        console.log('ddddddddddddddddddddllllllllllllljjj');

        observer.next(data);
      };
      this.socket.on('userTyping', listener);
      return () => {
        this.socket.off('userTyping', listener);
      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }

  userstopTyping() {
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        console.log('ffffffffffffffffff', data);

        observer.next(data);
      };
      this.socket.on('userStopTyping', listener);
      return () => {
        this.socket.off('userStopTyping', listener);
      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }

  getOnlineUsers() {
    const observable = new Observable<{ userId: String }>((observer: any) => {
      this.socket.emit('getOnlineUsers', (data: any) => {
        observer.next(data);
        observer.complete(); // ✅ completes the observable since it's a one-time response
      });
  
      return () => {
        // No need to do anything unless you want to cancel something
      };
    });
  
    return observable;
  }
  
  userOnline() {
    const observable = new Observable<{ userId: String }>((observer: any) => {
      const listener = (data: any) => {
        observer.next(data);
      };
  
      this.socket.on('userOnline', listener);
  
      return () => {
        this.socket.off('userOnline', listener); 
      };
    });
  
    return observable;
  }
  
  userOffline() {
    const observable = new Observable<{ userId: String }>((observer: any) => {
      const listener = (data: any) => {
        console.log('userOffline', data);
        observer.next(data);
      };
  
      this.socket.on('userOffline', listener);
  
      return () => {
        this.socket.off('userOffline', listener); // ✅ only removes the listener
      };
    });
  
    return observable;
  }

  deleteMessage(groupId: any, messageId: any, userIds: any) {
    this.socket.emit('deleteMessage',  { groupId,messageId, userIds });
  }
    
  updateDeletedMessage() {
    const observable = new Observable<{ userId: String }>((observer: any) => {
      const listener = (data: any) => {
        observer.next(data);
      };
      this.socket.on('messageDeleted', listener);
      return () => {
        this.socket.off('messageDeleted', listener);
      };
    });
    return observable;
  }

  editMessage(groupId: any, messageId: any, message: any) {
    this.socket.emit('editMessage',  { groupId,messageId, message });
  }

   updateEditMessage() {
    const observable = new Observable<{ userId: String }>((observer: any) => {
      const listener = (data: any) => {
        observer.next(data);
      };
  
      this.socket.on('editMessage', listener);
  
      return () => {
        this.socket.off('editMessage', listener); 
      };
    });
  
    return observable;
  }

  getcallstarttime(groupId: any) {
    const observable = new Observable<{ user: String }>((observer) => {
      this.socket.emit(
        'getcallstarttime',
        { groupId: groupId },
        (callstart: any) => {
          observer.next(callstart);
        }
      );
      return () => {

      };
    });
    return observable;
    // var message:any=[]

    // return message;
  }

setpagename(loginid: any,groupid:any ='') {
  this.socket.emit('setpagename', {loginid,groupid});
}
leavepagename(loginid: any,groupid:any ='') {
  this.socket.emit('leavepagename', {loginid,groupid});
}
  
  
DeleteConversation(conversationId: string, userId: string): Observable<{ success: boolean; message: string; result?: any; error?: string }> {
  return new Observable((observer) => {
    this.socket.emit(
      'delete-conversation',
      { conversationId, userId },
      (response: any) => {
        observer.next(response);
        observer.complete(); // Complete the observable
      }
    );

    // Optional: handle cleanup
    return () => {
      // Any teardown logic if needed
    };
  });
}

 muteVideo(groupId: any, senderID: any,isVideoMuted:any,uid:any,name:any) {
    this.socket.emit('mute-video', {groupId:groupId,senderID:senderID,isVideoMuted:isVideoMuted,uid:uid,name:name });
}

Videomute() {
    const observable = new Observable<{ user: String }>((observer) => {
      const listener = (data: any) => {
        observer.next(data);
      };
  
      this.socket.on('mute-video-on', listener);
  
      return () => {
        console.log('endcalllllllllll');
        this.socket.off('mute-video-on', listener); // ✅ cleanup listener only
      };
    });
  
    return observable;
}

editGroup(groupId: any) {
  console.log("working")
  this.socket.emit('editGroup', {
    groupId: groupId,
   
  });
}
updatedGroup() {
    // const observable = new Observable<{ userId: String }>((observer: any) => {
    //  console.log("groupUpdated======")
    //   this.socket.on('groupUpdated', (data: any) => {
    //     observer.next(data);
    //   });
    //   return () => {
    //     // this.socket.disconnect();
    //   };
    // });
     const observable = new Observable<{ user: String }>((observer: any) => {
      const listener = (data: any) => {
        console.log('groupUpdated======', data);
        observer.next(data);
      };
  
      this.socket.on('groupUpdated', listener);
  
      return () => {
        console.log('groupUpdated');
        this.socket.off('groupUpdated', listener); // ✅ properly removes the listener
      };
    });
    return observable;
  }
getReminder() {
  
  const observable = new Observable<{ user: String }>((observer) => {
    const listener = (data: any) => {
      console.log(`reminder-message `,data);
      observer.next(data);
    };
    this.socket.on('reminder-message', listener);
    return () => {
      console.log('endcalllllllllll');
      this.socket.off('reminder-message', listener); // ✅ just remove the listener
    };
  });

  return observable;
}  

unreadnoti() {
  const observable = new Observable<{ user: String }>((observer) => {
    const listener = (data: any) => {
      observer.next(data);
    };
    this.socket.on('unreadnoti', listener);
    return () => {
      this.socket.off('unreadnoti', listener);
    };
  });
  return observable;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5A — Slack-Inspired Collaboration
// ═══════════════════════════════════════════════════════════════════════════

// ─── Channel Topics ─────────────────────────────────────────────────────
setTopic(groupId: string, topic: string, userId: string, userName: string) {
  this.socket.emit('setTopic', { groupId, topic, userId, userName });
}

onTopicUpdated() {
  return new Observable<any>((observer) => {
    const listener = (data: any) => observer.next(data);
    this.socket.on('topicUpdated', listener);
    return () => this.socket.off('topicUpdated', listener);
  });
}

// ─── Message Reactions ──────────────────────────────────────────────────
addReaction(groupId: string, messageId: string, emoji: string, userId: string, userName: string) {
  this.socket.emit('addReaction', { groupId, messageId, emoji, userId, userName });
}

removeReaction(groupId: string, messageId: string, emoji: string, userId: string) {
  this.socket.emit('removeReaction', { groupId, messageId, emoji, userId });
}

onReactionUpdated() {
  return new Observable<any>((observer) => {
    const listener = (data: any) => observer.next(data);
    this.socket.on('reactionUpdated', listener);
    return () => this.socket.off('reactionUpdated', listener);
  });
}

// ─── Message Pinning ────────────────────────────────────────────────────
pinMessage(groupId: string, messageId: string, userId: string, userName: string) {
  this.socket.emit('pinMessage', { groupId, messageId, userId, userName });
}

unpinMessage(groupId: string, messageId: string, userId: string) {
  this.socket.emit('unpinMessage', { groupId, messageId, userId });
}

onMessagePinned() {
  return new Observable<any>((observer) => {
    const listener = (data: any) => observer.next(data);
    this.socket.on('messagePinned', listener);
    return () => this.socket.off('messagePinned', listener);
  });
}

onMessageUnpinned() {
  return new Observable<any>((observer) => {
    const listener = (data: any) => observer.next(data);
    this.socket.on('messageUnpinned', listener);
    return () => this.socket.off('messageUnpinned', listener);
  });
}


}
