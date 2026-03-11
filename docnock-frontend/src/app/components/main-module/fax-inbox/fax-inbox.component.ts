import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';

export interface FaxRecord {
  _id: string;
  direction: 'inbound' | 'outbound';
  faxNumber: string;
  facilityId?: { _id: string; fullName: string };
  pdfPath: string;
  pageCount: number;
  status: 'received' | 'read' | 'forwarded' | 'sent' | 'failed';
  phaxioId: string;
  sentAt: string;
  readAt?: string;
  createdAt: string;
}

@Component({
  selector: 'app-fax-inbox',
  templateUrl: './fax-inbox.component.html',
  styleUrls: ['./fax-inbox.component.scss'],
})
export class FaxInboxComponent implements OnInit {
  faxes: FaxRecord[] = [];
  total = 0;
  unreadCount = 0;
  page = 1;
  totalPages = 1;
  loading = false;

  activeTab: 'inbound' | 'outbound' = 'inbound';
  selectedFax: FaxRecord | null = null;
  showSendModal = false;

  sendFaxNumber = '';
  sendFile: File | null = null;
  sending = false;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadFaxes();
  }

  loadFaxes(): void {
    this.loading = true;
    this.authService.getFaxInbox(this.page).subscribe({
      next: (res: any) => {
        const data = res?.data;
        this.faxes = data?.data ?? [];
        this.total = data?.total ?? 0;
        this.unreadCount = data?.unreadCount ?? 0;
        this.totalPages = data?.totalPages ?? 1;
        this.loading = false;
      },
      error: () => {
        this.toastr.error('Failed to load faxes');
        this.loading = false;
      },
    });
  }

  switchTab(tab: 'inbound' | 'outbound'): void {
    this.activeTab = tab;
    this.page = 1;
    this.loadFaxes();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.loadFaxes();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.loadFaxes();
    }
  }

  openFax(fax: FaxRecord): void {
    this.selectedFax = fax;

    // Mark as read
    if (fax.status === 'received') {
      this.authService.markFaxRead(fax._id).subscribe({
        next: () => {
          fax.status = 'read';
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        },
      });
    }
  }

  closeFaxViewer(): void {
    this.selectedFax = null;
  }

  openSendModal(): void {
    this.showSendModal = true;
    this.sendFaxNumber = '';
    this.sendFile = null;
  }

  closeSendModal(): void {
    this.showSendModal = false;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.sendFile = input.files[0];
    }
  }

  submitSendFax(): void {
    if (!this.sendFaxNumber || !this.sendFile) return;
    this.sending = true;

    this.authService.sendFax(this.sendFaxNumber, this.sendFile).subscribe({
      next: () => {
        this.toastr.success('Fax sent successfully');
        this.closeSendModal();
        this.sending = false;
        this.loadFaxes();
      },
      error: () => {
        this.toastr.error('Failed to send fax');
        this.sending = false;
      },
    });
  }

  forwardToChat(fax: FaxRecord): void {
    // Prompt user for conversation selection — simplified for now
    const conversationId = prompt('Enter conversation ID to forward this fax to:');
    if (!conversationId) return;

    this.authService.forwardFaxToChat(fax._id, conversationId).subscribe({
      next: () => {
        this.toastr.success('Fax forwarded to chat');
        fax.status = 'forwarded';
      },
      error: () => this.toastr.error('Failed to forward fax'),
    });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      received: 'New',
      read: 'Read',
      forwarded: 'Forwarded',
      sent: 'Sent',
      failed: 'Failed',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    const classes: Record<string, string> = {
      received: 'status-new',
      read: 'status-read',
      forwarded: 'status-forwarded',
      sent: 'status-sent',
      failed: 'status-failed',
    };
    return classes[status] ?? '';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
