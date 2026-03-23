import { Component, OnInit } from '@angular/core';
import {
  FormGroup,
  FormControl,
  Validators,
  ValidatorFn,
  AbstractControl
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from '../../../services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-account-setting',
  templateUrl: './account-setting.component.html',
  styleUrls: ['./account-setting.component.scss']
})
export class AccountSettingComponent {
  changePassword!: FormGroup;
  profileSetup!: FormGroup;
  backendUrl = environment.backEndUrl;

  activeTab: string = 'profile'; // Default active tab
  public hasAddressChanged = false;
  latitude:any=0;
  longitude:any=0;
  previewUrl: string | ArrayBuffer | null = null;
  profileName: any;
  role: any;

  // Security tab
  mfaEnabled: boolean = false;
  mfaLoading: boolean = false;
  activeSessions: any[] = [];
  sessionsLoading: boolean = false;
  loginHistory: any[] = [];
  loginHistoryLoading: boolean = false;
  currentSessionId: string = '';

  showTab(tab: string) {
    this.activeTab = tab; // Update active tab
    if (tab === 'security') {
      this.loadSecurityData();
    }
  }

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService

    // private location: Location
  ) {}

  ngOnInit(): void{
    this.getUserById();
    this.changePassword = new FormGroup({
      oldPassword:new FormControl('',[Validators.required]),
      newpassword: new FormControl('', [Validators.required]),
      confirmpassword: new FormControl('', [Validators.required]),

    },
    { validators: this.passwordMatchValidator })

    this.profileSetup = new FormGroup({

      profileUpload: new FormControl(null),
      name: new FormControl('', [Validators.required]),
      mobile: new FormControl({value:'',disabled: true }, [
        Validators.required,
        Validators.pattern(/^\d{10}$/)
      ]),
      email: new FormControl('', [Validators.required, Validators.email]),
      location: new FormControl('',[Validators.required]),
      geolocation: new FormControl(false),

    },
    { updateOn: 'blur' })
  }
 

  passwordMatchValidator: ValidatorFn = (group: AbstractControl): { [key: string]: boolean } | null => {
    const newPassword = group.get('newpassword')?.value;
    const confirmPassword = group.get('confirmpassword')?.value;
    
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      return { passwordsDoNotMatch: true };
    }
    return null;
  };
  onSubmit() {
    console.log("check inside");
    

    if (this.changePassword.invalid) {
      this.changePassword.markAllAsTouched(); // Show errors if form is invalid
      return;
    }
    console.log(this.changePassword,"111");
    
    if (this.changePassword.valid) {
      console.log('Form Submitted:', this.changePassword.value);
      const requestPayload = {
        oldPassword: this.changePassword.get("oldPassword")?.value || "",
        newPassword: this.changePassword.get("newpassword")?.value || ""
      };


      this.authService.changePassword(requestPayload).subscribe({
       next:(res:any)=>{
         if(res.success){
          this.toastr.success(res.message);
          this.changePassword.reset();
         }else{
          this.toastr.error(res.message);
         }
       },
       error:(err:any)=>{
        this.toastr.error(err.error.message);
       }
      });
    
    } else {
      console.error('Form is invalid!');
    }
  }

  get formControls() {
    return this.profileSetup.controls;
  }

  public handleAddressChange(place: google.maps.places.PlaceResult) {
    this.latitude = place.geometry?.location?.lat();
    this.longitude = place.geometry?.location?.lng();
    const address = place.formatted_address;
    if (address) {
      this.hasAddressChanged = true; // Flag the location as changed
      this.profileSetup.get('location')?.setValue(address); // Set the address
      this.profileSetup.get('location')?.setErrors(null); // Clear any errors
    }
  }

  cancel(){
    // this.location.back()
  }

  private markAllFieldsAsTouched() {
    Object.keys(this.profileSetup.controls).forEach((field) => {
      const control = this.profileSetup.get(field);
      control?.markAsTouched({ onlySelf: true });
    });
  }

  getLocationAddress(coordinates: number[]): string {
    return `Lat: ${coordinates[1]}, Lng: ${coordinates[0]}`; // Example format
  }

  getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map(part => part.charAt(0).toUpperCase()).join('');
  }

  getUserById() {
    this.authService.getUserById().subscribe((res:any) => {
      let response = this._coreService.decryptObjectData({ data: res.encryptDatauserdata
         });
      console.log('PROFILE DETAILS===>', response);
      this.profileName = response?.fullName;
      this.role = response?.role;
      if (response) {
        this.profileSetup.patchValue({
          name: response.fullName || '',
          mobile: response.mobile || '',
          email: response.email || '',
          location: response.address,
          geolocation: response.geoLocation || false,
        });
  
        // Set profile picture preview
        if (response.profilePicture?.savedName) {
          const savedName = response.profilePicture.savedName;
          this.previewUrl =
            savedName.startsWith('http')
              ? savedName
              : `${this.backendUrl}/user-uploads/profiles/${savedName}`;
        }
        this.hasAddressChanged = true;
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Generate a preview URL using FileReader
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl = reader.result; // Set the preview URL
        this.profileSetup.patchValue({ profileUpload: file });
      };
      reader.readAsDataURL(file); // Read the file as a Data URL
    }
  }

  triggerFileInput(): void {
    const inputElement = document.getElementById('profile-upload') as HTMLInputElement;
    inputElement.click(); // Programmatically trigger the file input click
  }
  profileSetupSubmit() {
    if (!this.hasAddressChanged) {
      // Manually add an error if the location hasn't been selected
      this.profileSetup.get('location')?.setErrors({ invalidAddress: true });
    }

    if (this.profileSetup.valid) {
      console.log('Form Submitted:', this.profileSetup.value);
      let formData = new FormData();
      formData.append("fullName", this.profileSetup.get("name")?.value || "");
      formData.append("email", this.profileSetup.get("email")?.value || "");
      formData.append("mobile", this.profileSetup.get("mobile")?.value || "");
      formData.append("address", this.profileSetup.get("location")?.value || "");
      formData.append("lat", this.latitude?.toString() || ""); // Ensure lat is a string
      formData.append("long", this.longitude?.toString() || ""); // Ensure long is a string

      if(this.profileSetup.get("profileUpload")?.value != null)
        formData.append("profileImage", this.profileSetup.get("profileUpload")?.value);

      //formData.append("userIds",this.addAssistedLiving.get("name")?.value);
      //formData.append("rolename",);

      this.authService.updateUser(formData).subscribe({
       next:(res:any)=>{
         if(res.success){
          this.toastr.success(res.message);
          // this.location.back()
         }else{
          this.toastr.error(res.message);
         }
       },
       error:(err:any)=>{
        this.toastr.error(err.error.message);
       }
      });
    
    } else {
      console.error('Form is invalid!');
      this.markAllFieldsAsTouched()
    }
  }

  onLocationChange() {
    this.hasAddressChanged = false; // Reset if user modifies the input
    this.profileSetup
        .get('location')
        ?.setErrors({ invalidAddress: true });
    console.log("User modified the location, isEdited set to:", this.hasAddressChanged);
  }

  // ─── Security Tab ──────────────────────────────────────────────────────────

  loadSecurityData() {
    this.currentSessionId = localStorage.getItem('loginsessionid') || '';
    this.loadActiveSessions();
    this.loadLoginHistory();
  }

  toggleMfa() {
    this.mfaLoading = true;
    if (this.mfaEnabled) {
      // Disable MFA
      this.authService.setupMfa().subscribe({
        next: (res: any) => {
          this.mfaEnabled = false;
          this.mfaLoading = false;
          this.toastr.success('Two-Factor Authentication disabled');
        },
        error: (err: any) => {
          this.mfaLoading = false;
          this.toastr.error(err?.error?.message || 'Failed to disable 2FA');
        }
      });
    } else {
      // Enable MFA
      this.authService.setupMfa().subscribe({
        next: (res: any) => {
          this.mfaEnabled = true;
          this.mfaLoading = false;
          this.toastr.success('Two-Factor Authentication enabled');
        },
        error: (err: any) => {
          this.mfaLoading = false;
          this.toastr.error(err?.error?.message || 'Failed to enable 2FA');
        }
      });
    }
  }

  loadActiveSessions() {
    this.sessionsLoading = true;
    this.authService.getMyActiveSessions().subscribe({
      next: (res: any) => {
        this.activeSessions = res?.data || [];
        this.sessionsLoading = false;
      },
      error: (err: any) => {
        this.sessionsLoading = false;
        console.error('Failed to load sessions', err);
      }
    });
  }

  isCurrentSession(session: any): boolean {
    return session._id === this.currentSessionId || session.sessionId === this.currentSessionId;
  }

  getDeviceIcon(userAgent: string): string {
    if (!userAgent) return 'bx bx-laptop';
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'bx bx-mobile';
    }
    return 'bx bx-laptop';
  }

  revokeSessionById(sessionId: string) {
    this.authService.revokeMySession(sessionId).subscribe({
      next: (res: any) => {
        this.toastr.success(res?.message || 'Session revoked');
        this.loadActiveSessions();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to revoke session');
      }
    });
  }

  revokeAllOtherSessions() {
    this.authService.revokeAllOtherSessions().subscribe({
      next: (res: any) => {
        this.toastr.success(res?.message || 'All other sessions revoked');
        this.loadActiveSessions();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to revoke sessions');
      }
    });
  }

  loadLoginHistory() {
    this.loginHistoryLoading = true;
    const userId = localStorage.getItem('userId') || '';
    this.authService.listLoginRecords(userId).subscribe({
      next: (res: any) => {
        this.loginHistory = res?.data || [];
        this.loginHistoryLoading = false;
      },
      error: (err: any) => {
        this.loginHistoryLoading = false;
        console.error('Failed to load login history', err);
      }
    });
  }
}
