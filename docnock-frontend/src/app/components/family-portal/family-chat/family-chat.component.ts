import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-family-chat',
  templateUrl: './family-chat.component.html',
  styleUrls: ['./family-chat.component.scss'],
})
export class FamilyChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() conversationId: string = '';
  @ViewChild('messageContainer') messageContainer!: ElementRef;

  chatConversationId: string = '';
  chatGroupName: string = '';
  messages: any[] = [];
  newMessage: string = '';
  loading: boolean = true;
  loadingMore: boolean = false;
  sending: boolean = false;
  error: string = '';
  page: number = 1;
  hasMore: boolean = false;
  currentUserId: string = '';
  shouldScrollToBottom: boolean = true;
  isTyping: boolean = false;

  private messageSubscription?: Subscription;
  private typingSubscription?: Subscription;
  private stopTypingSubscription?: Subscription;

  constructor(
    private authService: AuthServiceService,
    private websocket: WebsocketService
  ) {
    this.currentUserId = localStorage.getItem('userId') || '';
  }

  ngOnInit(): void {
    this.initializeChat();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.messageSubscription?.unsubscribe();
    this.typingSubscription?.unsubscribe();
    this.stopTypingSubscription?.unsubscribe();
    if (this.chatConversationId) {
      this.websocket.leaveChat(this.currentUserId);
    }
  }

  initializeChat() {
    this.loading = true;

    this.authService.getFamilyChat().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.chatConversationId = res.data.conversationId;
          this.chatGroupName = res.data.groupName || 'Chat';
          this.loadMessages();
          this.joinChatRoom();
          this.listenForMessages();
        } else {
          this.error = res.message || 'Unable to load chat';
          this.loading = false;
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Unable to connect to chat. Please try again.';
        this.loading = false;
      },
    });
  }

  loadMessages() {
    this.authService.getFamilyChatMessages(this.page).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.messages = res.data.messages || [];
          this.hasMore = res.data.pagination?.hasMore || false;
          this.shouldScrollToBottom = true;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadOlderMessages() {
    if (this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    this.page++;

    this.authService.getFamilyChatMessages(this.page).subscribe({
      next: (res: any) => {
        if (res.success) {
          const older = res.data.messages || [];
          this.messages = [...older, ...this.messages];
          this.hasMore = res.data.pagination?.hasMore || false;
        }
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
        this.page--;
      },
    });
  }

  joinChatRoom() {
    if (this.chatConversationId && this.currentUserId) {
      this.websocket.joinChat(this.currentUserId, this.chatConversationId);
    }
  }

  listenForMessages() {
    // Typing indicator subscriptions
    this.typingSubscription = this.websocket.userTyping().subscribe((data: any) => {
      if (data.groupId === this.chatConversationId && data.senderID !== this.currentUserId) {
        this.isTyping = true;
        this.shouldScrollToBottom = true;
      }
    });
    this.stopTypingSubscription = this.websocket.userstopTyping().subscribe((data: any) => {
      if (data.groupId === this.chatConversationId) {
        this.isTyping = false;
      }
    });

    this.messageSubscription = this.websocket.newMessage().subscribe((msg: any) => {
      if (msg.groupId === this.chatConversationId) {
        this.isTyping = false;
        this.messages.push({
          _id: msg._id || msg.messageId,
          messageId: msg.messageId,
          message: msg.message,
          senderId: msg.senderID || msg.senderId,
          senderName: msg.senderDetails?.fullName || msg.senderName || 'Unknown',
          senderRole: msg.senderDetails?.role || msg.senderRole,
          senderAvatar: msg.senderDetails?.profilePicture || null,
          attachments: msg.attachment || [],
          timestamp: msg.timestamp,
          createdAt: new Date().toISOString(),
          status: 'DELIVERED',
        });
        this.shouldScrollToBottom = true;

        // Mark as read
        this.websocket.markAsRead(this.chatConversationId, this.currentUserId);
      }
    });
  }

  sendMessage() {
    const text = this.newMessage.trim();
    if (!text || this.sending || !this.chatConversationId) return;

    this.sending = true;
    const messageId = Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

    // Optimistic add
    const optimisticMsg = {
      _id: messageId,
      messageId,
      message: text,
      senderId: this.currentUserId,
      senderName: localStorage.getItem('family_userName') || 'You',
      senderRole: 'family_member',
      attachments: [],
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      status: 'SENT',
    };

    this.messages.push(optimisticMsg);
    this.newMessage = '';
    this.shouldScrollToBottom = true;

    this.websocket.sendMessage(
      text,
      this.chatConversationId,
      Date.now(),
      [],
      false,
      messageId,
      'ROUTINE'
    );

    this.sending = false;
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onTyping() {
    if (this.chatConversationId && this.currentUserId) {
      this.websocket.typing(this.chatConversationId, this.currentUserId);
    }
  }

  isOwnMessage(msg: any): boolean {
    return msg.senderId === this.currentUserId || msg.senderId?._id === this.currentUserId;
  }

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() || '?';
  }

  formatTime(dateStr: string | number): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  formatDateSeparator(dateStr: string | number): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const current = new Date(this.messages[index].createdAt || this.messages[index].timestamp);
    const previous = new Date(this.messages[index - 1].createdAt || this.messages[index - 1].timestamp);
    return current.toDateString() !== previous.toDateString();
  }

  scrollToBottom() {
    try {
      if (this.messageContainer) {
        this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
      }
    } catch (e) {}
  }

  trackByMessageId(index: number, msg: any): string {
    return msg._id || msg.messageId || index.toString();
  }
}
