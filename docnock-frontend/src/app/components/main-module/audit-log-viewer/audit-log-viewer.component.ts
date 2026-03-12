import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-audit-log-viewer',
  templateUrl: './audit-log-viewer.component.html',
  styleUrls: ['./audit-log-viewer.component.scss'],
})
export class AuditLogViewerComponent implements OnInit {
  logs: any[] = [];
  loading = true;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 50;
  totalPages = 0;

  // Filters
  actionFilter = '';
  successFilter = '';
  startDate = '';
  endDate = '';
  ipFilter = '';
  availableActions: string[] = [];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadActions();
    this.loadLogs();
  }

  loadActions() {
    this.authService.getAuditLogActions().subscribe({
      next: (res: any) => {
        if (res.success) this.availableActions = res.data || [];
      },
    });
  }

  loadLogs() {
    this.loading = true;
    const params: Record<string, any> = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.actionFilter) params['action'] = this.actionFilter;
    if (this.successFilter) params['success'] = this.successFilter;
    if (this.startDate) params['startDate'] = this.startDate;
    if (this.endDate) params['endDate'] = this.endDate;
    if (this.ipFilter) params['ip'] = this.ipFilter;

    this.authService.getAuditLogs(params).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.logs = this._coreService.decryptObjectData({ data: res.encryptDatauserdata }) || [];
          this.totalRecords = res.totalRecords;
          this.totalPages = res.totalPages;
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load audit logs');
        this.loading = false;
      },
    });
  }

  applyFilter() {
    this.currentPage = 1;
    this.loadLogs();
  }

  clearFilters() {
    this.actionFilter = '';
    this.successFilter = '';
    this.startDate = '';
    this.endDate = '';
    this.ipFilter = '';
    this.currentPage = 1;
    this.loadLogs();
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadLogs();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadLogs();
    }
  }

  getActionClass(action: string): string {
    if (action?.startsWith('AUTH_FAIL')) return 'action-danger';
    if (action?.startsWith('AUTH_')) return 'action-auth';
    if (action?.startsWith('PHI_')) return 'action-phi';
    if (action?.startsWith('USER_')) return 'action-user';
    if (action?.startsWith('CALL_')) return 'action-call';
    if (action?.startsWith('FAX_')) return 'action-fax';
    return 'action-default';
  }

  exportCsv() {
    if (!this.logs.length) return;
    try {
      const headers = ['Timestamp', 'User', 'Role', 'Action', 'Resource', 'IP', 'Success'];
      const rows = this.logs.map((l: any) => [
        new Date(l.timestamp).toLocaleString(),
        l.userId?.fullName || l.userId || 'Unknown',
        l.userRole || '',
        l.action,
        l.resourceType || '',
        l.ip || '',
        l.success ? 'Yes' : 'No',
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toastr.success(`Exported ${this.logs.length} records`);
    } catch (err) {
      this.toastr.error('Failed to export CSV');
    }
  }
}
