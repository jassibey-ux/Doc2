import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  templateUrl: './access-denied.component.html',
  styleUrls: ['./access-denied.component.scss']
})
export class AccessDeniedComponent {
  constructor(private router: Router) {}

  goToDashboard(): void {
    const role = localStorage.getItem('role') || 'login';
    this.router.navigate([`/${role}/dashboard`]);
  }
}
