import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-facility-invitation-banner',
  templateUrl: './facility-invitation-banner.component.html',
  styleUrls: ['./facility-invitation-banner.component.scss']
})
export class FacilityInvitationBannerComponent implements OnInit {
  invitations: any[] = [];
  showAll: boolean = false;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadInvitations();
  }

  loadInvitations() {
    this.authService.getMyInvitations().subscribe({
      next: (res: any) => {
        this.invitations = res?.data || [];
      },
      error: (err: any) => {
        console.error('Failed to load invitations', err);
      }
    });
  }

  acceptInvitation(membershipId: string) {
    this.authService.acceptFacilityInvitation(membershipId).subscribe({
      next: (res: any) => {
        this.toastr.success(res?.message || 'Invitation accepted');
        this.loadInvitations();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to accept invitation');
      }
    });
  }

  declineInvitation(membershipId: string) {
    this.authService.declineFacilityInvitation(membershipId).subscribe({
      next: (res: any) => {
        this.toastr.success(res?.message || 'Invitation declined');
        this.loadInvitations();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Failed to decline invitation');
      }
    });
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
  }
}
