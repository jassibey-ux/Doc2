import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

interface ConfigItem {
  _id: string;
  key: string;
  value: any;
  defaultValue: any;
  category: string;
  dataType: string;
  label: string;
  description: string;
  unit: string;
  validation: { min?: number; max?: number; pattern?: string; options?: string[] };
  requiresRestart: boolean;
  lastModifiedBy: any;
  lastModifiedAt: string;
  // UI state
  editValue?: any;
  saving?: boolean;
  dirty?: boolean;
}

@Component({
  selector: 'app-system-settings',
  templateUrl: './system-settings.component.html',
  styleUrls: ['./system-settings.component.scss'],
})
export class SystemSettingsComponent implements OnInit {
  configGroups: Record<string, ConfigItem[]> = {};
  loading = true;
  seeding = false;
  showRestartBanner = false;
  activeCategory = 'authentication';

  categoryMeta: Record<string, { label: string; icon: string }> = {
    authentication: { label: 'Authentication', icon: 'bx bxs-lock-alt' },
    file_management: { label: 'File Management', icon: 'bx bxs-file' },
    communication: { label: 'Communication', icon: 'bx bxs-message-rounded' },
    caching: { label: 'Caching', icon: 'bx bxs-timer' },
    system: { label: 'System', icon: 'bx bxs-server' },
  };

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig() {
    this.loading = true;
    this.authService.getSystemConfig().subscribe({
      next: (res: any) => {
        if (res.success) {
          const data = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });
          this.configGroups = {};
          for (const [category, items] of Object.entries(data as Record<string, any[]>)) {
            this.configGroups[category] = (items as any[]).map((item: any) => ({
              ...item,
              editValue: this.cloneValue(item.value),
              dirty: false,
              saving: false,
            }));
          }
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load system config');
        this.loading = false;
      },
    });
  }

  seedConfig() {
    this.seeding = true;
    this.authService.seedSystemConfig().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success(res.message || 'Config seeded successfully');
          this.loadConfig();
        }
        this.seeding = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to seed config');
        this.seeding = false;
      },
    });
  }

  getCategoryKeys(): string[] {
    return Object.keys(this.categoryMeta);
  }

  setActiveCategory(cat: string) {
    this.activeCategory = cat;
  }

  onValueChange(item: ConfigItem) {
    item.dirty = JSON.stringify(item.editValue) !== JSON.stringify(item.value);
  }

  onArrayChange(item: ConfigItem, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    item.editValue = val.split(',').map((s: string) => s.trim()).filter((s: string) => s);
    this.onValueChange(item);
  }

  saveItem(item: ConfigItem) {
    item.saving = true;
    this.authService.updateSystemConfig(item.key, item.editValue).subscribe({
      next: (res: any) => {
        if (res.success) {
          item.value = this.cloneValue(item.editValue);
          item.dirty = false;
          this.toastr.success(`${item.label} updated`);
          if (res.requiresRestart) {
            this.showRestartBanner = true;
          }
        }
        item.saving = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || `Failed to update ${item.label}`);
        item.saving = false;
      },
    });
  }

  resetItem(item: ConfigItem) {
    item.saving = true;
    this.authService.resetSystemConfig(item.key).subscribe({
      next: (res: any) => {
        if (res.success) {
          const updated = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });
          item.value = updated.value;
          item.editValue = this.cloneValue(updated.value);
          item.dirty = false;
          this.toastr.success(`${item.label} reset to default`);
        }
        item.saving = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || `Failed to reset ${item.label}`);
        item.saving = false;
      },
    });
  }

  isModified(item: ConfigItem): boolean {
    return JSON.stringify(item.value) !== JSON.stringify(item.defaultValue);
  }

  hasConfigs(): boolean {
    return Object.keys(this.configGroups).length > 0;
  }

  private cloneValue(val: any): any {
    if (Array.isArray(val)) return [...val];
    return val;
  }
}
