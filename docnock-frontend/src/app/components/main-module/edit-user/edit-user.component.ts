import { Component, OnInit, ViewChild } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AuthServiceService } from '../../../services/auth-service.service';
import { ActivatedRoute } from '@angular/router';
import { NgxGpAutocompleteDirective } from '@angular-magic/ngx-gp-autocomplete';
import { ToastrService } from 'ngx-toastr';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss']
})
export class EditUserComponent implements OnInit {
  isOpen = false;
  addAssistedLiving!: FormGroup;
  isSubmitted = false;
  routeSegment: string = '';
  @ViewChild('ngxPlaces') placesRef!: NgxGpAutocompleteDirective;
  showSelectUser: boolean = false;
  showRoleName: boolean = false;
  dynamicPath: any = '';
  dynamicPathDetails: string = '';
  public hasAddressChanged = false;
  latitude: any = 0;
  longitude: any = 0;
  previewUrl: string | ArrayBuffer | null = null;

  //selector
  diagnosisList: any[] = [];
  patientSelectedIds: any[] = [];
  loading: boolean = false;
  multiple: boolean = false;
  decryptedId:any="";

  constructor(
    private authService: AuthServiceService,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private location: Location,
    private _coreService: CoreService
  ) {}
  ngOnInit(): void {
    this.route.params.subscribe((params: any) => {
      this.dynamicPath = this.authService.getRole();
      this.dynamicPathDetails = params['dynamicPathDetails']; // Access the dynamic path value

      if(this.dynamicPath == 'superadmin'){
      if (this.dynamicPathDetails != 'facilitycenter') {
        this.showSelectUser = true;
        this.getList('facility_center');
        if (this.dynamicPathDetails == 'physician') {
          this.multiple = true;
        } else {
          this.multiple = false;
        }
      }
    }

      if(this.dynamicPathDetails == 'other'){
        this.showRoleName = true
      }

      this.route.queryParams.subscribe(params => {
        if (params['id']) {
          this.decryptedId = this._coreService.decrypt(params['id']);
        }
      });
      if(this.showSelectUser == false){
        this.getUserDetails(this.decryptedId)
      }
    });

    this.addAssistedLiving = new FormGroup({
      profileUpload: new FormControl(null),
      name: new FormControl('', [Validators.required]),
      mobile: new FormControl({value:'',disabled: true}, [
        Validators.required,
        Validators.pattern(/^\d{10}$/),
      ]),
      email: new FormControl('', [Validators.required, Validators.email]),
      location: new FormControl('', [Validators.required]),
      geolocation: new FormControl(false),
      roleName: new FormControl(''),
      selectUser: new FormControl(null),
    });

    if (this.showSelectUser) {
      this.addAssistedLiving
        .get('selectUser')
        ?.setValidators(Validators.required);
    } else {
      this.addAssistedLiving.get('selectUser')?.clearValidators();
    }
    this.addAssistedLiving.get('selectUser')?.updateValueAndValidity();

    if (this.showRoleName) {
      this.addAssistedLiving
        .get('roleName')
        ?.setValidators(Validators.required);
    } else {
      this.addAssistedLiving.get('roleName')?.clearValidators();
    }
    this.addAssistedLiving.get('roleName')?.updateValueAndValidity();
  }

  get formControls() {
    return this.addAssistedLiving.controls;
  }

  onSubmit() {
    if (!this.hasAddressChanged) {
      // Manually add an error if the location hasn't been selected
      this.addAssistedLiving
        .get('location')
        ?.setErrors({ invalidAddress: true });
    }

    if (this.addAssistedLiving.valid) {
      let formData = new FormData();
      formData.append(
        'fullName',
        this.addAssistedLiving.get('name')?.value || ''
      );
      formData.append(
        'editId',
        this.decryptedId
      );
      formData.append(
        'email',
        this.addAssistedLiving.get('email')?.value || ''
      );
      formData.append(
        'address',
        this.addAssistedLiving.get('location')?.value || ''
      );
      formData.append('role', this.getRole(this.dynamicPathDetails) || '');
      formData.append('lat', this.latitude?.toString() || ''); // Ensure lat is a string
      formData.append('long', this.longitude?.toString() || ''); // Ensure long is a string
      formData.append(
        'geoLocation',
        this.addAssistedLiving.get('geolocation')?.value || false
      );

      if (this.addAssistedLiving.get('profileUpload')?.value != null)
        formData.append(
          'profileImage',
          this.addAssistedLiving.get('profileUpload')?.value
        );

      if(this.showSelectUser){
      const selectedUser = this.addAssistedLiving.get('selectUser')?.value;
      if (selectedUser) {
        if (Array.isArray(selectedUser)) {
          const userIds = selectedUser.map((user) => user._id);
          formData.append('userIds', JSON.stringify(userIds)); // Convert to JSON string if multiple values
        } else {
          formData.append('userIds', JSON.stringify([selectedUser._id]));
        }
      }
    }
      if(this.showRoleName)
       formData.append("rolename",this.addAssistedLiving.get('roleName')?.value);

      this.authService.updateUser(formData).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.toastr.success(res.message);
            this.location.back();
            //this.getUserDetails(this.decryptedId)
          } else {
            this.toastr.error(res.message);
          }
        },
        error: (err: any) => {
          this.toastr.error(err.error.message);
        },
      });
    } else {
      console.error('Form is invalid!');
      this.markAllFieldsAsTouched();
    }
  }

  public handleAddressChange(place: google.maps.places.PlaceResult) {
    this.latitude = place.geometry?.location?.lat();
    this.longitude = place.geometry?.location?.lng();
    const address = place.formatted_address;
    if (address) {
      this.hasAddressChanged = true; // Flag the location as changed
      this.addAssistedLiving.get('location')?.setValue(address); // Set the address
      this.addAssistedLiving.get('location')?.setErrors(null); // Clear any errors
    }
  }

  getTitle(dynamic: any) {
    return dynamic === 'facilitycenter'
      ? 'Facility Center'
      : dynamic === 'subadmin'
      ? 'Sub-Admin'
      : dynamic;
  }

  // Mark all fields as touched to show validation errors
  private markAllFieldsAsTouched() {
    Object.keys(this.addAssistedLiving.controls).forEach((field) => {
      const control = this.addAssistedLiving.get(field);
      control?.markAsTouched({ onlySelf: true });
    });
  }

  getRole(dynamic: any) {
    return dynamic === 'facilitycenter' ? 'facility_center' : dynamic;
  }

  cancel() {
    this.location.back();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Generate a preview URL using FileReader
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl = reader.result; // Set the preview URL
        this.addAssistedLiving.patchValue({ profileUpload: file });
      };
      reader.readAsDataURL(file); // Read the file as a Data URL
    }
  }

  triggerFileInput(): void {
    const inputElement = document.getElementById(
      'profile-upload'
    ) as HTMLInputElement;
    inputElement.click(); // Programmatically trigger the file input click
  }

  // Selector
  loadMoreItems(): void {
    this.getList('nurse');
  }
  private selectionChangeSubject = new Subject<any>();
  onSelectionChange(selected: any): void {
    let previousValue = this.patientSelectedIds.length
      ? this.patientSelectedIds[0]
      : null;

    if (this.multiple) {
      this.patientSelectedIds = Array.isArray(selected) ? selected : [];
    } else {
      this.patientSelectedIds = selected ? [selected] : [];
    }

    if (this.patientSelectedIds[0] !== previousValue) {
      this.selectionChangeSubject.next(this.patientSelectedIds[0]); // Debounced call
    }
  }

  compareFn(item1: any, item2: any): boolean {
    return item1 && item2 ? item1._id === item2._id : item1 === item2;
  }

  removeItem(item: any): void {
    this.patientSelectedIds = this.patientSelectedIds.filter(
      (id) => id !== item._id
    );
  }

  onSearch(searchTerm: string): void {
    //this.searchSubject.next(searchTerm);
  }

  getList(role: any, limit = '', page = '', searchKey = '', status = '') {
    this.authService.getList(role,1000).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.diagnosisList = response;
          console.log(this.diagnosisList);
          
          this.getUserDetails(this.decryptedId)
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }

  getUserDetails(userId:any='') {
    this.authService.getUserById(userId).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          
          this.addAssistedLiving.patchValue({
            name: response?.fullName,
            email: response?.email,
            mobile: response?.mobile,
            geolocation: response?.geoLocation,
            location: response?.address,
            roleName: response?.rolename
          });
          this.previewUrl = response?.profilePicture?.savedName;
          this.hasAddressChanged = true; // Flag the location as 
          
          if(this.showSelectUser){
            let user = response?.userIds.map((id:any) => ({ _id: id }))
            this.addAssistedLiving.patchValue({
              selectUser: user || []
            })
          }
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }

  onLocationChange() {
    this.hasAddressChanged = false; // Reset if user modifies the input
    this.addAssistedLiving
        .get('location')
        ?.setErrors({ invalidAddress: true });
    console.log("User modified the location, isEdited set to:", this.hasAddressChanged);
  }
      
}
