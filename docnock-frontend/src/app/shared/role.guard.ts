import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const userRole = localStorage.getItem('role');
    const allowedRoles = route.data['roles'] as string[];

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    if (userRole && allowedRoles.includes(userRole)) {
      return true;
    }

    this.router.navigate([`/${userRole || 'login'}/access-denied`], { replaceUrl: true });
    return false;
  }
}
