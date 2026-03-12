import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-security-monitor',
  templateUrl: './security-monitor.component.html',
  styleUrls: ['./security-monitor.component.scss'],
})
export class SecurityMonitorComponent implements OnInit, OnDestroy {
  sessions: any[] = [];
  failedLogins: any[] = [];
  sessionsLoading = true;
  failedLoading = true;
  totalSessions = 0;
  totalFailed = 0;
  failedHours = 24;
  showRevokeModal = false;
  showRevokeAllModal = false;
  revokeTarget: any = null;
  revokeAllUserId: string | null = null;
  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadSessions();
    this.loadFailedLogins();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  loadSessions() {
    this.sessionsLoading = true;
    const sub = this.authService.getActiveSessions().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.sessions = this._coreService.decryptObjectData({ data: res.encryptDatauserdata }) || [];
          this.totalSessions = res.totalSessions;
        }
        this.sessionsLoading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load sessions');
        this.sessionsLoading = false;
      },
    });
    this.subscriptions.push(sub);
  }

  loadFailedLogins() {
    this.failedLoading = true;
    const sub = this.authService.getFailedLogins(this.failedHours).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.failedLogins = this._coreService.decryptObjectData({ data: res.encryptDatauserdata }) || [];
          this.totalFailed = res.total;
        }
        this.failedLoading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load failed logins');
        this.failedLoading = false;
      },
    });
    this.subscriptions.push(sub);
  }

  openRevokeModal(session: any) {
    this.revokeTarget = session;
    this.showRevokeModal = true;
  }

  closeRevokeModal() {
    this.showRevokeModal = false;
    this.revokeTarget = null;
  }

  confirmRevoke() {
    if (!this.revokeTarget) return;
    this.authService.revokeSession({ sessionId: this.revokeTarget._id }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Session revoked');
          this.sessions = this.sessions.filter((s: any) => s._id !== this.revokeTarget._id);
          this.totalSessions--;
        }
        this.closeRevokeModal();
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to revoke session');
        this.closeRevokeModal();
      },
    });
  }

  openRevokeAllModal(userId: string) {
    this.revokeAllUserId = userId;
    this.showRevokeAllModal = true;
  }

  closeRevokeAllModal() {
    this.showRevokeAllModal = false;
    this.revokeAllUserId = null;
  }

  confirmRevokeAll() {
    if (!this.revokeAllUserId) return;
    const sub = this.authService.revokeSession({ userId: this.revokeAllUserId, revokeAll: true }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success(res.message);
          this.loadSessions();
        }
        this.closeRevokeAllModal();
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to revoke sessions');
        this.closeRevokeAllModal();
      },
    });
    this.subscriptions.push(sub);
  }

  getTimeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  getDeviceIcon(userAgent: string): string {
    if (!userAgent) return 'bx bxs-devices';
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'bx bxs-mobile';
    if (ua.includes('tablet') || ua.includes('ipad')) return 'bx bxs-tablet';
    return 'bx bxs-laptop';
  }

  getBrowserName(userAgent: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  }
}
