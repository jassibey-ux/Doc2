import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-ai-templates',
  templateUrl: './ai-templates.component.html',
  styleUrls: ['./ai-templates.component.scss'],
})
export class AiTemplatesComponent implements OnInit {
  templates: any[] = [];
  loading: boolean = true;
  selectedTemplate: any = null;
  variables: { [key: string]: string } = {};
  result: string = '';
  running: boolean = false;
  activeCategory: string = '';

  // Create modal
  showCreateModal: boolean = false;
  newTemplate: any = {
    name: '',
    description: '',
    category: 'clinical',
    icon: 'bx-file',
    systemPrompt: '',
    userPromptTemplate: '',
    variables: [],
  };
  creating: boolean = false;

  categories = [
    { value: '', label: 'All', icon: 'bx-grid-alt' },
    { value: 'clinical', label: 'Clinical', icon: 'bx-first-aid' },
    { value: 'family', label: 'Family', icon: 'bx-group' },
    { value: 'admin', label: 'Admin', icon: 'bx-cog' },
  ];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loading = true;
    const category = this.activeCategory || undefined;
    this.authService.getAiTemplates(category).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.templates = res.templates || [];
        }
        this.loading = false;
      },
      error: () => {
        this.toastr.error('Failed to load templates');
        this.loading = false;
      },
    });
  }

  filterByCategory(cat: string) {
    this.activeCategory = cat;
    this.selectedTemplate = null;
    this.result = '';
    this.loadTemplates();
  }

  selectTemplate(tmpl: any) {
    this.selectedTemplate = tmpl;
    this.result = '';
    this.variables = {};
    (tmpl.variables || []).forEach((v: any) => {
      this.variables[v.key] = '';
    });
  }

  closeTemplate() {
    this.selectedTemplate = null;
    this.result = '';
    this.variables = {};
  }

  runTemplate() {
    if (!this.selectedTemplate) return;

    // Validate required variables
    const missing = (this.selectedTemplate.variables || []).find(
      (v: any) => !this.variables[v.key]?.trim()
    );
    if (missing) {
      this.toastr.warning(`Please fill in: ${missing.label}`);
      return;
    }

    this.running = true;
    this.result = '';

    this.authService.runAiTemplate(this.selectedTemplate._id, this.variables).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.result = res.answer;
        } else {
          this.toastr.error(res.message || 'Failed to run template');
        }
        this.running = false;
      },
      error: () => {
        this.toastr.error('Failed to run template. Please try again.');
        this.running = false;
      },
    });
  }

  copyResult() {
    if (!this.result) return;
    navigator.clipboard.writeText(this.result).then(() => {
      this.toastr.success('Copied to clipboard');
    });
  }

  openCreateModal() {
    this.showCreateModal = true;
    this.newTemplate = {
      name: '',
      description: '',
      category: 'clinical',
      icon: 'bx-file',
      systemPrompt: '',
      userPromptTemplate: '',
      variables: [],
    };
  }

  addVariable() {
    this.newTemplate.variables.push({ key: '', label: '', placeholder: '', type: 'textarea' });
  }

  removeVariable(index: number) {
    this.newTemplate.variables.splice(index, 1);
  }

  createTemplate() {
    if (!this.newTemplate.name?.trim() || !this.newTemplate.systemPrompt?.trim() || !this.newTemplate.userPromptTemplate?.trim()) {
      this.toastr.warning('Name, system prompt, and user prompt template are required');
      return;
    }

    this.creating = true;
    this.authService.createAiTemplate(this.newTemplate).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Template created');
          this.showCreateModal = false;
          this.loadTemplates();
        } else {
          this.toastr.error(res.message || 'Failed to create template');
        }
        this.creating = false;
      },
      error: () => {
        this.toastr.error('Failed to create template');
        this.creating = false;
      },
    });
  }

  getCategoryColor(cat: string): string {
    switch (cat) {
      case 'clinical': return '#3B82F6';
      case 'family': return '#10B981';
      case 'admin': return '#8B5CF6';
      default: return '#64748b';
    }
  }
}
