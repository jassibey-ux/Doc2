import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-clinical-alerts',
  templateUrl: './clinical-alerts.component.html',
  styleUrls: ['./clinical-alerts.component.scss'],
})
export class ClinicalAlertsComponent implements OnInit, OnDestroy {
  alerts: any[] = [];
  loading = true;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;

  // KPI counts
  criticalCount = 0;
  warningCount = 0;
  infoCount = 0;
  activeCount = 0;

  // Filters
  severityFilter = '';
  statusFilter = '';
  alertTypeFilter = '';

  // Modal
  showCreateModal = false;
  showResolveModal = false;
  submitting = false;
  selectedAlert: any = null;

  // Create form
  newAlert: any = {
    alertType: 'VITAL_SIGN',
    severity: 'WARNING',
    patientName: '',
    patientRoom: '',
    title: '',
    description: '',
  };

  // Resolve form
  resolveNotes = '';

  // Auto-refresh
  private refreshInterval: any = null;

  severities = ['CRITICAL', 'WARNING', 'INFO'];
  statuses = ['active', 'acknowledged', 'resolved', 'escalated'];
  alertTypes = ['VITAL_SIGN', 'LAB_RESULT', 'MEDICATION', 'FALL_RISK', 'INFECTION_CONTROL', 'OTHER'];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadAlerts();
    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.loadAlerts(true), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadAlerts(silent = false) {
    if (!silent) this.loading = true;
    const params: Record<string, any> = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.severityFilter) params['severity'] = this.severityFilter;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.alertTypeFilter) params['alertType'] = this.alertTypeFilter;

    this.authService.getAlerts(params).subscribe({
      next: (res: any) => {
        if (res.success) {
          const encData = res.encryptDatauserdata || res.data;
          const decrypted = (typeof encData === 'string')
            ? this._coreService.decryptObjectData({ data: encData })
            : encData;
          this.alerts = Array.isArray(decrypted) ? decrypted : [];
          this.totalRecords = res.totalRecords || 0;
          this.totalPages = res.totalPages || 0;
          this.updateKpis();
        }
        this.loading = false;
      },
      error: (err: any) => {
        if (!silent) this.toastr.error(err.error?.message || 'Failed to load alerts');
        this.loading = false;
      },
    });
  }

  updateKpis() {
    this.criticalCount = this.alerts.filter((a: any) => a.severity === 'CRITICAL' && a.status === 'active').length;
    this.warningCount = this.alerts.filter((a: any) => a.severity === 'WARNING' && a.status === 'active').length;
    this.infoCount = this.alerts.filter((a: any) => a.severity === 'INFO' && a.status === 'active').length;
    this.activeCount = this.alerts.filter((a: any) => a.status === 'active').length;
  }

  applyFilter() {
    this.currentPage = 1;
    this.loadAlerts();
  }

  clearFilters() {
    this.severityFilter = '';
    this.statusFilter = '';
    this.alertTypeFilter = '';
    this.currentPage = 1;
    this.loadAlerts();
  }

  openCreateModal() {
    this.newAlert = {
      alertType: 'VITAL_SIGN',
      severity: 'WARNING',
      patientName: '',
      patientRoom: '',
      title: '',
      description: '',
    };
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  submitAlert() {
    if (!this.newAlert.title) {
      this.toastr.warning('Alert title is required');
      return;
    }
    this.submitting = true;

    // Transform to match backend API
    const payload: any = {
      alertType: this.newAlert.alertType,
      severity: this.newAlert.severity,
      patientName: this.newAlert.patientName,
      roomBed: this.newAlert.patientRoom,
      title: this.newAlert.title,
      description: this.newAlert.description,
    };

    this.authService.createAlert(payload).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Alert created');
          this.closeCreateModal();
          this.loadAlerts();
        } else {
          this.toastr.error(res.message || 'Failed to create alert');
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to create alert');
        this.submitting = false;
      },
    });
  }

  acknowledgeAlert(id: string) {
    this.authService.acknowledgeAlert(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Alert acknowledged');
          this.loadAlerts();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to acknowledge');
      },
    });
  }

  openResolveModal(alert: any) {
    this.selectedAlert = alert;
    this.resolveNotes = '';
    this.showResolveModal = true;
  }

  closeResolveModal() {
    this.showResolveModal = false;
    this.selectedAlert = null;
  }

  resolveAlert() {
    if (!this.selectedAlert) return;
    this.submitting = true;
    this.authService.resolveAlert(this.selectedAlert._id, { notes: this.resolveNotes }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Alert resolved');
          this.closeResolveModal();
          this.loadAlerts();
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to resolve');
        this.submitting = false;
      },
    });
  }

  escalateAlert(id: string) {
    this.authService.escalateAlert(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Alert escalated');
          this.loadAlerts();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to escalate');
      },
    });
  }

  getSeverityClass(severity: string): string {
    switch (severity) {
      case 'CRITICAL': return 'severity-critical';
      case 'WARNING': return 'severity-warning';
      case 'INFO': return 'severity-info';
      default: return 'severity-info';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'status-active';
      case 'acknowledged': return 'status-acknowledged';
      case 'resolved': return 'status-resolved';
      case 'escalated': return 'status-escalated';
      default: return 'status-active';
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadAlerts();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadAlerts();
    }
  }
}
