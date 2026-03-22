import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

interface ChatDocument {
  _id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  selected?: boolean;
}

@Component({
  selector: 'app-chat-document-panel',
  templateUrl: './chat-document-panel.component.html',
  styleUrls: ['./chat-document-panel.component.scss'],
})
export class ChatDocumentPanelComponent implements OnChanges {
  @Input() conversationId = '';
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();

  loading = false;
  uploading = false;
  querying = false;
  documents: ChatDocument[] = [];
  searchQuery = '';
  question = '';
  aiAnswer = '';

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && this.conversationId) {
      this.loadDocuments();
    }
  }

  loadDocuments() {
    if (!this.conversationId) return;
    this.loading = true;
    this.authService.listChatDocuments(this.conversationId, this.searchQuery).subscribe({
      next: (res: any) => {
        this.documents = (res?.data || []).map((d: any) => ({
          ...d,
          selected: this.documents.find((existing) => existing._id === d._id)?.selected || false,
        }));
        this.loading = false;
      },
      error: () => {
        this.documents = [];
        this.loading = false;
      },
    });
  }

  searchDocuments() {
    this.loadDocuments();
  }

  clearSearch() {
    this.searchQuery = '';
    this.loadDocuments();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    const allowedTypes = ['text/plain', 'text/csv', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.csv')) {
      this.toastr.error('Supported formats: .txt, .csv, .pdf, .doc, .docx');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toastr.error('File must be under 5 MB');
      input.value = '';
      return;
    }

    this.uploading = true;

    // For text-based files, read directly via FileReader
    if (file.type === 'text/plain' || file.type === 'text/csv' || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        this.uploadDocument(file.name, file.type || 'text/plain', text);
      };
      reader.onerror = () => {
        this.toastr.error('Failed to read file');
        this.uploading = false;
      };
      reader.readAsText(file);
    } else {
      // For PDF/DOCX, send as base64 and let the backend extract text
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        this.uploadDocument(file.name, file.type, base64);
      };
      reader.onerror = () => {
        this.toastr.error('Failed to read file');
        this.uploading = false;
      };
      reader.readAsDataURL(file);
    }

    input.value = '';
  }

  private uploadDocument(fileName: string, fileType: string, extractedText: string) {
    this.authService.uploadChatDocument({
      conversationId: this.conversationId,
      fileName,
      fileType,
      extractedText,
    }).subscribe({
      next: () => {
        this.toastr.success('Document uploaded');
        this.uploading = false;
        this.loadDocuments();
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Upload failed');
        this.uploading = false;
      },
    });
  }

  toggleSelect(doc: ChatDocument) {
    doc.selected = !doc.selected;
  }

  get selectedDocIds(): string[] {
    return this.documents.filter((d) => d.selected).map((d) => d._id);
  }

  get selectedCount(): number {
    return this.selectedDocIds.length;
  }

  deleteDocument(doc: ChatDocument, event: Event) {
    event.stopPropagation();
    this.authService.deleteChatDocument(doc._id).subscribe({
      next: () => {
        this.toastr.success('Document removed');
        this.documents = this.documents.filter((d) => d._id !== doc._id);
      },
      error: () => {
        this.toastr.error('Failed to remove document');
      },
    });
  }

  askQuestion() {
    if (!this.question.trim()) return;
    if (this.selectedCount === 0) {
      this.toastr.warning('Select at least one document');
      return;
    }

    this.querying = true;
    this.aiAnswer = '';
    this.authService.queryChatDocuments({
      conversationId: this.conversationId,
      documentIds: this.selectedDocIds,
      question: this.question,
    }).subscribe({
      next: (res: any) => {
        this.aiAnswer = res?.data?.answer || 'No answer received.';
        this.querying = false;
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Query failed');
        this.querying = false;
      },
    });
  }

  closePanel() {
    this.close.emit();
  }

  formatSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getFileIcon(fileType: string): string {
    if (fileType?.includes('pdf')) return 'bx-file';
    if (fileType?.includes('word') || fileType?.includes('document')) return 'bx-file';
    if (fileType?.includes('csv')) return 'bx-table';
    return 'bx-file-blank';
  }
}
