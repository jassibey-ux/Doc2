import { Component, OnInit, ElementRef, Renderer2, ViewChild ,OnDestroy} from '@angular/core';
import AgoraRTC, { IAgoraRTCClient,  IAgoraRTCRemoteUser,  ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { environment } from 'src/environments/environment';
import { ChatService } from 'src/app/services/chat.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { Location } from '@angular/common';
import { ToastrService } from 'ngx-toastr';

export interface IRtc {
  client: IAgoraRTCClient | null, // Allow null
  localAudioTrack: IMicrophoneAudioTrack | null, // Allow null
  localVideoTrack: ICameraVideoTrack | null  // Allow null
}

@Component({
  selector: 'app-video-call',
  templateUrl: './video-call.component copy.html',
  styleUrls: ['./video-call.component copy.scss']
})
export class VideoCallComponent implements OnInit {
  @ViewChild('localVideo') localVideoRef!: ElementRef;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef;
  @ViewChild('ringtone') ringtoneRef!: ElementRef<HTMLAudioElement>;
  groupId: any | null = null;
  activegroupuserids: any = [];
  recievetitle: any = {name: "akash", image: ""};
  loginid: any = '';
  callstarted:any=false;
   callstatus:any = ''
   callerID:any=''
callstarttime:any=0
watchdogInterval: any;
  rtc: IRtc = {
    client: null,
    localAudioTrack: null,
    localVideoTrack: null,
  };
  localTracks = {
    videoTrack: null,
    audioTrack: null
  };
  senderName:any=''
  senderImage:any=''
  dynamicpath: any = '';
  isRinging: any = false;
  incomingCall: any = '';
  private APP_ID = environment.APP_ID;
  loginuserresponse: any = '';
isVideoMuted :any=false;
isAudioMuted :any=false;
isReject:any=false
callDuration = '00:00:00';
private timerInterval: any;
rejoin:any=false;
private totalSeconds = 0;
audio:any=false;
statevalue='';
isGroup:any='';
remoteUsers: any[] = [];   // <-- ADD THIS
  isAudioCall: boolean = false; // <-- ADD THIS
  constructor(
    private chatservice: ChatService,
    private websocket: WebsocketService,
    private route: ActivatedRoute,
    private readonly renderer: Renderer2,
    private authService: AuthServiceService,
    private _coreService: CoreService,
    private router: Router,
    private location: Location,
     private toastr: ToastrService,
  ) {
    this.remoteUsers = [
      { name: 'User 1', isMuted: false },
      { name: 'User 2', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false },
      { name: 'User 1', isMuted: false }
      
    ];
    this.isAudioCall = true; 
  }

  getGridClass(totalUsers: number): string {
    if (totalUsers === 1) {
      return 'col-12';    // full width
    } else if (totalUsers === 2) {
      return 'col-6';     // 2 columns
    } else if (totalUsers <= 4) {
      return 'col-6';     // 2x2 grid
    } else if (totalUsers <= 6) {
      return 'col-4';     // 3 columns
    } else if (totalUsers <= 9) {
      return 'col-4';     // 3x3 grid
    } else {
      return 'col-3';     // 4 columns for 10+ users
    }
  }
  // startOfflineWatchdog() {
  //   let offlineCounter = 0;
  //   // Check every second if the user is offline
  //   this.watchdogInterval = setInterval(() => {
  //     console.log("onlineeeeeeeeee",navigator.onLine);
      
  //     if (!navigator.onLine) {
  //       offlineCounter++;
  //       console.warn(`Offline for ${offlineCounter} seconds`);
  //       if (offlineCounter >= 30) {
  //         this.endCallDueToDisconnect();
  //       }
  //     } else {
  //       // Reset counter if user is back online
  //       offlineCounter = 0;
  //     }
  //   }, 1000);
  // }
  
  // endCallDueToDisconnect() {
  //   // Clean up everything
  //   clearInterval(this.timerInterval);
  //   clearInterval(this.watchdogInterval);
  //   console.error("Internet was down for 30 seconds. Ending call...");
  //   // You can also emit a message to the backend or navigate away
  //   this.leaveCall(); // <-- Your custom method to leave the call
  // }

  async ngOnInit() {
    this.dynamicpath = this.authService.getRole();
    this.Audiomute();
    this.VideoMute()
    this.websocket.registerUser();
    const navState = this.location.getState() as any;
    const fromA = navState?.fromA;

    console.log(fromA, "fromA");

    if (fromA) {
      this.getUserById(fromA);
    } else {
      this.redirectchat()
      console.log("Not coming from Component A");
    }

    this.loginid = localStorage.getItem('userId');
    this.isRinging = false;
    this.activegroupuserids = [];

    // this.websocket.callstarted().subscribe((data: any) => {
    //   console.log("channelNamecallstarted",data);
    //   if (this.loginid != data.loginid) {
    //     this.startCall(data.groupId, this.loginid);
    //   }
    // });

    this.websocket.onCallAccepted().subscribe((data: any) => {
      console.log('Call Accepted by Receiver', data,this.isRinging);
      if (this.loginid == data.callerId && !this.callstarted) {
        if(this.isRinging){
          console.log("ddddddddddddddddddddddd");
          this.stopRingtone();
          this.isRinging = false;
          this.callUser(data.groupId);
        }
      }
    });

this.websocket.CallCancelled().subscribe((data: any) => {
  console.log('Call Accepted by Receiver', data);
  if (this.loginid == data.loginid) {
    this.isRinging = false;
        this.incomingCall = null;
       this.redirectchat()
  }
  else{
      if(!this.callstarted){
        this.isRinging = false;
        this.incomingCall = null;
        this.redirectchat()
      }
      }
    });

    this.websocket.userleavecall().subscribe((data: any) => {
      console.log("leavecallllll",data);
      
      if(data.groupId == this.groupId && this.loginid!=data.leaveuserid)
      {
        this.toastr.error(data.name+" Participant left");
 if(!data.isGroup)
        {
          console.log("leavecallllll");
          
          this.leaveCall()
        }
      }
      else{
        
       
      }
    })

    this.websocket.onCallRejected().subscribe((data: any) => {
      console.log('Call Rejected by Receiver',data);
      if (this.loginid == data.loginid) {
        this.isRinging = false;
            this.incomingCall = null;
            this.stopRingtone();
           this.redirectchat()
      }
      else{
        if(data.groupmember)
          {
  
          }
          else{
            this.isRinging = false;
            this.incomingCall = null;
            this.isReject=true;
            this.stopRingtone();
          }
      }
    });
   
    this.websocket.ringerstarted().subscribe((data: any) => {
      console.log("dddddddddaddringerstarted",data);
      
      if (data.callerId == this.loginid) {
        this.callstatus = "Ringing"
      }
    });

    setTimeout(() => {
      if(this.isRinging)
      {
        this.isRinging = false;
        this.incomingCall = null;
        this.redirectchat()
      }
      if(this.incomingCall)
        {
          this.incomingCall = null;
          this.redirectchat()
        }
     
    }, 30000); // 30 sec timeout agar receiver response na de
  }

  redirectchat()
  {
    if (this.rtc.localAudioTrack) {
      this.rtc.localAudioTrack.close();
      this.rtc.localAudioTrack =  null;
    }
    if (this.rtc.localVideoTrack) {
      this.rtc.localVideoTrack.close();
      this.rtc.localVideoTrack =  null;
    }
localStorage.removeItem('uid')

    const path = `/${this.dynamicpath}/chats`;
    window.location.href =path
  }

  stopRingtone() {
    const ringtone = this.ringtoneRef?.nativeElement;
    if (ringtone) {
      ringtone.pause();
      ringtone.currentTime = 0;
    }
  }
  
  acceptCall() {
    this.websocket.acceptCall(this.incomingCall.callerId, this.groupId,this.loginid,this.audio);
    this.incomingCall = null; // UI se call remove karein
    this.isRinging=false;
    this.stopRingtone()
    this.startCall(this.groupId, this.loginid);
  }

  async rejectCall() {
    this.websocket.rejectCall(this.incomingCall.callerId, this.groupId,this.loginid);
    this.incomingCall = null;
    setTimeout(() => {
      this.redirectchat()
    }, 1000);
    
  }

  async cancelCall() {
    console.log('Call Cancelled by Sender');
    this.websocket.cancelcall(this.incomingCall.callerId, this.groupId,this.loginid);

    this.isRinging = false;
    this.incomingCall = null;
    this.redirectchat()
  }

  mutesvideo() {
     // Ensure localVideoTrack is not null before muting
  if (this.rtc.localVideoTrack) {
    if (!this.isVideoMuted) {
      this.isVideoMuted = true;
      this.rtc.localVideoTrack.setMuted(true);
    } else {
      this.isVideoMuted = false;
      this.rtc.localVideoTrack.setMuted(false);
    }

    var uid = localStorage.getItem('uid')
    this.websocket.muteVideo(this.groupId, this.loginid,this.isVideoMuted,uid,this.loginuserresponse.fullName);

    // Send the mute/unmute action to the websocket
  } else {
    console.warn('Local video track is null');
  }
  }

  mutesAudio() {
  if (this.rtc.localAudioTrack) {
    if (!this.isAudioMuted) {
      this.isAudioMuted = true;
      this.rtc.localAudioTrack.setMuted(true);
    } else {
      this.isAudioMuted = false;
      this.rtc.localAudioTrack.setMuted(false);
    }
    var uid = localStorage.getItem('uid')

    this.websocket.muteAudio(this.groupId, this.loginid,this.isAudioMuted,uid);

  }
  }
  Audiomute() {
    this.websocket.Audiomute().subscribe((data: any) => {
      if (
        data.groupId === this.groupId
      ) {
       if(data.isAudioMuted)
       {
console.log("if",data);
if(data.uid)
{
  let element = document.getElementsByClassName('remote-video-mic' + data.uid)[0];
  console.log(element,"elementiffffff");
  
  if (element) {
    element.classList.remove('bx-microphone');
    element.classList.add('bx-microphone-off');
  
  }
}

       }
       else{
        if(data.uid)
          {
            let element = document.getElementsByClassName('remote-video-mic' + data.uid)[0];
  console.log(element,"elementelseeeee");

            if (element) {
              element.classList.remove('bx-microphone-off');
              element.classList.add('bx-microphone');
            }
          }
       }
      }
    });
  }

  VideoMute(){
    this.websocket.Videomute().subscribe((data: any) => {
      if (
        data.groupId === this.groupId
      ) {
        if(data.isVideoMuted)
       {
if(data.uid)
{
  let element = document.getElementsByClassName('remote-video-cam' + data.uid)[0];
  if (element) {
    element.classList.remove('username');
    element.classList.add('usernamecenter');
  //  element.innerHTML = this.getInitials(data.name);
  }
}
       }
       else{
        if(data.uid)
          {
            let element = document.getElementsByClassName('remote-video-cam' + data.uid)[0];
            console.log(element,"elementelseeeee");

            if (element) {
              element.classList.remove('usernamecenter');
              element.classList.add('username');
              // element.innerHTML = data.name;
            }
          }
       }
        console.log("data log",data)
      
}})

}

  getUserById(fromA: any) {
    this.authService.getUserById().subscribe((res: any) => {
      this.loginuserresponse = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });
      this.senderName =this.loginuserresponse.fullName
      this.senderImage =this.loginuserresponse?.profilePicture?.savedName;
      this.activegroupuserids = fromA.actualgroupmemberid;
      this.audio = fromA.audio;
      const type = fromA.type;
      this.groupId = fromA?.groupid;
      this.rejoin=fromA?.rejoin;
      this.isGroup=fromA?.group;
      this.callerID = fromA.callerId !== undefined?fromA.callerId:this.loginid
      if(!fromA?.rejoin && localStorage.getItem('uid'))
        {
          this.redirectchat();
        }
      if(fromA?.rejoin)
      {
this.startCall(this.groupId,this.loginuserresponse)
      }
      this.websocket.joinGroup({
        groupId: this.groupId,
        userId: this.activegroupuserids
      });
      this.recievetitle = { name: fromA.title, image: fromA.image };

      if (type === 'callby'  && !fromA?.rejoin) {
        this.startRing(fromA);
      }

      if (fromA.callerId !== undefined  && !fromA?.rejoin) {
        this.ringtoneRef?.nativeElement.play().catch(err => {
          console.error("Ringtone play failed:", err);
        });
        if (this.loginid !== fromA.callerId) {
         this.incomingCall = {
            callerImage: fromA.callerImage,
            callerName: fromA.callerName,
            callerId: fromA.callerId,
            audio: fromA.audio
          };
        }
      }
    });
  }

  async startRing(fromA: any) {
    if(!this.callstarted)
      {
    this.isRinging = true;
    this.callstatus = "Calling";
    this.ringtoneRef?.nativeElement.play().catch(err => {
      console.error("Ringtone play failed:", err);
    });
    console.log("Starting call", this.loginuserresponse, "receiver", this.recievetitle);
    this.websocket.ringstart(fromA.groupid, this.loginid, this.loginuserresponse?.fullName, this.loginuserresponse?.profilePicture?.savedName, this.activegroupuserids,this.audio,this.isGroup);
}
  }

  async callUser(groupId: any) {
    console.log("channelNamecallUser", groupId);
    this.startCall(groupId, this.loginid);
    // this.websocket.startcall(groupId, this.loginid);
  }

  async startCall(groupId: any, loginuserresponse: any) {
    if(!this.callstarted)
      {
    const channelName = groupId;
    console.log("channelNamestartCall", channelName);
    if(this.rejoin)
    {
      this.websocket.joinparticipant(this.groupId,this.loginid,this.audio);
    }
    const uid = this.rejoin ? localStorage.getItem('uid') || '' : '';
    await this.chatservice.getAgoraToken(channelName,uid).subscribe(async (data: any) => {
      if (!data.token) {
        console.error("Error: Token is missing or invalid.");
        return;
      }
      localStorage.setItem('uid',data.uid)
      this.websocket.participantinfo(this.loginuserresponse,data.uid,this.groupId);
      const option = { APP_ID: this.APP_ID, groupId: this.groupId, token: data.token, uid: data.uid, name: loginuserresponse.fullName };
      console.log(option, "option");

      this.connect(option);
    });
  }
  }

 connect(data: any) {
    console.log("Connecting...");

    AgoraRTC.getDevices().then(async (devices) => {
      let audioDevices, videoDevices;
      let selectedMicrophoneId, selectedCameraId;
      audioDevices = devices.filter(function (device) {
        return device.kind === "audioinput";
      });
      selectedMicrophoneId = audioDevices[0].deviceId;
      this.rtc.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      console.log(this.audio,"audio");
      
      if(!this.audio)
      {
      console.log("audiokllllllllllll");

        videoDevices = devices.filter(function (device) {
          return device.kind === "videoinput";
        });
        selectedCameraId = videoDevices[0].deviceId;
        this.rtc.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
          cameraId: selectedCameraId, encoderConfig: "720p",
        });
      }
     

      return Promise.all([
        this.rtc
      ]);
    }).then(res => {
      this.startBasicCall(data);
    }).catch(e => {
      console.error("Error while connecting:", e);
    });
  }


  async startBasicCall(data: any) {
    this.rtc.client = await AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    await this.rtc.client.join(data.APP_ID, data.groupId, data.token, data.uid).then((data:any) => {

      console.log("llllllllllllllllllllll",data);
      
      if(data && !this.callstarted)
      {
        this.callstarted=true;
        this.startCallTimer();
        this.publishLocalTrack();
        this.publishedRemoteTracks();
      }
      console.log("Joined channel");
   
    }).catch(e => {
      console.error("Error while joining channel:", e);
    });
  }

  publishedRemoteTracks() {
    if (!this.rtc.client) {
      console.error("RTC client is not initialized.");
      return;
    }

    this.rtc.client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => {
      console.log("User published", user.hasAudio,"====",user);
      await this.rtc.client!.subscribe(user, mediaType as "audio" | "video");
      if (mediaType === "video" || mediaType === "audio") {
        this.attachRemoteTrack(mediaType, user);
      }
    });

    this.rtc.client.on("user-joined", async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => {
  console.log("user joined:", user.uid,this.audio);
  
        this.attachRemoteTrack(this.audio ? 'audio' : 'video', user);
      
});

    this.rtc.client.on("user-unpublished", user => {
      console.log("User unpublished", user);
    });

    this.rtc.client.on("user-left", user => {
      console.log("User left", user,this.activegroupuserids);
      this.removeRemoteUser(user.uid);
    });
  }
   getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  private attachRemoteTrack(track: any, user: any) {
    console.log(track,"this.rtc.clientthis.rtc.clientthis.rtc.client",user);
   var receipentname='';
   user.uid = typeof user.uid === "number" ? user.uid : Number(user.uid);
    this.websocket
    .getparticipantinfo(this.groupId)
    .subscribe((getparticipantinfo: any) => {
      console.log(`getparticipantinfo`, getparticipantinfo);
      var getparticipantinfo=JSON.parse(getparticipantinfo).participant;
   const userinfo = getparticipantinfo.find((u:any) => u.uid === user.uid);
      if(userinfo)
      {
        //receipentname=userinfo?.loginuserdetails?.fullName;
        // receipentname = (userinfo?.loginuserdetails?.fullName) || 'Unknown' + '<i class="bx bx-microphone" id= "remote-video-mic"' + user.uid +'></i>';
        receipentname = (userinfo?.loginuserdetails?.fullName || 'Unknown');

        if (!this.rtc.client) {
          console.error("RTC client is not initialized.");
          return;
        }
    this.websocket
    .getaudiomuteinfo(this.groupId)
    .subscribe((getmutedinfo: any) => {
      console.log(getmutedinfo,"===========mutedinfo");
      var mutedinfo:any= {};
      if(getmutedinfo!= null){
        var getmutedinfo=JSON.parse(getmutedinfo).audio
        console.log(getmutedinfo,"===========mutedinfo-1", user.uid);
        mutedinfo = getmutedinfo.find((u:any) => u.uid == user.uid);
        console.log(mutedinfo,"===========mutedinfo-2");

      }

        if (track === 'video' && !this.audio) {
          if (document.getElementsByClassName('sid-' + user.uid).length == 0) {
    
            const div = this.renderer.createElement('div');
    
            const videoBox = this.renderer.createElement('div');
            this.renderer.addClass(videoBox, 'video_box');
            this.renderer.addClass(videoBox, 'video-' + user.uid);
            this.renderer.addClass(div, 'user');
            this.renderer.addClass(div, 'sid-' + user.uid);
            this.renderer.setProperty(div, 'id', 'remote-video-div-' + user.uid);
    
    
            this.renderer.addClass(div, 'identity-' + user.uid);
            this.renderer.setProperty(videoBox, 'id', 'remote-video-' + user.uid);
            this.renderer.appendChild(div, videoBox);
            // const userBtn = this.renderer.createElement('div');
         
    
            // this.renderer.addClass(userBtn, 'mute-btn');
            // // //getting anchor data
            // // const anchor ="vikas";
            
            const itag = this.renderer.createElement('i');
            this.renderer.addClass(itag, 'bx');
            console.log(`mutedinfo?.audiomute`, mutedinfo);
            if(mutedinfo?.audiomute){
              this.renderer.addClass(itag, 'bx-microphone-off');
            }
            else{
            this.renderer.addClass(itag, 'bx-microphone');
            }
            this.renderer.addClass(itag, 'remote-video-mic' + user.uid);
    
            // this.renderer.appendChild(userBtn, itag);
            const namediv = this.renderer.createElement('div');
            this.renderer.addClass(namediv, 'username');
            this.renderer.addClass(namediv, 'remote-video-cam' + user.uid);
            const text = this.renderer.createText(receipentname);  // ✅ createText
            this.renderer.appendChild(namediv, text); 
            this.renderer.appendChild(namediv, itag);

            this.renderer.appendChild(videoBox, namediv);
    
            // this.renderer.appendChild(videoBox, userBtn);
    
            // this.renderer.appendChild(userBtn, itag);
            this.renderer.appendChild(this.remoteVideoRef.nativeElement, div);
            this.updateVideoGridLayout();
           
          }
          this.rtc.localVideoTrack?.play(this.localVideoRef.nativeElement);
          user.videoTrack.play('remote-video-' + user.uid);
            user.audioTrack.play('remote-audio-' + user.uid);
          const element = document.querySelector('.agora_video_player') as HTMLElement;
    if (element) {
      element.style.position = 'unset';
      // element.style.backgroundColor = 'black';
      // element.style.width = '100%';
    }
        } 
        
        
        if (track === 'audio' && this.audio) {
        receipentname = (userinfo?.loginuserdetails?.fullName);

          if (document.getElementsByClassName('sid-' + user.uid).length == 0) {
            const div = this.renderer.createElement('div');
          const videoBox = this.renderer.createElement('div');
          this.renderer.addClass(videoBox, 'video_box');
          this.renderer.addClass(videoBox, 'video-' + user.uid);
          this.renderer.addClass(div, 'user');
          this.renderer.addClass(div, 'sid-' + user.uid);
          this.renderer.setProperty(div, 'id', 'remote-video-div-' + user.uid);
    
          this.renderer.addClass(div, 'identity-' + user.uid);
          this.renderer.setProperty(videoBox, 'id', 'remote-video-' + user.uid);
          this.renderer.appendChild(div, videoBox);
          // const userBtn = this.renderer.createElement('button');
          // this.renderer.addClass(userBtn, 'mute-btn');
    
          const itag = this.renderer.createElement('i');
          this.renderer.addClass(itag, 'bx');
          if(mutedinfo?.audiomute){
            this.renderer.addClass(itag, 'bx-microphone-off');
            }else{
            this.renderer.addClass(itag, 'bx-microphone');
            }
          this.renderer.addClass(itag, 'remote-video-mic' + user.uid);
          // this.renderer.appendChild(userBtn, itag);
          const namediv = this.renderer.createElement('div');
          this.renderer.addClass(namediv, 'usernamecenter'); 
          // this.renderer.addClass(namediv, 'remote-video-cam' + user.uid);

          const text = this.renderer.createText(receipentname);  // ✅ createText
          this.renderer.appendChild(namediv, text); 
          this.renderer.appendChild(namediv, itag);
          this.renderer.appendChild(videoBox, namediv);
          // this.renderer.appendChild(videoBox, userBtn);
          this.renderer.appendChild(this.remoteVideoRef.nativeElement, div);
          this.updateVideoGridLayout();
          }
          user.audioTrack.play('remote-audio-' + user.uid);
    
        }
    })
      }
    
    });
  
  }

  removeRemoteUser(uid: any) {
    const remoteVideo = document.getElementById(`remote-video-div-${uid}`);
    if (remoteVideo) {
      remoteVideo.remove();
      this.updateVideoGridLayout();
    }
  }

  private async cleanupAgora() {
    // Stop and close local audio track
    if (this.rtc.localAudioTrack) {
      console.log("Stopping and closing local audio track...");
      this.rtc.localAudioTrack.stop();
      this.rtc.localAudioTrack.close();
      this.rtc.localAudioTrack = null;
    }
  
    // Stop and close local video track
    if (this.rtc.localVideoTrack) {
      console.log("Stopping and closing local video track...");
      this.rtc.localVideoTrack.stop();
      this.rtc.localVideoTrack.close();
      this.rtc.localVideoTrack = null;
    }
    await this.forceStopCamera();

    // Leave the channel and remove all listeners
    if (this.rtc.client) {
      console.log("Leaving the Agora channel...");
      await this.rtc.client.leave();
      this.rtc.client.removeAllListeners();
      this.rtc.client = null;
    }
  
    // Clear video sources for local and remote video elements
    this.clearVideoElements();
  
    console.log("Agora cleanup completed.");
  }
  private async forceStopCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop()); // Stop all media tracks
    console.log("Forced stop of all camera tracks.");
  }
  
  
  private clearVideoElements() {
    const localVideoElement = this.localVideoRef.nativeElement;
    if (localVideoElement) {
      console.log("Clearing local video source...");
      localVideoElement.srcObject = null; // Clear the local video source
    }
  
    const remoteVideoElement = this.remoteVideoRef.nativeElement;
    if (remoteVideoElement) {
      console.log("Clearing remote video source...");
      remoteVideoElement.srcObject = null; // Clear the remote video source
    }
  }
  
  

  async publishLocalTrack() {
    try {
      if (!this.rtc.client) {
        console.error("RTC client is not initialized.");
        return;
      }

      if (!this.rtc.localVideoTrack && !this.audio) {
        this.rtc.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      }
      if (!this.rtc.localAudioTrack) {
        this.rtc.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }

      this.rtc.localVideoTrack?.play(this.localVideoRef.nativeElement);
      let dataTracks = [this.rtc.localAudioTrack, ...(this.rtc.localVideoTrack ? [this.rtc.localVideoTrack] : [])];
      await this.rtc.client.publish(dataTracks);
      if(this.rejoin){
        this.rtc.client.remoteUsers.forEach((user) => {
          console.log(`user-----------`, user);
        this.attachRemoteTrack('audio', { uid: localStorage.getItem('uid') });
        })
      }
      console.log("Local tracks published");
    } catch (error) {
      console.error("Error publishing local tracks:", error);
    }
  }


  startCallTimer() {
    this.websocket
    .getcallstarttime(this.groupId)
    .subscribe((callstart: any) => {
      // console.log(message, 'messagemessage');
      this.callstarttime = JSON.parse(callstart).time;
      console.log("callstartedstatus", this.callstarttime);
      
      // Get current timestamp in seconds
      const timestamp2 = Math.floor(Date.now() / 1000);
      console.log("Current timestamp:", timestamp2);
      // Calculate difference in seconds (no extra division)
      const diffInSeconds = timestamp2 - this.callstarttime;
      console.log(`Difference: ${diffInSeconds} seconds`);
    this.totalSeconds = diffInSeconds;
    this.timerInterval = setInterval(() => {
      this.totalSeconds++;
      this.callDuration = this.formatTime(this.totalSeconds);
    }, 1000);
    // this.startOfflineWatchdog();
    });
   
  }

  stopCallTimer() {
    clearInterval(this.timerInterval);
    clearInterval(this.watchdogInterval);
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':');
  }
  leaveCall() {
    setTimeout(() => {
    this.websocket.leavecall(this.groupId,this.loginid,this.loginuserresponse.fullName,this.callerID,this.isGroup,this.audio);
    this.redirectchat()
    }, 1000);
  }

  ngOnDestroy()
  {
    console.log("ngOnDestroy");
    
    this.websocket.leavecall(this.groupId,this.loginid,this.loginuserresponse.fullName,this.callerID,this.isGroup,this.audio);
    setTimeout(() => {
      this.stopRingtone();
      this.stopCallTimer();
    this.redirectchat();``
    }, 100);
  }

  ngAfterViewInit(): void {
    const observer = new MutationObserver(() => {
      const videoBoxes = document.querySelectorAll('.video_box');
      videoBoxes.forEach(box => {
        (box as HTMLElement).style.position = 'relative';
  
        const muteBtn = box.querySelector('.mute-btn') as HTMLElement;
        if (muteBtn) {
          // muteBtn.style.position = 'absolute';
          muteBtn.style.zIndex = '999';
          muteBtn.style.top = '10px';
          muteBtn.style.left = '10px';
        }
      });
    });
  
    const target = document.querySelector('.append_main_videoBox');
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  private updateVideoGridLayout() {
    const container = this.remoteVideoRef.nativeElement;
    const users = container.querySelectorAll('.user');
    const totalUsers = users.length;
  
    const maxColumns = Math.ceil(Math.sqrt(totalUsers));
    container.style.gridTemplateColumns = `repeat(${maxColumns}, 1fr)`;
    const rows = Math.ceil(totalUsers / maxColumns);

    if (totalUsers === 2 && rows === 1) {
      container.style.alignItems = "center";
    } else {
      container.style.alignItems = "start";
    }
    // ---- 3. Calculate each block max height ----
    const containerHeight = window.innerHeight * 0.85;
    const blockMaxHeight = containerHeight / rows;
  
    users.forEach((el: any) => {
      el.style.maxHeight = `${blockMaxHeight - 10}px`; // minus gap
    });
  }

  
}
