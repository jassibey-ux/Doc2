import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-facility-setup-wizard',
  templateUrl: './facility-setup-wizard.component.html',
  styleUrls: ['./facility-setup-wizard.component.scss']
})
export class FacilitySetupWizardComponent implements OnInit {
  currentStep = 1;
  totalSteps = 5;
  facilityForm!: FormGroup;
  submitting = false;
  dynamicPath = '';

  facilityTypes = [
    { value: 'hospital', label: 'Hospital' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'senior_living', label: 'Senior Living' },
    { value: 'rehab', label: 'Rehabilitation' },
    { value: 'pediatric', label: 'Pediatric' },
    { value: 'other', label: 'Other' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.dynamicPath = this.route.parent?.snapshot.params['dynamicPath'] || 'superadmin';

    this.facilityForm = this.fb.group({
      // Step 1: Basic Info
      name: ['', [Validators.required, Validators.minLength(2)]],
      type: ['hospital', Validators.required],
      licenseNumber: [''],
      phone: [''],
      email: ['', Validators.email],

      // Step 2: Address
      street: [''],
      city: [''],
      state: [''],
      zip: [''],
      country: ['US'],

      // Step 3: Capacity
      totalBeds: [0, [Validators.min(0)]],
      icuBeds: [0, [Validators.min(0)]],

      // Step 4: Departments
      departments: this.fb.array([])
    });
  }

  get departments(): FormArray {
    return this.facilityForm.get('departments') as FormArray;
  }

  addDepartment() {
    this.departments.push(this.fb.group({
      name: ['', Validators.required],
      beds: [0, Validators.min(0)],
      nurses: [0, Validators.min(0)]
    }));
  }

  removeDepartment(index: number) {
    this.departments.removeAt(index);
  }

  nextStep() {
    if (this.canProceed()) {
      this.currentStep = Math.min(this.currentStep + 1, this.totalSteps);
    }
  }

  prevStep() {
    this.currentStep = Math.max(this.currentStep - 1, 1);
  }

  goToStep(step: number) {
    if (step < this.currentStep || this.canProceed()) {
      this.currentStep = step;
    }
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 1:
        const nameCtrl = this.facilityForm.get('name');
        const typeCtrl = this.facilityForm.get('type');
        return !!(nameCtrl?.valid && typeCtrl?.valid);
      case 2:
      case 3:
      case 4:
        return true;
      default:
        return true;
    }
  }

  getTypeLabel(value: string): string {
    const found = this.facilityTypes.find(t => t.value === value);
    return found ? found.label : value;
  }

  submitFacility() {
    if (this.submitting) return;
    this.submitting = true;

    const formVal = this.facilityForm.value;
    const payload = {
      name: formVal.name,
      type: formVal.type,
      licenseNumber: formVal.licenseNumber,
      phone: formVal.phone,
      email: formVal.email,
      location: [formVal.city, formVal.state].filter(Boolean).join(', '),
      address: {
        street: formVal.street,
        city: formVal.city,
        state: formVal.state,
        zip: formVal.zip,
        country: formVal.country
      },
      beds: formVal.totalBeds,
      icuBeds: formVal.icuBeds,
      departments: formVal.departments.map((d: any) => ({
        name: d.name,
        beds: d.beds,
        occupied: 0,
        nurses: d.nurses
      }))
    };

    this.authService.createFacility(payload).subscribe({
      next: (res: any) => {
        this.submitting = false;
        if (res.success) {
          this.toastr.success('Facility created successfully');
          this.router.navigate([`/${this.dynamicPath}/facilities`]);
        } else {
          this.toastr.error(res.message || 'Failed to create facility');
        }
      },
      error: (err: any) => {
        this.submitting = false;
        this.toastr.error(err?.error?.message || 'Failed to create facility');
      }
    });
  }
}
