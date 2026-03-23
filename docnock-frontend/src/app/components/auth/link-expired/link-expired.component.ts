import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-link-expired',
  templateUrl: './link-expired.component.html',
  styleUrls: ['./link-expired.component.scss']
})
export class LinkExpiredComponent {
  constructor(private router: Router) {}

  requestNewLink() {
    this.router.navigate(['/forgot-password']);
  }
}
