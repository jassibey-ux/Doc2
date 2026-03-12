import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-system-health',
  templateUrl: './system-health.component.html',
  styleUrls: ['./system-health.component.scss'],
})
export class SystemHealthComponent implements OnInit, OnDestroy {
  systemData: any = null;
  loading = true;
  lastRefresh: Date | null = null;
  autoRefreshInterval: any;

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadStatus();
    this.autoRefreshInterval = setInterval(() => this.loadStatus(), 15000);
  }

  ngOnDestroy(): void {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
  }

  loadStatus() {
    this.authService.getSystemStatus().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.systemData = this._coreService.decryptObjectData({ data: res.encryptDatauserdata });
          this.lastRefresh = new Date();
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.toastr.error(err.error?.message || 'Failed to load system status');
        this.loading = false;
      },
    });
  }

  getCollectionKeys(): string[] {
    return this.systemData?.database?.collections
      ? Object.keys(this.systemData.database.collections)
      : [];
  }

  getTotalDocuments(): number {
    if (!this.systemData?.database?.collections) return 0;
    return Object.values(this.systemData.database.collections).reduce((sum: number, v: any) => sum + (v || 0), 0);
  }

  /**
   * Format memory values with smart units (bytes → KB → MB → GB → TB).
   * Handles both raw numeric MB values and pre-formatted strings like "128.5 MB".
   */
  formatMemory(value: any): string {
    if (value == null) return 'N/A';

    // If it's already a formatted string, try to parse and re-format with smart units
    if (typeof value === 'string') {
      const match = value.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
      if (!match) return value; // Return as-is if not parseable
      let num = parseFloat(match[1]);
      const unit = (match[2] || 'MB').toUpperCase();
      // Convert to bytes first
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
      num = num * (multipliers[unit] || multipliers['MB']);
      return this.formatBytes(num);
    }

    // Numeric value — assume MB (common Node.js process.memoryUsage() output)
    if (typeof value === 'number') {
      return this.formatBytes(value * 1024 * 1024);
    }

    return String(value);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const index = Math.min(i, units.length - 1);
    const formatted = (bytes / Math.pow(1024, index)).toFixed(index <= 1 ? 0 : 2);
    return `${formatted} ${units[index]}`;
  }
}
