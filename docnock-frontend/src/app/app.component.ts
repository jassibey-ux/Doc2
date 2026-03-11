import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Observable, Subscription } from 'rxjs';
import { WebsocketService } from './services/websocket.service';
import { GlobalLoaderService } from './services/global-loader.service';
import { SessionTimeoutService } from './services/session-timeout.service';
import { AuthServiceService } from './services/auth-service.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'DockFrontend';
  loading$!: Observable<boolean>;
  hideGlobalLoaderOnChat = false;
  activeCallSession: any = null;
  private callCapsuleInterval: any;
  private routeSubscription!: Subscription;
  hideGlobalCallCapsule = false;
  private miniPreviewInterval: any;
  isMiniAudioMuted = false;
  isMiniVideoMuted = false;
  hasMiniLocalPreview = false;
  private lastLocalTrackId = '';
  // timestamp of last time we observed active RTC client/tracks (ms)
  private lastActiveCallSeenAt: number | null = null;
  // bound handler for global logout event
  private handleAppLogoutBound = () => this.terminateActiveCall();
  isCapsuleDragging = false;
  private capsuleMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private capsuleStartLeft = 0;
  private capsuleStartTop = 68;
  capsuleLeft: number | null = null;
  capsuleTop = 68;
  private readonly defaultImageFallback = '/assets/images/profile_sample_image.png';
  private readonly genericImageFallback = '/assets/images/attachement.png';

  private readonly globalImageErrorHandler = (event: Event) => {
    const target = event.target as HTMLImageElement | null;
    if (!target || target.tagName !== 'IMG') {
      return;
    }

    if (target.dataset['fallbackApplied'] === 'true') {
      return;
    }

    const specificFallback = target.getAttribute('data-fallback-src');
    const isAvatarLike =
      target.classList.contains('user-avatar') ||
      target.classList.contains('profile') ||
      target.classList.contains('profilePhoto') ||
      target.classList.contains('caller-img') ||
      target.classList.contains('user-image');

    const fallbackSrc = specificFallback || (isAvatarLike ? this.defaultImageFallback : this.genericImageFallback);
    target.dataset['fallbackApplied'] = 'true';
    target.src = fallbackSrc;
  };

  @ViewChild('globalCallCapsule', { static: false }) globalCallCapsuleRef!: ElementRef<HTMLElement>;
  @ViewChild('miniRemoteVideo', { static: false }) miniRemoteVideoRef!: ElementRef<HTMLElement>;
  @ViewChild('miniLocalVideoEl', { static: false }) miniLocalVideoElRef!: ElementRef<HTMLVideoElement>;

  constructor(
    private router: Router,
    private websocket: WebsocketService,
    private globalLoader: GlobalLoaderService,
    private sessionTimeout: SessionTimeoutService,
    private authService: AuthServiceService
  ) {}

  private clearCapsuleState() {
    this.activeCallSession = null;
    this.hasMiniLocalPreview = false;
    this.lastLocalTrackId = '';

    if (this.miniLocalVideoElRef?.nativeElement) {
      this.miniLocalVideoElRef.nativeElement.srcObject = null;
    }

    if (this.miniRemoteVideoRef?.nativeElement) {
      this.miniRemoteVideoRef.nativeElement.innerHTML = '';
    }
  }

  private applyTheme(isDarkMode: boolean): void {
    const root = document.documentElement;
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);

    if (isDarkMode) {
      root.style.setProperty('--bg', 'var(--darkmode-bg)');
      root.style.setProperty('--bg-light', 'var(--darkmode-bg-light)');
      root.style.setProperty('--p', 'var(--darkmode-p)');
      root.style.setProperty('--line', 'var(--darkmode-line)');
      root.style.setProperty('--scrollbar', 'var(--darkmode-scrollbar)');
      root.style.setProperty('--h', 'var(--darkmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#1f8f67');
      root.style.setProperty('--bubble-received-bg', '#1e2430');
    } else {
      root.style.setProperty('--bg', 'var(--lightmode-bg)');
      root.style.setProperty('--bg-light', 'var(--lightmode-bg-light)');
      root.style.setProperty('--p', 'var(--lightmode-p)');
      root.style.setProperty('--line', 'var(--lightmode-line)');
      root.style.setProperty('--scrollbar', 'var(--lightmode-scrollbar)');
      root.style.setProperty('--h', 'var(--lightmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#dcf8c6');
      root.style.setProperty('--bubble-received-bg', '#ffffff');
    }
  }

  ngOnInit(): void {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyTheme(isDarkMode);

    window.addEventListener('error', this.globalImageErrorHandler, true);
    this.loading$ = this.globalLoader.loading$;

    // Start session idle timeout (HIPAA requirement)
    if (this.authService.isAuthenticated()) {
      this.sessionTimeout.start();
    }
    this.authService.isLoggedIn$.subscribe(loggedIn => {
      if (loggedIn) this.sessionTimeout.start();
      else this.sessionTimeout.stop();
    });

    this.refreshActiveCallSession();
    this.callCapsuleInterval = setInterval(() => this.refreshActiveCallSession(), 3000);
    this.miniPreviewInterval = setInterval(() => this.attachMiniCallPreview(), 1200);

    this.routeSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const currentUrl = event.urlAfterRedirects || '';
        this.hideGlobalCallCapsule = currentUrl.includes('/video-call');
        const loaderSuppressedRoutes = ['/chats', '/video-call'];
        this.hideGlobalLoaderOnChat = loaderSuppressedRoutes.some((segment) => currentUrl.includes(segment));
        this.refreshActiveCallSession();
      });

    // listen for logout from anywhere in the app so we can terminate active calls
    window.addEventListener('app-logout', this.handleAppLogoutBound);
  }

  ngOnDestroy(): void {
    window.removeEventListener('error', this.globalImageErrorHandler, true);

    if (this.callCapsuleInterval) {
      clearInterval(this.callCapsuleInterval);
      this.callCapsuleInterval = null;
    }

    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }

    if (this.miniPreviewInterval) {
      clearInterval(this.miniPreviewInterval);
      this.miniPreviewInterval = null;
    }

    window.removeEventListener('app-logout', this.handleAppLogoutBound);
  }

  @HostListener('window:beforeunload')
  handleWindowBeforeUnload() {
    if (this.router.url.includes('/video-call')) {
      return;
    }

    const session = this.activeCallSession || this.getActiveCallSessionFromStorage();
    const loginId = localStorage.getItem('userId');
    if (!session?.groupid || !loginId) {
      return;
    }

    this.websocket.leaveCallOnWindowExit(
      session.groupid,
      loginId,
      session?.title || '',
      session?.callerId || '',
      session?.group,
      session?.audio
    );
  }

  private getActiveCallSessionFromStorage() {
    const raw = localStorage.getItem('activeCallSession');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  refreshActiveCallSession() {
    const callSession = localStorage.getItem('activeCallSession');
    if (!callSession) {
      this.clearCapsuleState();
      return;
    }

    try {
      this.activeCallSession = JSON.parse(callSession);
    } catch {
      localStorage.removeItem('activeCallSession');
      this.clearCapsuleState();
    }
  }

  resumeActiveCall() {
    if (this.capsuleMoved) {
      this.capsuleMoved = false;
      return;
    }

    if (!this.activeCallSession) return;

    const role = localStorage.getItem('role') || 'main';
    const path = `${role}/video-call`;
    this.router.navigate([path], {
      state: {
        fromA: {
          ...this.activeCallSession,
          rejoin: true,
          type: 'callby'
        }
      }
    });
  }

  startCapsuleDrag(event: MouseEvent | TouchEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.mini-call-controls')) {
      return;
    }

    const capsuleElement = this.globalCallCapsuleRef?.nativeElement;
    if (!capsuleElement) {
      return;
    }

    const pointer = this.getPointerPoint(event);
    const capsuleRect = capsuleElement.getBoundingClientRect();

    if (this.capsuleLeft === null) {
      this.capsuleLeft = capsuleRect.left;
      this.capsuleTop = capsuleRect.top;
    }

    this.isCapsuleDragging = true;
    this.capsuleMoved = false;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.capsuleStartLeft = this.capsuleLeft ?? capsuleRect.left;
    this.capsuleStartTop = this.capsuleTop;
  }

  @HostListener('document:mousemove', ['$event'])
  onCapsuleMouseMove(event: MouseEvent) {
    this.handleCapsuleDragMove(event);
  }

  @HostListener('document:touchmove', ['$event'])
  onCapsuleTouchMove(event: TouchEvent) {
    this.handleCapsuleDragMove(event);
  }

  @HostListener('document:mouseup')
  onCapsuleMouseUp() {
    this.stopCapsuleDrag();
  }

  @HostListener('document:touchend')
  onCapsuleTouchEnd() {
    this.stopCapsuleDrag();
  }

  private handleCapsuleDragMove(event: MouseEvent | TouchEvent) {
    if (!this.isCapsuleDragging) {
      return;
    }

    const capsuleElement = this.globalCallCapsuleRef?.nativeElement;
    if (!capsuleElement) {
      return;
    }

    const pointer = this.getPointerPoint(event);
    const deltaX = pointer.x - this.dragStartX;
    const deltaY = pointer.y - this.dragStartY;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      this.capsuleMoved = true;
    }

    const capsuleRect = capsuleElement.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - capsuleRect.width);
    const maxTop = Math.max(0, window.innerHeight - capsuleRect.height);

    this.capsuleLeft = Math.min(maxLeft, Math.max(0, this.capsuleStartLeft + deltaX));
    this.capsuleTop = Math.min(maxTop, Math.max(0, this.capsuleStartTop + deltaY));
  }

  private stopCapsuleDrag() {
    if (!this.isCapsuleDragging) {
      return;
    }

    this.isCapsuleDragging = false;
  }

  private getPointerPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
    if ('touches' in event) {
      const touch = event.touches[0] || event.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }

    return { x: event.clientX, y: event.clientY };
  }

  toggleMiniAudio(event: Event) {
    event.stopPropagation();
    const globalState = window as any;
    const localAudioTrack = globalState.__dockRtcLocalAudioTrack;
    if (!localAudioTrack) {
      return;
    }

    this.isMiniAudioMuted = !this.isMiniAudioMuted;
    localAudioTrack.setMuted(this.isMiniAudioMuted);
  }

  toggleMiniVideo(event: Event) {
    event.stopPropagation();
    const globalState = window as any;
    const localVideoTrack = globalState.__dockRtcLocalVideoTrack;
    if (!localVideoTrack) {
      return;
    }

    this.isMiniVideoMuted = !this.isMiniVideoMuted;
    localVideoTrack.setMuted(this.isMiniVideoMuted);
    if (this.isMiniVideoMuted) {
      this.hasMiniLocalPreview = false;
    }
  }

  async stopMiniScreenShare(event: Event) {
    event.stopPropagation();

    if (!this.activeCallSession?.isScreenSharing) {
      return;
    }

    const globalState = window as any;
    const rtcClient = globalState.__dockRtcClient;
    const localVideoTrack = globalState.__dockRtcLocalVideoTrack;

    if (!rtcClient || !localVideoTrack) {
      return;
    }

    try {
      await rtcClient.unpublish(localVideoTrack);
      localVideoTrack.stop?.();
      localVideoTrack.close?.();

      let restoredCameraTrack = globalState.__dockRtcCameraVideoTrackBackup;
      if (!restoredCameraTrack) {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        restoredCameraTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p' });
      }

      await rtcClient.publish(restoredCameraTrack);
      globalState.__dockRtcLocalVideoTrack = restoredCameraTrack;
      globalState.__dockRtcCameraVideoTrackBackup = null;

      this.activeCallSession = {
        ...this.activeCallSession,
        isScreenSharing: false
      };
      localStorage.setItem('activeCallSession', JSON.stringify(this.activeCallSession));

      if (this.miniLocalVideoElRef?.nativeElement) {
        const mediaTrack = restoredCameraTrack.getMediaStreamTrack?.();
        if (mediaTrack) {
          this.miniLocalVideoElRef.nativeElement.srcObject = new MediaStream([mediaTrack]);
          this.miniLocalVideoElRef.nativeElement.play().catch(() => {});
          this.hasMiniLocalPreview = true;
        }
      }
    } catch {
      // keep capsule responsive even if share-stop fails
    }
  }

  async endCallFromMini(event: Event) {
    event.stopPropagation();

    const session = this.activeCallSession;
    const loginId = localStorage.getItem('userId');
    if (session?.groupid && loginId) {
      try {
        this.websocket.leavecall(
          session.groupid,
          loginId,
          session?.title || '',
          session?.callerId || '',
          session?.group,
          session?.audio
        );
      } catch {}
    }

    const globalState = window as any;
    const rtcClient = globalState.__dockRtcClient;
    const localAudioTrack = globalState.__dockRtcLocalAudioTrack;
    const localVideoTrack = globalState.__dockRtcLocalVideoTrack;
    const backupVideoTrack = globalState.__dockRtcCameraVideoTrackBackup;

    try {
      localAudioTrack?.stop?.();
      localAudioTrack?.close?.();
    } catch {}

    try {
      localVideoTrack?.stop?.();
      localVideoTrack?.close?.();
    } catch {}

    try {
      backupVideoTrack?.stop?.();
      backupVideoTrack?.close?.();
    } catch {}

    try {
      await rtcClient?.leave?.();
    } catch {}

    globalState.__dockRtcClient = null;
    globalState.__dockRtcLocalAudioTrack = null;
    globalState.__dockRtcLocalVideoTrack = null;
    globalState.__dockRtcCameraVideoTrackBackup = null;

    localStorage.removeItem('activeCallSession');
    localStorage.removeItem('uid');
    this.activeCallSession = null;
    this.hasMiniLocalPreview = false;
    this.lastLocalTrackId = '';

    if (this.miniLocalVideoElRef?.nativeElement) {
      this.miniLocalVideoElRef.nativeElement.srcObject = null;
    }
  }

  /**
   * Terminate active call without relying on an Event object (used on global logout)
   */
  async terminateActiveCall() {
    const session = this.activeCallSession;
    const loginId = localStorage.getItem('userId');
    if (session?.groupid && loginId) {
      try {
        this.websocket.leavecall(
          session.groupid,
          loginId,
          session?.title || '',
          session?.callerId || '',
          session?.group,
          session?.audio
        );
      } catch {}
    }

    const globalState = window as any;
    const rtcClient = globalState.__dockRtcClient;
    const localAudioTrack = globalState.__dockRtcLocalAudioTrack;
    const localVideoTrack = globalState.__dockRtcLocalVideoTrack;
    const backupVideoTrack = globalState.__dockRtcCameraVideoTrackBackup;

    try {
      localAudioTrack?.stop?.();
      localAudioTrack?.close?.();
    } catch {}

    try {
      localVideoTrack?.stop?.();
      localVideoTrack?.close?.();
    } catch {}

    try {
      backupVideoTrack?.stop?.();
      backupVideoTrack?.close?.();
    } catch {}

    try {
      await rtcClient?.leave?.();
    } catch {}

    globalState.__dockRtcClient = null;
    globalState.__dockRtcLocalAudioTrack = null;
    globalState.__dockRtcLocalVideoTrack = null;
    globalState.__dockRtcCameraVideoTrackBackup = null;

    localStorage.removeItem('activeCallSession');
    localStorage.removeItem('uid');
    this.activeCallSession = null;
    this.hasMiniLocalPreview = false;
    this.lastLocalTrackId = '';

    if (this.miniLocalVideoElRef?.nativeElement) {
      this.miniLocalVideoElRef.nativeElement.srcObject = null;
    }
  }

  private attachMiniCallPreview() {
    if (this.hideGlobalCallCapsule || !this.activeCallSession) {
      return;
    }

    const globalState = window as any;
    const localTrack = globalState.__dockRtcLocalVideoTrack;
    const rtcClient = globalState.__dockRtcClient;

    const hasAnyActive = !!rtcClient || !!globalState.__dockRtcLocalAudioTrack || !!globalState.__dockRtcLocalVideoTrack;
    const now = Date.now();
    const GRACE_MS = 15000; // allow short temporary dropouts (15s) before clearing capsule

    if (hasAnyActive) {
      this.lastActiveCallSeenAt = now;
    } else {
      if (!this.lastActiveCallSeenAt) this.lastActiveCallSeenAt = now;
      const elapsed = now - (this.lastActiveCallSeenAt || now);
      if (elapsed > GRACE_MS) {
        localStorage.removeItem('activeCallSession');
        this.clearCapsuleState();
        this.lastActiveCallSeenAt = null;
        return;
      } else {
        // temporary absence of tracks — do not clear capsule yet
        return;
      }
    }

    const remoteTrack = rtcClient?.remoteUsers?.find((user: any) => user?.videoTrack)?.videoTrack;

    if (this.miniLocalVideoElRef?.nativeElement && localTrack && !this.activeCallSession?.audio && !this.isMiniVideoMuted) {
      try {
        const mediaTrack = localTrack.getMediaStreamTrack?.();
        const videoElement = this.miniLocalVideoElRef.nativeElement;

        if (mediaTrack) {
          if (this.lastLocalTrackId !== mediaTrack.id || !videoElement.srcObject) {
            videoElement.srcObject = new MediaStream([mediaTrack]);
            this.lastLocalTrackId = mediaTrack.id;
          }

          videoElement.play().catch(() => {});
          this.hasMiniLocalPreview = true;
        } else {
          this.hasMiniLocalPreview = false;
        }
      } catch {}
    } else {
      this.hasMiniLocalPreview = false;
      if (this.miniLocalVideoElRef?.nativeElement) {
        this.miniLocalVideoElRef.nativeElement.srcObject = null;
      }
    }

    if (this.miniRemoteVideoRef?.nativeElement && remoteTrack) {
      try {
        remoteTrack.play(this.miniRemoteVideoRef.nativeElement, { fit: 'cover' });
      } catch {}
    }
  }
}
