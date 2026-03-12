import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-multi-facility',
  templateUrl: './multi-facility.component.html',
  styleUrls: ['./multi-facility.component.scss'],
})
export class MultiFacilityComponent implements OnInit, OnDestroy {
  facilities: any[] = [];
  loading = true;

  // Aggregate KPIs
  totalFacilities = 0;
  totalPatients = 0;
  totalStaff = 0;
  totalAlerts = 0;
  avgOccupancy = 0;

  // View
  selectedFacility: any = null;

  private refreshInterval: any = null;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadFacilities();
    this.refreshInterval = setInterval(() => this.loadFacilities(), 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  loadFacilities(): void {
    this.loading = true;

    this.facilities = [
      {
        id: 1, name: 'DocNock Central Hospital', location: 'San Francisco, CA',
        type: 'General Hospital', beds: 320, occupancy: 87,
        patients: 278, staff: 450, activeAlerts: 5, criticalAlerts: 1,
        departments: [
          { name: 'ICU', beds: 40, occupied: 38, nurses: 24 },
          { name: 'Med-Surg', beds: 80, occupied: 68, nurses: 32 },
          { name: 'ER', beds: 30, occupied: 22, nurses: 18 },
          { name: 'Pediatrics', beds: 45, occupied: 35, nurses: 20 },
          { name: 'Cardiac', beds: 35, occupied: 32, nurses: 16 },
        ],
        recentActivity: [
          { type: 'alert', message: 'Critical alert: ICU bed shortage', time: '5m ago', severity: 'critical' },
          { type: 'admission', message: '3 new admissions in last hour', time: '15m ago', severity: 'info' },
          { type: 'discharge', message: '5 patients discharged today', time: '1h ago', severity: 'info' },
        ],
        status: 'operational',
      },
      {
        id: 2, name: 'DocNock Westside Clinic', location: 'Oakland, CA',
        type: 'Outpatient Clinic', beds: 80, occupancy: 62,
        patients: 50, staff: 85, activeAlerts: 2, criticalAlerts: 0,
        departments: [
          { name: 'Primary Care', beds: 25, occupied: 18, nurses: 12 },
          { name: 'Urgent Care', beds: 15, occupied: 10, nurses: 8 },
          { name: 'Rehab', beds: 20, occupied: 14, nurses: 10 },
          { name: 'Imaging', beds: 20, occupied: 8, nurses: 6 },
        ],
        recentActivity: [
          { type: 'staffing', message: '2 nurses called in sick', time: '30m ago', severity: 'warning' },
          { type: 'admission', message: '12 appointments scheduled', time: '1h ago', severity: 'info' },
        ],
        status: 'operational',
      },
      {
        id: 3, name: 'DocNock Senior Living East', location: 'Berkeley, CA',
        type: 'Senior Living Facility', beds: 150, occupancy: 93,
        patients: 140, staff: 180, activeAlerts: 8, criticalAlerts: 2,
        departments: [
          { name: 'Memory Care', beds: 40, occupied: 39, nurses: 20 },
          { name: 'Assisted Living', beds: 60, occupied: 56, nurses: 24 },
          { name: 'Skilled Nursing', beds: 50, occupied: 45, nurses: 30 },
        ],
        recentActivity: [
          { type: 'alert', message: 'Fall alert in Memory Care wing', time: '2m ago', severity: 'critical' },
          { type: 'alert', message: 'Medication error flagged', time: '20m ago', severity: 'warning' },
          { type: 'handoff', message: 'Night shift handoff completed', time: '2h ago', severity: 'info' },
        ],
        status: 'attention',
      },
      {
        id: 4, name: 'DocNock North Valley', location: 'Walnut Creek, CA',
        type: 'General Hospital', beds: 200, occupancy: 75,
        patients: 150, staff: 280, activeAlerts: 3, criticalAlerts: 0,
        departments: [
          { name: 'ICU', beds: 20, occupied: 16, nurses: 12 },
          { name: 'Med-Surg', beds: 60, occupied: 45, nurses: 24 },
          { name: 'Maternity', beds: 30, occupied: 22, nurses: 16 },
          { name: 'Oncology', beds: 40, occupied: 30, nurses: 18 },
          { name: 'ER', beds: 25, occupied: 18, nurses: 14 },
        ],
        recentActivity: [
          { type: 'admission', message: '2 emergency admissions', time: '10m ago', severity: 'info' },
          { type: 'discharge', message: '8 patients discharged today', time: '3h ago', severity: 'info' },
        ],
        status: 'operational',
      },
      {
        id: 5, name: 'DocNock Pediatric Center', location: 'Palo Alto, CA',
        type: 'Pediatric Hospital', beds: 120, occupancy: 68,
        patients: 82, staff: 160, activeAlerts: 1, criticalAlerts: 0,
        departments: [
          { name: 'NICU', beds: 30, occupied: 22, nurses: 18 },
          { name: 'PICU', beds: 20, occupied: 14, nurses: 12 },
          { name: 'General Peds', beds: 40, occupied: 28, nurses: 16 },
          { name: 'Adolescent', beds: 30, occupied: 18, nurses: 10 },
        ],
        recentActivity: [
          { type: 'admission', message: '4 new NICU admissions', time: '45m ago', severity: 'info' },
        ],
        status: 'operational',
      },
    ];

    this.updateAggregates();
    this.loading = false;
  }

  updateAggregates(): void {
    this.totalFacilities = this.facilities.length;
    this.totalPatients = this.facilities.reduce((sum, f) => sum + f.patients, 0);
    this.totalStaff = this.facilities.reduce((sum, f) => sum + f.staff, 0);
    this.totalAlerts = this.facilities.reduce((sum, f) => sum + f.activeAlerts, 0);
    this.avgOccupancy = Math.round(this.facilities.reduce((sum, f) => sum + f.occupancy, 0) / this.facilities.length);
  }

  selectFacility(facility: any): void {
    this.selectedFacility = this.selectedFacility?.id === facility.id ? null : facility;
  }

  getOccupancyColor(pct: number): string {
    if (pct >= 90) return '#e74c3c';
    if (pct >= 75) return '#e6a817';
    return '#2f936d';
  }

  getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return 'bx bxs-error-circle';
      case 'warning': return 'bx bx-error';
      default: return 'bx bx-info-circle';
    }
  }
}
