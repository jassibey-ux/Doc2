import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'signature' | 'textarea';
  required: boolean;
  options: string[];
  validation: { min?: number; max?: number; pattern?: string };
}

interface FormTemplate {
  _id?: string;
  name: string;
  category: string;
  fields: FormField[];
  isActive?: boolean;
  createdAt?: string;
}

@Component({
  selector: 'app-form-builder',
  templateUrl: './form-builder.component.html',
  styleUrls: ['./form-builder.component.scss'],
})
export class FormBuilderComponent implements OnInit {
  templates: FormTemplate[] = [];
  loading = false;

  // Builder state
  showBuilder = false;
  editingTemplate: FormTemplate | null = null;
  templateName = '';
  templateCategory = 'custom';
  builderFields: FormField[] = [];

  categories = [
    { value: 'admission', label: 'Admission' },
    { value: 'discharge', label: 'Discharge' },
    { value: 'medication_reconciliation', label: 'Medication Reconciliation' },
    { value: 'fall_risk', label: 'Fall Risk' },
    { value: 'custom', label: 'Custom' },
  ];

  fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Long Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'multiselect', label: 'Multi-Select' },
    { value: 'boolean', label: 'Yes/No' },
    { value: 'signature', label: 'Signature' },
  ];

  // Submissions viewer
  showSubmissions = false;
  selectedTemplateId = '';
  submissions: any[] = [];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loading = true;
    this.authService.listFormTemplates().subscribe({
      next: (res: any) => {
        this.templates = res?.data || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  openBuilder(template?: FormTemplate) {
    this.showBuilder = true;
    if (template) {
      this.editingTemplate = template;
      this.templateName = template.name;
      this.templateCategory = template.category;
      this.builderFields = JSON.parse(JSON.stringify(template.fields));
    } else {
      this.editingTemplate = null;
      this.templateName = '';
      this.templateCategory = 'custom';
      this.builderFields = [];
    }
  }

  closeBuilder() {
    this.showBuilder = false;
    this.editingTemplate = null;
    this.templateName = '';
    this.builderFields = [];
  }

  addField() {
    this.builderFields.push({
      id: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      options: [],
      validation: {},
    });
  }

  removeField(index: number) {
    this.builderFields.splice(index, 1);
  }

  moveField(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.builderFields.length) return;
    const temp = this.builderFields[index];
    this.builderFields[index] = this.builderFields[target];
    this.builderFields[target] = temp;
  }

  addOption(field: FormField) {
    field.options.push('');
  }

  removeOption(field: FormField, index: number) {
    field.options.splice(index, 1);
  }

  trackByIndex(index: number) {
    return index;
  }

  saveTemplate() {
    if (!this.templateName.trim()) {
      this.toastr.error('Template name is required');
      return;
    }
    if (this.builderFields.length === 0) {
      this.toastr.error('Add at least one field');
      return;
    }
    for (const f of this.builderFields) {
      if (!f.label.trim()) {
        this.toastr.error('All fields must have a label');
        return;
      }
    }

    const payload = {
      name: this.templateName,
      category: this.templateCategory,
      fields: this.builderFields,
    };

    const obs = this.editingTemplate?._id
      ? this.authService.updateFormTemplate(this.editingTemplate._id, payload)
      : this.authService.createFormTemplate(payload);

    obs.subscribe({
      next: () => {
        this.toastr.success(this.editingTemplate ? 'Template updated' : 'Template created');
        this.closeBuilder();
        this.loadTemplates();
      },
      error: () => {
        this.toastr.error('Failed to save template');
      },
    });
  }

  deleteTemplate(id: string) {
    if (!confirm('Deactivate this template?')) return;
    this.authService.deleteFormTemplate(id).subscribe({
      next: () => {
        this.toastr.success('Template deactivated');
        this.loadTemplates();
      },
      error: () => this.toastr.error('Failed to delete template'),
    });
  }

  viewSubmissions(templateId: string) {
    this.selectedTemplateId = templateId;
    this.showSubmissions = true;
    this.authService.listFormSubmissions({ templateId }).subscribe({
      next: (res: any) => {
        this.submissions = res?.data || [];
      },
      error: () => {
        this.submissions = [];
      },
    });
  }

  closeSubmissions() {
    this.showSubmissions = false;
    this.submissions = [];
  }
}
