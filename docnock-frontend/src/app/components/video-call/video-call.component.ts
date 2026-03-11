import { Component, OnInit, ElementRef, Renderer2, ViewChild, OnDestroy, HostListener } from '@angular/core';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack
} from 'agora-rtc-sdk-ng';
import { environment } from 'src/environments/environment';
import { ChatService } from 'src/app/services/chat.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { Location } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

export interface IRtc {
  client: IAgoraRTCClient | null;
  localAudioTrack: IMicrophoneAudioTrack | null;
  localVideoTrack: ICameraVideoTrack | null;
}

interface CallChatMessage {
  messageId: string;
  senderID: string;
  senderName: string;
  message: string;
  timestamp: number;
  attachments: any[];
}

@Component({
  selector: 'app-video-call',
  templateUrl: './video-call.component.html',
  styleUrls: ['./video-call.component.scss']
})
export class VideoCallComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLElement>;
  @ViewChild('ringtone') ringtoneRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('callChatScroll') callChatScrollRef!: ElementRef<HTMLElement>;

  groupId: any | null = null;
  activegroupuserids: any = [];
  recievetitle: any = { name: 'akash', image: '' };

  loginid: any = '';
  callerID: any = '';
  callstarted: any = false;
  callstatus: any = '';
  callstarttime: any = 0;

  rtc: IRtc = {
    client: null,
    localAudioTrack: null,
    localVideoTrack: null
  };

  private APP_ID = environment.APP_ID;

  dynamicpath: any = '';
  isRinging: any = false;
  incomingCall: any = '';
  loginuserresponse: any = '';

  isVideoMuted: any = false;
  isAudioMuted: any = false;
  isReject: any = false;
  isScreenSharing: boolean = false;
  private cameraVideoTrackBackup: ICameraVideoTrack | null = null;

  callDuration = '00:00:00';
  private timerInterval: any;
  private totalSeconds = 0;

  rejoin: any = false;
  audio: any = false; // audio-only call
  isGroup: any = '';
  private remoteEventsBound = false;
  private remoteMuteState: Record<string, boolean> = {};

  watchdogInterval: any;
  private isPiPActive = false;
  private visibilityHeartbeatInterval: any;
  private explicitLeaveRequested = false;
  private isStartingCall = false;
  private hasRejoinParticipantSynced = false;
  private lastParticipantInfoKey = '';
  private destroy$ = new Subject<void>();
  private isCleaningUpRtc = false;
  callChatMessages: CallChatMessage[] = [];
  callChatText: string = '';
  isSendingCallChat: boolean = false;
  isCallChatOpen: boolean = false;
  callChatSelectedFiles: Array<{ file: File; name: string; type: string }> = [];
  private isCallChatListenerBound = false;

  callUiState: 'idle' | 'incoming' | 'outgoing' | 'missed' | 'rejected' = 'idle';
  currentCallContext: any = null;

  private readonly remoteRejoinGraceMs = 7000;
  private remoteRejoinTimers: Record<string, any> = {};
  remoteReconnecting: boolean = false;
  remoteReconnectMessage: string = '';

  private async teardownRtcSession() {
    if (this.isCleaningUpRtc) {
      return;
    }

    this.isCleaningUpRtc = true;

    this.clearAllRemoteRejoinTimers();

    try {
      const client = this.rtc.client;
      const tracksToUnpublish: any[] = [];

      if (this.rtc.localAudioTrack) {
        tracksToUnpublish.push(this.rtc.localAudioTrack);
      }

      if (this.rtc.localVideoTrack) {
        tracksToUnpublish.push(this.rtc.localVideoTrack);
      }

      try {
        if (client && tracksToUnpublish.length > 0) {
          await client.unpublish(tracksToUnpublish);
        }
      } catch {}

      try {
        client?.removeAllListeners?.();
      } catch {}

      try {
        if (client) {
          await client.leave();
        }
      } catch {}

      try {
        this.rtc.localAudioTrack?.stop();
        this.rtc.localAudioTrack?.close();
      } catch {}

      try {
        this.rtc.localVideoTrack?.stop();
        this.rtc.localVideoTrack?.close();
      } catch {}

      if (this.cameraVideoTrackBackup) {
        try {
          this.cameraVideoTrackBackup.stop();
          this.cameraVideoTrackBackup.close();
        } catch {}
        this.cameraVideoTrackBackup = null;
      }

      this.rtc.client = null;
      this.rtc.localAudioTrack = null;
      this.rtc.localVideoTrack = null;
      this.remoteEventsBound = false;
      this.callstarted = false;
      this.isScreenSharing = false;
      this.clearCurrentAgoraSessionGlobally();

      if (this.remoteVideoRef?.nativeElement) {
        this.remoteVideoRef.nativeElement.innerHTML = '';
        this.updateVideoGridLayout();
      }
    } finally {
      this.isCleaningUpRtc = false;
    }
  }

  private async cleanupOrphanAgoraSession() {
    const globalState = window as any;
    const orphanClient = globalState.__dockRtcClient as IAgoraRTCClient | undefined;
    const orphanAudioTrack = globalState.__dockRtcLocalAudioTrack as IMicrophoneAudioTrack | undefined;
    const orphanVideoTrack = globalState.__dockRtcLocalVideoTrack as ICameraVideoTrack | undefined;
    const orphanBackupVideoTrack = globalState.__dockRtcCameraVideoTrackBackup as ICameraVideoTrack | undefined;

    try {
      if (orphanAudioTrack) {
        orphanAudioTrack.stop();
        orphanAudioTrack.close();
      }
    } catch {}

    try {
      if (orphanVideoTrack) {
        orphanVideoTrack.stop();
        orphanVideoTrack.close();
      }
    } catch {}

    try {
      if (orphanBackupVideoTrack) {
        orphanBackupVideoTrack.stop();
        orphanBackupVideoTrack.close();
      }
    } catch {}

    try {
      if (orphanClient) {
        await orphanClient.leave();
      }
    } catch {}

    globalState.__dockRtcClient = null;
    globalState.__dockRtcLocalAudioTrack = null;
    globalState.__dockRtcLocalVideoTrack = null;
    globalState.__dockRtcCameraVideoTrackBackup = null;
  }

  private storeCurrentAgoraSessionGlobally() {
    const globalState = window as any;
    globalState.__dockRtcClient = this.rtc.client;
    globalState.__dockRtcLocalAudioTrack = this.rtc.localAudioTrack;
    globalState.__dockRtcLocalVideoTrack = this.rtc.localVideoTrack;
    globalState.__dockRtcCameraVideoTrackBackup = this.cameraVideoTrackBackup;
  }

  private clearCurrentAgoraSessionGlobally() {
    const globalState = window as any;
    globalState.__dockRtcClient = null;
    globalState.__dockRtcLocalAudioTrack = null;
    globalState.__dockRtcLocalVideoTrack = null;
    globalState.__dockRtcCameraVideoTrackBackup = null;
  }

  constructor(
    private chatservice: ChatService,
    private websocket: WebsocketService,
    private readonly renderer: Renderer2,
    private authService: AuthServiceService,
    private _coreService: CoreService,
    private location: Location,
    private toastr: ToastrService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.dynamicpath = this.authService.getRole();
    this.loginid = localStorage.getItem('userId');

    this.Audiomute();
    this.VideoMute();

    this.websocket.registerUser();
    this.bindCallChatEvents();

    const navState = this.location.getState() as any;
    const fromA = navState?.fromA;

    if (fromA) {
      this.getUserById(fromA);
    } else {
      this.redirectchat();
      return;
    }

    this.isRinging = false;

    this.websocket.onCallAccepted().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (this.loginid == data.callerId && !this.callstarted) {
        if (this.isRinging) {
          this.stopRingtone();
          this.isRinging = false;
          this.callUiState = 'idle';
          this.callstatus = '';
          this.callUser(data.groupId);
        }
      }
    });

    this.websocket.CallCancelled().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (this.loginid == data.loginid) {
        this.isRinging = false;
        this.incomingCall = null;
        this.callUiState = 'idle';
        this.clearActiveCallSession();
        this.redirectchat();
      } else {
        if (!this.callstarted) {
          this.isRinging = false;
          this.incomingCall = null;
          this.callUiState = 'idle';
          this.clearActiveCallSession();
          this.redirectchat();
        }
      }
    });

    this.websocket.userleavecall().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      const eventGroupId = data?.groupId ?? data?.groupid;
      const leftUserId = data?.leaveuserid ?? data?.loginid ?? data?.userId ?? data?.senderID;
      const isOtherParticipant = String(leftUserId ?? '') !== String(this.loginid ?? '');

      if (eventGroupId == this.groupId && isOtherParticipant) {
        const participantName = data?.name || 'Participant';
        const leftUid = String(leftUserId ?? participantName ?? 'unknown');

        const isExplicitHangup =
          data?.explicitLeave === true ||
          data?.isHangup === true ||
          data?.reason === 'hangup' ||
          data?.type === 'hangup';

        const hadPendingRejoin = Boolean(this.remoteRejoinTimers[leftUid]);

        if (!data?.isGroup && !isExplicitHangup) {
          if (!hadPendingRejoin) {
            this.remoteReconnectMessage = participantName + ' disconnected. Trying to reconnect...';
          }
          this.scheduleRemoteRejoin(leftUid);
          return;
        }

        this.toastr.error(participantName + ' left the call');
        if (!data?.isGroup) {
          this.leaveCall();
        }
      }
    });

    this.websocket.onCallRejected().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (this.loginid == data.loginid) {
        this.isRinging = false;
        this.incomingCall = null;
        this.stopRingtone();
        this.clearActiveCallSession();
        this.callUiState = 'rejected';
        this.callstatus = 'Call rejected';
        localStorage.removeItem('uid');
      } else {
        if (!data.groupmember) {
          this.isRinging = false;
          this.incomingCall = null;
          this.stopRingtone();
          this.callUiState = 'rejected';
        }
      }
    });

    this.websocket.ringerstarted().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (data.callerId == this.loginid) {
        this.callstatus = 'Ringing';
        this.callUiState = 'outgoing';
      }
    });

    // Timeout if no response
    setTimeout(() => {
      if (this.isRinging && !this.callstarted) {
        this.isRinging = false;
        this.callUiState = 'missed';
        this.callstatus = 'No answer';
        this.stopRingtone();
        this.clearActiveCallSession();
        localStorage.removeItem('uid');
      }
      if (this.incomingCall && !this.callstarted) {
        this.incomingCall = null;
        this.callUiState = 'idle';
      }
    }, 30000);

    window.addEventListener('resize', this.updateVideoGridLayoutBound);
    document.addEventListener('visibilitychange', this.handleVisibilityChangeBound);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    this.clearAllRemoteRejoinTimers();

    const shouldTeardownSession = this.explicitLeaveRequested || !this.callstarted;
    if (shouldTeardownSession) {
      void this.teardownRtcSession();
    }

    window.removeEventListener('resize', this.updateVideoGridLayoutBound);
    document.removeEventListener('visibilitychange', this.handleVisibilityChangeBound);
    this.stopVisibilityHeartbeat();

    this.exitPictureInPicture();

    this.stopRingtone();
    this.stopCallTimer();
  }

  private persistActiveCallSession(fromA: any) {
    const activeCallSession = {
      actualgroupmemberid: fromA?.actualgroupmemberid || this.activegroupuserids || [],
      groupid: fromA?.groupid || this.groupId,
      group: fromA?.group || this.isGroup,
      type: 'callby',
      title: fromA?.title || this.recievetitle?.name || 'Call',
      image: fromA?.image || this.recievetitle?.image || '',
      audio: fromA?.audio ?? this.audio,
      callerId: fromA?.callerId || this.callerID || '',
      isScreenSharing: fromA?.isScreenSharing ?? this.isScreenSharing,
      rejoin: true,
      startedAt: Date.now()
    };

    localStorage.setItem('activeCallSession', JSON.stringify(activeCallSession));
  }

  private patchActiveCallSession(partial: any) {
    const raw = localStorage.getItem('activeCallSession');
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      localStorage.setItem('activeCallSession', JSON.stringify({ ...parsed, ...partial }));
    } catch {}
  }

  private clearActiveCallSession() {
    localStorage.removeItem('activeCallSession');
  }

  private scheduleRemoteRejoin(uid: string) {
    if (this.isGroup || !this.callstarted || this.explicitLeaveRequested) {
      this.clearRemoteRejoin(uid);
      return;
    }

    // If a timer already exists, keep the existing deadline to avoid perpetual resets from duplicate events
    if (this.remoteRejoinTimers[uid]) {
      this.remoteReconnecting = true;
      if (!this.remoteReconnectMessage) {
        this.remoteReconnectMessage = 'Connection lost. Trying to reconnect...';
      }
      return;
    }

    this.remoteReconnecting = true;
    if (!this.remoteReconnectMessage) {
      this.remoteReconnectMessage = 'Connection lost. Trying to reconnect...';
    }

    this.remoteRejoinTimers[uid] = setTimeout(() => {
      delete this.remoteRejoinTimers[uid];
      if (Object.keys(this.remoteRejoinTimers).length === 0) {
        this.remoteReconnecting = false;
        this.remoteReconnectMessage = '';
      }

      if (!this.callstarted || this.explicitLeaveRequested) {
        return;
      }

      this.toastr.error('Connection lost. Ending call.');
      this.leaveCall();
    }, this.remoteRejoinGraceMs);
  }

  private clearRemoteRejoin(uid: string) {
    if (this.remoteRejoinTimers[uid]) {
      clearTimeout(this.remoteRejoinTimers[uid]);
      delete this.remoteRejoinTimers[uid];
    }

    if (Object.keys(this.remoteRejoinTimers).length === 0) {
      this.remoteReconnecting = false;
      this.remoteReconnectMessage = '';
    }
  }

  private clearAllRemoteRejoinTimers() {
    Object.keys(this.remoteRejoinTimers).forEach((timerUid) => this.clearRemoteRejoin(timerUid));
  }

  private bindCallChatEvents() {
    if (this.isCallChatListenerBound) {
      return;
    }

    this.isCallChatListenerBound = true;
    this.websocket.newMessage().pipe(takeUntil(this.destroy$)).subscribe((payload: any) => {
      const eventGroupId = payload?.groupId;
      if (!this.groupId || String(eventGroupId ?? '') !== String(this.groupId ?? '')) {
        return;
      }

      const content = (payload?.message || '').toString().trim();
      const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
      if (!content && attachments.length === 0) {
        return;
      }

      const resolvedMessage = content || 'Attachment shared';
      const messageId = String(payload?.messageId || `${payload?.senderID || 'unknown'}-${payload?.timestamp || Date.now()}`);

      if (this.callChatMessages.some((item) => item.messageId === messageId)) {
        return;
      }

      this.callChatMessages.push({
        messageId,
        senderID: String(payload?.senderID || ''),
        senderName: payload?.senderDetails?.fullName || payload?.group_name || 'Participant',
        message: resolvedMessage,
        timestamp: Number(payload?.timestamp || Date.now()),
        attachments
      });

      this.scrollCallChatToBottom();
    });
  }

  private loadRecentCallChatMessages() {
    if (!this.groupId) {
      return;
    }

    this.websocket.getmessage(this.groupId, 1, 25).pipe(takeUntil(this.destroy$)).subscribe((history: any) => {
      const messages = this.extractCallChatHistory(history);
      this.callChatMessages = messages;
      this.scrollCallChatToBottom();
    });
  }

  private extractCallChatHistory(history: any): CallChatMessage[] {
    const source =
      Array.isArray(history)
        ? history
        : Array.isArray(history?.messages)
          ? history.messages
          : Array.isArray(history?.data)
            ? history.data
            : [];

    return source
      .map((item: any) => {
        const content = (item?.message || '').toString().trim();
        const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
        if (!content && attachments.length === 0) {
          return null;
        }

        return {
          messageId: String(item?.messageId || `${item?.senderID || 'unknown'}-${item?.timestamp || Date.now()}`),
          senderID: String(item?.senderID || ''),
          senderName: item?.senderDetails?.fullName || item?.group_name || 'Participant',
          message: content || 'Attachment shared',
          timestamp: Number(item?.timestamp || Date.now()),
          attachments
        } as CallChatMessage;
      })
      .filter((item: CallChatMessage | null): item is CallChatMessage => !!item)
      .sort((a: CallChatMessage, b: CallChatMessage) => a.timestamp - b.timestamp);
  }

  async sendCallChatMessage() {
    const content = this.callChatText.trim();
    const hasFiles = this.callChatSelectedFiles.length > 0;

    if ((!content && !hasFiles) || !this.groupId || this.isSendingCallChat) {
      return;
    }

    const timestamp = Date.now();
    const messageId = String(Math.floor(Math.random() * 10000) + timestamp);
    const senderName = this.loginuserresponse?.fullName || 'You';
    let uploadedAttachments: any[] = [];

    this.isSendingCallChat = true;

    if (hasFiles) {
      try {
        const files = this.callChatSelectedFiles.map((item) => item.file);
        const imageUrls = await this._coreService.uploadImages(files);
        uploadedAttachments = imageUrls.map((url: string, index: number) => ({
          name: this.callChatSelectedFiles[index]?.name || `attachment-${index + 1}`,
          type: this.callChatSelectedFiles[index]?.type || 'application/octet-stream',
          data: url
        }));
      } catch {
        this.isSendingCallChat = false;
        this.toastr.error('Failed to upload attachment');
        return;
      }
    }

    this.callChatMessages.push({
      messageId,
      senderID: String(this.loginid || ''),
      senderName,
      message: content || 'Attachment shared',
      timestamp,
      attachments: uploadedAttachments
    });

    this.websocket.sendMessage(content, this.groupId, timestamp, uploadedAttachments, false, messageId);

    this.callChatText = '';
    this.callChatSelectedFiles = [];
    this.isSendingCallChat = false;
    this.scrollCallChatToBottom();
  }

  isOwnCallChatMessage(message: CallChatMessage): boolean {
    return String(message?.senderID || '') === String(this.loginid || '');
  }

  onCallChatEnter(event: Event) {
    event.preventDefault();
    this.sendCallChatMessage();
  }

  toggleCallChatPanel() {
    this.isCallChatOpen = !this.isCallChatOpen;
  }

  onCallChatFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || !files.length) {
      return;
    }

    const mapped = Array.from(files).map((file: File) => ({
      file,
      name: file.name,
      type: file.type
    }));

    this.callChatSelectedFiles = [...this.callChatSelectedFiles, ...mapped];
    input.value = '';
  }

  removeCallChatFile(index: number) {
    this.callChatSelectedFiles.splice(index, 1);
    this.callChatSelectedFiles = [...this.callChatSelectedFiles];
  }

  callChatCanSend(): boolean {
    return !!this.callChatText.trim() || this.callChatSelectedFiles.length > 0;
  }

  private scrollCallChatToBottom() {
    setTimeout(() => {
      const chatEl = this.callChatScrollRef?.nativeElement;
      if (!chatEl) {
        return;
      }

      chatEl.scrollTop = chatEl.scrollHeight;
    }, 0);
  }

  @HostListener('window:beforeunload')
  handleBeforeUnload() {
    if (!this.explicitLeaveRequested && this.callstarted) {
      try {
        this.websocket.leaveCallOnWindowExit(
          this.groupId,
          this.loginid,
          this.loginuserresponse?.fullName,
          this.callerID,
          this.isGroup,
          this.audio
        );
      } catch {}
    }
  }

  redirectchat() {
    void this.teardownRtcSession();

    this.hasRejoinParticipantSynced = false;
    this.lastParticipantInfoKey = '';
    this.clearActiveCallSession();
    this.callUiState = 'idle';

    localStorage.removeItem('uid');
    const path = `/${this.dynamicpath}/chats`;
    this.router.navigateByUrl(path);
  }

  stopRingtone() {
    const ringtone = this.ringtoneRef?.nativeElement;
    if (ringtone) {
      ringtone.pause();
      ringtone.currentTime = 0;
    }
  }

  acceptCall() {
    this.websocket.acceptCall(this.incomingCall.callerId, this.groupId, this.loginid, this.audio);
    this.incomingCall = null;
    this.isRinging = false;
    this.callUiState = 'idle';
    this.callstatus = '';
    this.stopRingtone();
    this.startCall(this.groupId, this.loginuserresponse);
  }

  async rejectCall() {
    this.explicitLeaveRequested = true;
    this.clearActiveCallSession();
    this.websocket.rejectCall(this.incomingCall.callerId, this.groupId, this.loginid);
    this.incomingCall = null;
    this.callUiState = 'idle';
    this.stopRingtone();
    setTimeout(() => this.redirectchat(), 1000);
  }

  async cancelCall() {
    this.explicitLeaveRequested = true;
    this.clearActiveCallSession();
    const callerId = this.currentCallContext?.callerId || this.loginid;
    this.websocket.cancelcall(callerId, this.groupId, this.loginid);
    this.isRinging = false;
    this.callUiState = 'idle';
    this.incomingCall = null;
    this.stopRingtone();
    this.redirectchat();
  }

  retryCall() {
    if (!this.currentCallContext) {
      this.redirectchat();
      return;
    }

    this.isReject = false;
    this.isRinging = false;
    this.incomingCall = null;
    this.callstarted = false;
    this.isStartingCall = false;
    this.callstatus = 'Calling';
    this.callUiState = 'outgoing';
    this.explicitLeaveRequested = false;

    this.stopRingtone();
    this.clearActiveCallSession();
    localStorage.removeItem('uid');

    this.startRing({ ...this.currentCallContext, rejoin: false });
  }

  mutesvideo() {
    if (!this.rtc.localVideoTrack) return;

    this.isVideoMuted = !this.isVideoMuted;
    this.rtc.localVideoTrack.setMuted(this.isVideoMuted);

    const uid = localStorage.getItem('uid');
    this.websocket.muteVideo(this.groupId, this.loginid, this.isVideoMuted, uid, this.loginuserresponse.fullName);
  }

  async toggleScreenShare() {
    if (this.audio) return;

    if (this.isScreenSharing) {
      await this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  private async startScreenShare() {
    if (!this.rtc.client || !this.rtc.localVideoTrack || this.isScreenSharing) {
      return;
    }

    try {
      const createdTrack: any = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1' },
        'auto'
      );

      const screenVideoTrack: any = Array.isArray(createdTrack) ? createdTrack[0] : createdTrack;
      if (!screenVideoTrack) {
        return;
      }

      this.cameraVideoTrackBackup = this.rtc.localVideoTrack;

      await this.rtc.client.unpublish(this.rtc.localVideoTrack);
      await this.rtc.client.publish(screenVideoTrack);

      this.rtc.localVideoTrack = screenVideoTrack;
      this.storeCurrentAgoraSessionGlobally();
      this.patchActiveCallSession({ isScreenSharing: true });

      screenVideoTrack.play(this.localVideoRef.nativeElement, { fit: 'cover' });
      this.isScreenSharing = true;
      this.isVideoMuted = false;

      screenVideoTrack.on('track-ended', async () => {
        await this.stopScreenShare();
      });
    } catch (error) {
      console.error('Failed to start screen share:', error);
      this.toastr.error('Unable to start screen sharing');
    }
  }

  private async stopScreenShare() {
    if (!this.rtc.client || !this.isScreenSharing) {
      return;
    }

    try {
      const currentScreenTrack: any = this.rtc.localVideoTrack;
      if (currentScreenTrack) {
        await this.rtc.client.unpublish(currentScreenTrack);
        currentScreenTrack.stop?.();
        currentScreenTrack.close?.();
      }

      let restoredCameraTrack = this.cameraVideoTrackBackup;
      if (!restoredCameraTrack) {
        restoredCameraTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p' });
      }

      await this.rtc.client.publish(restoredCameraTrack);
      this.rtc.localVideoTrack = restoredCameraTrack;
      this.cameraVideoTrackBackup = null;
      this.storeCurrentAgoraSessionGlobally();
      this.patchActiveCallSession({ isScreenSharing: false });

      restoredCameraTrack.play(this.localVideoRef.nativeElement, { fit: 'cover' });
    } catch (error) {
      console.error('Failed to stop screen share:', error);
    } finally {
      this.isScreenSharing = false;
    }
  }

  mutesAudio() {
    if (!this.rtc.localAudioTrack) return;

    this.isAudioMuted = !this.isAudioMuted;
    this.rtc.localAudioTrack.setMuted(this.isAudioMuted);

    const uid = localStorage.getItem('uid');
    this.websocket.muteAudio(this.groupId, this.loginid, this.isAudioMuted, uid);
  }

  Audiomute() {
    this.websocket.Audiomute().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (data.groupId !== this.groupId) return;
      if (!data.uid) return;

      this.remoteMuteState[data.uid] = !!data.isAudioMuted;
      this.applyMicState(String(data.uid), !!data.isAudioMuted);
    });
  }

  VideoMute() {
    // Keep pill; you can extend to show initials if video muted
    this.websocket.Videomute().pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      if (data.groupId !== this.groupId) return;
      if (!data.uid) return;

      const element = document.getElementsByClassName('remote-video-cam' + data.uid)[0];
      if (!element) return;

      element.classList.add('username');
    });
  }

  getUserById(fromA: any) {
    this.authService.getUserById('', true).subscribe((res: any) => {
      this.loginuserresponse = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });

      this.currentCallContext = fromA;

      this.activegroupuserids = fromA.actualgroupmemberid;
      this.audio = fromA.audio;
      this.groupId = fromA?.groupid;
      this.rejoin = fromA?.rejoin;
      this.isGroup = fromA?.group;

      this.persistActiveCallSession(fromA);

      this.callerID = fromA.callerId !== undefined ? fromA.callerId : this.loginid;

      if (!fromA?.rejoin && localStorage.getItem('uid')) {
        this.redirectchat();
      }

      if (fromA?.rejoin) {
        this.startCall(this.groupId, this.loginuserresponse);
      }

      this.websocket.joinGroup({
        groupId: this.groupId,
        userId: this.activegroupuserids
      });

      this.loadRecentCallChatMessages();

      const resolvedName =
        fromA.title ||
        fromA.callerName ||
        fromA.receiverName ||
        fromA.name ||
        '';
      const resolvedImage = fromA.image || fromA.callerImage || fromA.receiverImage || '';

      this.recievetitle = { name: resolvedName, image: resolvedImage };

      if (fromA.type === 'callby' && !fromA?.rejoin) {
        this.callUiState = 'outgoing';
        this.startRing(fromA);
      }

      if (fromA.callerId !== undefined && !fromA?.rejoin) {
        this.ringtoneRef?.nativeElement.play().catch(() => {});
        if (this.loginid !== fromA.callerId) {
          this.callUiState = 'incoming';
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
    if (this.callstarted) return;

    this.isRinging = true;
    this.callstatus = 'Calling';
    this.callUiState = 'outgoing';
    this.ringtoneRef?.nativeElement.play().catch(() => {});

    this.websocket.ringstart(
      fromA.groupid,
      this.loginid,
      this.loginuserresponse?.fullName,
      this.loginuserresponse?.profilePicture?.savedName,
      this.activegroupuserids,
      this.audio,
      this.isGroup
    );
  }

  async callUser(groupId: any) {
    this.startCall(groupId, this.loginuserresponse);
  }

  async startCall(groupId: any, loginuserresponse: any) {
    if (this.callstarted || this.isStartingCall) return;
    this.isStartingCall = true;

    const globalState = window as any;
    const existingClient = globalState.__dockRtcClient as IAgoraRTCClient | null;
    const existingAudioTrack = globalState.__dockRtcLocalAudioTrack as IMicrophoneAudioTrack | null;
    const existingVideoTrack = globalState.__dockRtcLocalVideoTrack as ICameraVideoTrack | null;
    const connectionState = (existingClient as any)?.connectionState;

    if (this.rejoin && existingClient && connectionState === 'CONNECTED') {
      this.rtc.client = existingClient;
      this.rtc.localAudioTrack = existingAudioTrack;
      this.rtc.localVideoTrack = existingVideoTrack;
      this.callstarted = true;

      const activeCallSessionRaw = localStorage.getItem('activeCallSession');
      if (activeCallSessionRaw) {
        try {
          const activeCallSession = JSON.parse(activeCallSessionRaw);
          this.isScreenSharing = !!activeCallSession?.isScreenSharing;
        } catch {
          this.isScreenSharing = false;
        }
      }

      if (!this.audio && this.rtc.localVideoTrack) {
        this.rtc.localVideoTrack.play(this.localVideoRef.nativeElement, { fit: 'cover' });
      }

      (this.rtc.client as any)?.removeAllListeners?.();
      this.remoteEventsBound = false;
      this.publishedRemoteTracks();
      await this.syncExistingPublishedUsers();
      this.startCallTimer();
      this.storeCurrentAgoraSessionGlobally();
      this.callUiState = 'idle';
      this.callstatus = '';
      this.isRinging = false;
      this.isStartingCall = false;
      return;
    }

    await this.cleanupOrphanAgoraSession();

    const channelName = groupId;

    if (this.rejoin && !this.hasRejoinParticipantSynced) {
      this.websocket.joinparticipant(this.groupId, this.loginid, this.audio);
      this.hasRejoinParticipantSynced = true;
    }

    const uid = '';
    await this.chatservice.getAgoraToken(channelName, uid).subscribe(async (data: any) => {
      if (!data?.token) return;

      localStorage.setItem('uid', data.uid);
      const participantInfoKey = `${this.groupId}_${data.uid}`;
      if (this.lastParticipantInfoKey !== participantInfoKey) {
        this.websocket.participantinfo(this.loginuserresponse, data.uid, this.groupId);
        this.lastParticipantInfoKey = participantInfoKey;
      }

      const option = {
        APP_ID: this.APP_ID,
        groupId: this.groupId,
        token: data.token,
        uid: data.uid,
        name: loginuserresponse.fullName
      };

      this.connect(option);
    }, () => {
      this.isStartingCall = false;
    });
  }

  connect(data: any) {
    AgoraRTC.getDevices()
      .then(async (devices) => {
        // Always audio
        this.rtc.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();

        // Video only if not audio-only
        if (!this.audio) {
          const videoDevices = devices.filter((d) => d.kind === 'videoinput');
          const selectedCameraId = videoDevices?.[0]?.deviceId;
          this.rtc.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
            cameraId: selectedCameraId,
            encoderConfig: '720p'
          });
        }

        this.startBasicCall(data);
      })
      .catch((e) => console.error('Error while connecting:', e));
  }

  async startBasicCall(data: any) {
    this.rtc.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.publishedRemoteTracks();

    await this.rtc.client
      .join(data.APP_ID, data.groupId, data.token, data.uid)
      .then(async () => {
        if (!this.callstarted) {
          this.callstarted = true;
          this.storeCurrentAgoraSessionGlobally();
          this.startCallTimer();
          await this.publishLocalTrack();
        }
        this.callUiState = 'idle';
        this.callstatus = '';
        this.isRinging = false;
        await this.syncExistingPublishedUsers();
        this.isStartingCall = false;
      })
      .catch((e) => {
        this.isStartingCall = false;
        console.error('Error while joining channel:', e);
      });
  }

  publishedRemoteTracks() {
    if (!this.rtc.client || this.remoteEventsBound) return;
    this.remoteEventsBound = true;

    this.rtc.client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      try {
        this.clearRemoteRejoin(String(user.uid));
        await this.rtc.client!.subscribe(user, mediaType);
        this.attachRemoteTrack(mediaType, user);

        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      } catch (error) {
        console.error('Failed to subscribe remote user:', error);
      }
    });

    this.rtc.client.on('user-joined', (user: IAgoraRTCRemoteUser) => {
      this.clearRemoteRejoin(String(user.uid));
    });

    this.rtc.client.on('user-left', (user: IAgoraRTCRemoteUser) => {
      this.scheduleRemoteRejoin(String(user.uid));
      this.removeRemoteUser(user.uid);
    });
  }

  private async syncExistingPublishedUsers() {
    if (!this.rtc.client) return;

    for (const user of this.rtc.client.remoteUsers) {
      if (user.hasVideo) {
        await this.rtc.client.subscribe(user, 'video');
        this.attachRemoteTrack('video', user);
      }

      if (user.hasAudio) {
        await this.rtc.client.subscribe(user, 'audio');
        this.attachRemoteTrack('audio', user);
        user.audioTrack?.play();
      }
    }
  }

  private attachRemoteTrack(track: 'audio' | 'video', user: IAgoraRTCRemoteUser) {
    const uid = String(user.uid);
    const fallbackName = !this.isGroup && this.recievetitle?.name ? this.recievetitle.name : 'Participant';

    this.ensureRemoteTile(uid, fallbackName, this.remoteMuteState[uid] ?? false);

    if (track === 'video' && !this.audio && user.videoTrack) {
      setTimeout(() => {
        user.videoTrack?.play('remote-video-' + uid, { fit: 'contain' });
        const remoteContainer = document.getElementById('remote-video-' + uid);
        const agoraPlayer = remoteContainer?.querySelector('.agora_video_player') as HTMLElement | null;
        if (agoraPlayer) {
          agoraPlayer.style.objectFit = 'contain';
          agoraPlayer.style.width = '100%';
          agoraPlayer.style.height = '100%';
        }
      }, 0);
    }

    this.populateRemoteTileMetadata(uid);
  }

  private ensureRemoteTile(uid: string, participantName: string, isAudioMuted: boolean) {
    if (document.getElementsByClassName('sid-' + uid).length !== 0) return;

    const safeName = participantName || (!this.isGroup && this.recievetitle?.name) || 'Participant';
    const initials = this.getInitialsForName(safeName);

    const userTile = this.renderer.createElement('div');
    const videoBox = this.renderer.createElement('div');
    const micIcon = this.renderer.createElement('i');
    const micWrap = this.renderer.createElement('div');
    const nameDiv = this.renderer.createElement('div');

    this.renderer.addClass(videoBox, 'video_box');
    this.renderer.addClass(userTile, 'user');
    this.renderer.addClass(userTile, 'sid-' + uid);
    this.renderer.setProperty(userTile, 'id', 'remote-video-div-' + uid);
    this.renderer.setAttribute(userTile, 'data-uid', uid);
    this.renderer.setProperty(videoBox, 'id', 'remote-video-' + uid);

    const initialMuted = this.remoteMuteState[uid] ?? isAudioMuted;

    this.renderer.addClass(micWrap, 'mic-indicator');
    this.renderer.addClass(micWrap, 'remote-video-mic' + uid);
    this.renderer.addClass(micIcon, 'bx');
    this.renderer.addClass(micIcon, initialMuted ? 'bx-microphone-off' : 'bx-microphone');
    if (initialMuted) {
      this.renderer.addClass(micWrap, 'muted');
    }
    this.renderer.appendChild(micWrap, micIcon);

    this.renderer.addClass(nameDiv, 'username');
    this.renderer.addClass(nameDiv, 'remote-video-cam' + uid);
    this.renderer.appendChild(nameDiv, this.renderer.createText(safeName));
    this.renderer.appendChild(nameDiv, micWrap);

    this.renderer.appendChild(userTile, videoBox);

    if (this.audio) {
      const placeholder = this.renderer.createElement('div');
      const avatar = this.renderer.createElement('div');
      const nameLabel = this.renderer.createElement('div');

      this.renderer.addClass(placeholder, 'audio-placeholder');
      this.renderer.addClass(avatar, 'audio-avatar');
      this.renderer.addClass(nameLabel, 'audio-name');

      this.renderer.appendChild(avatar, this.renderer.createText(initials || safeName));
      this.renderer.appendChild(nameLabel, this.renderer.createText(safeName));
      this.renderer.appendChild(placeholder, avatar);
      this.renderer.appendChild(placeholder, nameLabel);
      this.renderer.appendChild(placeholder, micWrap);
      this.renderer.appendChild(videoBox, placeholder);

      this.renderer.addClass(userTile, 'audio-only');
    } else {
      this.renderer.appendChild(videoBox, nameDiv);
    }

    this.renderer.appendChild(this.remoteVideoRef.nativeElement, userTile);
    this.updateVideoGridLayout();
  }

  private dedupeRemoteTileByParticipant(currentUid: string, participantId: string) {
    if (!participantId) {
      return;
    }

    const duplicates = Array.from(
      this.remoteVideoRef.nativeElement.querySelectorAll(`.user[data-participant-id="${participantId}"]`)
    ) as HTMLElement[];

    duplicates.forEach((tile) => {
      if (tile.getAttribute('data-uid') !== currentUid) {
        tile.remove();
      }
    });

    this.updateVideoGridLayout();
  }

  private populateRemoteTileMetadata(uid: string) {
    this.websocket.getparticipantinfo(this.groupId).subscribe((pi: any) => {
      let participants: any[] = [];

      try {
        const parsed = pi ? JSON.parse(pi) : null;
        participants = parsed?.participant || [];
      } catch {
        participants = [];
      }

      const userInfo = participants.find((user: any) => String(user.uid) === uid);

      const fallbackName = !this.isGroup && this.recievetitle?.name ? this.recievetitle.name : 'Participant';
      const participantName = userInfo?.loginuserdetails?.fullName || fallbackName;

      const participantIdentity =
        userInfo?.loginuserdetails?._id ||
        userInfo?.loginuserdetails?.userId ||
        userInfo?.loginuserdetails?.id ||
        '';

      const nameNode = document.querySelector('.remote-video-cam' + uid);
      if (nameNode && nameNode.firstChild) {
        nameNode.firstChild.textContent = participantName;
      }

      const userTile = document.getElementById('remote-video-div-' + uid);
      if (userTile && participantIdentity) {
        userTile.setAttribute('data-participant-id', String(participantIdentity));
        this.dedupeRemoteTileByParticipant(uid, String(participantIdentity));
      }

      this.websocket.getaudiomuteinfo(this.groupId).subscribe((mi: any) => {
        let mutedInfo: any;

        try {
          const parsedMuted = mi ? JSON.parse(mi) : null;
          mutedInfo = (parsedMuted?.audio || []).find((item: any) => String(item.uid) === uid);
        } catch {
          mutedInfo = null;
        }

        const resolvedMuted = this.remoteMuteState[uid] ?? mutedInfo?.audiomute ?? false;
        this.remoteMuteState[uid] = resolvedMuted;
        this.applyMicState(uid, resolvedMuted);
      });
    });
  }

  private applyMicState(uid: string, isMuted: boolean) {
    const micNode = document.querySelector('.remote-video-mic' + uid) as HTMLElement | null;
    const iconNode = micNode?.querySelector('i');
    if (!micNode || !iconNode) return;

    micNode.classList.remove('muted');
    iconNode.classList.remove('bx-microphone', 'bx-microphone-off');

    if (isMuted) {
      micNode.classList.add('muted');
      iconNode.classList.add('bx-microphone-off');
    } else {
      iconNode.classList.add('bx-microphone');
    }
  }

  get callStateTitle(): string {
    switch (this.callUiState) {
      case 'incoming':
        return 'Incoming call';
      case 'outgoing':
        return `Calling ${this.callPartnerName}`;
      case 'missed':
        return 'No answer';
      case 'rejected':
        return 'Call rejected';
      default:
        return '';
    }
  }

  get callStateSubtitle(): string {
    switch (this.callUiState) {
      case 'incoming':
        return `Incoming ${this.audio ? 'audio' : 'video'} call`;
      case 'outgoing':
        return 'Waiting for answer...';
      case 'missed':
        return 'Didn\'t connect. You can try again.';
      case 'rejected':
        return 'The user declined your call.';
      default:
        return '';
    }
  }

  get callPartnerName(): string {
    if (this.callUiState === 'incoming') {
      return this.incomingCall?.callerName || this.recievetitle?.name || 'Caller';
    }
    return this.recievetitle?.name || this.incomingCall?.callerName || 'User';
  }

  get callPartnerImage(): string {
    if (this.callUiState === 'incoming') {
      return this.incomingCall?.callerImage || this.recievetitle?.image || '';
    }
    return this.recievetitle?.image || this.incomingCall?.callerImage || '';
  }

  getInitialsForName(name: string): string {
    if (!name) return '';
    return name
      .split(' ')
      .filter((p) => !!p)
      .map((p) => p[0]?.toUpperCase?.() || '')
      .join('')
      .slice(0, 3);
  }

  removeRemoteUser(uid: any) {
    const remoteVideo = document.getElementById(`remote-video-div-${uid}`);
    if (remoteVideo) {
      remoteVideo.remove();
      this.updateVideoGridLayout();
    }
  }

  async publishLocalTrack() {
    try {
      if (!this.rtc.client) return;

      if (!this.rtc.localVideoTrack && !this.audio) {
        this.rtc.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      }
      if (!this.rtc.localAudioTrack) {
        this.rtc.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }

      if (!this.audio) {
        this.rtc.localVideoTrack?.play(this.localVideoRef.nativeElement, { fit: 'cover' });
      }

      const tracks: any[] = [];
      if (this.rtc.localAudioTrack) tracks.push(this.rtc.localAudioTrack);
      if (!this.audio && this.rtc.localVideoTrack) tracks.push(this.rtc.localVideoTrack);

      await this.rtc.client.publish(tracks);
    } catch (error) {
      console.error('Error publishing local tracks:', error);
    }
  }

  startCallTimer() {
    this.websocket.getcallstarttime(this.groupId).subscribe((callstart: any) => {
      this.callstarttime = JSON.parse(callstart).time;

      const now = Math.floor(Date.now() / 1000);
      const diffInSeconds = now - this.callstarttime;

      this.totalSeconds = diffInSeconds > 0 ? diffInSeconds : 0;

      this.timerInterval = setInterval(() => {
        this.totalSeconds++;
        this.callDuration = this.formatTime(this.totalSeconds);
      }, 1000);
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
    return [hours, minutes, seconds].map((v) => v.toString().padStart(2, '0')).join(':');
  }

  formatCallChatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  leaveCall() {
    this.clearAllRemoteRejoinTimers();

    setTimeout(async () => {
      if (this.isScreenSharing) {
        await this.stopScreenShare();
      }

      this.explicitLeaveRequested = true;
      this.isStartingCall = false;
      this.hasRejoinParticipantSynced = false;
      this.lastParticipantInfoKey = '';
      this.clearActiveCallSession();
      this.exitPictureInPicture();
      this.websocket.leavecall(
        this.groupId,
        this.loginid,
        this.loginuserresponse.fullName,
        this.callerID,
        this.isGroup,
        this.audio
      );
      this.redirectchat();
    }, 500);
  }

  private updateVideoGridLayoutBound = () => this.updateVideoGridLayout();

  private handleVisibilityChangeBound = () => this.handleVisibilityChange();

  private async handleVisibilityChange() {
    if (!this.callstarted || this.audio) {
      return;
    }

    if (document.hidden) {
      this.startVisibilityHeartbeat();
      await this.enterPictureInPicture();
    } else {
      this.stopVisibilityHeartbeat();
      await this.exitPictureInPicture();
    }
  }

  private startVisibilityHeartbeat() {
    this.stopVisibilityHeartbeat();

    this.visibilityHeartbeatInterval = setInterval(() => {
      if (!this.callstarted || !this.groupId || !this.loginid) {
        return;
      }

      this.websocket.registerUser();
    }, 12000);
  }

  private stopVisibilityHeartbeat() {
    if (this.visibilityHeartbeatInterval) {
      clearInterval(this.visibilityHeartbeatInterval);
      this.visibilityHeartbeatInterval = null;
    }
  }

  private getPiPVideoElement(): HTMLVideoElement | null {
    const localVideo = this.localVideoRef?.nativeElement;
    if (localVideo && localVideo.srcObject) {
      return localVideo;
    }

    const remoteVideo = this.remoteVideoRef?.nativeElement?.querySelector('video') as HTMLVideoElement | null;
    if (remoteVideo) {
      return remoteVideo;
    }

    return localVideo || null;
  }

  private async enterPictureInPicture() {
    try {
      const anyDocument = document as any;
      const pipEnabled = anyDocument.pictureInPictureEnabled;
      if (!pipEnabled || anyDocument.pictureInPictureElement) {
        return;
      }

      const pipVideo = this.getPiPVideoElement();
      if (!pipVideo) {
        return;
      }

      await (pipVideo as any).requestPictureInPicture();
      this.isPiPActive = true;
    } catch {
      this.isPiPActive = false;
    }
  }

  private async exitPictureInPicture() {
    try {
      const anyDocument = document as any;
      if (anyDocument.pictureInPictureElement) {
        await anyDocument.exitPictureInPicture();
      }
      this.isPiPActive = false;
    } catch {
      this.isPiPActive = false;
    }
  }

  // private updateVideoGridLayout() {
  //   const container = this.remoteVideoRef.nativeElement as HTMLElement;
  //   const users = container.querySelectorAll('.user');
  //   const total = users.length;

  //   if (!total) return;

  //   // 1-to-1 => stage
  //   if (total === 1) {
  //     container.style.gridTemplateColumns = '1fr';
  //     container.style.gridAutoRows = '1fr';
  //     container.style.alignContent = 'stretch';

  //     users.forEach((el: any) => {
  //       el.style.height = '100%';
  //       el.style.maxHeight = 'none';
  //       el.style.minHeight = '0';
  //     });
  //     return;
  //   }

  //   // group
  //   let cols = 2;
  //   if (total === 2) cols = 2;
  //   else if (total <= 4) cols = 2;
  //   else if (total <= 9) cols = 3;
  //   else cols = 4;

  //   container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  //   container.style.alignContent = 'center';

  //   users.forEach((el: any) => {
  //     el.style.height = 'auto';
  //     el.style.maxHeight = 'none';
  //   });
  // }

  private updateVideoGridLayout() {
  const container = this.remoteVideoRef.nativeElement;
  const users = container.querySelectorAll('.user');

  container.classList.remove('single-user');

  if (users.length === 1) {
    container.classList.add('single-user');
  }
}
}