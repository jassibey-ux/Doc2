import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-otp-verification',
  templateUrl: './otp-verification.component.html',
  styleUrls: ['./otp-verification.component.scss']
})
export class OtpVerificationComponent implements OnInit{
  otpValue: string = '';
  config = {
    allowNumbersOnly: true,
    length: 6,

    disableAutoFocus: false,
    placeholder: "0",
  }
  isDisabled: Boolean = true;

  mobile!: string;

  constructor(private route: ActivatedRoute,private authSerive:AuthServiceService) {}

  ngOnInit(): void {
    // Get the 'mobile' parameter from the query string
    this.route.queryParams.subscribe(params => {
      this.mobile = params['mobile'];
    });
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
}
