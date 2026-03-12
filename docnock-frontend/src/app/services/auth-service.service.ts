import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class AuthServiceService {
  private baseUrl = environment.apiUrl; // Replace with your API URL~
  private tokenKey = 'auth_token';
  public isLoggedIn$ = new BehaviorSubject<boolean>(this.isAuthenticated());

  constructor(
    private http: HttpClient, private router: Router,
    private toastr: ToastrService
  ) { }

  getHeader(token: any) {
    // console.log(`token header`, token);
    const httpHeaders = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return httpHeaders;
  }

  getNotification(userId:any='') {
    let token = this.getToken();
    return this.http.get
      (`${this.baseUrl}/getUnreadCountByReceiver?userId=${userId}`,
      {
        headers: this.getHeader(token),
      }
    );
  }

  login(mobile: string, password: string) {
    return this.http.post<any>(`${this.baseUrl}/login`, { mobile, password });
  }

  otp(mobile:any,otp:any){
    return this.http.post<any>(`${this.baseUrl}/verifyOTP`, { mobile, otp }).subscribe({
      next:(res)=>{
        if(res.success){
          this.storeTokens(res.token, '');
           this.isLoggedIn$.next(true);
           this.router.navigate(['/main']);
           localStorage.setItem('role',res.role)
              localStorage.setItem('loginsessionid',res.loginsessionid);
              localStorage.setItem('userId',res.userId);
          
           this.toastr.success(res.message);
        }
      },
      error:(err)=>{
       console.log(``, );
       this.toastr.error(err.error.message);
       
      }
    })
  }

  getUserById(userId:any='', skipLoader: boolean = false) {
    let token = this.getToken();
    const headers = skipLoader
      ? this.getHeader(token).set('X-Skip-Loader', 'true')
      : this.getHeader(token);

    return this.http.get
      (`${this.baseUrl}/getUserById?userId=${userId}`,
      {
        headers,
      }
    );
  }

  listLoginRecords(userId: string = ''): Observable<any> {
    const token = this.getToken();
  
    return this.http.get(`${this.baseUrl}/listLoginRecords`, {
      headers: this.getHeader(token),
      params: { userId }  // ✅ use `params` object for query params
    });
  }

  
  
  getUserByIdwithToken(token:any) {
    console.log(`token`, token);
    const httpHeaders = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.get
      (`${this.baseUrl}/getUserById`,
      {
        headers: httpHeaders,
      }
    );
  }

  logout() {
    let token = this.getToken();
    var loginsessionid = localStorage.getItem("loginsessionid");
    var userId = localStorage.getItem("userId");

    return this.http.get
   (`${this.baseUrl}/logoutUser?loginsessionid=${loginsessionid}&userId=${userId}`,
    {
      headers: this.getHeader(token),
    }
  ).subscribe({
    next:(res:any)=>{
      if(res.success){
    // notify app to terminate any active calls before finishing logout
    try { window.dispatchEvent(new CustomEvent('app-logout')); } catch (e) {}
    this.clearTokens();
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("loginsessionid");
    this.isLoggedIn$.next(false);
    this.router.navigate(['/login']);
      }
    },
    error:(err)=>{
     console.log(``, );
    }
  })
  }

  storeTokens(token: string, refreshToken: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  clearTokens() {
    localStorage.removeItem(this.tokenKey);
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const helper = new JwtHelperService();
    return token ? !helper.isTokenExpired(token) : false;
  }

  getRole(){
    return localStorage.getItem("role");
  }

  addUser(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/addUser`, data, {
      headers: this.getHeader(token)
    });
  }

  forgotPassword(data: any) {
    return this.http.post(`${this.baseUrl}/forgotPassword`, data);
  }

  updateUser(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/updateUser`, data, {
      headers: this.getHeader(token)
    });
  }
  
  getList(role='', limit:number=0, page:number=0,searchKey:any='', status:any='',userId:any=''){
    let token = this.getToken();
    let userIds = userId.length > 0 ? JSON.stringify(userId) : ''
    return this.http.get
      (`${this.baseUrl}/listUsers?role=${role}&limit=${limit}&page=${page}&searchKey=${searchKey}&status=${status}&userId=${userIds}`,
      {
        headers: this.getHeader(token),
      }
    );
  }

  getPermission(userId:any='') {
    let token = this.getToken();
    return this.http.get
      (`${this.baseUrl}/getPermissionsByUserId?userId=${userId}`,
      {
        headers: this.getHeader(token),
      }
    );
  }

  createPermission(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/createPermission`, data, {
      headers: this.getHeader(token)
    });
  }

  countUsersByRole(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/countUsersByRole`, data, {
      headers: this.getHeader(token)
    });
  }
//date, month, year
  countGraph(filter:any = 'date') {
    let token = this.getToken();
    let loginid = localStorage.getItem('userId');
    return this.http.get(`${this.baseUrl}/get_graph?userid=${loginid}&filterType=${filter}`, {
      headers: this.getHeader(token)
    });
  }

  changePassword(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/changePassword`, data, {
      headers: this.getHeader(token)
    });
  }

  changeStatusAndDelete(data:any){
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/changeStatusAndDelete`, data, {
      headers: this.getHeader(token)
    });
  }

  resetPassword(data:any){
    return this.http.post(`${this.baseUrl}/resetPassword`, data, {
      headers: this.getHeader(data.token)
    });
  }

  updateGroupNameProfile(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/update-group-name`, data, {
      headers: this.getHeader(token)
    });
}
 updateGroupMembers(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/update-group-members`, data, {
      headers: this.getHeader(token)
    });
}

sendPasswordResetEmail(data: any) {
  let token = this.getToken();
  return this.http.post(`${this.baseUrl}/sendPasswordResetEmail`, data,{
    headers: this.getHeader(token)
  });
}

verifylink(data: any) {
  return this.http.post(`${this.baseUrl}/verify-link`, data, {
    headers: this.getHeader(data.token)
  });
}

// ─── On-Call Schedule ────────────────────────────────────────────────────────

createSchedule(payload: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/schedule/create`, payload, {
    headers: this.getHeader(token),
  });
}

updateSchedule(id: string, payload: any) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/schedule/${id}`, payload, {
    headers: this.getHeader(token),
  });
}

deleteSchedule(id: string) {
  const token = this.getToken();
  return this.http.delete(`${this.baseUrl}/schedule/${id}`, {
    headers: this.getHeader(token),
  });
}

getFacilitySchedule(facilityId: string, from?: string, to?: string) {
  const token = this.getToken();
  let url = `${this.baseUrl}/schedule/facility/${facilityId}`;
  const params: string[] = [];
  if (from) params.push(`from=${encodeURIComponent(from)}`);
  if (to) params.push(`to=${encodeURIComponent(to)}`);
  if (params.length) url += '?' + params.join('&');
  return this.http.get(url, { headers: this.getHeader(token) });
}

getOnCallNow(facilityId: string, role?: string) {
  const token = this.getToken();
  let url = `${this.baseUrl}/schedule/oncall-now?facilityId=${facilityId}`;
  if (role) url += `&role=${role}`;
  return this.http.get(url, { headers: this.getHeader(token) });
}

listUsers(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/listUsers${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

// ─── Fax ─────────────────────────────────────────────────────────────────────

getFaxInbox(page = 1, limit = 20) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/fax/inbox?page=${page}&limit=${limit}`, {
    headers: this.getHeader(token),
  });
}

markFaxRead(id: string) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/fax/${id}/read`, {}, {
    headers: this.getHeader(token),
  });
}

sendFax(faxNumber: string, file: File) {
  const token = this.getToken();
  const formData = new FormData();
  formData.append('faxNumber', faxNumber);
  formData.append('file', file);
  return this.http.post(`${this.baseUrl}/fax/send`, formData, {
    headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
  });
}

forwardFaxToChat(faxId: string, conversationId: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/fax/forward-to-chat`, { faxId, conversationId }, {
    headers: this.getHeader(token),
  });
}

// ─── PCC / EHR Integration ──────────────────────────────────────────────────

linkPatient(conversationId: string, pccPatientId: string, pccFacilityId?: string, patientName?: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/pcc/link-patient`,
    { conversationId, pccPatientId, pccFacilityId, patientName },
    { headers: this.getHeader(token) }
  );
}

unlinkPatient(conversationId: string) {
  const token = this.getToken();
  return this.http.delete(`${this.baseUrl}/pcc/unlink-patient/${conversationId}`, {
    headers: this.getHeader(token),
  });
}

getPatientLink(conversationId: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/pcc/patient-link/${conversationId}`, {
    headers: this.getHeader(token),
  });
}

getPatientSummary(conversationId: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/pcc/patient-summary/${conversationId}`, {
    headers: this.getHeader(token),
  });
}

searchPccPatients(query: string, facilityId?: string) {
  const token = this.getToken();
  let url = `${this.baseUrl}/pcc/search-patients?q=${encodeURIComponent(query)}`;
  if (facilityId) url += `&facilityId=${facilityId}`;
  return this.http.get(url, { headers: this.getHeader(token) });
}

getPccFacilities() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/pcc/facilities`, {
    headers: this.getHeader(token),
  });
}

// ─── Clinical Forms ─────────────────────────────────────────────────────────

createFormTemplate(payload: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/forms/templates`, payload, {
    headers: this.getHeader(token),
  });
}

listFormTemplates(params: Record<string, string> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return this.http.get(`${this.baseUrl}/forms/templates${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

getFormTemplate(id: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/forms/templates/${id}`, {
    headers: this.getHeader(token),
  });
}

updateFormTemplate(id: string, payload: any) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/forms/templates/${id}`, payload, {
    headers: this.getHeader(token),
  });
}

deleteFormTemplate(id: string) {
  const token = this.getToken();
  return this.http.delete(`${this.baseUrl}/forms/templates/${id}`, {
    headers: this.getHeader(token),
  });
}

sendForm(templateId: string, conversationId: string, patientLink?: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/forms/send`, { templateId, conversationId, patientLink }, {
    headers: this.getHeader(token),
  });
}

submitForm(submissionId: string, data: any) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/forms/submissions/${submissionId}/submit`, data, {
    headers: this.getHeader(token),
  });
}

getFormSubmission(id: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/forms/submissions/${id}`, {
    headers: this.getHeader(token),
  });
}

listFormSubmissions(params: Record<string, string> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return this.http.get(`${this.baseUrl}/forms/submissions${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

// ─── Analytics Dashboard ───────────────────────────────────────────────────
getAnalyticsDashboard() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/analytics/dashboard`, {
    headers: this.getHeader(token),
  });
}

// ─── AI Services ───────────────────────────────────────────────────────────
summarizeConversation(conversationId: string, lastN: number = 50) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/ai/summarize-conversation`, { conversationId, lastN }, {
    headers: this.getHeader(token),
  });
}

// ─── Family Communication Portal ──────────────────────────────────────────
inviteFamily(data: { conversationId: string; familyEmail: string; familyName?: string; relationshipType?: string; accessLevel?: string }) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/family/invite`, data, {
    headers: this.getHeader(token),
  });
}

verifyFamilyLink(token: string) {
  return this.http.get(`${this.baseUrl}/family/verify-link/${token}`);
}

getFamilyPatientSummary() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/family/patient-summary`, {
    headers: this.getHeader(token),
  });
}

requestFamilyVideoVisit(data: { preferredTime?: string; notes?: string }) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/family/video-request`, data, {
    headers: this.getHeader(token),
  });
}

listFamilyLinks(conversationId: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/family/links/${conversationId}`, {
    headers: this.getHeader(token),
  });
}

revokeFamilyAccess(linkId: string) {
  const token = this.getToken();
  return this.http.delete(`${this.baseUrl}/family/links/${linkId}`, {
    headers: this.getHeader(token),
  });
}

// ─── Admin Management ──────────────────────────────────────────────────────

getIntegrationHealth() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/integrations/health`, {
    headers: this.getHeader(token),
  });
}

getSystemStatus() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/system/status`, {
    headers: this.getHeader(token),
  });
}

getActiveSessions() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/sessions/active`, {
    headers: this.getHeader(token),
  });
}

revokeSession(data: { sessionId?: string; userId?: string; revokeAll?: boolean }) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/admin/sessions/revoke`, data, {
    headers: this.getHeader(token),
  });
}

getAuditLogs(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/admin/audit-logs${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

getAuditLogActions() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/audit-logs/actions`, {
    headers: this.getHeader(token),
  });
}

getFailedLogins(hours: number = 24) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/security/failed-logins?hours=${hours}`, {
    headers: this.getHeader(token),
  });
}

getSystemConfig() {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/admin/system-config`, {
    headers: this.getHeader(token),
  });
}

updateSystemConfig(key: string, value: any) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/admin/system-config/${key}`, { value }, {
    headers: this.getHeader(token),
  });
}

resetSystemConfig(key: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/admin/system-config/${key}/reset`, {}, {
    headers: this.getHeader(token),
  });
}

seedSystemConfig() {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/admin/system-config/seed`, {}, {
    headers: this.getHeader(token),
  });
}

getPinnedMessages(conversationId: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/conversations/${conversationId}/pins`, {
    headers: this.getHeader(token),
  });
}

getMentionableUsers(conversationId: string, query: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/conversations/${conversationId}/mentionable?query=${encodeURIComponent(query)}`, {
    headers: this.getHeader(token),
  });
}

getMessageReactions(messageId: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/messages/${messageId}/reactions`, {
    headers: this.getHeader(token),
  });
}

// ─── Clinical - Shift Handoffs ──────────────────────────────────────────────

createHandoff(data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/handoffs`, data, {
    headers: this.getHeader(token),
  });
}

getHandoffs(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/clinical/handoffs${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

getHandoffById(id: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/clinical/handoffs/${id}`, {
    headers: this.getHeader(token),
  });
}

updateHandoff(id: string, data: any) {
  const token = this.getToken();
  return this.http.put(`${this.baseUrl}/clinical/handoffs/${id}`, data, {
    headers: this.getHeader(token),
  });
}

acknowledgeHandoff(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/handoffs/${id}/acknowledge`, {}, {
    headers: this.getHeader(token),
  });
}

completeHandoff(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/handoffs/${id}/complete`, {}, {
    headers: this.getHeader(token),
  });
}

// ─── Clinical - SBAR ────────────────────────────────────────────────────────

createSbar(data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/sbar`, data, {
    headers: this.getHeader(token),
  });
}

getSbars(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/clinical/sbar${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

getSbarById(id: string) {
  const token = this.getToken();
  return this.http.get(`${this.baseUrl}/clinical/sbar/${id}`, {
    headers: this.getHeader(token),
  });
}

acknowledgeSbar(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/sbar/${id}/acknowledge`, {}, {
    headers: this.getHeader(token),
  });
}

resolveSbar(id: string, data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/sbar/${id}/resolve`, data, {
    headers: this.getHeader(token),
  });
}

// ─── Clinical - Alerts ──────────────────────────────────────────────────────

createAlert(data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/alerts`, data, {
    headers: this.getHeader(token),
  });
}

getAlerts(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/clinical/alerts${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

acknowledgeAlert(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/alerts/${id}/acknowledge`, {}, {
    headers: this.getHeader(token),
  });
}

resolveAlert(id: string, data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/alerts/${id}/resolve`, data, {
    headers: this.getHeader(token),
  });
}

escalateAlert(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/alerts/${id}/escalate`, {}, {
    headers: this.getHeader(token),
  });
}

// ─── Clinical - Consultations ───────────────────────────────────────────────

createConsultation(data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/consultations`, data, {
    headers: this.getHeader(token),
  });
}

getConsultations(params: Record<string, any> = {}) {
  const token = this.getToken();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return this.http.get(`${this.baseUrl}/clinical/consultations${qs ? '?' + qs : ''}`, {
    headers: this.getHeader(token),
  });
}

acceptConsultation(id: string) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/consultations/${id}/accept`, {}, {
    headers: this.getHeader(token),
  });
}

completeConsultation(id: string, data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/consultations/${id}/complete`, data, {
    headers: this.getHeader(token),
  });
}

declineConsultation(id: string, data: any) {
  const token = this.getToken();
  return this.http.post(`${this.baseUrl}/clinical/consultations/${id}/decline`, data, {
    headers: this.getHeader(token),
  });
}

}


