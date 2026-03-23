import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-facility-permissions-manager',
  templateUrl: './facility-permissions-manager.component.html',
  styleUrls: ['./facility-permissions-manager.component.scss']
})
export class FacilityPermissionsManagerComponent implements OnInit {
  facilities: any[] = [];
  selectedFacilityId = '';
  staffMembers: any[] = [];
  permissionCodes = ['F', 'P', 'N', 'C', 'R', 'S', 'O', 'V'];
  permissionLabels: Record<string, string> = {
    F: 'Facility',
    P: 'Patients',
    N: 'Nurses',
    C: 'Chat',
    R: 'Roles',
    S: 'Sub Admin',
    O: 'Others',
    V: 'Video'
  };
  saving = false;
  searchQuery = '';
  private changedMembers = new Set<string>();

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.loadFacilities();
  }

  loadFacilities() {
    this.authService.listFacilities().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.facilities = res.data || [];
        }
      },
      error: () => {
        this.toastr.error('Failed to load facilities');
      }
    });
  }

  onFacilitySelect(facilityId: string) {
    if (!facilityId) {
      this.staffMembers = [];
      return;
    }
    this.selectedFacilityId = facilityId;
    this.changedMembers.clear();

    this.authService.listFacilityStaff(facilityId).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.staffMembers = (res.data || []).map((m: any) => ({
            ...m,
            permissions: m.permissions || [],
            _originalPermissions: [...(m.permissions || [])]
          }));
        }
      },
      error: () => {
        this.toastr.error('Failed to load staff members');
        this.staffMembers = [];
      }
    });
  }

  togglePermission(member: any, code: string) {
    if (!member.permissions) {
      member.permissions = [];
    }
    const idx = member.permissions.indexOf(code);
    if (idx > -1) {
      member.permissions.splice(idx, 1);
    } else {
      member.permissions.push(code);
    }

    const memberId = member.userId?._id || member._id;
    this.changedMembers.add(memberId);
  }

  filteredStaff(): any[] {
    if (!this.searchQuery.trim()) return this.staffMembers;
    const q = this.searchQuery.toLowerCase();
    return this.staffMembers.filter(m => {
      const name = (m.userId?.fullName || m.fullName || '').toLowerCase();
      const role = (m.role || '').toLowerCase();
      return name.includes(q) || role.includes(q);
    });
  }

  savePermissions() {
    if (this.changedMembers.size === 0) {
      this.toastr.info('No changes to save');
      return;
    }

    this.saving = true;
    const updates: any[] = [];

    for (const member of this.staffMembers) {
      const memberId = member.userId?._id || member._id;
      if (this.changedMembers.has(memberId)) {
        updates.push({
          memberId,
          permissions: [...member.permissions]
        });
      }
    }

    let completed = 0;
    let errors = 0;

    for (const update of updates) {
      this.authService.updateStaffMembership(this.selectedFacilityId, update.memberId, { permissions: update.permissions }).subscribe({
        next: () => {
          completed++;
          if (completed + errors === updates.length) {
            this.saving = false;
            this.changedMembers.clear();
            if (errors === 0) {
              this.toastr.success('Permissions saved successfully');
            } else {
              this.toastr.warning(`${completed} saved, ${errors} failed`);
            }
          }
        },
        error: () => {
          errors++;
          if (completed + errors === updates.length) {
            this.saving = false;
            if (errors === updates.length) {
              this.toastr.error('Failed to save permissions');
            } else {
              this.toastr.warning(`${completed} saved, ${errors} failed`);
            }
          }
        }
      });
    }
  }
}
