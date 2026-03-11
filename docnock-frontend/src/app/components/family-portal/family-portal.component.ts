import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-family-portal',
  templateUrl: './family-portal.component.html',
  styleUrls: ['./family-portal.component.scss'],
})
export class FamilyPortalComponent implements OnInit {
  loading: boolean = true;
  error: string = '';
  verified: boolean = false;
  patientData: any = null;
  patientLoading: boolean = false;

  // Video request form
  showVideoRequest: boolean = false;
  videoPreferredTime: string = '';
  videoNotes: string = '';
  videoRequestSent: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthServiceService
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) {
      this.verifyLink(token);
    } else {
      // Already authenticated family member — load summary
      this.loading = false;
      this.verified = true;
      this.loadPatientSummary();
    }
  }

  verifyLink(token: string) {
    this.authService.verifyFamilyLink(token).subscribe({
      next: (res: any) => {
        if (res.success) {
          // Store the family token
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('role', 'family_member');
          localStorage.setItem('userId', res.data.userId);
          this.verified = true;
          this.loadPatientSummary();
        } else {
          this.error = res.message || 'Verification failed';
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'This link is invalid or has expired.';
        this.loading = false;
      },
    });
  }

  loadPatientSummary() {
    this.patientLoading = true;
    this.authService.getFamilyPatientSummary().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.patientData = res.data;
        }
        this.patientLoading = false;
      },
      error: () => {
        this.patientLoading = false;
      },
    });
  }

  requestVideoVisit() {
    this.authService.requestFamilyVideoVisit({
      preferredTime: this.videoPreferredTime,
      notes: this.videoNotes,
    }).subscribe({
      next: () => {
        this.videoRequestSent = true;
        this.showVideoRequest = false;
      },
      error: () => {
        this.error = 'Failed to send video visit request.';
      },
    });
  }
}
