import { Component } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-ai-assistant',
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.scss'],
})
export class AiAssistantComponent {
  documentText: string = '';
  question: string = '';
  answer: string = '';
  loading: boolean = false;
  fileName: string = '';
  history: { question: string; answer: string }[] = [];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  onFileSelected(event: any) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toastr.warning('File size must be under 5MB');
      return;
    }

    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.documentText = e.target.result;
      this.toastr.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => {
      this.toastr.error('Failed to read file');
    };
    reader.readAsText(file);
  }

  askQuestion() {
    if (!this.documentText.trim()) {
      this.toastr.warning('Please paste or upload document text first');
      return;
    }
    if (!this.question.trim()) {
      this.toastr.warning('Please enter a question');
      return;
    }

    this.loading = true;
    this.answer = '';

    this.authService.documentQuery(this.documentText, this.question).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.answer = res.answer;
          this.history.unshift({ question: this.question, answer: res.answer });
          this.question = '';
        } else {
          this.toastr.error(res.message || 'Failed to get answer');
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error('Failed to process query. Please try again.');
        this.loading = false;
      },
    });
  }

  clearAll() {
    this.documentText = '';
    this.question = '';
    this.answer = '';
    this.fileName = '';
    this.history = [];
  }

  get charCount(): number {
    return this.documentText.length;
  }
}
