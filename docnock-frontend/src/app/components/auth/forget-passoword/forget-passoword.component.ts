import { Component, OnInit } from '@angular/core';
import {
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from '../../../services/auth-service.service';
import { Router } from '@angular/router';


@Component({
  selector: 'app-forget-passoword',
  templateUrl: './forget-passoword.component.html',
  styleUrls: ['./forget-passoword.component.scss']
})
export class ForgetPassowordComponent implements OnInit{
  forgotPassword!: FormGroup;


  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private router:Router
  ) {}
  ngOnInit(): void{

    this.forgotPassword = new FormGroup({
      email:new FormControl('',[Validators.required, Validators.email])
    })
  }

  onSubmit() {

    if (this.forgotPassword.valid) {
      console.log('Form Submitted:', this.forgotPassword.value);
      const requestPayload = {
        email: this.forgotPassword.get("email")?.value || ""
      };


      this.authService.forgotPassword(requestPayload).subscribe({
       next:(res:any)=>{
         if(res.success){
          this.toastr.success(res.message);
          this.router.navigate(["/"])
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
