import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-patient-status-board',
  templateUrl: './patient-status-board.component.html',
  styleUrls: ['./patient-status-board.component.scss'],
})
export class PatientStatusBoardComponent implements OnInit, OnDestroy {
  patients: any[] = [];
  filteredPatients: any[] = [];
  loading = true;

  // Filters
  unitFilter = '';
  statusFilter = '';
  searchQuery = '';

  // Units
  units: string[] = ['ICU', 'Med-Surg', 'Telemetry', 'ER', 'NICU', 'Pediatrics', 'Oncology', 'Cardiac'];

  // Status options
  statusOptions = [
    { value: 'stable', label: 'Stable', color: '#2f936d' },
    { value: 'guarded', label: 'Guarded', color: '#e6a817' },
    { value: 'serious', label: 'Serious', color: '#e67e22' },
    { value: 'critical', label: 'Critical', color: '#e74c3c' },
    { value: 'discharged', label: 'Discharged', color: '#95a5a6' },
  ];

  // KPI
  totalPatients = 0;
  criticalCount = 0;
  seriousCount = 0;
  dischargeReadyCount = 0;

  // View mode
  viewMode: 'grid' | 'list' = 'grid';

  // Auto-refresh
  private refreshInterval: any = null;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadPatients();
    this.refreshInterval = setInterval(() => this.loadPatients(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  loadPatients(): void {
    // In production, call API. For now, generate demo data
    this.loading = true;
    const rooms = ['101A','101B','102A','102B','103A','103B','104A','104B','105A','105B','106A','106B','201A','201B','202A','202B','203A','203B','204A','204B'];
    const names = ['Smith, J.','Johnson, M.','Williams, R.','Brown, K.','Jones, A.','Davis, L.','Miller, T.','Wilson, S.','Moore, D.','Taylor, C.','Anderson, P.','Thomas, N.','Jackson, B.','White, G.','Harris, E.','Martin, F.','Thompson, H.','Garcia, I.','Martinez, O.','Robinson, Q.'];
    const physicians = ['Dr. Chen','Dr. Patel','Dr. Rodriguez','Dr. Kim','Dr. Thompson','Dr. Williams'];
    const nurses = ['RN Garcia','RN Johnson','RN Smith','RN Lee','RN Brown','RN Davis'];
    const statuses = ['stable','stable','stable','guarded','guarded','serious','critical','stable','stable','discharged'];

    this.patients = rooms.map((room, i) => ({
      id: i + 1,
      name: names[i % names.length],
      room: room,
      unit: this.units[Math.floor(i / 3) % this.units.length],
      status: statuses[i % statuses.length],
      physician: physicians[i % physicians.length],
      nurse: nurses[i % nurses.length],
      admitDate: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      diagnosis: ['Pneumonia','CHF Exacerbation','Post-Op Hip','Acute MI','COPD Exacerbation','Sepsis','CVA','Diabetic Ketoacidosis','GI Bleed','Renal Failure'][i % 10],
      allergies: i % 3 === 0 ? 'NKDA' : ['Penicillin','Sulfa','Latex','Codeine'][i % 4],
      dietOrder: ['Regular','Cardiac','Diabetic','NPO','Clear Liquids'][i % 5],
      codeStatus: i % 5 === 0 ? 'DNR' : 'Full Code',
      fallRisk: i % 3 === 0,
      isolationPrecautions: i % 7 === 0 ? 'Contact' : (i % 11 === 0 ? 'Droplet' : ''),
      lastVitals: {
        bp: `${110 + Math.floor(Math.random() * 40)}/${60 + Math.floor(Math.random() * 30)}`,
        hr: 60 + Math.floor(Math.random() * 40),
        temp: (97 + Math.random() * 3).toFixed(1),
        spo2: 94 + Math.floor(Math.random() * 6),
        rr: 12 + Math.floor(Math.random() * 10),
      },
      lastVitalsTime: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    }));

    this.updateKPIs();
    this.applyFilters();
    this.loading = false;
  }

  updateKPIs(): void {
    this.totalPatients = this.patients.length;
    this.criticalCount = this.patients.filter(p => p.status === 'critical').length;
    this.seriousCount = this.patients.filter(p => p.status === 'serious').length;
    this.dischargeReadyCount = this.patients.filter(p => p.status === 'discharged').length;
  }

  applyFilters(): void {
    this.filteredPatients = this.patients.filter(p => {
      if (this.unitFilter && p.unit !== this.unitFilter) return false;
      if (this.statusFilter && p.status !== this.statusFilter) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.room.toLowerCase().includes(q) || p.diagnosis.toLowerCase().includes(q);
      }
      return true;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  getStatusColor(status: string): string {
    return this.statusOptions.find(s => s.value === status)?.color || '#95a5a6';
  }

  getStatusLabel(status: string): string {
    return this.statusOptions.find(s => s.value === status)?.label || status;
  }

  getTimeSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  toggleView(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }
}
