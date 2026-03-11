import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, Subject } from 'rxjs';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-role-permission',
  templateUrl: './role-permission.component.html',
  styleUrls: ['./role-permission.component.scss'],
})
export class RolePermissionComponent {
  diagnosisList: any[] = [];
  patientSelectedIds: any[] = [];
  loading: boolean = false;
  multiple: boolean = false;
  rolesForm: FormGroup | any;
  roles:any[]= []
  predefinedRoles = [
    { id: 'facility_center', name: 'Facility Center', moduleName: 'F' },
    { id: 'physician', name: 'Physicians', moduleName: 'P' },
    { id: 'nurse', name: 'Nurses', moduleName: 'N' },
    { id: 'subadmin', name: 'Sub Admin', moduleName: 'S' },
    { id: 'other', name: 'Other User', moduleName: 'O' },
    { id: 'video', name: 'Video Calling', moduleName: 'V' },
    { id: 'chat', name: 'Chat', moduleName: 'C' },
    { id: 'role-permission', name: 'Role and Permission', moduleName: 'R' },
  ];
  selectedRoles = [
    { id: 'facility_center', name: 'Facility Center', moduleName: 'F' },
    { id: 'physician', name: 'Physicians', moduleName: 'P' },
    { id: 'nurse', name: 'Nurses', moduleName: 'N' },
    { id: 'subadmin', name: 'Sub Admin', moduleName: 'S' },
    { id: 'other', name: 'Other User', moduleName: 'O' },
  ]

  selectedRole: string = '';
  page = 1;
  limit = 10;
  searchTerm = '';

  editData: any = [];
  selectAllControl = new FormControl({ value: false, disabled: true }); // For Select All checkbox
  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService,
    private fb: FormBuilder
  ) {
    this.rolesForm = this.fb.group({
      roles: this.fb.group({}),
      limits: this.fb.group({}),
    });
  }

  ngOnInit(): void {
    // Initialize form controls for each role
    this.getPermissionnew()
  }

  
 onRoleChange(event: Event): void { 
    this.rolesForm.reset();
    this.editData = [];
    this.diagnosisList = [];
    this.setEditValues();
    this.selectedRole = (event.target as HTMLSelectElement).value;
    if (this.selectedRole === 'facility_center') {
      if (this.predefinedRoles.length === 1 && this.predefinedRoles[0].id === 'facility_center') {
        this.roles = [];
      } else {
        this.roles = this.predefinedRoles.filter(item => item.id !== 'facility_center');
      }
    } 
     else if (this.selectedRole === 'physician') {
      if (this.predefinedRoles.length === 1 && this.predefinedRoles[0].id === "role-permission") {
        this.roles = [];
      } else {
        this.roles = this.predefinedRoles.filter(item => item.id !== 'role-permission');
      }
    } 
      else  if (this.selectedRole === 'nurse') {
      if (this.predefinedRoles.length === 1 && this.predefinedRoles[0].id === "role-permission") {
        this.roles = [];
      } else {
        this.roles = this.predefinedRoles.filter(item => item.id !== 'role-permission');
      }
    } else {
      this.roles = this.predefinedRoles;
    }

    if (this.selectedRole !== '') {
      this.getList(this.selectedRole);
    }
  }
  

  loadMoreItems() {
    if (this.loading) return;
    this.loading = true;
  
    this.page++; // Increase page number
  
    this.authService.getList(this.selectedRole, this.limit, this.page, this.searchTerm).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.diagnosisList = [...this.diagnosisList, ...response]; // Append new items
        } else {
          this.toastr.error(res.message);
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
        this.loading = false;
      },
    });
  }
  private selectionChangeSubject = new Subject<any>();
  onSelectionChange(selected: any): void {
    this.rolesForm.reset()
    this.editData = [];
    this.setEditValues();
    let previousValue = this.patientSelectedIds.length ? this.patientSelectedIds[0] : null;
  
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

  onSearch(term: string) {
    this.searchTerm = term;
    this.page = 1; // Reset page to 1
    if(this.selectedRole != '')
      this.getList(this.selectedRole, this.limit, this.page, this.searchTerm);
  }

  getList(role: any, limit = 10, page = 1, searchKey = '', status = '') {
    this.authService.getList(role,limit,page,searchKey).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.diagnosisList = response;
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }
  // Function to check if the role is checked
  getRoleControlChecked(roleId: string): boolean {
    const control = this.rolesForm.get('roles')?.get(roleId) as FormControl;
    return control ? control.value : false;
  }

  // Set initial values for edit mode
  setEditValues(): void {
    this.editData.forEach((data: any) => {
      const role = this.roles.find(
        (role) => role.moduleName === data.moduleName
      );
      if (role) {
        this.rolesForm.get('roles')?.get(role.id)?.setValue(true);
        this.rolesForm.get('limits')?.get(role.id)?.setValue(data.noOfLimit);
      }
    });
    this.updateSelectAllState();
  }

  toggleAllRoles(isChecked: boolean): void {
    this.roles.forEach((role) => {
      this.rolesForm.get('roles')?.get(role.id)?.setValue(isChecked);
      if (isChecked) {
        // When checked, restore the limit value from editData if it exists
        const editItem = this.editData.find((item: any) => item.moduleName === role.moduleName);
        const limitValue = editItem ? editItem.noOfLimit : '';
        this.rolesForm.get('limits')?.get(role.id)?.setValue(limitValue);
      } else {
        // When unchecked, clear the limit value
        this.rolesForm.get('limits')?.get(role.id)?.setValue('');
      }
    });
  }

  // Handle individual role checkbox changes
  toggleIndividualRole(roleId: string): void {
    const isChecked = this.getRoleControlChecked(roleId);
    const role = this.roles.find((r) => r.id === roleId);
    
    if (isChecked) {
      // When checked, restore the limit value from editData if it exists
      const editItem = this.editData.find((item: any) => item.moduleName === role.moduleName);
      const limitValue = editItem ? editItem.noOfLimit : '';
      this.rolesForm.get('limits')?.get(roleId)?.setValue(limitValue);
    } else {
      // When unchecked, clear the limit value
      this.rolesForm.get('limits')?.get(roleId)?.setValue('');
    }
    
    this.updateSelectAllState();
  }

  updateSelectAllState(): void {
    const allChecked = this.roles.every((role) =>
      this.getRoleControlChecked(role.id)
    );
    this.selectAllControl.setValue(allChecked, { emitEvent: false });
  }

  getAllValues(): void {
    const values: any = [];

    this.roles.forEach((role) => {
      const isChecked = this.getRoleControlChecked(role.id);
      const inputValue = this.rolesForm.get('limits')?.get(role.id)?.value;

      if (isChecked) {
        values.push({
          moduleName: role.moduleName,
          noOfLimit: inputValue ? parseInt(inputValue, 10) : 0,
        });
      }
    });

    if(values.length > 0){
    let data = {
      user_id: this.patientSelectedIds[0]._id,
      modules: values
    }

    this.authService.createPermission(data).subscribe({
      next: (res: any) => {
        if (res.status) {
          this.getPermission(this.patientSelectedIds[0]._id);
          this.toastr.success(res.message);
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }else{
    this.toastr.error("Select atleast one permission.")
  }
  }

  enabledField(userId: any) {
    this.selectAllControl.enable();
    this.roles.forEach((role) => {
      this.rolesForm.get('roles')?.get(role.id)?.enable();
      this.rolesForm.get('limits')?.get(role.id)?.enable();
    });
    this.getPermission(userId);
  }

  getPermission(userId: any) {
    this.authService.getPermission(userId).subscribe({
      next: (res: any) => {
        if (res.status) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.editData = response;
          this.setEditValues()
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }

  getPermissionnew() {
    this.authService.getPermission().subscribe({
      next: (res: any) => {
        if (res.status) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
  
          let matchedModules = this.selectedRoles.filter((predefined) =>
            response.some(
              (apiData: { moduleName: string }) =>
                apiData.moduleName === predefined.moduleName
            )
          );

          let matchedModules1 = this.predefinedRoles.filter((predefined) =>
            response.some(
              (apiData: { moduleName: string }) =>
                apiData.moduleName === predefined.moduleName
            )
          );
  
          this.selectedRoles = matchedModules; // <-- assign the full object array
          this.predefinedRoles = matchedModules1;
          console.log(`this.selectedRoles`, this.selectedRoles,this.predefinedRoles);
          this.roles = this.predefinedRoles
          this.roles.forEach((role) => {
            this.rolesForm
              .get('roles')
              ?.addControl(
                role.id,
                new FormControl({ value: false, disabled: true })
              );
            this.rolesForm
              .get('limits')
              ?.addControl(role.id, new FormControl({ value: 0, disabled: true }));
          });
          this.selectAllControl.valueChanges.subscribe((isChecked: any) => {
            this.toggleAllRoles(isChecked);
          });
          this.selectionChangeSubject.pipe(debounceTime(300)).subscribe((selected) => {
            this.enabledField(selected._id);
          });
        }
      },
      error: (err: any) => {
        this.toastr.error("Count Not Found");
      },
    });
  }
  
}
