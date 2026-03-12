import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-integration-monitor',
  templateUrl: './integration-monitor.component.html',
  styleUrls: ['./integration-monitor.component.scss'],
})
export class IntegrationMonitorComponent implements OnInit, OnDestroy {
  integrations: any = null;
  loading = true;
  lastRefresh: Date | null = null;
  autoRefreshInterval: any;

  integrationMeta: Record<string, { label: string; icon: string; description: string }> = {
    mongodb: { label: 'MongoDB', icon: 'bx bxs-data', description: 'Primary database' },
    redis: { label: 'Redis', icon: 'bx bxs-bolt', description: 'Cache & pub/sub' },
    pointClickCare: { label: 'PointClickCare', icon: 'bx bxs-heart', description: 'EHR integration' },
    agora: { label: 'Agora RTC', icon: 'bx bxs-video', description: 'Video/audio calling' },
    phaxio: { label: 'Phaxio', icon: 'bx bxs-printer', description: 'Fax management' },
    firebase: { label: 'Firebase', icon: 'bx bxs-bell', description: 'Push notifications' },
    email: { label: 'Email / SendGrid', icon: 'bx bxs-envelope', description: 'Email delivery' },
    digitalOceanSpaces: { label: 'DO Spaces', icon: 'bx bxs-cloud-upload', description: 'File storage' },
    claudeAI: { label: 'Claude AI', icon: 'bx bxs-bot', description: 'AI summarization' },
  };

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadHealth();
    this.autoRefreshInterval = setInterval(() => this.loadHealth(), 30000);
  }

  ngOnDestroy(): void {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
  }

  loadHealth() {
    this.authService.getIntegrationHealth().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.integrations = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });
          this.lastRefresh = new Date();
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load integration health');
        this.loading = false;
      },
    });
  }

  getIntegrationKeys(): string[] {
    return this.integrations ? Object.keys(this.integrations) : [];
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'healthy':
      case 'initialized':
        return 'status-healthy';
      case 'configured':
        return 'status-configured';
      case 'not_configured':
      case 'not_initialized':
      case 'not_available':
        return 'status-unconfigured';
      case 'unhealthy':
      case 'error':
        return 'status-error';
      default:
        return 'status-unknown';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'configured': return 'Configured';
      case 'not_configured': return 'Not Configured';
      case 'initialized': return 'Running';
      case 'not_initialized': return 'Not Initialized';
      case 'not_available': return 'Not Available';
      case 'unhealthy': return 'Unhealthy';
      case 'error': return 'Error';
      default: return status;
    }
  }

  getDetails(key: string): { label: string; value: any }[] {
    const data = this.integrations[key];
    if (!data) return [];
    const details: { label: string; value: any }[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (k === 'status') continue;
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
      details.push({ label, value: v === true ? 'Yes' : v === false ? 'No' : v });
    }
    return details;
  }
}
