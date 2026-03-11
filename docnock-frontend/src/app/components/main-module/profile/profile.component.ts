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

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {
  profileSetup!: FormGroup;
  profileName: any;
  role: any;
  previewUrl: string | ArrayBuffer | null = null;
  latitude:any=0;
  longitude:any=0;
  public hasAddressChanged = false; 


  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService

    // private location: Location
  ) {}
  ngOnInit(): void{
    this.getUserById();

    this.profileSetup = new FormGroup({

      profileUpload: new FormControl(null),
      name: new FormControl('', [Validators.required]),
      mobile: new FormControl('', [
        Validators.required,
        Validators.pattern(/^\d{10}$/)
      ]),
      email: new FormControl('', [Validators.required, Validators.email]),
      location: new FormControl('',[Validators.required]),
      geolocation: new FormControl(false),

    },
    { updateOn: 'blur' })
  }
  getUserById() {
    this.authService.getUserById().subscribe((res:any) => {
      let response = this._coreService.decryptObjectData({ data: res.encryptDatauserdata
         });
      //console.log('PROFILE DETAILS===>', response);
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
          this.previewUrl = response.profilePicture.savedName;
        }
      }
    });
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

  private markAllFieldsAsTouched() {
    Object.keys(this.profileSetup.controls).forEach((field) => {
      const control = this.profileSetup.get(field);
      control?.markAsTouched({ onlySelf: true });
    });
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
}
