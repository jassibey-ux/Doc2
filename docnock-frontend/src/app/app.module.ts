import { HttpClientModule, HTTP_INTERCEPTORS } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { NgOtpInputModule } from "ng-otp-input";
import { NgxApexchartsModule } from "ngx-apexcharts";
import { ToastrModule } from "ngx-toastr";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { LoginComponent } from "./components/auth/login/login.component";
import { OtpVerificationComponent } from "./components/auth/otp-verification/otp-verification.component";
import { NavBarComponent } from "./components/common/nav-bar/nav-bar.component";
import { SideBarComponent } from "./components/common/side-bar/side-bar.component";
import { AddAssistedLivingComponent } from "./components/main-module/add-assisted-living/add-assisted-living.component";
import { AdminDashboardComponent } from "./components/main-module/admin-dashboard/admin-dashboard.component";
import { AdminLayoutComponent } from "./components/main-module/admin-layout/admin-layout.component";
import { AssistedLivingComponent } from "./components/main-module/assisted-living/assisted-living.component";
import { RolePermissionComponent } from "./components/main-module/role-permission/role-permission.component";
import { AuthInterceptor } from "./shared/auth.interceptor";
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatPaginationStyleDirective } from './shared/mat-pagination-style.directive';
import { FilterPipe } from './shared/filter.pipe';
import { NgxGpAutocompleteModule } from "@angular-magic/ngx-gp-autocomplete";
import { Loader } from '@googlemaps/js-api-loader';
import { MultiSelectComponent } from './shared/multi-select/multi-select.component';
import { NgSelectModule } from '@ng-select/ng-select';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ProfileComponent } from './components/main-module/profile/profile.component';
import { AccountSettingComponent } from './components/main-module/account-setting/account-setting.component';
import { SetupProfileComponent } from './components/auth/setup-profile/setup-profile.component';
import { EditUserComponent } from './components/main-module/edit-user/edit-user.component';
import { ForgetPassowordComponent } from "./components/auth/forget-passoword/forget-passoword.component";
import { ResetPassowordComponent } from "./components/auth/reset-passoword/reset-passoword.component";
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
import { FacilityFormModalComponent } from './components/main-module/multi-facility/facility-form-modal/facility-form-modal.component';
import { SsoSettingsComponent } from './components/main-module/sso-settings/sso-settings.component';
import { ClinicalHubComponent } from './components/main-module/clinical-hub/clinical-hub.component';
import { StaffHubComponent } from './components/main-module/staff-hub/staff-hub.component';
import { PatientContextPanelComponent } from './components/main-module/patient-context-panel/patient-context-panel.component';
import { ChatDocumentPanelComponent } from './components/main-module/chat-document-panel/chat-document-panel.component';
import { FamilyFeedComponent } from './components/family-portal/family-feed/family-feed.component';
import { FamilyChatComponent } from './components/family-portal/family-chat/family-chat.component';
import { FamilyHealthComponent } from './components/family-portal/family-health/family-health.component';
import { FamilyVideoComponent } from './components/family-portal/family-video/family-video.component';
import { FamilyFeedCreatorComponent } from './components/family-feed-creator/family-feed-creator.component';
import { FamilyPortalAdminComponent } from './components/main-module/family-portal-admin/family-portal-admin.component';
import { AiAssistantComponent } from './components/main-module/ai-assistant/ai-assistant.component';
import { AiTemplatesComponent } from './components/main-module/ai-templates/ai-templates.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    AdminLayoutComponent,
    SideBarComponent,
    NavBarComponent,
    AdminDashboardComponent,
    RolePermissionComponent,
    AddAssistedLivingComponent,
    OtpVerificationComponent,
    MatPaginationStyleDirective,
    FilterPipe,
    AssistedLivingComponent,
    MultiSelectComponent,
    ChatsComponent,
    ProfileComponent,
    AccountSettingComponent,
    SetupProfileComponent,
    EditUserComponent,
    ForgetPassowordComponent,
    ResetPassowordComponent,
    VideoCallComponent,
    OnCallScheduleComponent,
    FaxInboxComponent,
    FormBuilderComponent,
    FamilyPortalComponent,
    IntegrationMonitorComponent,
    AuditLogViewerComponent,
    SystemHealthComponent,
    SecurityMonitorComponent,
    SystemSettingsComponent,
    ShiftHandoffComponent,
    SbarReportComponent,
    ClinicalAlertsComponent,
    ConsultationRequestComponent,
    PatientStatusBoardComponent,
    MultiFacilityComponent,
    FacilityFormModalComponent,
    SsoSettingsComponent,
    ClinicalHubComponent,
    StaffHubComponent,
    PatientContextPanelComponent,
    ChatDocumentPanelComponent,
    FamilyFeedComponent,
    FamilyChatComponent,
    FamilyHealthComponent,
    FamilyVideoComponent,
    FamilyFeedCreatorComponent,
    FamilyPortalAdminComponent,
    AiAssistantComponent,
    AiTemplatesComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NgxApexchartsModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    NgOtpInputModule,
    ToastrModule.forRoot({
      preventDuplicates: true,
      maxOpened: 1,
      autoDismiss: true,
      closeButton: true,
      progressBar: true,
      newestOnTop: true,
      timeOut: 3200,
      extendedTimeOut: 1200,
      easeTime: 250,
      tapToDismiss: true,
      positionClass: 'toast-top-right'
    }),
    BrowserAnimationsModule,
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatToolbarModule,
    NgxGpAutocompleteModule,
    NgSelectModule,
    DragDropModule
  ],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    {
      provide: Loader,
      useValue: new Loader({
        apiKey: 'AIzaSyBP4s0sl8zt0J-X05ZMvpgtOTA1S7l6U8U',
        libraries: ['places']
      })
    },
  ],
  bootstrap: [AppComponent],
  exports: [MatPaginationStyleDirective]
})
export class AppModule { }
