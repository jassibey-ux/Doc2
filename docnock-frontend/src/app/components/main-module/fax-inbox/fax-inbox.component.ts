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
  sendFaxNumberRaw = '';
  faxNumberError = '';
  faxNumberValid = false;
  sendFile: File | null = null;
  sending = false;

  // Conversation picker
  showConversationPicker = false;
  conversations: any[] = [];
  conversationSearch = '';
  conversationLoading = false;
  pendingForwardFax: FaxRecord | null = null;
  private searchTimeout: any;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadFaxes();
  }

  loadFaxes(): void {
    this.loading = true;
    this.authService.getFaxInbox(this.page, 20, this.activeTab).subscribe({
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

  // ─── PDF Viewer Toolbar ─────────────────────────────────────────────────────

  downloadPdf(): void {
    if (!this.selectedFax?.pdfPath) return;
    const link = document.createElement('a');
    link.href = this.selectedFax.pdfPath;
    link.download = `fax-${this.selectedFax.faxNumber || 'document'}.pdf`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  openInNewTab(): void {
    if (!this.selectedFax?.pdfPath) return;
    window.open(this.selectedFax.pdfPath, '_blank');
  }

  printFax(): void {
    if (!this.selectedFax?.pdfPath) return;
    const printWindow = window.open(this.selectedFax.pdfPath, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }

  // ─── Send Fax Modal ─────────────────────────────────────────────────────────

  openSendModal(): void {
    this.showSendModal = true;
    this.sendFaxNumber = '';
    this.sendFaxNumberRaw = '';
    this.faxNumberError = '';
    this.faxNumberValid = false;
    this.sendFile = null;
  }

  closeSendModal(): void {
    this.showSendModal = false;
  }

  onFaxNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/\D/g, '');

    // Strip leading country code '1'
    if (raw.length > 10 && raw.startsWith('1')) {
      raw = raw.substring(1);
    }

    // Cap at 10 digits
    if (raw.length > 10) {
      raw = raw.substring(0, 10);
    }

    this.sendFaxNumberRaw = raw;

    // Auto-format display
    if (raw.length <= 3) {
      this.sendFaxNumber = raw;
    } else if (raw.length <= 6) {
      this.sendFaxNumber = `(${raw.substring(0, 3)}) ${raw.substring(3)}`;
    } else {
      this.sendFaxNumber = `(${raw.substring(0, 3)}) ${raw.substring(3, 6)}-${raw.substring(6)}`;
    }

    // Set value back to input to reflect formatting
    input.value = this.sendFaxNumber;

    // Validation
    this.faxNumberValid = raw.length === 10;
    if (raw.length === 0) {
      this.faxNumberError = '';
    } else if (raw.length < 10) {
      this.faxNumberError = 'Phone number must be 10 digits';
    } else {
      this.faxNumberError = '';
    }
  }

  getCleanNumber(): string {
    return '+1' + this.sendFaxNumberRaw;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.sendFile = input.files[0];
    }
  }

  submitSendFax(): void {
    if (!this.faxNumberValid || !this.sendFile) return;
    this.sending = true;

    this.authService.sendFax(this.getCleanNumber(), this.sendFile).subscribe({
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

  // ─── Forward to Chat (Conversation Picker) ─────────────────────────────────

  forwardToChat(fax: FaxRecord): void {
    this.pendingForwardFax = fax;
    this.showConversationPicker = true;
    this.conversationSearch = '';
    this.loadConversations();
  }

  loadConversations(): void {
    this.conversationLoading = true;
    this.authService.getConversationList(this.conversationSearch).subscribe({
      next: (res: any) => {
        this.conversations = res?.data?.data ?? res?.data ?? res ?? [];
        if (!Array.isArray(this.conversations)) this.conversations = [];
        this.conversationLoading = false;
      },
      error: () => {
        this.conversations = [];
        this.conversationLoading = false;
      },
    });
  }

  onConversationSearch(): void {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadConversations(), 300);
  }

  selectConversation(conv: any): void {
    if (!this.pendingForwardFax) return;
    this.showConversationPicker = false;

    const convId = conv.groupId || conv._id;
    const convName = conv.groupName || conv.name || 'conversation';

    this.authService.forwardFaxToChat(this.pendingForwardFax._id, convId).subscribe({
      next: () => {
        this.toastr.success('Fax forwarded to ' + convName);
        if (this.pendingForwardFax) this.pendingForwardFax.status = 'forwarded';
        this.pendingForwardFax = null;
      },
      error: () => this.toastr.error('Failed to forward fax'),
    });
  }

  closeConversationPicker(): void {
    this.showConversationPicker = false;
    this.pendingForwardFax = null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

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
