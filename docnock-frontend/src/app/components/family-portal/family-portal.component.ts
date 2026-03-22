import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { WebsocketService } from 'src/app/services/websocket.service';

@Component({
  selector: 'app-family-portal',
  templateUrl: './family-portal.component.html',
  styleUrls: ['./family-portal.component.scss'],
})
export class FamilyPortalComponent implements OnInit {
  loading: boolean = true;
  error: string = '';
  verified: boolean = false;
  patientData: any = null;

  // Tab state
  activeTab: 'feed' | 'chat' | 'health' | 'video' = 'feed';

  // Data from verification
  conversationId: string = '';
  familyChatConversationId: string = '';
  accessLevel: string = 'read_only';
  userName: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthServiceService,
    private websocket: WebsocketService
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) {
      this.verifyLink(token);
    } else {
      // Already authenticated family member
      this.loading = false;
      this.verified = true;
      this.conversationId = localStorage.getItem('family_conversationId') || '';
      this.familyChatConversationId = localStorage.getItem('family_chatConversationId') || '';
      this.userName = localStorage.getItem('family_userName') || '';
      this.initializeSocket();
    }
  }

  verifyLink(token: string) {
    this.authService.verifyFamilyLink(token).subscribe({
      next: (res: any) => {
        if (res.success) {
          // Store the family token and data
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('role', 'family_member');
          localStorage.setItem('userId', res.data.userId);
          localStorage.setItem('family_conversationId', res.data.conversationId);
          localStorage.setItem('family_chatConversationId', res.data.familyChatConversationId || '');
          localStorage.setItem('family_userName', res.data.name || '');

          this.conversationId = res.data.conversationId;
          this.familyChatConversationId = res.data.familyChatConversationId || '';
          this.userName = res.data.name || '';
          this.accessLevel = res.data.accessLevel;
          this.verified = true;

          this.initializeSocket();

          // Navigate to portal view (remove token from URL)
          this.router.navigate(['/family/portal']);
        } else {
          this.error = res.message || 'Verification failed';
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'This link is invalid or has expired.';
        this.loading = false;
      },
    });
  }

  initializeSocket() {
    this.websocket.registerUser();
  }

  switchTab(tab: 'feed' | 'chat' | 'health' | 'video') {
    this.activeTab = tab;
  }

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('family_conversationId');
    localStorage.removeItem('family_chatConversationId');
    localStorage.removeItem('family_userName');
    this.router.navigate(['/login']);
  }
}
