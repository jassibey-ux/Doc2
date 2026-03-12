import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { AdminLayoutComponent } from './components/main-module/admin-layout/admin-layout.component';
import { AdminDashboardComponent } from './components/main-module/admin-dashboard/admin-dashboard.component';
import { RolePermissionComponent } from './components/main-module/role-permission/role-permission.component';
import { AssistedLivingComponent } from './components/main-module/assisted-living/assisted-living.component';
import { OtpVerificationComponent } from './components/auth/otp-verification/otp-verification.component';
import { AddAssistedLivingComponent } from './components/main-module/add-assisted-living/add-assisted-living.component';
import { AuthGuard } from './shared/auth.guard';
import { AuthGuardLogin } from './shared/auth.loginguard';
import { ProfileComponent } from './components/main-module/profile/profile.component';
import { AccountSettingComponent } from './components/main-module/account-setting/account-setting.component';
import { SetupProfileComponent } from './components/auth/setup-profile/setup-profile.component';
import { EditUserComponent } from './components/main-module/edit-user/edit-user.component';
import { ForgetPassowordComponent } from './components/auth/forget-passoword/forget-passoword.component';
import { ResetPassowordComponent } from './components/auth/reset-passoword/reset-passoword.component';
import { ChatsComponent } from './components/chats/chats.component';
import { VideoCallComponent } from './components/video-call/video-call.component';
import { OnCallScheduleComponent } from './components/main-module/on-call-schedule/on-call-schedule.component';
import { FaxInboxComponent } from './components/main-module/fax-inbox/fax-inbox.component';
import { FormBuilderComponent } from './components/main-module/form-builder/form-builder.component';
import { FamilyPortalComponent } from './components/family-portal/family-portal.component';
import { IntegrationMonitorComponent } from './components/main-module/integration-monitor/integration-monitor.component';
import { AuditLogViewerComponent } from './components/main-module/audit-log-viewer/audit-log-viewer.component';
import { SystemHealthComponent } from './components/main-module/system-health/system-health.component';
import { SecurityMonitorComponent } from './components/main-module/security-monitor/security-monitor.component';
import { SystemSettingsComponent } from './components/main-module/system-settings/system-settings.component';
import { ShiftHandoffComponent } from './components/main-module/shift-handoff/shift-handoff.component';
import { SbarReportComponent } from './components/main-module/sbar-report/sbar-report.component';
import { ClinicalAlertsComponent } from './components/main-module/clinical-alerts/clinical-alerts.component';
import { ConsultationRequestComponent } from './components/main-module/consultation-request/consultation-request.component';
import { PatientStatusBoardComponent } from './components/main-module/patient-status-board/patient-status-board.component';
import { MultiFacilityComponent } from './components/main-module/multi-facility/multi-facility.component';
import { SsoSettingsComponent } from './components/main-module/sso-settings/sso-settings.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [AuthGuardLogin] },
  { path: 'otp-verification', component: OtpVerificationComponent },
  { path: 'setup-profile', component: SetupProfileComponent },
  { path: 'forgot-password', component: ForgetPassowordComponent },
  { path: 'reset-password', component: ResetPassowordComponent },
  { path: 'family/verify/:token', component: FamilyPortalComponent },
  { path: 'family/portal', component: FamilyPortalComponent },

  {
    path: ':dynamicPath',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'role-permission', component: RolePermissionComponent },
      { path: 'chats', component: ChatsComponent },
      { path: 'video-call', component: VideoCallComponent },
      { path: ':dynamicPathDetails/list', component: AssistedLivingComponent },
      { path: ':dynamicPathDetails/add', component: AddAssistedLivingComponent },
      { path: ':dynamicPathDetails/edit', component: EditUserComponent },
      { path: 'on-call-schedule', component: OnCallScheduleComponent },
      { path: 'fax-inbox', component: FaxInboxComponent },
      { path: 'form-builder', component: FormBuilderComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'setting', component: AccountSettingComponent },
      { path: 'integrations', component: IntegrationMonitorComponent },
      { path: 'audit-logs', component: AuditLogViewerComponent },
      { path: 'system-health', component: SystemHealthComponent },
      { path: 'security', component: SecurityMonitorComponent },
      { path: 'system-settings', component: SystemSettingsComponent },
      { path: 'shift-handoff', component: ShiftHandoffComponent },
      { path: 'sbar', component: SbarReportComponent },
      { path: 'clinical-alerts', component: ClinicalAlertsComponent },
      { path: 'consultations', component: ConsultationRequestComponent },
      { path: 'patient-board', component: PatientStatusBoardComponent },
      { path: 'facilities', component: MultiFacilityComponent },
      { path: 'sso-settings', component: SsoSettingsComponent },
    ],
    canActivate: [AuthGuard],
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
