import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-staff-hub',
  templateUrl: './staff-hub.component.html',
  styleUrls: ['./staff-hub.component.scss'],
})
export class StaffHubComponent implements OnInit {
  dynamicpath: string = '';

  features = [
    {
      name: 'Physicians',
      icon: 'bx bxs-user-circle',
      route: 'physician/list',
      description: 'View and manage physician accounts',
      color: '#2F936D',
    },
    {
      name: 'Nurses',
      icon: 'bx bxs-group',
      route: 'nurse/list',
      description: 'View and manage nursing staff',
      color: '#3B82F6',
    },
  ];

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {
    this.dynamicpath = this.authService.getRole() || '';
  }
}
