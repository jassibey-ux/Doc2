import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-email-verification',
  templateUrl: './email-verification.component.html',
  styleUrls: ['./email-verification.component.scss']
})
export class EmailVerificationComponent implements OnInit, OnDestroy {
  private baseUrl = environment.apiUrl;
  email: string = '';
  otpValue: string = '';
  config = {
    allowNumbersOnly: true,
    length: 6,
    disableAutoFocus: false,
    placeholder: '0',
  };
  isDisabled: boolean = true;

  // Resend timer
  resendCountdown: number = 60;
  resendInterval: any = null;
  canResend: boolean = false;
  resendAttempts: number = 0;
  maxResendAttempts: number = 3;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.email = this.route.snapshot.queryParams['email'] || '';
    this.startResendTimer();
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  onOtpChange(event: any) {
    this.otpValue = event;
    this.isDisabled = event.length !== 6;
  }

  verifyEmail() {
    if (this.otpValue.length !== 6) return;
    this.http.post(`${this.baseUrl}/verifyEmail`, {
      email: this.email,
      otp: this.otpValue
    }).subscribe({
      next: (res: any) => {
        this.toastr.success('Email verified successfully');
        this.router.navigate(['/login']);
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Verification failed. Please try again.');
      }
    });
  }

  resendCode() {
    if (!this.canResend || this.resendAttempts >= this.maxResendAttempts) return;
    this.resendAttempts++;
    this.http.post(`${this.baseUrl}/sendVerificationEmail`, {
      email: this.email
    }).subscribe({
      next: () => {
        this.toastr.success('Verification code sent');
        this.startResendTimer();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to resend code');
      }
    });
  }

  startResendTimer() {
    this.canResend = false;
    this.resendCountdown = 60;
    this.clearResendTimer();
    this.resendInterval = setInterval(() => {
      this.resendCountdown--;
      if (this.resendCountdown <= 0) {
        this.clearResendTimer();
        this.canResend = true;
      }
    }, 1000);
  }

  clearResendTimer() {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
      this.resendInterval = null;
    }
  }

  get formattedCountdown(): string {
    const seconds = this.resendCountdown;
    return `0:${seconds < 10 ? '0' : ''}${seconds}`;
  }
}
