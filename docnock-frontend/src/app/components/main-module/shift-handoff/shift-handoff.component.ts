import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-shift-handoff',
  templateUrl: './shift-handoff.component.html',
  styleUrls: ['./shift-handoff.component.scss'],
})
export class ShiftHandoffComponent implements OnInit {
  handoffs: any[] = [];
  loading = true;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;

  // Filters
  statusFilter = '';
  unitFilter = '';
  startDate = '';
  endDate = '';

  // Modal
  showCreateModal = false;
  submitting = false;

  // Form
  newHandoff: any = {
    shiftType: 'DAY',
    unit: '',
    notes: '',
    patients: [{ name: '', room: '', diagnosis: '', medications: '', notes: '' }],
  };

  statuses = ['draft', 'submitted', 'acknowledged', 'completed'];
  shiftTypes = ['DAY', 'EVENING', 'NIGHT'];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadHandoffs();
  }

  loadHandoffs() {
    this.loading = true;
    const params: Record<string, any> = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.unitFilter) params['unit'] = this.unitFilter;
    if (this.startDate) params['startDate'] = this.startDate;
    if (this.endDate) params['endDate'] = this.endDate;

    this.authService.getHandoffs(params).subscribe({
      next: (res: any) => {
        if (res.success) {
          const encData = res.encryptDatauserdata || res.data;
          const decrypted = (typeof encData === 'string')
            ? this._coreService.decryptObjectData({ data: encData })
            : encData;
          this.handoffs = Array.isArray(decrypted) ? decrypted : [];
          this.totalRecords = res.totalRecords || 0;
          this.totalPages = res.totalPages || 0;
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load handoffs');
        this.loading = false;
      },
    });
  }

  applyFilter() {
    this.currentPage = 1;
    this.loadHandoffs();
  }

  clearFilters() {
    this.statusFilter = '';
    this.unitFilter = '';
    this.startDate = '';
    this.endDate = '';
    this.currentPage = 1;
    this.loadHandoffs();
  }

  openCreateModal() {
    this.resetForm();
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  resetForm() {
    this.newHandoff = {
      shiftType: 'DAY',
      unit: '',
      notes: '',
      patients: [{ name: '', room: '', diagnosis: '', medications: '', notes: '' }],
    };
  }

  addPatient() {
    this.newHandoff.patients.push({ name: '', room: '', diagnosis: '', medications: '', notes: '' });
  }

  removePatient(index: number) {
    if (this.newHandoff.patients.length > 1) {
      this.newHandoff.patients.splice(index, 1);
    }
  }

  submitHandoff() {
    if (!this.newHandoff.unit) {
      this.toastr.warning('Please enter a unit');
      return;
    }
    this.submitting = true;

    // Transform data to match backend API expectations
    const payload: any = {
      unit: this.newHandoff.unit,
      shiftType: this.newHandoff.shiftType,
      shiftDate: new Date().toISOString(),
      generalNotes: this.newHandoff.notes,
      patients: this.newHandoff.patients.map((p: any) => ({
        patientName: p.name,
        roomBed: p.room,
        diagnosis: p.diagnosis,
        medications: p.medications ? p.medications.split(',').map((m: string) => ({ name: m.trim() })) : [],
        nursingNotes: p.notes,
      })),
    };

    this.authService.createHandoff(payload).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Handoff created successfully');
          this.closeCreateModal();
          this.loadHandoffs();
        } else {
          this.toastr.error(res.message || 'Failed to create handoff');
        }
        this.submitting = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to create handoff');
        this.submitting = false;
      },
    });
  }

  acknowledgeHandoff(id: string) {
    this.authService.acknowledgeHandoff(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Handoff acknowledged');
          this.loadHandoffs();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to acknowledge handoff');
      },
    });
  }

  completeHandoff(id: string) {
    this.authService.completeHandoff(id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Handoff completed');
          this.loadHandoffs();
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to complete handoff');
      },
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'draft': return 'status-draft';
      case 'submitted': return 'status-submitted';
      case 'acknowledged': return 'status-acknowledged';
      case 'completed': return 'status-completed';
      default: return 'status-draft';
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadHandoffs();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadHandoffs();
    }
  }
}
