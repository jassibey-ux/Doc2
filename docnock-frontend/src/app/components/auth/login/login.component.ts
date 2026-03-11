import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthServiceService } from '../../../services/auth-service.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthServiceService,
    private router: Router,
    private toastr: ToastrService
  ) {}
  passwordFieldType: string = 'password';

  ngOnInit() {
    this.initializeForm();
  }

  initializeForm() {
    this.loginForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]], // Validates 10-digit Indian mobile numbers
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }
  

  login() {
    if (this.loginForm.valid) {
      this.errorMessage = ''; // Clear previous errors
      this.isLoading = true;
      const { mobile, password } = this.loginForm.value;
      this.authService.login(mobile, password).subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res.success) {
            if (res.verify && res.token) {
              localStorage.setItem('auth_token', res.token);
              localStorage.setItem('role', res.role);
              localStorage.setItem('userId', res.userId);
              localStorage.setItem('loginsessionid', res.loginsessionid);
              this.toastr.success('Login successful!', 'Welcome', {
                timeOut: 3000,
                positionClass: 'toast-top-right',
              });
              let dynamicPath = this.authService.getRole();
              this.router.navigate([`${dynamicPath}`]);
            } else {
              this.router.navigate(['/otp-verification'], {
                queryParams: { mobile: mobile },
              });
            }
          } else {
            this.errorMessage = res.message || 'Login failed. Please try again.';
          }
        },
        error: (err) => {
          this.isLoading = false;
          console.log(`error`, err);
          let errorMessage = 'An error occurred during login. Please try again.';
          
          if (err.error && err.error.message) {
            errorMessage = err.error.message;
          } else if (err.message) {
            errorMessage = err.message;
          } else if (err.status === 0) {
            errorMessage = 'Unable to connect to the server. Please check your internet connection.';
          }
          
          this.errorMessage = errorMessage;
        },
      });
    } else {
      this.loginForm.markAllAsTouched(); // Highlight invalid fields
      //alert('Please fill in valid login credentials.');
    }
  }
  togglePasswordVisibility() {
    this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
  }
}
