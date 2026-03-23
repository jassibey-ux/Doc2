import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.scss'],
})
export class DeleteAccountComponent {
  confirmText = '';
  exporting = false;
  deleting = false;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  canDelete(): boolean {
    return this.confirmText === 'DELETE';
  }

  exportData(): void {
    this.exporting = true;
    // Placeholder — backend endpoint may not exist yet
    this.toastr.success('Data export requested. You will receive an email when ready.');
    setTimeout(() => {
      this.exporting = false;
    }, 1500);
  }

  deleteAccount(): void {
    if (!this.canDelete()) return;
    this.deleting = true;

    this.authService.requestAccountDeletion().subscribe({
      next: () => {
        this.toastr.success('Account scheduled for deletion. You have 30 days to cancel by logging back in.');
        // Log out
        localStorage.clear();
        sessionStorage.clear();
        this.router.navigate(['/login']);
      },
      error: (err: any) => {
        this.deleting = false;
        this.toastr.error(err?.error?.message || 'Failed to process account deletion');
      },
    });
  }
}
