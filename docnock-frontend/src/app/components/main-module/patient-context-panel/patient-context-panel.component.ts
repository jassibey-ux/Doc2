import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

interface PatientLink {
  _id: string;
  pccPatientId: string;
  pccFacilityId?: string;
  patientName?: string;
}

interface PatientSummary {
  demographics?: {
    birthDate?: string;
    gender?: string;
    roomBed?: string;
    admissionDate?: string;
  };
  medications?: Array<{
    drugName?: string;
    description?: string;
    dosage?: string;
  }>;
  vitals?: Array<{
    type: string;
    value: string;
    unit?: string;
    recordedAt?: string;
  }>;
}

@Component({
  selector: 'app-patient-context-panel',
  templateUrl: './patient-context-panel.component.html',
  styleUrls: ['./patient-context-panel.component.scss'],
})
export class PatientContextPanelComponent implements OnChanges {
  @Input() conversationId = '';
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();

  loading = false;
  patientLink: PatientLink | null = null;
  summary: PatientSummary | null = null;

  // Search state
  showSearch = false;
  searchQuery = '';
  searchResults: any[] = [];
  searchLoading = false;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && this.conversationId) {
      this.loadPatientContext();
    }
  }

  loadPatientContext() {
    if (!this.conversationId) return;
    this.loading = true;
    this.authService.getPatientLink(this.conversationId).subscribe({
      next: (res: any) => {
        const link = res?.data;
        if (link) {
          this.patientLink = link;
          this.loadSummary();
        } else {
          this.patientLink = null;
          this.summary = null;
          this.loading = false;
        }
      },
      error: () => {
        this.patientLink = null;
        this.summary = null;
        this.loading = false;
      },
    });
  }

  private loadSummary() {
    this.authService.getPatientSummary(this.conversationId).subscribe({
      next: (res: any) => {
        this.summary = res?.data ?? null;
        this.loading = false;
      },
      error: () => {
        this.summary = null;
        this.loading = false;
      },
    });
  }

  openSearch() {
    this.showSearch = true;
    this.searchQuery = '';
    this.searchResults = [];
  }

  closeSearch() {
    this.showSearch = false;
  }

  searchPatients() {
    if (!this.searchQuery.trim()) return;
    this.searchLoading = true;
    this.authService.searchPccPatients(this.searchQuery).subscribe({
      next: (res: any) => {
        this.searchResults = res?.data ?? [];
        this.searchLoading = false;
      },
      error: () => {
        this.searchResults = [];
        this.searchLoading = false;
      },
    });
  }

  linkPatient(patient: any) {
    const name = patient.name || patient.fullName || 'Unknown';
    const patientId = patient.patientId || patient._id;
    this.authService
      .linkPatient(this.conversationId, patientId, patient.facilityId, name)
      .subscribe({
        next: () => {
          this.toastr.success(`Linked ${name} to this conversation`);
          this.showSearch = false;
          this.loadPatientContext();
        },
        error: () => {
          this.toastr.error('Failed to link patient');
        },
      });
  }

  unlinkPatient() {
    if (!this.patientLink) return;
    const name = this.patientLink.patientName || 'Patient';
    this.authService.unlinkPatient(this.conversationId).subscribe({
      next: () => {
        this.toastr.success(`Unlinked ${name}`);
        this.patientLink = null;
        this.summary = null;
      },
      error: () => {
        this.toastr.error('Failed to unlink patient');
      },
    });
  }

  closePanel() {
    this.close.emit();
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
