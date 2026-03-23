import { Component } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-bulk-user-import',
  templateUrl: './bulk-user-import.component.html',
  styleUrls: ['./bulk-user-import.component.scss']
})
export class BulkUserImportComponent {
  currentStep = 1;
  csvData: any[] = [];
  validationResults: any[] = [];
  importResults: any = null;
  validCount = 0;
  invalidCount = 0;
  importing = false;
  skipErrors = true;
  fileName = '';

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      this.toastr.error('File size must be under 5MB');
      return;
    }
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const text = e.target.result as string;
      this.parseCsv(text);
    };
    reader.readAsText(file);
    input.value = '';
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer?.files?.length) return;
    const file = event.dataTransfer.files[0];
    if (!file.name.endsWith('.csv')) {
      this.toastr.error('Only CSV files are accepted');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toastr.error('File size must be under 5MB');
      return;
    }
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.parseCsv(e.target.result as string);
    };
    reader.readAsText(file);
  }

  private parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      this.toastr.error('CSV must have a header row and at least one data row');
      return;
    }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('fullname');
    const emailIdx = headers.indexOf('email');
    const mobileIdx = headers.indexOf('mobile');
    const roleIdx = headers.indexOf('role');

    if (nameIdx === -1 || emailIdx === -1 || mobileIdx === -1 || roleIdx === -1) {
      this.toastr.error('CSV must contain headers: fullName, email, mobile, role');
      return;
    }

    this.csvData = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      this.csvData.push({
        fullName: cols[nameIdx] || '',
        email: cols[emailIdx] || '',
        mobile: cols[mobileIdx] || '',
        role: cols[roleIdx] || ''
      });
    }

    if (this.csvData.length === 0) {
      this.toastr.error('No data rows found in CSV');
      return;
    }

    this.toastr.success(`Parsed ${this.csvData.length} rows from ${this.fileName}`);
    this.validateUsers();
  }

  downloadTemplate() {
    const csv = 'fullName,email,mobile,role\nJohn Doe,john@example.com,1234567890,nurse\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-import-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  validateUsers() {
    this.authService.bulkValidateUsers(this.csvData).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.validationResults = res.data.results;
          this.validCount = res.data.validCount;
          this.invalidCount = res.data.invalidCount;
          this.currentStep = 2;
        } else {
          this.toastr.error(res.message || 'Validation failed');
        }
      },
      error: (err: any) => {
        this.toastr.error(err?.error?.message || 'Validation request failed');
      }
    });
  }

  importUsers() {
    const usersToImport = this.skipErrors
      ? this.validationResults.filter(r => r.valid)
      : this.validationResults;

    if (usersToImport.length === 0) {
      this.toastr.warning('No valid users to import');
      return;
    }

    this.importing = true;
    this.authService.bulkImportUsers(usersToImport).subscribe({
      next: (res: any) => {
        this.importing = false;
        if (res.success) {
          this.importResults = res.data;
          this.currentStep = 3;
          this.toastr.success(`${res.data.created} users imported successfully`);
        } else {
          this.toastr.error(res.message || 'Import failed');
        }
      },
      error: (err: any) => {
        this.importing = false;
        this.toastr.error(err?.error?.message || 'Import request failed');
      }
    });
  }

  reset() {
    this.currentStep = 1;
    this.csvData = [];
    this.validationResults = [];
    this.importResults = null;
    this.validCount = 0;
    this.invalidCount = 0;
    this.importing = false;
    this.fileName = '';
  }
}
