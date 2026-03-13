import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-clinical-hub',
  templateUrl: './clinical-hub.component.html',
  styleUrls: ['./clinical-hub.component.scss'],
})
export class ClinicalHubComponent implements OnInit {
  dynamicpath: string = '';

  features = [
    {
      name: 'Patient Board',
      icon: 'bx bxs-user-detail',
      route: 'patient-board',
      description: 'View and manage patient statuses across your unit',
      color: '#2F936D',
    },
    {
      name: 'Shift Handoff',
      icon: 'bx bxs-calendar-check',
      route: 'shift-handoff',
      description: 'Create and review shift handoff reports',
      color: '#3B82F6',
    },
    {
      name: 'SBAR Reports',
      icon: 'bx bxs-report',
      route: 'sbar',
      description: 'Structured clinical communication reports',
      color: '#8B5CF6',
    },
    {
      name: 'Clinical Alerts',
      icon: 'bx bxs-bell-ring',
      route: 'clinical-alerts',
      description: 'Monitor and respond to clinical alerts',
      color: '#EF4444',
    },
    {
      name: 'Consultations',
      icon: 'bx bxs-conversation',
      route: 'consultations',
      description: 'Request and track physician consultations',
      color: '#F59E0B',
    },
  ];

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {
    this.dynamicpath = this.authService.getRole() || '';
  }
}
