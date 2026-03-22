import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-family-video',
  templateUrl: './family-video.component.html',
  styleUrls: ['./family-video.component.scss'],
})
export class FamilyVideoComponent implements OnInit, OnDestroy {
  @Input() conversationId: string = '';
  @ViewChild('localVideo') localVideoRef!: ElementRef;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef;

  // View state: 'landing' | 'calling' | 'request' | 'success'
  viewState: 'landing' | 'calling' | 'request' | 'success' = 'landing';

  // Request form
  preferredTime: string = '';
  notes: string = '';
  sending: boolean = false;
  error: string = '';

  // Agora state
  private agoraClient: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private localVideoTrack: ICameraVideoTrack | null = null;
  isMuted: boolean = false;
  isVideoOff: boolean = false;
  isJoining: boolean = false;
  callDuration: string = '00:00';
  hasRemoteUser: boolean = false;
  private callTimer: any = null;
  private callStartTime: number = 0;

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.endCall();
  }

  // ─── Landing Actions ──────────────────────────────────────────────────────
  openRequestForm() {
    this.viewState = 'request';
    this.error = '';
    this.preferredTime = '';
    this.notes = '';
  }

  cancelRequest() {
    this.viewState = 'landing';
  }

  submitRequest() {
    if (this.sending) return;
    this.sending = true;
    this.error = '';

    this.authService.requestFamilyVideoVisit({
      preferredTime: this.preferredTime,
      notes: this.notes,
    }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.viewState = 'success';
        } else {
          this.error = res.message || 'Failed to send request';
        }
        this.sending = false;
      },
      error: () => {
        this.error = 'Unable to send video visit request. Please try again.';
        this.sending = false;
      },
    });
  }

  requestAnother() {
    this.viewState = 'landing';
  }

  // ─── Video Call (Agora) ───────────────────────────────────────────────────
  async startCall() {
    this.isJoining = true;
    this.error = '';

    this.authService.getFamilyVideoToken().subscribe({
      next: async (res: any) => {
        if (res.success) {
          try {
            const { token, uid, channelName } = res.data;
            await this.joinChannel(channelName || this.conversationId, token, uid);
            this.viewState = 'calling';
            this.startCallTimer();
          } catch (err: any) {
            console.error('Agora join error:', err);
            this.error = 'Failed to start video call. Please check your camera and microphone permissions.';
          }
        } else {
          this.error = res.message || 'Failed to get video token';
        }
        this.isJoining = false;
      },
      error: () => {
        this.error = 'Unable to connect to video service. Please try again.';
        this.isJoining = false;
      },
    });
  }

  private async joinChannel(channelName: string, token: string, uid: number) {
    // Create client
    this.agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    // Listen for remote users
    this.agoraClient.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      if (!this.agoraClient) return;
      await this.agoraClient.subscribe(user, mediaType);
      if (mediaType === 'video') {
        this.hasRemoteUser = true;
        // Small delay to let Angular render the remote video container
        setTimeout(() => {
          if (this.remoteVideoRef?.nativeElement) {
            user.videoTrack?.play(this.remoteVideoRef.nativeElement);
          }
        }, 100);
      }
      if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    });

    this.agoraClient.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      if (mediaType === 'video') {
        this.hasRemoteUser = false;
      }
    });

    this.agoraClient.on('user-left', () => {
      this.hasRemoteUser = false;
    });

    // Join channel
    await this.agoraClient.join(environment.APP_ID, channelName, token, uid);

    // Create and publish local tracks
    this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();

    // Play local video
    setTimeout(() => {
      if (this.localVideoRef?.nativeElement && this.localVideoTrack) {
        this.localVideoTrack.play(this.localVideoRef.nativeElement);
      }
    }, 100);

    // Publish
    const tracks: any[] = [];
    if (this.localAudioTrack) tracks.push(this.localAudioTrack);
    if (this.localVideoTrack) tracks.push(this.localVideoTrack);
    await this.agoraClient.publish(tracks);
  }

  toggleMute() {
    if (this.localAudioTrack) {
      this.isMuted = !this.isMuted;
      this.localAudioTrack.setEnabled(!this.isMuted);
    }
  }

  toggleVideo() {
    if (this.localVideoTrack) {
      this.isVideoOff = !this.isVideoOff;
      this.localVideoTrack.setEnabled(!this.isVideoOff);
    }
  }

  async endCall() {
    this.stopCallTimer();

    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      if (this.localVideoTrack) {
        this.localVideoTrack.close();
        this.localVideoTrack = null;
      }
      if (this.agoraClient) {
        await this.agoraClient.leave();
        this.agoraClient = null;
      }
    } catch (e) {
      console.error('Error ending call:', e);
    }

    this.isMuted = false;
    this.isVideoOff = false;
    this.hasRemoteUser = false;
    this.callDuration = '00:00';
    this.viewState = 'landing';
  }

  private startCallTimer() {
    this.callStartTime = Date.now();
    this.callTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      this.callDuration = `${mins}:${secs}`;
    }, 1000);
  }

  private stopCallTimer() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
  }
}
