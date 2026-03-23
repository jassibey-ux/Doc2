import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-otp-verification',
  templateUrl: './otp-verification.component.html',
  styleUrls: ['./otp-verification.component.scss']
})
export class OtpVerificationComponent implements OnInit, OnDestroy {
  otpValue: string = '';
  config = {
    allowNumbersOnly: true,
    length: 6,

    disableAutoFocus: false,
    placeholder: "0",
  }
  isDisabled: Boolean = true;

  mobile!: string;

  // Resend timer
  resendCountdown: number = 60;
  resendInterval: any = null;
  canResend: boolean = false;
  resendAttempts: number = 0;
  maxResendAttempts: number = 3;

  constructor(private route: ActivatedRoute,private authSerive:AuthServiceService) {}

  ngOnInit(): void {
    // Get the 'mobile' parameter from the query string
    this.route.queryParams.subscribe(params => {
      this.mobile = params['mobile'];
    });
    this.startResendTimer();
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  onOtpChnage(event: any) {
    if (event.length == 6) {
       this.isDisabled = false;
    }
  }

  verifyOtp(val: any) {
    if (val.currentVal.length == 6) {
      console.log(`val.currentVal`, val.currentVal);
      this.authSerive.otp(this.mobile,val.currentVal);
    }else{
      console.log(``, );
    }
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

  resendOTP() {
    if (!this.canResend || this.resendAttempts >= this.maxResendAttempts) {
      return;
    }
    this.resendAttempts++;
    this.authSerive.resendOTP(this.mobile).subscribe({
      next: (res: any) => {
        this.startResendTimer();
      },
      error: (err: any) => {
        console.error('Resend OTP failed', err);
      }
    });
  }
}
