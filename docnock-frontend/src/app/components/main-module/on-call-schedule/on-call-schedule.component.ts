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
  viewMode: 'day' | 'week' | 'month' = 'week';
  weekStart: Date = this.getMonday(new Date());
  weekDays: Date[] = [];
  scheduleMatrix: Record<string, Record<string, ScheduleEntry[]>> = {};

  selectedDate: Date = new Date();
  currentMonth: Date = new Date();
  monthWeeks: Date[][] = [];
  allEntries: ScheduleEntry[] = [];

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
    this.buildMonthGrid();
    this.loadFacilities();
  }

  setViewMode(mode: 'day' | 'week' | 'month'): void {
    this.viewMode = mode;
    if (this.selectedFacilityId) this.loadSchedule();
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

  prevDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() - 1);
    this.selectedDate = d;
    if (this.selectedFacilityId) this.loadSchedule();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.selectedDate = d;
    if (this.selectedFacilityId) this.loadSchedule();
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.weekStart = this.getMonday(new Date());
    this.buildWeekDays();
    this.currentMonth = new Date();
    this.buildMonthGrid();
    if (this.selectedFacilityId) this.loadSchedule();
  }

  getDayEntries(role: string): ScheduleEntry[] {
    const dayStart = new Date(this.selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(this.selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    return this.allEntries.filter((e) => {
      if (e.role !== role) return false;
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      return start <= dayEnd && end >= dayStart;
    });
  }

  buildMonthGrid(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = this.getMonday(firstDay);
    this.monthWeeks = [];
    let current = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      this.monthWeeks.push(week);
      if (current.getMonth() !== month && current.getDate() > 7) break;
    }
  }

  prevMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.buildMonthGrid();
    if (this.selectedFacilityId) this.loadSchedule();
  }

  nextMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.buildMonthGrid();
    if (this.selectedFacilityId) this.loadSchedule();
  }

  isCurrentMonth(date: Date): boolean {
    return date.getMonth() === this.currentMonth.getMonth();
  }

  getMonthDayEntries(date: Date): ScheduleEntry[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return this.allEntries.filter((e) => {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      return start <= dayEnd && end >= dayStart;
    });
  }

  monthDayClick(date: Date): void {
    this.selectedDate = date;
    this.setViewMode('day');
  }

  roleColor(role: string): string {
    switch (role) {
      case 'physician': return '#2F936D';
      case 'nurse': return '#3B82F6';
      case 'charge_nurse': return '#8B5CF6';
      case 'specialist': return '#F59E0B';
      default: return '#6B7280';
    }
  }

  roleInitial(role: string): string {
    switch (role) {
      case 'physician': return 'Dr';
      case 'nurse': return 'RN';
      case 'charge_nurse': return 'CN';
      case 'specialist': return 'Sp';
      default: return '?';
    }
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
    let from: string;
    let to: string;

    if (this.viewMode === 'day') {
      const dayStart = new Date(this.selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(this.selectedDate);
      dayEnd.setHours(23, 59, 59, 999);
      from = dayStart.toISOString();
      to = dayEnd.toISOString();
    } else if (this.viewMode === 'month') {
      const firstWeek = this.monthWeeks[0];
      const lastWeek = this.monthWeeks[this.monthWeeks.length - 1];
      from = firstWeek[0].toISOString();
      const endDate = new Date(lastWeek[6]);
      endDate.setHours(23, 59, 59);
      to = endDate.toISOString();
    } else {
      from = this.weekStart.toISOString();
      const weekEnd = new Date(this.weekDays[6]);
      weekEnd.setHours(23, 59, 59);
      to = weekEnd.toISOString();
    }

    this.authService
      .getFacilitySchedule(this.selectedFacilityId, from, to)
      .subscribe({
        next: (res: any) => {
          const entries: ScheduleEntry[] = res?.data ?? [];
          this.allEntries = entries;
          if (this.viewMode === 'week') {
            this.buildMatrix(entries);
          }
        },
        error: () => this.toastr.error('Failed to load schedule'),
      });
  }

  buildMatrix(entries: ScheduleEntry[]): void {
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
      next: (res: any) => { this.onCallNow = res?.data ?? null; },
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

  get timeInvalid(): boolean {
    const start = this.addForm.get('startTime')?.value;
    const end = this.addForm.get('endTime')?.value;
    if (!start || !end) return false;
    return new Date(end) <= new Date(start);
  }

  saveSchedule(): void {
    if (this.addForm.invalid || this.timeInvalid) return;
    const payload = this.addForm.value;
    const obs = this.editingEntry
      ? this.authService.updateSchedule(this.editingEntry._id!, payload)
      : this.authService.createSchedule(payload);
    obs.subscribe({
      next: (res: any) => {
        if (res?.data?.warning) {
          this.toastr.warning(res.data.warning, 'Overlap Detected');
        } else {
          this.toastr.success(this.editingEntry ? 'Schedule updated' : 'Schedule created');
        }
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
