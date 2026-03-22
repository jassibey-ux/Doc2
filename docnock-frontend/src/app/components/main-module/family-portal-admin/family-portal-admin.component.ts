import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-family-portal-admin',
  templateUrl: './family-portal-admin.component.html',
  styleUrls: ['./family-portal-admin.component.scss'],
})
export class FamilyPortalAdminComponent implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Stats
  totalFamilies: number = 0;
  activeLinks: number = 0;
  pendingInvites: number = 0;
  revokedLinks: number = 0;

  // Table
  displayedColumns: string[] = ['patient', 'familyMember', 'relationship', 'accessLevel', 'status', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  totalItems: number = 0;
  pageSize: number = 20;
  currentPage: number = 1;
  loading: boolean = true;

  // Filters
  searchKey: string = '';
  statusFilter: string = '';
  relationshipFilter: string = '';
  private searchSubject = new Subject<string>();

  // Modals
  showInviteModal: boolean = false;
  showEditModal: boolean = false;
  showRevokeConfirm: boolean = false;
  selectedLink: any = null;

  // Invite form
  inviteForm = {
    conversationId: '',
    familyName: '',
    familyEmail: '',
    relationshipType: 'guardian',
    accessLevel: 'read_only',
    pocUserId: '',
    patientSearch: '',
  };
  patientSearchResults: any[] = [];
  inviteSending: boolean = false;
  inviteError: string = '';

  // Edit form
  editForm = {
    relationshipType: '',
    accessLevel: '',
    pocUserId: '',
  };
  editSending: boolean = false;
  editError: string = '';

  // Relationship options
  relationshipOptions = [
    { value: 'spouse', label: 'Spouse' },
    { value: 'parent', label: 'Parent' },
    { value: 'child', label: 'Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'guardian', label: 'Guardian' },
    { value: 'power_of_attorney', label: 'Power of Attorney' },
    { value: 'other', label: 'Other' },
  ];

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadLinks();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((searchText) => {
        this.searchKey = searchText;
        this.currentPage = 1;
        this.loadLinks();
      });
  }

  loadStats() {
    this.authService.getAdminFamilyStats().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.totalFamilies = res.data.totalFamilies || 0;
          this.activeLinks = res.data.activeLinks || 0;
          this.pendingInvites = res.data.pendingInvites || 0;
          this.revokedLinks = res.data.revokedLinks || 0;
        }
      },
      error: () => {},
    });
  }

  loadLinks() {
    this.loading = true;
    this.authService.getAdminFamilyLinks({
      page: this.currentPage,
      limit: this.pageSize,
      search: this.searchKey || undefined,
      status: this.statusFilter || undefined,
      relationship: this.relationshipFilter || undefined,
    }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.dataSource.data = res.data.links || [];
          this.totalItems = res.data.pagination?.total || 0;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  onFilterChange() {
    this.currentPage = 1;
    this.loadLinks();
  }

  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadLinks();
  }

  getStatusLabel(link: any): string {
    if (!link.isActive) return 'Revoked';
    if (link.magicLinkUsed) return 'Active';
    return 'Pending';
  }

  getStatusClass(link: any): string {
    if (!link.isActive) return 'status-revoked';
    if (link.magicLinkUsed) return 'status-active';
    return 'status-pending';
  }

  getPatientName(link: any): string {
    return link.patientConversationId?.groupName || 'Unknown Patient';
  }

  getFamilyName(link: any): string {
    if (link.familyUserId?.fullName) return link.familyUserId.fullName;
    return link.familyName || 'Pending Registration';
  }

  getFamilyEmail(link: any): string {
    return link.familyUserId?.email || link.familyEmail || '';
  }

  getRelationshipLabel(type: string): string {
    const opt = this.relationshipOptions.find((o) => o.value === type);
    return opt ? opt.label : type || 'N/A';
  }

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() || '?';
  }

  // ─── Invite Modal ──────────────────────────────────────────────────────
  openInviteModal() {
    this.showInviteModal = true;
    this.inviteError = '';
    this.inviteForm = {
      conversationId: '',
      familyName: '',
      familyEmail: '',
      relationshipType: 'guardian',
      accessLevel: 'read_only',
      pocUserId: '',
      patientSearch: '',
    };
    this.patientSearchResults = [];
  }

  closeInviteModal() {
    this.showInviteModal = false;
  }

  submitInvite() {
    if (!this.inviteForm.conversationId || !this.inviteForm.familyEmail) {
      this.inviteError = 'Please select a patient and enter family email.';
      return;
    }

    this.inviteSending = true;
    this.inviteError = '';

    this.authService.inviteFamily({
      conversationId: this.inviteForm.conversationId,
      familyEmail: this.inviteForm.familyEmail,
      familyName: this.inviteForm.familyName,
      relationshipType: this.inviteForm.relationshipType,
      accessLevel: this.inviteForm.accessLevel,
    }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.closeInviteModal();
          this.loadLinks();
          this.loadStats();
        } else {
          this.inviteError = res.message || 'Failed to send invitation';
        }
        this.inviteSending = false;
      },
      error: (err: any) => {
        this.inviteError = err.error?.message || 'Failed to send invitation';
        this.inviteSending = false;
      },
    });
  }

  // ─── Edit Modal ────────────────────────────────────────────────────────
  openEditModal(link: any) {
    this.selectedLink = link;
    this.showEditModal = true;
    this.editError = '';
    this.editForm = {
      relationshipType: link.relationshipType || '',
      accessLevel: link.accessLevel || 'read_only',
      pocUserId: link.pocUserId?._id || '',
    };
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedLink = null;
  }

  submitEdit() {
    if (!this.selectedLink) return;
    this.editSending = true;
    this.editError = '';

    this.authService.updateAdminFamilyLink(this.selectedLink._id, {
      relationshipType: this.editForm.relationshipType,
      accessLevel: this.editForm.accessLevel,
    }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.closeEditModal();
          this.loadLinks();
        } else {
          this.editError = res.message || 'Failed to update';
        }
        this.editSending = false;
      },
      error: (err: any) => {
        this.editError = err.error?.message || 'Failed to update';
        this.editSending = false;
      },
    });
  }

  // ─── Resend ────────────────────────────────────────────────────────────
  resendInvite(link: any) {
    this.authService.resendFamilyInvite(link._id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.loadLinks();
        }
      },
      error: () => {},
    });
  }

  // ─── Revoke ────────────────────────────────────────────────────────────
  openRevokeConfirm(link: any) {
    this.selectedLink = link;
    this.showRevokeConfirm = true;
  }

  closeRevokeConfirm() {
    this.showRevokeConfirm = false;
    this.selectedLink = null;
  }

  confirmRevoke() {
    if (!this.selectedLink) return;

    this.authService.revokeFamilyAccess(this.selectedLink._id).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.closeRevokeConfirm();
          this.loadLinks();
          this.loadStats();
        }
      },
      error: () => {},
    });
  }
}
