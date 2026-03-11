import { Component } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import {
  FormGroup,
  FormControl,
  Validators,
  ValidatorFn,
  AbstractControl
} from '@angular/forms';
import { BranchService } from 'src/app/services/branch.service';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
@Component({
  selector: 'app-setup-profile',
  templateUrl: './setup-profile.component.html',
  styleUrls: ['./setup-profile.component.scss']
})
export class SetupProfileComponent {
  profileName: any;
  role: any;
  profileSetup!: FormGroup;
  name:any;
  branchToken:any;
  error:boolean=false;
  errorshow:boolean=false;
  message:string='';
  profileImage: string | null = null;


  constructor(
    private authService: AuthServiceService,
    private _coreService: CoreService,
    private branchService: BranchService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  applyTheme(isDarkMode: boolean): void {
    const root = document.documentElement;
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);
  
    if (isDarkMode) {
      root.style.setProperty('--bg', 'var(--darkmode-bg)');
      root.style.setProperty('--bg-light', 'var(--darkmode-bg-light)');
      root.style.setProperty('--p', 'var(--darkmode-p)');
      root.style.setProperty('--line', 'var(--darkmode-line)');
      root.style.setProperty('--scrollbar', 'var(--darkmode-scrollbar)');
      root.style.setProperty('--h', 'var(--darkmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#1f8f67');
      root.style.setProperty('--bubble-received-bg', '#1e2430');
    } else {
      root.style.setProperty('--bg', 'var(--lightmode-bg)');
      root.style.setProperty('--bg-light', 'var(--lightmode-bg-light)');
      root.style.setProperty('--p', 'var(--lightmode-p)');
      root.style.setProperty('--line', 'var(--lightmode-line)');
      root.style.setProperty('--scrollbar', 'var(--lightmode-scrollbar)');
      root.style.setProperty('--h', 'var(--lightmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#dcf8c6');
      root.style.setProperty('--bubble-received-bg', '#ffffff');
    }
  }
  ngOnInit(): void {
   console.log('typeof errorshow:', typeof this.errorshow);
   console.log('typeof errorshow', this.errorshow);

    console.log(`this.authService.getToken()`,this.authService.getToken() );
    if(this.authService.getToken() != null){
      this.error = true
    }
    this.branchService.getBranchData()
      .then((data) => {
        console.log('Branch Data:', data.data);
        if (data && data.data) {
         this.branchToken = JSON.parse(data.data).custom_data.token; // JWT token
         let type = JSON.parse(data.data).custom_data.type;
         this.authService.verifylink({ token: this.branchToken, type: type }).subscribe({
          next: (res: any) => {
            if (res.success) {
              this.getUserById(this.branchToken);
              this.errorshow = true;
            } else {
              this.errorshow = false;
              this.message = res.message;
            }
          },
          error: (err: any) => {
            this.errorshow = false;
            this.message = err?.error?.message || 'Something went wrong';
          }
        });
        }
      })
      .catch((error) => {
        console.error('Error getting Branch data:', error);
      });
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyTheme(isDarkMode);  // Apply the stored theme preference
    const darkModeToggle = document.getElementById('darkModeToggle') as HTMLInputElement;
    if (darkModeToggle) {
      darkModeToggle.checked = isDarkMode;  // Set the toggle to reflect the saved state
    }

    this.profileSetup = new FormGroup({

      name: new FormControl({value:'',disabled:true}),
      mobile: new FormControl({value:'',disabled:true}),
      email: new FormControl({value:'',disabled:true}),
      location: new FormControl({value:'',disabled:true}),
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(6),
      ]),
      confirmpassword: new FormControl('', Validators.required),

    },
    { validators: this.profilepasswordMatchValidator })
  }

  profilepasswordMatchValidator: ValidatorFn = (group: AbstractControl): { [key: string]: boolean } | null => {
    const newPassword = group.get('password')?.value;
    const confirmPassword = group.get('confirmpassword')?.value;
    if (newPassword && confirmPassword && newPassword !== confirmPassword) { 
      return { passwordMismatch: true };
    }
    return null;
  };

  getUserById(token:any) {
    this.authService.getUserByIdwithToken(token).subscribe((res:any) => {
      let response = this._coreService.decryptObjectData({ data: res.encryptDatauserdata
         });
         console.log(response,"responseresponse");
         
    this.name = response?.fullName
     this.profileImage = response?.profilePicture?.savedName || null;
      this.profileSetup.patchValue({
        name: response?.fullName,
        mobile: response?.mobile,
        email: response?.email,
        location: response?.address
      });
    });
  }

  onSubmit(){
    if (this.profileSetup.invalid) {
      this.profileSetup.markAllAsTouched(); // Show validation errors
      return;
    }
    let requestPayload ={
      newPassword:this.profileSetup.get('password')?.value ?? 'Admin@123',
      token:this.branchToken
    }

    this.authService.resetPassword(requestPayload).subscribe({
      next:(res:any)=>{
        if(res.success){
         this.toastr.success(res.message);
         this.router.navigate(['']);
        }else{
         this.toastr.error(res.message);
        }
      },
      error:(err:any)=>{
       this.toastr.error(err.error.message);
      }
     });
  }

  getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map(part => part.charAt(0).toUpperCase()).join('');
  }
}
