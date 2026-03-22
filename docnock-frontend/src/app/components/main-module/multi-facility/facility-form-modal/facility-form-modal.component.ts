import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-facility-form-modal',
  templateUrl: './facility-form-modal.component.html',
  styleUrls: ['./facility-form-modal.component.scss'],
})
export class FacilityFormModalComponent implements OnInit {
  @Input() facility: any = null; // null = create mode, object = edit mode
  @Output() save = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  saving = false;
  isEditMode = false;

  form: any = {
    name: '',
    type: 'other',
    status: 'active',
    licenseNumber: '',
    phone: '',
    fax: '',
    email: '',
    address: { street: '', city: '', state: '', zip: '', country: 'US' },
    capacity: { totalBeds: 0, icuBeds: 0 },
  };

  facilityTypes = [
    { value: 'hospital', label: 'Hospital' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'senior_living', label: 'Senior Living' },
    { value: 'rehab', label: 'Rehabilitation' },
    { value: 'pediatric', label: 'Pediatric' },
    { value: 'other', label: 'Other' },
  ];

  statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    if (this.facility) {
      this.isEditMode = true;
      this.form = {
        name: this.facility.name || '',
        type: this.facility.type || 'other',
        status: this.facility.status === 'operational' ? 'active' : (this.facility.status || 'active'),
        licenseNumber: this.facility.licenseNumber || '',
        phone: this.facility.phone || '',
        fax: this.facility.fax || '',
        email: this.facility.email || '',
        address: {
          street: this.facility.address?.street || '',
          city: this.facility.address?.city || '',
          state: this.facility.address?.state || '',
          zip: this.facility.address?.zip || '',
          country: this.facility.address?.country || 'US',
        },
        capacity: {
          totalBeds: this.facility.capacity?.totalBeds || this.facility.beds || 0,
          icuBeds: this.facility.capacity?.icuBeds || 0,
        },
      };
    }
  }

  onSubmit(): void {
    if (!this.form.name?.trim()) {
      this.toastr.error('Facility name is required');
      return;
    }

    this.saving = true;

    const payload = { ...this.form };

    if (this.isEditMode) {
      this.authService.updateFacility(this.facility.id || this.facility._id, payload).subscribe({
        next: () => {
          this.toastr.success('Facility updated');
          this.saving = false;
          this.save.emit();
        },
        error: (err: any) => {
          this.toastr.error(err?.error?.message || 'Failed to update facility');
          this.saving = false;
        },
      });
    } else {
      this.authService.createFacility(payload).subscribe({
        next: () => {
          this.toastr.success('Facility created');
          this.saving = false;
          this.save.emit();
        },
        error: (err: any) => {
          this.toastr.error(err?.error?.message || 'Failed to create facility');
          this.saving = false;
        },
      });
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
