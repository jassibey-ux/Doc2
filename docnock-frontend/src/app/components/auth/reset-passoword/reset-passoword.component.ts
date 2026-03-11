import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { BranchService } from 'src/app/services/branch.service';

@Component({
  selector: 'app-reset-passoword',
  templateUrl: './reset-passoword.component.html',
  styleUrls: ['./reset-passoword.component.scss'],
})
export class ResetPassowordComponent implements OnInit {
  resetPassword!: FormGroup;
  branchToken:any;
  errorshow:boolean=false;
  message:string='';

  constructor(
    private authService: AuthServiceService,
    private branchService: BranchService,
    private toastr: ToastrService,
    private router: Router
    
  ) {}

  ngOnInit() {
    this.branchService.getBranchData()
      .then((data) => {
        console.log('Branch Data:', data.data);
        if (data && data.data) {
         this.branchToken = JSON.parse(data.data).custom_data.token; // JWT token
         let type = JSON.parse(data.data).custom_data.type;
         this.authService.verifylink({ token: this.branchToken, type: type }).subscribe({
          next: (res: any) => {
            if (res.success) {
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
    this.resetPassword = new FormGroup(
      {
        newpassword: new FormControl('', [Validators.required]),
        confirmpassword: new FormControl('', [Validators.required]),
      },
      { validators: this.profilepasswordMatchValidator }
    );
  }

  profilepasswordMatchValidator: ValidatorFn = (group: AbstractControl): { [key: string]: boolean } | null => {
      const newPassword = group.get('newpassword')?.value;
      const confirmPassword = group.get('confirmpassword')?.value;
      if (newPassword && confirmPassword && newPassword !== confirmPassword) { 
        return { passwordMismatch: true };
      }
      return null;
    };

  onSubmit() {

    if (this.resetPassword.valid) {
      console.log('Form Submitted:', this.resetPassword.value);
      const requestPayload = {
        token:this.branchToken,
        newPassword: this.resetPassword.get("newpassword")?.value || ""
      };


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
    
    } else {
      console.error('Form is invalid!');
    }
  }
}
