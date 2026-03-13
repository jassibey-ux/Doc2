import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-sbar-report',
  templateUrl: './sbar-report.component.html',
  styleUrls: ['./sbar-report.component.scss'],
})
export class SbarReportComponent implements OnInit {
  sbars: any[] = [];
  loading = true;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;

  // Filters
  statusFilter = '';
  priorityFilter = '';

  // Modal
  showCreateModal = false;
  showResolveModal = false;
  submitting = false;
  selectedSbar: any = null;

  // Create form
  newSbar: any = {
    patientName: '',
    patientRoom: '',
    priority: 'ROUTINE',
    situation: '',
    background: '',
    assessment: '',
    recommendation: '',
    recipientId: '',
  };

  // Resolve form
  resolveNotes = '';

  statuses = ['sent', 'submitted', 'acknowledged', 'resolved'];
  priorities = ['ROUTINE', 'URGENT', 'CRITICAL'];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadSbars();
  }

  loadSbars() {
    this.loading = true;
    const params: Record<string, any> = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.priorityFilter) params['priority'] = this.priorityFilter;

    this.authService.getSbars(params).subscribe({
      next: (res: any) => {
        if (res.success) {
          const encData = res.encryptDatauserdata || res.data;
          const decrypted = (typeof encData === 'string')
            ? this._coreService.decryptObjectData({ data: encData })
            : encData;
          this.sbars = Array.isArray(decrypted) ? decrypted : [];
          this.totalRecords = res.totalRecords || 0;
          this.totalPages = res.totalPages || 0;
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load SBAR reports');
        this.loading = false;
      },
    });
  }

  applyFilter() {
    this.currentPage = 1;
    this.loadSbars();
  }

  clearFilters() {
    this.statusFilter = '';
    this.priorityFilter = '';
    this.currentPage = 1;
    this.loadSbars();
  }

  openCreateModal() {
    this.newSbar = {
      patientName: '',
      patientRoom: '',
      priority: 'ROUTINE',
      situation: '',
      background: '',
      assessment: '',
      recommendation: '',
      recipientId: '',
    };
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  submitSbar() {
    if (!this.newSbar.situation || !this.newSbar.patientName) {
      this.toastr.warning('Patient name and situation are required');
      return;
    }
    this.submitting = true;

    // Transform to match backend API
    const payload: any = {
      patientName: this.newSbar.patientName,
      roomBed: this.newSbar.patientRoom,
      priority: this.newSbar.priority,
      situation: this.newSbar.situation,
      background: this.newSbar.background,
      assessment: this.newSbar.assessment,
      recommendation: this.newSbar.recommendation,
      recipientRole: 'physician',
      recipientUser: this.newSbar.recipientId || undefined,
    };

    this.authService.createSbar(payload).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('SBAR report created');
          this.closeCreateModal();
          this.loadSbars();
        } else {
          this.toastr.error(res.message || 'Failed to create SBAR');
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to create SBAR');
        this.submitting = false;
      },
    });
  }

  acknowledgeSbar(id: string) {
    this.authService.acknowledgeSbar(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('SBAR acknowledged');
          this.loadSbars();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to acknowledge');
      },
    });
  }

  openResolveModal(sbar: any) {
    this.selectedSbar = sbar;
    this.resolveNotes = '';
    this.showResolveModal = true;
  }

  closeResolveModal() {
    this.showResolveModal = false;
    this.selectedSbar = null;
  }

  resolveSbar() {
    if (!this.selectedSbar) return;
    this.submitting = true;
    this.authService.resolveSbar(this.selectedSbar._id, { notes: this.resolveNotes }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('SBAR resolved');
          this.closeResolveModal();
          this.loadSbars();
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to resolve');
        this.submitting = false;
      },
    });
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'CRITICAL': return 'priority-critical';
      case 'URGENT': return 'priority-urgent';
      case 'ROUTINE': return 'priority-routine';
      default: return 'priority-routine';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'submitted': return 'status-submitted';
      case 'acknowledged': return 'status-acknowledged';
      case 'resolved': return 'status-resolved';
      default: return 'status-submitted';
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSbars();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSbars();
    }
  }
}
