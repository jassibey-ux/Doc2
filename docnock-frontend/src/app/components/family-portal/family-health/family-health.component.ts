import { Component, Input, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-family-health',
  templateUrl: './family-health.component.html',
  styleUrls: ['./family-health.component.scss'],
})
export class FamilyHealthComponent implements OnInit {
  @Input() conversationId: string = '';

  loading: boolean = true;
  linked: boolean = false;
  patientName: string = '';
  vitals: any[] = [];
  medications: any[] = [];
  lastUpdated: string = '';
  errorMessage: string = '';

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {
    this.loadHealthData();
  }

  loadHealthData() {
    this.loading = true;
    this.errorMessage = '';

    this.authService.getFamilyHealth().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.linked = res.data.linked;
          this.patientName = res.data.patientName || '';
          this.vitals = res.data.vitals || [];
          this.medications = res.data.medications || [];
          this.lastUpdated = res.data.lastUpdated || '';
          this.errorMessage = res.data.error || '';
        }
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Unable to load health data. Please try again.';
        this.loading = false;
      },
    });
  }

  refresh() {
    this.loadHealthData();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  getVitalIcon(type: string): string {
    const icons: Record<string, string> = {
      'blood_pressure': 'bx-heart',
      'heart_rate': 'bx-pulse',
      'temperature': 'bx-sun',
      'respiratory_rate': 'bx-wind',
      'oxygen_saturation': 'bxs-droplet',
      'weight': 'bx-body',
      'height': 'bx-ruler',
      'bmi': 'bx-calculator',
    };
    return icons[type?.toLowerCase()] || 'bx-plus-medical';
  }

  getVitalLabel(type: string): string {
    const labels: Record<string, string> = {
      'blood_pressure': 'Blood Pressure',
      'heart_rate': 'Heart Rate',
      'temperature': 'Temperature',
      'respiratory_rate': 'Respiratory Rate',
      'oxygen_saturation': 'O2 Saturation',
      'weight': 'Weight',
      'height': 'Height',
      'bmi': 'BMI',
    };
    return labels[type?.toLowerCase()] || type || 'Vital';
  }
}
