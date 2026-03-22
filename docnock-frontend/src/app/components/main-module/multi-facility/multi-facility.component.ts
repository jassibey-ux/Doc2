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
  showCreateModal = false;
  editingFacility: any = null;

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

    this.authService.listFacilities().subscribe({
      next: (res: any) => {
        const payload = res?.data;
        let raw: any[] = [];

        // Handle encrypted response: { data: encrypted, pagination: {...} }
        if (payload?.data && payload?.pagination) {
          try {
            raw = this.coreService.decryptObjectData(
              typeof payload.data === 'string' ? { data: [payload.data] } : payload.data
            ) || [];
          } catch {
            raw = Array.isArray(payload.data) ? payload.data : [];
          }
        } else if (Array.isArray(payload)) {
          raw = payload;
        }

        // Normalize facility data for display
        this.facilities = raw.map((f: any) => ({
          ...f,
          id: f._id,
          location: f.address ? `${f.address.city || ''}${f.address.state ? ', ' + f.address.state : ''}` : '',
          beds: f.capacity?.totalBeds || 0,
          occupancy: 0,
          patients: 0,
          staff: 0,
          activeAlerts: 0,
          criticalAlerts: 0,
          recentActivity: [],
          status: f.status === 'active' ? 'operational' : f.status,
        }));

        // Load stats for each facility
        this.facilities.forEach((facility, idx) => {
          this.authService.getFacilityStats(facility.id).subscribe({
            next: (statsRes: any) => {
              const stats = statsRes?.data;
              if (stats) {
                this.facilities[idx].staff = stats.staff || 0;
                this.facilities[idx].activeAlerts = stats.alerts || 0;
                this.facilities[idx].occupancy = stats.occupancy || 0;
                this.facilities[idx].recentHandoffs = stats.recentHandoffs || [];
                this.facilities[idx].onCallNow = stats.onCallNow || [];
                this.updateAggregates();
              }
            },
            error: () => {},
          });
        });

        this.updateAggregates();
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to load facilities');
        this.facilities = [];
        this.loading = false;
      },
    });
  }

  updateAggregates(): void {
    this.totalFacilities = this.facilities.length;
    this.totalPatients = this.facilities.reduce((sum: number, f: any) => sum + (f.patients || 0), 0);
    this.totalStaff = this.facilities.reduce((sum: number, f: any) => sum + (f.staff || 0), 0);
    this.totalAlerts = this.facilities.reduce((sum: number, f: any) => sum + (f.activeAlerts || 0), 0);
    const totalOcc = this.facilities.reduce((sum: number, f: any) => sum + (f.occupancy || 0), 0);
    this.avgOccupancy = this.facilities.length > 0 ? Math.round(totalOcc / this.facilities.length) : 0;
  }

  selectFacility(facility: any): void {
    this.selectedFacility = this.selectedFacility?.id === facility.id ? null : facility;
  }

  openCreateModal(): void {
    this.editingFacility = null;
    this.showCreateModal = true;
  }

  openEditModal(facility: any, event: Event): void {
    event.stopPropagation();
    this.editingFacility = facility;
    this.showCreateModal = true;
  }

  closeModal(): void {
    this.showCreateModal = false;
    this.editingFacility = null;
  }

  onFacilitySaved(): void {
    this.closeModal();
    this.loadFacilities();
  }

  confirmDelete(facility: any, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${facility.name}"? This action cannot be undone.`)) return;

    this.authService.deleteFacility(facility.id).subscribe({
      next: () => {
        this.toastr.success('Facility deleted');
        this.loadFacilities();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to delete facility');
      },
    });
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

  getTypeLabel(type: string): string {
    const labels: any = {
      hospital: 'Hospital', clinic: 'Clinic', senior_living: 'Senior Living',
      rehab: 'Rehabilitation', pediatric: 'Pediatric', other: 'Other',
    };
    return labels[type] || type;
  }
}
