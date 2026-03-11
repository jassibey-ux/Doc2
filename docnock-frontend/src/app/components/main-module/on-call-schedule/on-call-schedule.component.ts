import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

export interface ScheduleEntry {
  _id?: string;
  facilityId: string;
  role: string;
  userId: string;
  userDetails?: { fullName: string; profileImage?: string };
  startTime: string;
  endTime: string;
  timezone: string;
  isBackup: boolean;
  notes?: string;
}

const ROLES = ['physician', 'nurse', 'charge_nurse', 'specialist'] as const;
const DAYS_IN_WEEK = 7;

@Component({
  selector: 'app-on-call-schedule',
  templateUrl: './on-call-schedule.component.html',
  styleUrls: ['./on-call-schedule.component.scss'],
})
export class OnCallScheduleComponent implements OnInit {
  roles = [...ROLES];
  facilities: any[] = [];
  nurses: any[] = [];
  physicians: any[] = [];
  allUsers: any[] = [];

  selectedFacilityId = '';
  weekStart: Date = this.getMonday(new Date());
  weekDays: Date[] = [];
  scheduleMatrix: Record<string, Record<string, ScheduleEntry[]>> = {};
  // scheduleMatrix[role][dayIso] = entries[]

  showAddModal = false;
  addForm: FormGroup;
  editingEntry: ScheduleEntry | null = null;

  onCallNow: ScheduleEntry | null = null;

  constructor(
    private authService: AuthServiceService,
    private coreService: CoreService,
    private fb: FormBuilder,
    private toastr: ToastrService
  ) {
    this.addForm = this.fb.group({
      facilityId: ['', Validators.required],
      role: ['physician', Validators.required],
      userId: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      timezone: ['America/New_York', Validators.required],
      isBackup: [false],
      notes: [''],
    });
  }

  ngOnInit(): void {
    this.buildWeekDays();
    this.loadFacilities();
  }

  getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  buildWeekDays(): void {
    this.weekDays = Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  prevWeek(): void {
    this.weekStart.setDate(this.weekStart.getDate() - 7);
    this.weekStart = new Date(this.weekStart);
    this.buildWeekDays();
    if (this.selectedFacilityId) this.loadSchedule();
  }

  nextWeek(): void {
    this.weekStart.setDate(this.weekStart.getDate() + 7);
    this.weekStart = new Date(this.weekStart);
    this.buildWeekDays();
    if (this.selectedFacilityId) this.loadSchedule();
  }

  dayIso(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  isToday(date: Date): boolean {
    return this.dayIso(date) === this.dayIso(new Date());
  }

  loadFacilities(): void {
    this.authService.listUsers({ role: 'facility_center', limit: 200 }).subscribe({
      next: (res: any) => {
        this.facilities = res?.data?.data ?? res?.data ?? [];
      },
      error: () => this.toastr.error('Failed to load facilities'),
    });
  }

  onFacilityChange(): void {
    if (!this.selectedFacilityId) return;
    this.addForm.patchValue({ facilityId: this.selectedFacilityId });
    this.loadSchedule();
    this.loadFacilityUsers();
    this.loadOnCallNow();
  }

  loadFacilityUsers(): void {
    this.authService.listUsers({ limit: 500 }).subscribe({
      next: (res: any) => {
        this.allUsers = res?.data?.data ?? res?.data ?? [];
      },
      error: () => {},
    });
  }

  loadSchedule(): void {
    const from = this.weekStart.toISOString();
    const to = new Date(this.weekDays[6]);
    to.setHours(23, 59, 59);

    this.authService
      .getFacilitySchedule(this.selectedFacilityId, from, to.toISOString())
      .subscribe({
        next: (res: any) => {
          const entries: ScheduleEntry[] = res?.data ?? [];
          this.buildMatrix(entries);
        },
        error: () => this.toastr.error('Failed to load schedule'),
      });
  }

  buildMatrix(entries: ScheduleEntry[]): void {
    // Reset matrix
    this.scheduleMatrix = {};
    for (const role of this.roles) {
      this.scheduleMatrix[role] = {};
      for (const day of this.weekDays) {
        this.scheduleMatrix[role][this.dayIso(day)] = [];
      }
    }

    for (const entry of entries) {
      const entryStart = new Date(entry.startTime);
      const entryEnd = new Date(entry.endTime);

      for (const day of this.weekDays) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        // Entry overlaps with this day
        if (entryStart <= dayEnd && entryEnd >= dayStart) {
          if (this.scheduleMatrix[entry.role]) {
            this.scheduleMatrix[entry.role][this.dayIso(day)].push(entry);
          }
        }
      }
    }
  }

  getCell(role: string, day: Date): ScheduleEntry[] {
    return this.scheduleMatrix[role]?.[this.dayIso(day)] ?? [];
  }

  hasGap(role: string, day: Date): boolean {
    return this.isToday(day) && this.getCell(role, day).length === 0;
  }

  loadOnCallNow(): void {
    this.authService.getOnCallNow(this.selectedFacilityId).subscribe({
      next: (res: any) => {
        this.onCallNow = res?.data ?? null;
      },
      error: () => {},
    });
  }

  openAddModal(prefillRole?: string, prefillDay?: Date): void {
    this.editingEntry = null;
    this.addForm.reset({
      facilityId: this.selectedFacilityId,
      role: prefillRole ?? 'physician',
      timezone: 'America/New_York',
      isBackup: false,
      startTime: prefillDay ? this.toLocalInputValue(prefillDay) : '',
      endTime: '',
    });
    this.showAddModal = true;
  }

  openEditModal(entry: ScheduleEntry): void {
    this.editingEntry = entry;
    this.addForm.patchValue({
      facilityId: entry.facilityId,
      role: entry.role,
      userId: entry.userId,
      startTime: this.toLocalInputValue(new Date(entry.startTime)),
      endTime: this.toLocalInputValue(new Date(entry.endTime)),
      timezone: entry.timezone,
      isBackup: entry.isBackup,
      notes: entry.notes ?? '',
    });
    this.showAddModal = true;
  }

  toLocalInputValue(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  closeModal(): void {
    this.showAddModal = false;
    this.editingEntry = null;
  }

  saveSchedule(): void {
    if (this.addForm.invalid) return;

    const payload = this.addForm.value;

    const obs = this.editingEntry
      ? this.authService.updateSchedule(this.editingEntry._id!, payload)
      : this.authService.createSchedule(payload);

    obs.subscribe({
      next: () => {
        this.toastr.success(this.editingEntry ? 'Schedule updated' : 'Schedule created');
        this.closeModal();
        this.loadSchedule();
        this.loadOnCallNow();
      },
      error: () => this.toastr.error('Failed to save schedule'),
    });
  }

  deleteSchedule(entry: ScheduleEntry): void {
    if (!confirm(`Delete on-call slot for ${entry.role}?`)) return;
    this.authService.deleteSchedule(entry._id!).subscribe({
      next: () => {
        this.toastr.success('Schedule deleted');
        this.loadSchedule();
      },
      error: () => this.toastr.error('Failed to delete schedule'),
    });
  }

  getUserName(userId: string): string {
    const user = this.allUsers.find((u) => u._id === userId);
    return user?.fullName ?? userId;
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  roleLabel(role: string): string {
    return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
