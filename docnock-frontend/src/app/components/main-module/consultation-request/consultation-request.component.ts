import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-consultation-request',
  templateUrl: './consultation-request.component.html',
  styleUrls: ['./consultation-request.component.scss'],
})
export class ConsultationRequestComponent implements OnInit {
  consultations: any[] = [];
  loading = true;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;

  // Filters
  statusFilter = '';
  priorityFilter = '';

  // Modals
  showCreateModal = false;
  showActionModal = false;
  submitting = false;
  selectedConsultation: any = null;
  actionType = ''; // 'complete' | 'decline'
  actionNotes = '';

  // Create form
  newConsultation: any = {
    patientName: '',
    patientRoom: '',
    priority: 'ROUTINE',
    specialty: '',
    reason: '',
    clinicalHistory: '',
    requestedBy: '',
  };

  statuses = ['pending', 'accepted', 'completed', 'declined'];
  priorities = ['ROUTINE', 'URGENT', 'STAT'];
  specialties = [
    'Cardiology', 'Pulmonology', 'Neurology', 'Nephrology',
    'Gastroenterology', 'Infectious Disease', 'Endocrinology',
    'Orthopedics', 'Psychiatry', 'Surgery', 'Other',
  ];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  loadConsultations() {
    this.loading = true;
    const params: Record<string, any> = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.priorityFilter) params['priority'] = this.priorityFilter;

    this.authService.getConsultations(params).subscribe({
      next: (res: any) => {
        if (res.success) {
          const encData = res.encryptDatauserdata || res.data;
          const decrypted = (typeof encData === 'string')
            ? this._coreService.decryptObjectData({ data: encData })
            : encData;
          this.consultations = Array.isArray(decrypted) ? decrypted : [];
          this.totalRecords = res.totalRecords || 0;
          this.totalPages = res.totalPages || 0;
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load consultations');
        this.loading = false;
      },
    });
  }

  applyFilter() {
    this.currentPage = 1;
    this.loadConsultations();
  }

  clearFilters() {
    this.statusFilter = '';
    this.priorityFilter = '';
    this.currentPage = 1;
    this.loadConsultations();
  }

  openCreateModal() {
    this.newConsultation = {
      patientName: '',
      patientRoom: '',
      priority: 'ROUTINE',
      specialty: '',
      reason: '',
      clinicalHistory: '',
      requestedBy: '',
    };
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  submitConsultation() {
    if (!this.newConsultation.patientName || !this.newConsultation.reason) {
      this.toastr.warning('Patient name and reason are required');
      return;
    }
    this.submitting = true;

    // Transform to match backend API
    const payload: any = {
      patientName: this.newConsultation.patientName,
      roomBed: this.newConsultation.patientRoom,
      priority: this.newConsultation.priority,
      consultantType: this.newConsultation.specialty,
      reason: this.newConsultation.reason,
      clinicalHistory: this.newConsultation.clinicalHistory,
    };

    this.authService.createConsultation(payload).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Consultation request created');
          this.closeCreateModal();
          this.loadConsultations();
        } else {
          this.toastr.error(res.message || 'Failed to create consultation');
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to create consultation');
        this.submitting = false;
      },
    });
  }

  acceptConsultation(id: string) {
    this.authService.acceptConsultation(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Consultation accepted');
          this.loadConsultations();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to accept');
      },
    });
  }

  openActionModal(consultation: any, type: string) {
    this.selectedConsultation = consultation;
    this.actionType = type;
    this.actionNotes = '';
    this.showActionModal = true;
  }

  closeActionModal() {
    this.showActionModal = false;
    this.selectedConsultation = null;
    this.actionType = '';
  }

  submitAction() {
    if (!this.selectedConsultation) return;
    this.submitting = true;

    const payload = { notes: this.actionNotes };
    const id = this.selectedConsultation._id;

    const request$ = this.actionType === 'complete'
      ? this.authService.completeConsultation(id, payload)
      : this.authService.declineConsultation(id, payload);

    request$.subscribe({
      next: (res: any) => {
        if (res.success) {
          const verb = this.actionType === 'complete' ? 'completed' : 'declined';
          this.toastr.success(`Consultation ${verb}`);
          this.closeActionModal();
          this.loadConsultations();
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || `Failed to ${this.actionType} consultation`);
        this.submitting = false;
      },
    });
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'STAT': return 'priority-stat';
      case 'URGENT': return 'priority-urgent';
      case 'ROUTINE': return 'priority-routine';
      default: return 'priority-routine';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'accepted': return 'status-accepted';
      case 'completed': return 'status-completed';
      case 'declined': return 'status-declined';
      default: return 'status-pending';
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadConsultations();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadConsultations();
    }
  }
}
