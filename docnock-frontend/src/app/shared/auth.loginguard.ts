import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthServiceService } from '../services/auth-service.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuardLogin implements CanActivate {
  constructor(private authService: AuthServiceService, private router: Router) {}

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      let dynamicPath = this.authService.getRole();
      this.router.navigate([`${dynamicPath}`], { replaceUrl: true });
      // this.router.navigate(['/test/dashboard']);
      return false;
    }
    return true;
  }
}

