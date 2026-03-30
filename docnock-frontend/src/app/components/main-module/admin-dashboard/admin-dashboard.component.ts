import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
} from 'ngx-apexcharts';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ChatService } from 'src/app/services/chat.service';
import { CoreService } from 'src/app/shared/core.service';
import { environment } from 'src/environments/environment';
@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent {
  public chartOptions: any;

  // ─── Role-based dashboard ──────────────────────────────────────────────
  isDemo: boolean = (environment as any).isDemo || false;
  currentRole: string = '';

  // KPI data for non-superadmin roles
  myChatsCount: number = 0;
  unreadMessagesCount: number = 0;
  onCallStatus: string = 'Off Duty';
  activeAlertsCount: number = 0;
  shiftStatus: string = 'Off Duty';
  staffCount: number = 0;
  activeChatsCount: number = 0;
  openAlertsCount: number = 0;
  onlineNowCount: number = 0;

  // Recent conversations
  recentConversations: any[] = [];

  predefinedRoles = [
    { id: 'facility_center', name: 'Facilitycenter', moduleName: 'F' },
    { id: 'physician', name: 'Physicians', moduleName: 'P' },
    { id: 'nurse', name: 'Nurses', moduleName: 'N' },
    { id: 'subadmin', name: 'Subadmin', moduleName: 'S' },
    { id: 'other', name: 'Other', moduleName: 'O' },
  ];
  userIds: any = '';
  matchedModuleIds: any = [];

  items = [
    {
      title: 'Facility',
      value: 0,
      lightClass: 'greenlight',
      circleClass: 'green',
      iconClass: 'bxs-doughnut-chart',
      circleCount: 4,
      id: 'facility_center',
    },

    {
      title: 'Physicians',
      value: 0,
      lightClass: 'yellowlight',
      circleClass: 'yellow',
      iconClass: 'bxs-group',
      circleCount: 4,
      id: 'physician',
    },
    {
      title: 'Nurses',
      value: 0,
      lightClass: 'redlight',
      circleClass: 'red',
      iconClass: 'bxs-group',
      circleCount: 4,
      id: 'nurse',
    },
    {
      title: 'Sub Admin',
      value: 0,
      lightClass: 'yellowlight',
      circleClass: 'yellow',
      iconClass: 'bxs-group',
      circleCount: 4,
      id: 'subadmin',
    },
    {
      title: 'Other',
      value: 0,
      lightClass: 'redlight',
      circleClass: 'red',
      iconClass: 'bxs-group',
      circleCount: 4,
      id: 'other',
    },
  ];

  months = [
    { name: 'January', value: 1 },
    { name: 'February', value: 2 },
    { name: 'March', value: 3 },
    { name: 'April', value: 4 },
    { name: 'May', value: 5 },
    { name: 'June', value: 6 },
    { name: 'July', value: 7 },
    { name: 'August', value: 8 },
    { name: 'September', value: 9 },
    { name: 'October', value: 10 },
    { name: 'November', value: 11 },
    { name: 'December', value: 12 },
  ];

  years: number[] = [];
  selectedMonth: number | null = null;
  selectedYear: number | null = null;
  selectedFilter: string = 'date';

  // ─── Enhanced Analytics ───────────────────────────────────────────────
  analyticsData: any = null;
  analyticsLoading: boolean = false;
  responseTimeChart: any = {};
  priorityChart: any = {};
  faxVolumeChart: any = {};
  formCompletionChart: any = {};

  createArray(count: number): number[] {
    return Array(count);
  }
  circles = Array(4);

  getResponsiveClasses(length: number): string {
    switch (length) {
      case 1:
        return 'col-12';
      case 2:
        return 'col-12 col-md-6';
      case 3:
        return 'col-12 col-md-4';
      case 4:
        return 'col-12 col-md-3';
      case 5:
        return 'col-12 col-md-custom-20'; // Custom 20% width on medium+
      default:
        return 'col-12';
    }
  }

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService,
    private chatService: ChatService,
    private router: Router
  ) {
    this.chartOptions = {
      series: [],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0,
          opacityTo: 0,
          stops: [0, 90, 100],
        },
      },
      colors: ['#FF4145', '#FFA600'],

      chart: {
        height: 420,
        width: '100%',
        parentHeightOffset: 0,
        type: 'area',
        toolbar: {
          show: true,
          tools: {
            download: false,
            selection: false,
            zoom: false,
            zoomin: false,
            zoomout: false,
            pan: false,
            reset: false,
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: 'smooth',
        width: 1,
      },
      grid: {
        borderColor: '#00FFF7',
        yaxis: {
          lines: {
            show: false,
          },
        },
        xaxis: {
          lines: {
            show: true,
          },
        },
      },
      xaxis: {
        axisBorder: {
          show: false,
          color: '#FF5733', // Set Y-axis line color
        },
        lines: {
          show: false,
        },
        type: 'datetime',
        categories: [
          '2018-09-19T00:00:00.000Z',
          '2018-09-19T01:30:00.000Z',
          '2018-09-19T02:30:00.000Z',
          '2018-09-19T03:30:00.000Z',
          '2018-09-19T04:30:00.000Z',
          '2018-09-19T05:30:00.000Z',
          '2018-09-19T06:30:00.000Z',
        ],
        labels: {
          style: {
            colors: '#00FFF7',
            fontSize: '12px',
          },
        },
      },
      yaxis: {
        lines: {
          show: false,
        },
        type: 'datetime',
        categories: [
          '2018-09-19T00:00:00.000Z',
          '2018-09-19T01:30:00.000Z',
          '2018-09-19T02:30:00.000Z',
          '2018-09-19T03:30:00.000Z',
          '2018-09-19T04:30:00.000Z',
          '2018-09-19T05:30:00.000Z',
          '2018-09-19T06:30:00.000Z',
        ],
        labels: {
          style: {
            colors: '#00FFF7',
            fontSize: '12px',
          },
        },
      },
      tooltip: {
        theme: 'dark',
        style: {
          fontSize: '14px',
          fontFamily: 'Segoe UI, sans-serif',
          color: '#000000',
        },
        marker: {
          show: false,
        },
        background: '#808080',
        borderRadius: 5,
        padding: 10,
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        labels: {
          colors: ['#FF4145', '#FFA600'],
        },
      },
    };
  }
  ngOnInit(): void {
    this.currentRole = localStorage.getItem('role') || '';

    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 2024; i--) {
      this.years.push(i);
    }

    if (this.currentRole === 'superadmin') {
      // Load full superadmin dashboard
      this.getUserDetails();
      this.getGraph('date');
      this.loadAnalyticsDashboard();
    } else {
      // Load role-specific KPI data
      this.loadRoleKpiData();
      this.loadRecentConversations();
    }
  }

  getUserDetails() {
    this.authService.getUserById().subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.userIds = response?.userIds || null;
          this.getPermission();
        } else {
          +651;
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }
  getPermission() {
    this.authService.getPermission().subscribe({
      next: (res: any) => {
        if (res.status) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          let matchedModules = this.predefinedRoles.filter((predefined) =>
            response.some(
              (apiData: { moduleName: string }) =>
                apiData.moduleName === predefined.moduleName
            )
          );
          this.matchedModuleIds = matchedModules.map((mod) => mod.id);
          this.getCount(this.matchedModuleIds);
        }
      },
      error: (err: any) => {
        this.toastr.error('Count Not Found');
      },
    });
  }

  getCount(matchedModuleIds: any, month: any = null, year: any = null) {
    let data = {
      roles: matchedModuleIds,
      month: month,
      year: year,
      userId: this.userIds,
    };
    this.authService.countUsersByRole(data).subscribe({
      next: (res: any) => {
        let response = this._coreService.decryptObjectData({
          data: res.encryptDatauserdata,
        });
        const responseMap = Object.fromEntries(
          response.map((item: any) => [item.role, item.count])
        );
        this.items = this.items
          .filter((item) => responseMap.hasOwnProperty(item.id)) // only keep matched ones
          .map((item) => ({
            ...item,
            value: responseMap[item.id],
          }));
      },
    });
  }

  getFilterChange(val:any){
    this.getGraph(val)
  }

  

setChartData(apiData: any[], filterType: 'date' | 'month' | 'year') {

  const isDarkMode = localStorage.getItem('darkMode') === 'true';

  let messageSeries: { x: any; y: number }[] = [];
  let callSeries: { x: any; y: number }[] = [];

  /* ---------- DATE ---------- */
  if (filterType === 'date') {
    messageSeries = apiData.map(item => ({
      x: new Date(item.date).getTime(), // timestamp
      y: item.messageCount
    }));

    callSeries = apiData.map(item => ({
      x: new Date(item.date).getTime(),
      y: item.call
    }));
  }

  /* ---------- MONTH ---------- */
  else if (filterType === 'month') {
    messageSeries = apiData.map(item => ({
      x: item.date, // "2026-01"
      y: item.messageCount
    }));

    callSeries = apiData.map(item => ({
      x: item.date,
      y: item.call
    }));
  }

  /* ---------- YEAR ---------- */
  else {
    messageSeries = apiData.map(item => ({
      x: item.date, // "2025"
      y: item.messageCount
    }));

    callSeries = apiData.map(item => ({
      x: item.date,
      y: item.call
    }));
  }

  const curveType = filterType === 'year' ? 'straight' : 'smooth';

  this.chartOptions = {
    series: [
      { name: 'Messages', data: messageSeries },
      { name: 'Calls', data: callSeries }
    ],

    chart: {
      type: 'area',
      height: 420,
      width: '100%',
      parentHeightOffset: 0,
      background: isDarkMode ? '#000000' : '#FFFFFF',
      foreColor: isDarkMode ? '#ffffff' : '#000000',
      toolbar: { show: false }
    },

    stroke: {
      curve: curveType,
      width: 2
    },

    xaxis: {
      type: filterType === 'date' ? 'datetime' : 'category',
      labels: {
        datetimeUTC: false
      }
    },

    yaxis: {
      min: 0
    },

    tooltip: {
      theme: isDarkMode ? 'dark' : 'light',
      x: {
        format: filterType === 'date' ? 'dd MMM HH:mm' : undefined
      }
    },

    colors: ['#FF4145', '#FFA600'],
    dataLabels: { enabled: false }
  };
}

updateChartBackground(isDark: boolean) {
    this.chartOptions = {
      ...this.chartOptions,
      chart: {
        ...this.chartOptions.chart,
        background: isDark ? '#1E1E1E' : '#FFFFFF'
      }
    };
}


  getGraph(filter: any) {
    this.authService.countGraph(filter).subscribe({
      next: (res: any) => {
        console.log(res, '====>12345');
        const apiData = res.data;
        // Extract values
        this.setChartData(apiData, filter);

      },
    });
  }

  onMonthChange(month: number | null) {
    this.selectedMonth = month;
    if (!this.selectedYear) {
      this.selectedYear = new Date().getFullYear(); // Default year
      this.getCount(
        this.matchedModuleIds,
        this.selectedMonth,
        this.selectedYear
      );
    } else {
      this.getCount(
        this.matchedModuleIds,
        this.selectedMonth,
        this.selectedYear
      );
    }
  }

  onYearChange(year: number | null) {
    this.selectedYear = year;
    this.getCount(this.matchedModuleIds, this.selectedMonth, this.selectedYear);
  }

  // ─── Enhanced Analytics Methods ─────────────────────────────────────────

  loadAnalyticsDashboard() {
    this.analyticsLoading = true;
    this.authService.getAnalyticsDashboard().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.analyticsData = res.data;
          this.buildResponseTimeChart();
          this.buildPriorityChart();
          this.buildFaxVolumeChart();
          this.buildFormCompletionChart();
        }
        this.analyticsLoading = false;
      },
      error: () => {
        this.analyticsLoading = false;
      },
    });
  }

  buildResponseTimeChart() {
    const data = this.analyticsData?.avgResponseTime || {};
    const roles = Object.keys(data);
    if (!roles.length) return;
    const values = roles.map(r => Math.round((data[r]?.avgSeconds || 0) / 60));

    this.responseTimeChart = {
      series: [{ name: 'Avg Response (min)', data: values }],
      chart: { type: 'bar', height: 200, toolbar: { show: false } },
      xaxis: {
        categories: roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)),
      },
      colors: ['#005EB8'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => val + 'm',
      },
    };
  }

  buildPriorityChart() {
    const p = this.analyticsData?.priorityBreakdown || {};
    this.priorityChart = {
      series: [p.ROUTINE || 0, p.URGENT || 0, p.CRITICAL || 0],
      chart: { type: 'donut', height: 200 },
      labels: ['Routine', 'Urgent', 'Critical'],
      colors: ['#007F3B', '#D5600A', '#D5281B'],
      legend: { position: 'bottom', fontSize: '12px' },
      plotOptions: { pie: { donut: { size: '60%' } } },
    };
  }

  buildFaxVolumeChart() {
    const faxData = this.analyticsData?.faxVolumeByDay || [];
    if (!faxData.length) return;
    this.faxVolumeChart = {
      series: [
        { name: 'Inbound', data: faxData.map((d: any) => ({ x: d.date, y: d.inbound })) },
        { name: 'Outbound', data: faxData.map((d: any) => ({ x: d.date, y: d.outbound })) },
      ],
      chart: { type: 'bar', height: 200, stacked: true, toolbar: { show: false } },
      xaxis: { type: 'category' },
      colors: ['#005EB8', '#00838F'],
      plotOptions: { bar: { borderRadius: 2, columnWidth: '70%' } },
      dataLabels: { enabled: false },
    };
  }

  buildFormCompletionChart() {
    const f = this.analyticsData?.formCompletionRate || {};
    const completed = f.completed || 0;
    const pending = Math.max(0, (f.sent || 0) - completed - (f.expired || 0));
    const expired = f.expired || 0;
    if (completed + pending + expired === 0) return;
    this.formCompletionChart = {
      series: [completed, pending, expired],
      chart: { type: 'donut', height: 200 },
      labels: ['Completed', 'Pending', 'Expired'],
      colors: ['#007F3B', '#D5600A', '#D5281B'],
      legend: { position: 'bottom', fontSize: '12px' },
      plotOptions: { pie: { donut: { size: '60%' } } },
    };
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return seconds + 's';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + 'm' + (secs > 0 ? ' ' + secs + 's' : '');
  }

  // ─── Role-specific dashboard methods ─────────────────────────────────────

  loadRoleKpiData() {
    const userId = localStorage.getItem('userId') || '';

    // Load unread count
    this.authService.getNotification(userId).subscribe({
      next: (res: any) => {
        this.unreadMessagesCount = res?.unreadCount || res?.data?.unreadCount || 0;
      },
      error: () => {}
    });

    // Load chat count from group list
    this.chatService.getgrouplist(1, 1, userId).subscribe({
      next: (res: any) => {
        this.myChatsCount = res?.totalCount || res?.data?.totalCount || 0;
        this.activeChatsCount = this.myChatsCount;
      },
      error: () => {}
    });
  }

  loadRecentConversations() {
    const userId = localStorage.getItem('userId') || '';
    this.chatService.getgrouplist(5, 1, userId).subscribe({
      next: (res: any) => {
        const groups = res?.data?.data || res?.data || [];
        this.recentConversations = (Array.isArray(groups) ? groups : []).slice(0, 5).map((g: any) => ({
          name: g.groupName || g.name || 'Unknown',
          lastMessage: g.lastMessage || g.last_message || 'No messages yet',
          time: g.updatedAt || g.lastMessageTime || ''
        }));
      },
      error: () => {
        this.recentConversations = [];
      }
    });
  }

  navigateTo(path: string) {
    this.router.navigate([path]);
  }

  formatTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + 'h ago';
    const diffDays = Math.floor(diffHours / 24);
    return diffDays + 'd ago';
  }
}
