import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private baseUrl = environment.apiUrl; // Replace with your API URL
  private tokenKey = 'auth_token';

  constructor(
     private http: HttpClient, private router: Router,
     private toastr: ToastrService
   ) { }
 
   getHeader(token: any) {
     console.log(`token header`, token);
     const httpHeaders = new HttpHeaders({
       Authorization: `Bearer ${token}`,
     });
     return httpHeaders;
   }
 
   getToken() {
    return localStorage.getItem(this.tokenKey);
  }
  getAgoraToken(groupId:any,uid:any) {
    let token = this.getToken();
    const headers = this.getHeader(token).set('X-Skip-Loader', 'true');
    return this.http.get
      (`${this.baseUrl}/generate-agora-token?groupId=${groupId}&uid=${uid}`,
      {
        headers,
      }
    );
  }
  createGroup(data: any) {
    let token = this.getToken();
    return this.http.post(`${this.baseUrl}/create-group`, data, {
      headers: this.getHeader(token)
    });
  }

  getgrouplist(limit:number=10, page:number=1,userId:any='',groupName:any=''){
    let token = this.getToken();
    return this.http.get
      (`${this.baseUrl}/group-list?limit=${limit}&page=${page}&userId=${userId}&name=${groupName}`,
      {
        headers: this.getHeader(token),
      }
    );
  }

    exportChat(conversationId:any,locale:any='', timezone:any=''){
    let token = this.getToken();
    return this.http.get
      (`${this.baseUrl}/export/${conversationId}?locale=${locale}&timezone=${timezone}`,
      {
        headers: this.getHeader(token),
      }
    );
  }


  getNotifications(limit: number = 0, page: number = 0) {
    const token = this.getToken();
    return this.http.get(
      `${this.baseUrl}/notifications?limit=${limit}&page=${page}`,
      {
        headers: this.getHeader(token),
      }
    );
  }


  listNotifications(limit: number = 0, page: number = 0) {
    const token = this.getToken();
    return this.http.get(
      `${this.baseUrl}/notificationlist?limit=${limit}&page=${page}`,
      {
        headers: this.getHeader(token),
      }
    );
  }
  ReadNotifications(ids:any) {
    const token = this.getToken();
    return this.http.post(
      `${this.baseUrl}/read/notification`,
      {
        ids
      },
      {
        headers: this.getHeader(token),
      }
    );
  }

  searchMessages(query: string, conversationId?: string, limit = 10, page = 1) {
    let token = this.getToken();
    let params = `?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}`;
    if (conversationId) params += `&conversationId=${conversationId}`;
    return this.http.get(`${this.baseUrl}/messages/search${params}`, {
      headers: this.getHeader(token),
    });
  }

}
