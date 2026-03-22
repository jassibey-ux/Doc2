import { Component, ElementRef, ViewChild, HostListener, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { ChatService } from 'src/app/services/chat.service';
import { WebsocketService } from '../../services/websocket.service';
import { environment } from 'src/environments/environment';
import { ChangeDetectorRef } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FormGroup } from '@angular/forms';
import { Location } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';


@Component({
  selector: 'app-chats',
  templateUrl: './chats.component.html',
  styleUrls: ['./chats.component.scss'],
})
export class ChatsComponent {
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('scrollMe') private scrollContainer!: ElementRef;
  @ViewChild('intakeFormContent', { static: false }) intakeFormContent!: ElementRef;
  scrollToBottom(behavior: ScrollBehavior = 'auto') {
    try {
      if (!this.scrollContainer?.nativeElement) {
        return;
      }
      const el = this.scrollContainer.nativeElement;
      el.scroll({
        top: el.scrollHeight,
        behavior,
      });
    } catch (error) {
      console.error('Scroll error:', error);
    }
  }

  private scheduleScrollToBottom(behavior: ScrollBehavior = 'auto') {
    setTimeout(() => this.scrollToBottom(behavior), 0);
    setTimeout(() => this.scrollToBottom(behavior), 120);
  }
  ngAfterViewChecked() {
    // this.scrollToBottom();
  }
  typingUsers: any = [];
  selectedimage: any = []; // Add this at the top of your component
  private readonly imageCompressionThresholdBytes = 500 * 1024;
  private readonly imageCompressionQuality = 0.78;
  private readonly imageMaxDimension = 1600;
  private readonly composerAllowedAttachmentTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mp3',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/webm',
    'audio/ogg',
  ];
  private activeUploadRequests = new Map<string, XMLHttpRequest[]>();
  private cancelledUploadMessageIds = new Set<string>();
  imgUrl = environment.imgUrl;
  backendUrl = environment.backEndUrl; // Replace with your API URL
  previewUrl: string | ArrayBuffer | null = null;
  page = 1;
  is_loading: boolean = false;
  showHistoryLoader: boolean = false;
  historyPageSize: number = 20;
  hasMoreMessages: boolean = true;
  isImportant: boolean = false;
  is_edit: boolean = false
  showDeleteModal: boolean = false
  callstartedstatus: any = {}
  assignedDates = new Set();
  searchgroupname: any = ''
  userCallingparticipantInfo:boolean = false;
  showPatientContext = false;
  showDocumentPanel = false;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService,
    private chatservice: ChatService,
    private websocket: WebsocketService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private location: Location,
    private sanitizer: DomSanitizer,

  ) { }
  formData = {
    name: ''
    // You can add other fields later as needed
  };
  selecteduser: any = [];
  groupName: any = '';
  predefinedRoles = [
    { id: 'facility_center', name: 'Facilitycenter', moduleName: 'F' },
    { id: 'physician', name: 'Physicians', moduleName: 'P' },
    { id: 'nurse', name: 'Nurses', moduleName: 'N' },
    { id: 'subadmin', name: 'Subadmin', moduleName: 'S' },
    { id: 'other', name: 'Other', moduleName: 'O' },
  ];
  showAddChatModal: boolean = false;
  showAddChatModalGroupName: boolean = false;
  selectedTab: string = '';
  selectedChatTab: string = 'users'; // New property for Users/Groups tab
  roleTab: any = [];
  userList: any = [];
  newChatSearchQuery: string = '';
  selectedPriority: string = 'ROUTINE';
  groupList: any = [];
  grouppicture: any = '';
  activeGroup: any = '';
  message = '';
  showMessagePicker: boolean = false;
  messagePickerTab: 'emojis' | 'gifs' | 'stickers' = 'emojis';
  messagePickerSearch: string = '';
  private readonly emojiOptions: string[] = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '🙌',
    '👍', '👏', '🙏', '🔥', '✨', '🎉', '❤️', '💯', '🤖', '🧠',
    '🍀', '☕', '📚', '🚀'
  ];
  private readonly gifOptions: string[] = [
    'LOL', 'Nice', 'Thanks', 'Great', 'Awesome', 'Hype', 'On my way', 'BRB', 'ROFL', 'Love it'
  ];
  private readonly stickerOptions: string[] = [
    '👍 Thumbs Up', '🙌 High Five', '🔥 Fire', '🚀 Rocket', '❤️ Heart', '✨ Sparkles', '🎉 Party', '😊 Smile'
  ];
  filteredEmojiOptions: string[] = [...this.emojiOptions];
  filteredGifOptions: string[] = [...this.gifOptions];
  filteredStickerOptions: string[] = [...this.stickerOptions];
  messageList: any = [];
  replyingTo: any = null;
  loginId: any = '';
  sampleImage: any = '';
  onlineuser: any = [];
  dynamicpath: any = '';

  // Slack features
  reactionEmojis = ['👍', '✅', '👀', '❤️', '❗', '❓'];
  reactionEmojiMap: Record<string, string> = {
    'thumbsup': '👍', 'check': '✅', 'eyes': '👀',
    'heart': '❤️', 'exclamation': '❗', 'question': '❓'
  };
  reactionNameMap: Record<string, string> = {
    '👍': 'thumbsup', '✅': 'check', '👀': 'eyes',
    '❤️': 'heart', '❗': 'exclamation', '❓': 'question'
  };
  showReactionPicker: string | null = null;
  showPinnedPanel = false;
  pinnedMessages: any[] = [];
  pinnedLoading = false;
  conversationTopic = '';
  editingTopic = false;
  topicDraft = '';
  showMentionPopup = false;
  mentionQuery = '';
  mentionResults: any[] = [];
  mentionLoading = false;
  showThreadPanel = false;
  threadParentMessage: any = null;
  threadMessages: any[] = [];
  threadLoading = false;

  mediaRecorder!: MediaRecorder;
  recordingMimeType: string = 'audio/webm';
  audioChunks: Blob[] = [];
  audioBase64: string = '';
  recording: boolean = false;
  recordingTime: number = 0;
  maxRecordingTime = 120; // Limit to 10 seconds
  intervalRef: any;
  timeoutRef: any;
  private skipSaveRecording: boolean = false;
  userIds: any = ''
  showIntakeForm: boolean = false;
  showIntakeFormButtons: boolean = true;
  isIntakeFormClosing: boolean = false;
  private intakeFormCloseTimer: any;
  selectedImageForModal: string | null = null;
  selectedImageZoom: number = 1;
  selectedImageTranslateX: number = 0;
  selectedImageTranslateY: number = 0;
  isImagePreviewDragging: boolean = false;
  private imageDragStartX: number = 0;
  private imageDragStartY: number = 0;
  private imageDragOriginX: number = 0;
  private imageDragOriginY: number = 0;
  selectedPdfForModal: string | null = null;
  selectedPdfName: string = '';
  selectedPdfPreviewUrl: SafeResourceUrl | null = null;
  modalVisible = false;
  modalType: 'image' | 'pdf' | 'doc' | '' = '';
  modalData: string = '';
  hover = null;
  messageId = '';
  is_msg_edit: boolean = false
  loginrole:any='';
  deleteChat: boolean = false
  selectedConversationId: any = {}
  activeCallSession: any = null;

  // ─── PCC Patient Context ──────────────────────────────────────────────────
  showPatientPanel: boolean = false;
  patientLink: any = null;
  patientSummary: any = null;
  patientSummaryLoading: boolean = false;
  showLinkPatientModal: boolean = false;
  pccSearchQuery: string = '';
  pccSearchResults: any[] = [];
  pccSearchLoading: boolean = false;

  // AI Summarization
  aiSummary: string = '';
  aiSummaryLoading: boolean = false;
  showAiSummary: boolean = false;

  // Family Portal
  showInviteFamilyModal: boolean = false;
  inviteFamilyEmail: string = '';
  inviteFamilyName: string = '';
  inviteFamilyRelationship: string = 'spouse';
  inviteFamilyLoading: boolean = false;
  familyLinks: any[] = [];
  showFamilyLinksPanel: boolean = false;

  private callCapsuleInterval: any;
  isCallActionLocked: boolean = false;
  private callActionLockTimer: any;
  private readonly reminderAlertIntervalsMs = [10000, 50000, 120000, 360000, 600000];
  private reminderAlertTimers = new Map<string, number[]>();
  private trackedReminderMessageKeys = new Set<string>();
  private reminderAudioContext: AudioContext | null = null;
  private readonly reminderAudioUnlockHandler = () => {
    this.unlockReminderAudio();
  };
  private readonly replyLegacyPrefix = '[[REPLY:';
  private readonly replyLegacySuffix = ']]';
  private readonly replyPlainPrefix = '↪ Reply to ';

  private lockCallAction(durationMs: number = 1400): boolean {
    if (this.isCallActionLocked) {
      return false;
    }

    this.isCallActionLocked = true;
    if (this.callActionLockTimer) {
      clearTimeout(this.callActionLockTimer);
    }

    this.callActionLockTimer = setTimeout(() => {
      this.isCallActionLocked = false;
    }, durationMs);

    return true;
  }

  private parseSocketPayload(raw: any): any {
    if (raw === null || raw === undefined || raw === '' || raw === 'null') {
      return null;
    }

    if (typeof raw === 'object') {
      return raw;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private normalizeBusyState(raw: any): boolean {
    const parsed = this.parseSocketPayload(raw);

    if (typeof parsed === 'boolean') {
      return parsed;
    }

    if (typeof parsed === 'string') {
      return parsed.toLowerCase() === 'true';
    }

    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.busy === 'boolean') {
        return parsed.busy;
      }

      if (typeof parsed.inCall === 'boolean') {
        return parsed.inCall;
      }

      if (Array.isArray(parsed.participant)) {
        return parsed.participant.length > 0;
      }
    }

    return false;
  }

  private normalizeCallStartedStatus(raw: any): any {
    const parsed = this.parseSocketPayload(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const participant = Array.isArray(parsed.participant)
      ? parsed.participant.filter((item: any) => !!item)
      : [];

    return {
      ...parsed,
      participant,
    };
  }

  private refreshActiveGroupCallStatus() {
    if (!this.activeGroup?.groupId) {
      this.callstartedstatus = {};
      return;
    }

    this.websocket.getcallstart(this.activeGroup.groupId).subscribe(
      (callstart: any) => {
        this.callstartedstatus = this.normalizeCallStartedStatus(callstart);
      },
      () => {
        this.callstartedstatus = {};
      }
    );
  }

  hasRenderableMessage(message: any): boolean {
    const messageText = (message?.message || '').toString().trim();
    const hasAttachments = Array.isArray(message?.attachments) && message.attachments.length > 0;
    const hasReply = this.hasReplyMeta(message);
    return this.isCallLogMessage(message) || hasAttachments || messageText.length > 0 || hasReply;
  }

  private persistActiveCallSession(fromA: any) {
    const activeCallSession = {
      actualgroupmemberid: fromA?.actualgroupmemberid || [],
      groupid: fromA?.groupid || '',
      group: fromA?.group,
      type: 'callby',
      title: fromA?.title || 'Call',
      image: fromA?.image || '',
      audio: fromA?.audio ?? false,
      callerId: fromA?.callerId || '',
      rejoin: true,
      startedAt: Date.now()
    };

    localStorage.setItem('activeCallSession', JSON.stringify(activeCallSession));
    this.activeCallSession = activeCallSession;
  }

  refreshActiveCallSession() {
    const callSession = localStorage.getItem('activeCallSession');
    if (!callSession) {
      this.activeCallSession = null;
      return;
    }

    try {
      this.activeCallSession = JSON.parse(callSession);
    } catch {
      this.activeCallSession = null;
      localStorage.removeItem('activeCallSession');
    }
  }

  resumeActiveCall() {
    if (!this.activeCallSession) return;

    const path = `${this.dynamicpath}/video-call`;
    this.router.navigate([path], {
      state: {
        fromA: {
          ...this.activeCallSession,
          rejoin: true,
          type: 'callby'
        }
      }
    });
  }

  ngOnInit(): void {
    this.dynamicpath = this.authService.getRole();
    this.getPermission();
    this.getgrouplist(0, 1, "ngon");
    this.joingroup();
    this.newMessage();
    this.socketgroup();
    this.userstopTyping();
    this.userOnline();
    this.getOnlineUsers();
    this.userOffline();
    this.userTyping();
    this.updateDeleteMsg()
    this.getUpdatedMsg()
    this.getUpdatedGroup()
    this.websocket.registerUser();
    this.loginId = localStorage.getItem('userId');
    this.loginrole = localStorage.getItem('role');
    console.log("this.loginId", this.loginId,this.loginrole)
    // prashant code start
    this.websocket.unreadCountUpdated().subscribe((data: any) => {
      const groupIndex = this.groupList.findIndex((g: any) => g.groupId === data.groupId);
      if (groupIndex !== -1) {
        if (data.userId === this.loginId) {
          const updatedCount = Number(data?.count ?? data?.unreadCount ?? 0);
          console.log("unread count list ", data)
          this.groupList[groupIndex].count = updatedCount;
        }
        // ✅ Assign a new array reference
        this.groupList = [...this.groupList];
      }
    });
    // prashant code end

    this.websocket.userleavecall().subscribe((data: any) => {
      const eventGroupId = data?.groupId ?? data?.groupid;
      if (String(eventGroupId ?? '') === String(this.activeGroup?.groupId ?? '')) {
        setTimeout(() => this.refreshActiveGroupCallStatus(), 120);
      }
    });

    this.sampleImage = `${this.imgUrl}/assets/images/profile_sample_image.png`;
    this.websocket.setpagename(this.loginId, '');
    this.refreshActiveCallSession();
    this.callCapsuleInterval = setInterval(() => this.refreshActiveCallSession(), 3000);

     this.websocket.tickon('messageDelivered').subscribe((res: any) => {
    this.updateMessageStatus(res.messageId, 'DELIVERED');
  });

  this.websocket.tickon('messageRead').subscribe((res: any) => {
    this.updateMessageStatus(res.messageId, 'READ');
  });

  this.setupReminderAudioUnlock();

  // Slack feature subscriptions
  this.websocket.onReactionUpdated().subscribe((data: any) => {
    if (data?.groupId === this.activeGroup?.groupId) {
      const msg = this.messageList.find((m: any) => m.messageId === data.messageId);
      if (msg) msg.reactions = data.reactions || [];
    }
  });

  this.websocket.onTopicUpdated().subscribe((data: any) => {
    if (data?.groupId === this.activeGroup?.groupId && data?.topic) {
      this.conversationTopic = data.topic.text || '';
    }
  });

  this.websocket.onMessagePinned().subscribe((data: any) => {
    if (data?.groupId === this.activeGroup?.groupId) {
      this.toastr.info('Message pinned');
      if (this.showPinnedPanel) this.loadPinnedMessages();
    }
  });

  this.websocket.onMessageUnpinned().subscribe((data: any) => {
    if (data?.groupId === this.activeGroup?.groupId) {
      if (this.showPinnedPanel) this.loadPinnedMessages();
    }
  });

  }

  updateMessageStatus(messageId: number, status: 'SENT' | 'DELIVERED' | 'READ') {
  const msg = this.messageList.find((m:any) => m.messageId == messageId);
  if (msg) {
    msg.status = status;
  }

  if (status === 'READ') {
    this.clearReminderAlertsForMessage(messageId);
  }
  }

  private buildReminderKey(groupId: any, messageId: any): string {
    return `${String(groupId || '')}:${String(messageId || '')}`;
  }

  private isImportantIncomingReminder(message: any): boolean {
    if (!message) {
      return false;
    }

    const isIncoming = String(message.senderID || '') !== String(this.loginId || '');
    return !!message.isImportant && isIncoming;
  }

  private isReminderStillUnread(message: any): boolean {
    const groupId = String(message?.groupId || message?.conversationId || '');
    if (!groupId) {
      return false;
    }

    const group = this.groupList.find((item: any) => String(item?.groupId || '') === groupId);
    if (group && typeof group.count !== 'undefined') {
      return Number(group.count || 0) > 0;
    }

    if (String(this.activeGroup?.groupId || '') === groupId) {
      return false;
    }

    return true;
  }

  private triggerReminderAlert(message: any) {
    const senderName = message?.senderDetails?.fullName || message?.group_name || 'New reminder';
    this.toastr.warning(`Reminder from ${senderName} is still unread.`, 'Reminder Alert', {
      timeOut: 6000,
      closeButton: true,
      progressBar: true
    });
    this.playReminderTone();
  }

  private playReminderTone() {
    try {
      const context = this.getReminderAudioContext();
      if (!context) return;

      if (context.state === 'suspended') {
        context.resume().catch(() => {});
      }

      const now = context.currentTime + 0.01;

      const beep = (offset: number) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 1040;

        gainNode.gain.setValueAtTime(0.0001, now + offset);
        gainNode.gain.exponentialRampToValueAtTime(0.26, now + offset + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.22);
      };

      beep(0);
      beep(0.26);
      beep(0.52);
    } catch {}
  }

  private setupReminderAudioUnlock() {
    window.addEventListener('pointerdown', this.reminderAudioUnlockHandler, { once: true });
    window.addEventListener('keydown', this.reminderAudioUnlockHandler, { once: true });
    window.addEventListener('touchstart', this.reminderAudioUnlockHandler, { once: true });
  }

  private unlockReminderAudio() {
    const context = this.getReminderAudioContext();
    if (!context) {
      return;
    }

    context.resume().then(() => {
    }).catch(() => {});
  }

  private getReminderAudioContext(): AudioContext | null {
    if (this.reminderAudioContext) {
      return this.reminderAudioContext;
    }

    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    try {
      this.reminderAudioContext = new AudioCtx();
    } catch {
      this.reminderAudioContext = null;
    }

    return this.reminderAudioContext;
  }

  private scheduleReminderAlerts(message: any) {
    if (!this.isImportantIncomingReminder(message)) {
      return;
    }

    const groupId = message?.groupId || message?.conversationId;
    const messageId = message?.messageId;

    if (!groupId || !messageId) {
      return;
    }

    const reminderKey = this.buildReminderKey(groupId, messageId);
    if (this.trackedReminderMessageKeys.has(reminderKey)) {
      return;
    }

    this.trackedReminderMessageKeys.add(reminderKey);

    const timers = this.reminderAlertIntervalsMs.map((delay, index) =>
      window.setTimeout(() => {
        if (!this.isReminderStillUnread(message)) {
          this.clearReminderAlerts(reminderKey);
          return;
        }

        this.triggerReminderAlert(message);

        if (index === this.reminderAlertIntervalsMs.length - 1) {
          this.clearReminderAlerts(reminderKey);
        }
      }, delay)
    );

    this.reminderAlertTimers.set(reminderKey, timers);
  }

  private clearReminderAlerts(reminderKey: string) {
    const timers = this.reminderAlertTimers.get(reminderKey) || [];
    timers.forEach((timerId) => {
      try {
        window.clearTimeout(timerId);
      } catch {}
    });

    this.reminderAlertTimers.delete(reminderKey);
    this.trackedReminderMessageKeys.delete(reminderKey);
  }

  private clearReminderAlertsForMessage(messageId: any) {
    const suffix = `:${String(messageId)}`;
    Array.from(this.reminderAlertTimers.keys())
      .filter((key) => key.endsWith(suffix))
      .forEach((key) => this.clearReminderAlerts(key));
  }

  private clearReminderAlertsForGroup(groupId: any) {
    const prefix = `${String(groupId)}:`;
    Array.from(this.reminderAlertTimers.keys())
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => this.clearReminderAlerts(key));
  }

  private clearAllReminderAlerts() {
    Array.from(this.reminderAlertTimers.keys()).forEach((key) => this.clearReminderAlerts(key));
  }

  private fromBase64(value: string): string {
    return decodeURIComponent(escape(atob(value)));
  }

  private getAttachmentReplyLabel(attachments: any[]): string {
    const firstType = (attachments?.[0]?.type || '').toLowerCase();
    if (!firstType) {
      return 'Attachment';
    }

    if (firstType.startsWith('image/')) {
      return 'Photo';
    }

    if (firstType.includes('pdf')) {
      return 'PDF';
    }

    if (this.isAudioAttachmentType(firstType)) {
      return 'Audio';
    }

    return 'Attachment';
  }

  private getReplyPreviewForMessage(message: any): string {
    const text = (message?.message || '').toString().trim();
    if (text) {
      return text.length > 90 ? `${text.slice(0, 90)}...` : text;
    }

    if (Array.isArray(message?.attachments) && message.attachments.length > 0) {
      return this.getAttachmentReplyLabel(message.attachments);
    }

    return 'Message';
  }

  private getReplySenderLabel(message: any): string {
    if (String(message?.senderID || '') === String(this.loginId || '')) {
      return 'You';
    }

    const senderName = message?.group_name || message?.senderDetails?.fullName;
    if (senderName) {
      return senderName;
    }

    return this.activeGroup?.group ? 'User' : (this.activeGroup?.title || 'User');
  }

  startReply(message: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!message || this.isCallLogMessage(message)) {
      return;
    }

    this.replyingTo = {
      messageId: message?.messageId,
      sender: this.getReplySenderLabel(message),
      preview: this.getReplyPreviewForMessage(message)
    };
  }

  cancelReply(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.replyingTo = null;
  }

  private buildOutgoingMessageText(baseText: string): string {
    const plain = (baseText || '').trim();

    if (!this.replyingTo?.messageId) {
      return plain;
    }

    const replySender = (this.replyingTo.sender || 'User').toString().replace(/\n/g, ' ').trim();
    const replyPreview = (this.replyingTo.preview || 'Message').toString().replace(/\n/g, ' ').trim();
    const header = `${this.replyPlainPrefix}${replySender}: ${replyPreview}`;

    return plain ? `${header}\n${plain}` : header;
  }

  private parseReplyFromMessage(rawMessage: any): { text: string; replyMeta: any | null } {
    const rawText = (rawMessage || '').toString();

    if (rawText.startsWith(this.replyLegacyPrefix)) {
      const suffixIndex = rawText.indexOf(this.replyLegacySuffix, this.replyLegacyPrefix.length);
      if (suffixIndex !== -1) {
        const encoded = rawText.slice(this.replyLegacyPrefix.length, suffixIndex);
        const plainText = rawText.slice(suffixIndex + this.replyLegacySuffix.length);

        try {
          const decoded = this.fromBase64(encoded);
          const parsed = JSON.parse(decoded);
          if (parsed && parsed.messageId) {
            return {
              text: plainText,
              replyMeta: {
                messageId: parsed.messageId,
                sender: parsed.sender || 'User',
                preview: parsed.preview || 'Message'
              }
            };
          }
        } catch {
          return {
            text: plainText,
            replyMeta: {
              messageId: '',
              sender: 'User',
              preview: 'Reply'
            }
          };
        }
      }

      return {
        text: '',
        replyMeta: {
          messageId: '',
          sender: 'User',
          preview: 'Reply'
        }
      };
    }

    if (rawText.startsWith(this.replyPlainPrefix)) {
      const newlineIndex = rawText.indexOf('\n');
      const header = newlineIndex === -1 ? rawText : rawText.slice(0, newlineIndex);
      const plainText = newlineIndex === -1 ? '' : rawText.slice(newlineIndex + 1);
      const matched = header.match(/^↪ Reply to\s+(.+?):\s+(.+)$/);

      if (matched) {
        return {
          text: plainText,
          replyMeta: {
            messageId: '',
            sender: matched[1] || 'User',
            preview: matched[2] || 'Message'
          }
        };
      }
    }

    return { text: rawText, replyMeta: null };
  }

  private hydrateMessageForReply(message: any): any {
    if (!message || typeof message !== 'object') {
      return message;
    }

    if (message.replyMeta) {
      return message;
    }

    const parsed = this.parseReplyFromMessage(message.message);
    return {
      ...message,
      message: parsed.text,
      replyMeta: parsed.replyMeta
    };
  }

  private hydrateMessageListForReply(messages: any[]): any[] {
    if (!Array.isArray(messages)) {
      return [];
    }
    return messages.map((item: any) => this.hydrateMessageForReply(item));
  }

  getReplyDisplayText(message: any): string {
    if (this.isCallLogMessage(message)) {
      return this.formatCallLogMessage(message);
    }
    return message?.message || '';
  }

  hasReplyMeta(message: any): boolean {
    return !!(message?.replyMeta?.sender && message?.replyMeta?.preview);
  }

  setnotimessage() {
    const navState = this.location.getState() as any;
    const fromA = navState?.fromA;
    if (fromA != undefined) {
      var groupid = fromA.groupid;
      const filtered = this.groupList.filter((item: any) => item.groupId === groupid);
      if (filtered.length > 0) {
        this.selectGroup(filtered[0])
      }
    }
  }
  startVideoCall() {
    if (!this.lockCallAction()) {
      return;
    }

    const path = `${this.dynamicpath}/video-call`;
    const fromA = {
      actualgroupmemberid: this.activeGroup.userIds,
      groupid: this.activeGroup.groupId,
      group: this.activeGroup.group,
      type: 'callby',
      title: this.activeGroup.title,
      image: this.activeGroup.image
        ? this.backendUrl + '/user-uploads/profiles/' + this.activeGroup.image
        : this.sampleImage,
      audio: false,
      rejoin: false
    };
    this.persistActiveCallSession(fromA);
    this.router.navigate([path], {
      state: {
        fromA
      }
    });
  }

  joincall() {
    if (!this.lockCallAction()) {
      return;
    }

    const path = `${this.dynamicpath}/video-call`;
    const fromA = {
      actualgroupmemberid: this.activeGroup.userIds,
      groupid: this.activeGroup.groupId,
      group: this.activeGroup.group,
      type: 'callby',
      title: this.activeGroup.title,
      image: this.activeGroup.image
        ? this.backendUrl + '/user-uploads/profiles/' + this.activeGroup.image
        : this.sampleImage,
      audio: this.callstartedstatus.audio,
      rejoin: true
    };
    this.persistActiveCallSession(fromA);
    this.router.navigate([path], {
      state: {
        fromA
      }
    });
  }

  startAudioCall() {
    if (!this.lockCallAction()) {
      return;
    }

    const path = `${this.dynamicpath}/video-call`;
    const fromA = {
      actualgroupmemberid: this.activeGroup.userIds,
      groupid: this.activeGroup.groupId,
      group: this.activeGroup.group,
      type: 'callby',
      title: this.activeGroup.title,
      image: this.activeGroup.image
        ? this.backendUrl + '/user-uploads/profiles/' + this.activeGroup.image
        : this.sampleImage,
      audio: true,
      rejoin: false
    };
    this.persistActiveCallSession(fromA);
    this.router.navigate([path], {
      state: {
        fromA
      }
    });
  }
  
  getOnlineUsers() {
    this.websocket.getOnlineUsers().subscribe((data: any) => {
      this.onlineuser = data;
    });
  }
  selecteduserfunciton(
    userid: any,
    name: any,
    profilePicture: any,
    status: any
  ) {
    const object = { userid, name, profilePicture, status };

    // Check if user is already selected based on userid
    const index = this.selecteduser.findIndex((user: any) => user.userid === userid);

    if (index === -1) {
      // Add user if not already selected
      this.selecteduser.push(object);
    } else {
      // Remove user if already selected
      this.selecteduser.splice(index, 1);
    }

    console.log("selecteduserfunciton", this.selecteduser);
  }
  openChatModal() {
    this.newChatSearchQuery = '';
    this.showAddChatModal = true;
  }

  onNewChatSearch() {
    this.getList(this.selectedTab, 10, 1, this.newChatSearchQuery);
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    console.log("input", input)

    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Generate a preview URL using FileReader
      const reader = new FileReader();
      reader.onload = () => {
        console.log("onFileSelected", reader.result)
        this.previewUrl = reader.result; // Set the preview URL
        this.grouppicture = file;
      };
      reader.readAsDataURL(file); // Read the file as a Data URL
    }
  }
  triggerFileInput(): void {
    const inputElement = document.getElementById(
      'group-profile-upload'
    ) as HTMLInputElement;
    inputElement.click(); // Programmatically trigger the file input click
  }
  creategroup() {
    let formData = new FormData();
    var userlist: any = [];

    this.selecteduser.forEach((element: any) => {
      console.log(element, 'element');
      let profilePic = {
        savedName: element?.profilePicture?.actualName,
        originalName: element?.profilePicture?.originalName,
      };
      console.log(profilePic, 'profilePic');
      userlist.push({
        userid: element.userid,
        name: element.name,
        profilePicture: profilePic,
        status: element.status,
      });
    });
    if (this.grouppicture != '')
      formData.append('profileImage', this.grouppicture);

    formData.append('groupName', this.groupName);
    formData.append('userlist', JSON.stringify(userlist));
    formData.append('senderID', '');
    var message = this.chatservice.createGroup(formData).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.groupName = '';

          this.toastr.success(res.message);
          this.closeLogoutModal();
          this.getgrouplist();
          console.log(res.conversation.groupName, '123', res.conversation);
          // const userIds = res.conversation.userlist.map(
          //   (item: any) => item.userid
          // );
          // console.log(userIds, 'userIdsss');
          this.selecteduser = [];

          this.websocket.joinGroup({
            groupId: res.conversation._id,
            userId: res.conversation.userlist,
          });
          this.closeChatModalGroupName();
          // this.location.back();
        } else {
          this.toastr.error(res.message);
          this.closeLogoutModal();
          this.closeChatModalGroupName();
          this.selecteduser = [];
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }
  openChatModalGroupName() {
    if (this.selecteduser.length > 1) {
      this.showAddChatModalGroupName = true;
    } else {
      this.creategroup();
    }
  }

  closeLogoutModal() {
    this.showAddChatModal = false;
  }
  closeChatModalGroupName() {
    this.showAddChatModalGroupName = false;
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
          this.roleTab = matchedModules;
          this.selectedTab = matchedModules[0].id;
          this.getUserDetails()
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }


  getUserDetails() {
    this.authService.getUserById().subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.userIds = response?.userIds || ''
          // console.log(this.userIds.length,"###########################");
          this.getList(this.selectedTab);

        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }



  getList(role: any, limit = 10, page = 1, searchKey = '', status = '') {
    this.authService.getList(role, limit, page, searchKey, status, this.userIds).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          this.userList = response;
          console.log(`this.userList`, this.userList);
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }
  getgrouplist(limit = 0, page = 1, type = '') {
    this.chatservice.getgrouplist(limit, page, '', this.searchgroupname).subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatagroupdata,
          });
          console.log(response, 'responseresponse');

          this.groupList = (response || []).map((item: any) => ({
            ...item,
            latestMessage: this.getConversationPreviewText(item?.latestMessage)
          }));
          if (type == 'ngon') {
            this.setnotimessage();
          }
          if (type == 'groupUpdate') {
            const filtered = this.groupList.filter((item: any) => item.groupId === this.activeGroup?.groupId);
            if (filtered.length > 0) {
              this.selectGroup(filtered[0])
            }
          }
          //  prashant code start

          // Fetch unread count for each group
          this.groupList.forEach((group: any) => {
            this.websocket.getUnreadCount(group.groupId, this.loginId).subscribe((count: any) => {
              console.log(`Unread count for ${group.groupId}:`, count);
              group.count = Number(count) || 0;
              this.cdr.detectChanges();
            });
          });
          // prashant code end
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }

  trackByGroupId(index: number, item: any) {
    return item?.groupId || index;
  }
  selectGroup(group: any) {

    if (this.activeGroup != '') {
      this.websocket.leavepagename(this.loginId, this.activeGroup.groupId);
    }
    this.websocket.setpagename(this.loginId, group.groupId);

    this.activeGroup = group;
    this.clearReminderAlertsForGroup(group.groupId);
    this.replyingTo = null;
    this.messageList = [];
    this.callstartedstatus = {};
    this.patientLink = null;
    this.patientSummary = null;
    if (this.showPatientPanel) {
      this.loadPatientContext();
    }

    this.websocket.joinGroup({
      groupId: this.activeGroup.groupId,
      userId: this.activeGroup.userIds,
    });
    
    this.assignedDates = new Set();
    if(!this.activeGroup.group){
    this.websocket
      .getcallingparticipantinfo(this.activeGroup.userid)
      .subscribe((callstart: any) => {
        // console.log(message, 'messagemessage');
        this.userCallingparticipantInfo = this.normalizeBusyState(callstart)
        console.log("callstartedstatus===========", this.userCallingparticipantInfo);

      });
      }else{
         this.userCallingparticipantInfo=false
      }
    // prashant code start

    this.websocket.markAsRead(group.groupId, this.loginId).subscribe(() => {
      console.log(
        `Messages marked as read for group: ${this.activeGroup.groupId}`
      );

      // ✅ Update unread count to 0 in the UI
      const groupIndex = this.groupList.findIndex(
        (g: any) => g.groupId === this.activeGroup.groupId
      );
      if (groupIndex !== -1) {
        this.groupList[groupIndex].count = 0;
      }
    });
    // prashant code end
    // this.websocket.markAsRead(group.groupId,this.loginId);
    this.is_loading = true
    this.showHistoryLoader = false;
    this.hasMoreMessages = true;
    console.log("working")
    this.websocket
      .getmessage(this.activeGroup.groupId, 1, this.historyPageSize)
      .subscribe((message: any) => {
        // console.log(message, 'messagemessage');
        this.message = '';
        this.page = 1
        setTimeout(() => {
          this.selectedimage = []; // Reset object
          if (this.fileInput) {
            this.fileInput.nativeElement.value = ''; // Clear file input
          }
        }, 1000);
        this.messageList = this.hydrateMessageListForReply(message);
        this.hasMoreMessages = Array.isArray(message) && message.length >= this.historyPageSize;
        //  this.messageList.forEach((message: any) => {
        //   if(message.senderID == this.loginId)
        //   {
        //     this.websocket.getMessageStatus(message.messageId,message.status).subscribe((status: any) => {
        //       message.status = status;
        //       this.cdr.detectChanges();
        //     });
        //   }
        //   else{
        //       message.status = '';
        //       this.cdr.detectChanges();
        //   }
        //   });
        console.log("this.messageList", this.messageList)
        this.is_loading = false
        this.showHistoryLoader = false;
        // console.log(`this.messageList`, this.messageList);
        this.scheduleScrollToBottom('auto');
      }, () => {
        this.is_loading = false;
        this.showHistoryLoader = false;
      });
    this.refreshActiveGroupCallStatus();

    // console.log(
    //   this.activeGroup,
    //   'activegroup',
    //   this.activeGroup.actualgroupmemberid
    // );
  }

  onTabClick(roleId: string): void {
    this.selectedTab = roleId;
    this.getList(roleId);
  }
  userOnline() {
    this.websocket.userOnline().subscribe(async (res: any) => {
      // console.log(res, 'check resuserOnline');
      // this.getgrouplist();
      this.getOnlineUsers();
    });
  }
  userOffline() {
    this.websocket.userOffline().subscribe(async (res: any) => {
      // console.log(res, 'check resuserOnline');
      // this.getgrouplist();
      this.getOnlineUsers();
    });
  }
  userTyping() {
    this.websocket.userTyping().subscribe((data: any) => {
      // console.log('dddddddddddddddd123456', data, '123', this.activeGroup);

      if (
        data.groupId === this.activeGroup.groupId
        // data.senderID != this.loginId
      ) {
        if (this.typingUsers.indexOf(data.groupId) == -1) {
          this.typingUsers.push(data.groupId); // maintain a list/set of currently typing users
        }
        // Show typing indicator (e.g., "User X is typing...")
      }
    });
  }

  onFileSelectedforattache(event: any) {
    const files: FileList = event.target.files;

    if (!files?.length) {
      return;
    }

    const fileArray = Array.from(files);
    this.applySelectedAttachments(fileArray, true);

    if (event?.target) {
      event.target.value = '';
    }
  }

  onMessageInputPaste(event: ClipboardEvent) {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems?.length) {
      return;
    }

    const pastedFiles: File[] = [];

    Array.from(clipboardItems).forEach((item) => {
      if (item.kind !== 'file') {
        return;
      }

      const file = item.getAsFile();
      if (!file) {
        return;
      }

      if (!this.composerAllowedAttachmentTypes.includes(file.type)) {
        return;
      }

      const extension = (file.type.split('/')[1] || '').toLowerCase();
      const safeExtension = extension === 'jpeg' ? 'jpg' : extension || 'file';
      const normalizedName = file.name && file.name.trim().length
        ? file.name
        : `pasted-${Date.now()}.${safeExtension}`;

      pastedFiles.push(new File([file], normalizedName, { type: file.type }));
    });

    if (!pastedFiles.length) {
      return;
    }

    event.preventDefault();
    this.applySelectedAttachments(pastedFiles, false);
  }

  private applySelectedAttachments(files: File[], replaceExisting: boolean) {
    Promise.all(files.map((file: File) => this.prepareSelectedAttachment(file, this.composerAllowedAttachmentTypes)))
      .then((preparedFiles) => {
        const nextSelection = preparedFiles.filter((item: any) => !!item);

        if (!nextSelection.length) {
          return;
        }

        if (replaceExisting) {
          this.releaseSelectedImageUrls();
          this.selectedimage = nextSelection;
          return;
        }

        this.selectedimage = [...this.selectedimage, ...nextSelection];
      })
      .catch(() => {
        this.toastr.error('Unable to prepare selected files');
      });
  }

  private async prepareSelectedAttachment(file: File, allowedTypes: string[]) {
    if (!allowedTypes.includes(file.type)) {
      this.toastr.error(`Invalid file type \"${file.name}\"`);
      return null;
    }

    let finalFile = file;
    const isImage = file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'image/png';

    if (isImage && file.size > this.imageCompressionThresholdBytes) {
      try {
        finalFile = await this.compressImage(file);
      } catch {
        finalFile = file;
      }
    }

    const isAudio = this.isAudioAttachmentType(finalFile.type);
    const previewData = (isImage || isAudio) ? URL.createObjectURL(finalFile) : '';

    return {
      name: finalFile.name,
      type: finalFile.type,
      data: previewData,
      file: finalFile,
      size: finalFile.size
    };
  }

  private compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          if (width > height && width > this.imageMaxDimension) {
            height = Math.round((height * this.imageMaxDimension) / width);
            width = this.imageMaxDimension;
          } else if (height >= width && height > this.imageMaxDimension) {
            width = Math.round((width * this.imageMaxDimension) / height);
            height = this.imageMaxDimension;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas not supported'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Image compression failed'));
                return;
              }

              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            },
            'image/jpeg',
            this.imageCompressionQuality
          );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = reader.result as string;
      };

      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  private releaseSelectedImageUrls() {
    this.selectedimage.forEach((item: any) => {
      if (item?.data && typeof item.data === 'string' && item.data.startsWith('blob:')) {
        URL.revokeObjectURL(item.data);
      }
    });
  }

  private releaseAttachmentBlobUrls(items: any[] = []) {
    items.forEach((item: any) => {
      if (item?.data && typeof item.data === 'string' && item.data.startsWith('blob:')) {
        URL.revokeObjectURL(item.data);
      }
    });
  }

  isAudioAttachmentType(type: string = ''): boolean {
    const normalized = (type || '').toLowerCase();
    return normalized.startsWith('audio/') || normalized === 'mp3' || normalized === 'm4a';
  }

  formatAttachmentSize(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  userstopTyping() {
    this.websocket.userstopTyping().subscribe((data: any) => {
      // console.log('dddddddddddddddd', data, this.activeGroup);
      if (data.groupId === this.activeGroup.groupId) {
        if (this.typingUsers.indexOf(data.groupId) != -1) {
          this.typingUsers.splice(this.typingUsers.indexOf(data.groupId), 1); // maintain a list/set of currently typing users
        }
        // Show typing indicator (e.g., "User X is typing...")
      }
    });
  }
  onInputChange(event: any) {
    // console.log("dddddddddd");
    this.websocket.typing(this.activeGroup.groupId, this.loginId);
  }

  @HostListener('document:click')
  closeMessagePickerOnOutside() {
    if (this.showMessagePicker) {
      this.showMessagePicker = false;
    }
  }

  keepMessagePickerOpen(event: Event) {
    event.stopPropagation();
  }

  setMessagePickerTab(tab: 'emojis' | 'gifs' | 'stickers', event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.messagePickerTab = tab;
    this.applyMessagePickerFilter();
  }

  onMessagePickerSearchChange() {
    this.applyMessagePickerFilter();
  }

  insertPickerItem(item: string, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.message = `${this.message || ''}${item}`;
    this.showMessagePicker = false;
  }

  private applyMessagePickerFilter() {
    const term = (this.messagePickerSearch || '').trim().toLowerCase();

    this.filteredEmojiOptions = this.emojiOptions.filter((val) =>
      val.toLowerCase().includes(term)
    );

    this.filteredGifOptions = this.gifOptions.filter((val) =>
      val.toLowerCase().includes(term)
    );

    this.filteredStickerOptions = this.stickerOptions.filter((val) =>
      val.toLowerCase().includes(term)
    );
  }

  getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  joingroup() {
    this.websocket.onUserJoined().subscribe(async (res: any) => {
      console.log(res, 'check res', this.activeGroup);
      this.getgrouplist();
      if (this.activeGroup.groupId != res.groupId) {
        this.getgrouplist();
      }
    });
  }

  updateLatestMessage(groupId: any, newMessage: any, timestamp: any, count: any) {
    // Find the group with the matching groupId\
    // console.log(`newMessage`, newMessage);
    console.log(`test1234555`, '==========123456', groupId);
    const group = this.groupList.find((g: any) => g.groupId === groupId);
    console.log(`==========123456`, group);
    // If group is found, update the latestMessage
    if (group) {
      group.latestMessage = this.getConversationPreviewText(newMessage);
      group.timestamp = timestamp;
      if (count != 'checkcount') {
        group.count = count;
      }
      // console.log('Group updated:', group);
    } else {
      console.log('Group not found!');
    }
  }

  private getConversationPreviewText(rawMessage: any): string {
    const parsed = this.parseReplyFromMessage(rawMessage);
    const cleanText = (parsed.text || '').trim();
    if (cleanText) {
      return cleanText;
    }

    if (parsed.replyMeta?.preview) {
      return parsed.replyMeta.preview;
    }

    const raw = (rawMessage || '').toString();
    if (raw.startsWith(this.replyLegacyPrefix)) {
      return 'Reply';
    }

    return raw;
  }

  socketgroup() {
    this.websocket.socketgrouplist().subscribe(async (res: any) => {
      // console.log(res, 'check res');
      // this.getgrouplist();
      this.updateLatestMessage(res.groupId, res.message, res.timestamp, res.count);
      this.getgrouplist();

    });
  }
  removeSelectedFile() {
    // setTimeout(() => {
    this.releaseSelectedImageUrls();
    this.selectedimage = []; // Reset object
    if (this.fileInput) {
      this.fileInput.nativeElement.value = ''; // Clear file input
    }
    // }, 2000);
  }

  
  sendMessage() {
    console.log('check imagee else');

    const messagePriority = this.selectedPriority;
    const messageImportant = this.isImportant;
    const outboundMessageText = this.buildOutgoingMessageText(this.message);
    const parsedOutgoing = this.parseReplyFromMessage(outboundMessageText);
    const replyMetaForMessage = parsedOutgoing.replyMeta;
    const displayMessageText = parsedOutgoing.text;

    if (this.message.trim() === '' && (!this.selectedimage || this.selectedimage.length === 0)) {
      this.toastr.error('Message should not be blank');
      return;
    }

    // Upload images if any
    if (this.selectedimage.length > 0 && this.selectedimage[0].file) {
      const timestamp = Date.now();
      const uid = Math.floor(Math.random() * 10000);
      const messageId = uid + timestamp;
      
      // Show message immediately with base64 preview and loading flag
      this.messageList.push({
        message: displayMessageText,
        timestamp: timestamp,
        senderID: this.loginId,
        attachments: this.selectedimage.map((img: any) => ({
          name: img.name,
          type: img.type,
          data: img.data,
          uploading: true,
          uploadProgress: 0
        })),
        conversationId: this.activeGroup.groupId,
        isDeleted: false,
        isImportant: messageImportant,
        priority: messagePriority,
        messageId: messageId,
        status: 'SENT',
        replyMeta: replyMetaForMessage
      });

      this.message = '';
      this.isImportant = false;
      this.selectedPriority = 'ROUTINE';
      this.replyingTo = null;
      const tempImages = [...this.selectedimage];
      setTimeout(() => {
        this.selectedimage = [];
        if (this.fileInput) {
          this.fileInput.nativeElement.value = '';
        }
      }, 100);
      setTimeout(() => this.scrollToBottom(), 100);
      
      // Upload in background
      this.uploadFilesWithProgress(tempImages, messageId).then((uploadedImages: any[]) => {
        this.activeUploadRequests.delete(String(messageId));
        this.releaseAttachmentBlobUrls(tempImages);
        
        // Update message to remove loading flag
        const msgIndex = this.messageList.findIndex((m: any) => m.messageId === messageId);
        if (msgIndex !== -1) {
          this.messageList[msgIndex].attachments = uploadedImages.map((img: any) => ({
            ...img,
            uploading: false,
            uploadProgress: 100
          }));
        }
        
        this.websocket.sendMessage(
          outboundMessageText,
          this.activeGroup.groupId,
          timestamp,
          uploadedImages,
          messageImportant,
          messageId,
          messagePriority
        );
      }).catch((error: any) => {
        console.error('Upload error:', error);
        this.releaseAttachmentBlobUrls(tempImages);
        const messageKey = String(messageId);
        const isCancelled = this.cancelledUploadMessageIds.has(messageKey);

        this.activeUploadRequests.delete(messageKey);
        if (isCancelled) {
          this.cancelledUploadMessageIds.delete(messageKey);
          return;
        }

        this.toastr.error('Failed to upload files');
        // Remove loading flag on error
        const msgIndex = this.messageList.findIndex((m: any) => m.messageId === messageId);
        if (msgIndex !== -1) {
          this.messageList[msgIndex].attachments.forEach((att: any) => {
            att.uploading = false;
            att.uploadProgress = 0;
          });
        }
      });
    } else {
      this.sendMessageWithAttachments(this.selectedimage, outboundMessageText, displayMessageText, replyMetaForMessage);
    }
  }

  private uploadFilesWithProgress(files: any[], messageId: any): Promise<any[]> {
    const uploadTasks = files.map((item: any, index: number) =>
      this.uploadSingleFileWithProgress(item.file, messageId, index).then((url: string) => ({
        name: item.name,
        type: item.type,
        data: url
      }))
    );

    return Promise.all(uploadTasks);
  }

  private uploadSingleFileWithProgress(file: File, messageId: any, attachmentIndex: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('images', file);
      this.registerUploadRequest(String(messageId), xhr);

      xhr.open('POST', `${environment.apiUrl}/upload-image`, true);

      const token = localStorage.getItem('auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.min(99, Math.max(0, Math.round((event.loaded / event.total) * 100)));
        this.updateAttachmentUploadProgress(messageId, attachmentIndex, progress);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          this.unregisterUploadRequest(String(messageId), xhr);
          reject(new Error('Upload failed'));
          return;
        }

        try {
          const response = JSON.parse(xhr.responseText);
          const imageUrls = response?.imageUrls;
          if (!Array.isArray(imageUrls) || !imageUrls.length) {
            reject(new Error('Invalid upload response'));
            return;
          }

          this.updateAttachmentUploadProgress(messageId, attachmentIndex, 100);
          this.unregisterUploadRequest(String(messageId), xhr);
          resolve(imageUrls[0]);
        } catch {
          this.unregisterUploadRequest(String(messageId), xhr);
          reject(new Error('Invalid upload response'));
        }
      };

      xhr.onerror = () => {
        this.unregisterUploadRequest(String(messageId), xhr);
        reject(new Error('Network error while uploading'));
      };

      xhr.onabort = () => {
        this.unregisterUploadRequest(String(messageId), xhr);
        reject(new Error('UPLOAD_ABORTED'));
      };

      xhr.send(formData);
    });
  }

  private registerUploadRequest(messageId: string, xhr: XMLHttpRequest) {
    const list = this.activeUploadRequests.get(messageId) || [];
    list.push(xhr);
    this.activeUploadRequests.set(messageId, list);
  }

  private unregisterUploadRequest(messageId: string, xhr: XMLHttpRequest) {
    const list = this.activeUploadRequests.get(messageId);
    if (!list) {
      return;
    }

    const next = list.filter((item) => item !== xhr);
    if (next.length) {
      this.activeUploadRequests.set(messageId, next);
    } else {
      this.activeUploadRequests.delete(messageId);
    }
  }

  cancelAttachmentUpload(messageId: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const key = String(messageId);
    this.cancelledUploadMessageIds.add(key);

    const requests = this.activeUploadRequests.get(key) || [];
    requests.forEach((xhr) => {
      try {
        xhr.abort();
      } catch {}
    });

    const removingMessage = this.messageList.find((msg: any) => String(msg?.messageId) === key);
    if (removingMessage?.attachments?.length) {
      this.releaseAttachmentBlobUrls(removingMessage.attachments);
    }

    this.activeUploadRequests.delete(key);
    this.messageList = this.messageList.filter((msg: any) => String(msg?.messageId) !== key);
  }

  private updateAttachmentUploadProgress(messageId: any, attachmentIndex: number, progress: number) {
    const msgIndex = this.messageList.findIndex((m: any) => m.messageId === messageId);
    if (msgIndex === -1) {
      return;
    }

    const attachment = this.messageList[msgIndex]?.attachments?.[attachmentIndex];
    if (!attachment) {
      return;
    }

    attachment.uploadProgress = progress;
  }

  sendMessageWithAttachments(attachments: any[], outboundMessageText: string = this.message, displayMessageText: string = this.message, replyMeta: any = null) {
    const timestamp = Date.now();
    const uid = Math.floor(Math.random() * 10000);
    const messageId = uid + timestamp;
    const msgPriority = this.selectedPriority;


    this.messageList.push({
      message: displayMessageText,
      timestamp: timestamp,
      senderID: this.loginId,
      attachments: attachments,
      conversationId: this.activeGroup.groupId,
      isDeleted: false,
      isImportant: this.isImportant,
      priority: msgPriority,
      messageId: messageId,
      status: 'SENT',
      replyMeta: replyMeta
    });
    this.websocket.sendMessage(
      outboundMessageText,
      this.activeGroup.groupId,
      timestamp,
      attachments,
      this.isImportant,
      messageId,
      msgPriority
    );
    this.message = '';
    this.isImportant = false;
    this.selectedPriority = 'ROUTINE'
    this.replyingTo = null;
    this.releaseSelectedImageUrls();
    setTimeout(() => {
      this.selectedimage = [] // Reset object
      if (this.fileInput) {
        this.fileInput.nativeElement.value = ''; // Clear file input
      }
    }, 100);
    setTimeout(() => this.scrollToBottom(), 100);
  }

  newMessage() {

    console.log('check new message');
    this.websocket.newMessage().subscribe(async (res: any) => {
      // this.toastr.error(res.message+"messageids: "+res.messageId+"senderid "+res.senderID,"new  message event");

      console.log(res, 'newMessageres');
      this.scheduleReminderAlerts(res);
      const hydratedIncoming = this.hydrateMessageForReply({
        message: res.message,
        timestamp: res.timestamp,
        attachments: res.attachments,
        senderID: res.senderID,
        group_name: res?.senderDetails?.fullName,
        isImportant: res.isImportant,
        priority: res.priority || 'ROUTINE',
        messageId: res.messageId
      });
      if (this.activeGroup.groupId == res.groupId) {
        if (
          this.messageList.indexOf({
            message: hydratedIncoming.message,
            timestamp: res.timestamp,
            senderID: res.senderID,
            attachments: res.attachments,
            group_name: res?.senderDetails?.fullName,
            isImportant: res.isImportant,
            messageId: res.messageId
          }) == -1 &&
          res.senderID != this.loginId
        ) {
          this.messageList.push(hydratedIncoming);
        }
        else {
          // this.toastr.error(res,"messagelist mistaach");

        }
      }
      else {
        // this.toastr.error(res,"groupid misMATCH");

      }
      if (this.activeGroup.groupId == res.groupId) {
        this.scheduleScrollToBottom('auto');
      }
      // this.getgrouplist();
    });
  }

  //Audio Recording
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer MP4/M4A if supported by the browser, otherwise fall back
      const preferredTypes = [
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg'
      ];
      let selectedMime = '';
      for (const t of preferredTypes) {
        if ((window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported && (window as any).MediaRecorder.isTypeSupported(t)) {
          selectedMime = t;
          break;
        }
      }

      if (selectedMime) {
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });
        this.recordingMimeType = selectedMime;
      } else {
        this.mediaRecorder = new MediaRecorder(stream);
        this.recordingMimeType = '';
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        if (this.skipSaveRecording) {
          this.audioChunks = [];
          this.skipSaveRecording = false;
          return;
        }
        const blobType = this.recordingMimeType || (this.audioChunks[0]?.type) || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, blobType ? { type: blobType } : undefined);
        this.addRecordedAudioDraft(audioBlob);
      };

      this.audioChunks = [];
      this.mediaRecorder.start();
      this.recording = true;
      this.skipSaveRecording = false;
      this.recordingTime = 0;

      console.log("Recording started...");

      // Start Timer
      this.intervalRef = setInterval(() => {
        this.recordingTime++;
        if (this.recordingTime >= this.maxRecordingTime) {
          this.stopRecording();
        }
      }, 1000);

      // Auto Stop After Max Time
      this.timeoutRef = setTimeout(() => {
        this.stopRecording();
      }, this.maxRecordingTime * 1000);

    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.skipSaveRecording = false;
      this.mediaRecorder.stop();
      this.recording = false;
      clearInterval(this.intervalRef);
      clearTimeout(this.timeoutRef);

      // ✅ Stop Microphone Access
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

      // console.log("Recording stopped.");
    }
  }

  cancelRecording(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.skipSaveRecording = true;
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    this.recording = false;
    clearInterval(this.intervalRef);
    clearTimeout(this.timeoutRef);
    this.audioChunks = [];
    this.releaseSelectedImageUrls();
    this.selectedimage = [];
  }

  sendRecordingAfterStop() {
    this.stopRecording();
    setTimeout(() => this.sendRecordedAudioNow(), 140);
  }

  private addRecordedAudioDraft(blob: Blob) {
    const mime = blob.type || this.recordingMimeType || 'audio/webm';
    let ext = 'm4a';
    if (mime.includes('webm')) {
      ext = 'webm';
    } else if (mime.includes('ogg')) {
      ext = 'ogg';
    } else if (mime.includes('mpeg') || mime.includes('mp3')) {
      ext = 'mp3';
    }

    const audioFile = new File([blob], `audio_${Date.now()}.${ext}`, { type: mime });
    const previewUrl = URL.createObjectURL(audioFile);

    this.selectedimage = [
      {
        name: audioFile.name,
        type: audioFile.type || 'audio/webm',
        data: previewUrl,
        file: audioFile,
        size: audioFile.size,
        recorded: true
      }
    ];

    this.audioChunks = [];
    this.recordingTime = 0;
  }

  // ✅ Convert Seconds to MM:SS Format
  getFormattedTime(): string {
    const minutes = Math.floor(this.recordingTime / 60);
    const seconds = this.recordingTime % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  sendRecordedAudioNow(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!this.selectedimage?.length || !this.selectedimage[0]?.recorded) {
      return;
    }

    this.sendMessage();
  }
  onScroll(event: any) {
    const element = event.target;
    if (element.scrollTop <= 40 && !this.is_loading && this.hasMoreMessages) {
      this.is_loading = true
      this.showHistoryLoader = true;
      this.page++
      this.websocket
        .getmessage(this.activeGroup.groupId, this.page, this.historyPageSize)
        .subscribe((messages: any) => {
          this.is_loading = false
          this.showHistoryLoader = false;
          const olderMessages = Array.isArray(messages) ? messages : [];
          const hydratedOlderMessages = this.hydrateMessageListForReply(olderMessages);
          this.hasMoreMessages = olderMessages.length >= this.historyPageSize;

          if (hydratedOlderMessages.length === 0) {
            return;
          }

          this.messageList = [...hydratedOlderMessages, ...this.messageList];
          console.log(`messageList`, this.messageList);
          this.messageList.sort((a: any, b: any) => {
            return a.timestamp - b.timestamp;  // Sorts in ascending order
          });
          const currentScrollHeight = element.scrollHeight;
          setTimeout(() => {
            element.scrollTop = element.scrollHeight - currentScrollHeight;
          }, 0);

          this.messageList = this.messageList;

        }, () => {
          this.is_loading = false;
          this.showHistoryLoader = false;
        })
      // console.log("scroll working ",element.scrollTop)
      // console.log("this.page",this.page)

    }
  }

  openIntakeFormModel() {
    if (this.intakeFormCloseTimer) {
      clearTimeout(this.intakeFormCloseTimer);
      this.intakeFormCloseTimer = null;
    }
    this.isIntakeFormClosing = false;
    this.showIntakeForm = true;
  }

  closeIntakeFormModel() {
    if (!this.showIntakeForm) {
      return;
    }

    this.isIntakeFormClosing = true;

    if (this.intakeFormCloseTimer) {
      clearTimeout(this.intakeFormCloseTimer);
    }

    this.intakeFormCloseTimer = setTimeout(() => {
      this.showIntakeForm = false;
      this.isIntakeFormClosing = false;
      this.intakeFormCloseTimer = null;
    }, 220);
  }

  async generateIntakeFormPdf() {
    this.showIntakeFormButtons = false;
    const modalElement = this.intakeFormContent.nativeElement;
    if (!modalElement) {
      this.showIntakeFormButtons = true;
      return;
    }

    // Save original styles to restore later
    const originalOverflow = modalElement.style.overflow;
    const originalHeight = modalElement.style.height;

    // Temporarily disable scroll
    modalElement.style.overflow = 'visible';
    modalElement.style.height = 'auto';
    await html2canvas(modalElement, {
      logging: true,
      allowTaint: false,
      scrollY: 0, // ensures the entire modal is captured
      useCORS: true,
      scale: 3
    }).then(canvas => {
      const pdf = new jsPDF('p', 'mm', 'a4', true);

      const imgWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const imgHeight = (imgWidth * canvasHeight) / canvasWidth;

      let heightLeft = imgHeight;
      let position = 0;

      const imageData = canvas.toDataURL('image/png');

      // Add first page
      pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight);

      // Add more pages if needed
      while (heightLeft > 1) {
        position -= pageHeight;
        heightLeft -= pageHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight);
      }

      this.showIntakeFormButtons = true;

      // Revert scroll styles
      modalElement.style.overflow = originalOverflow;
      modalElement.style.height = originalHeight;

      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], `intake_${Date.now()}.pdf`, { type: 'application/pdf' });
      
      this._coreService.uploadImages([pdfFile]).then((pdfUrls: string[]) => {
        this.sendIntakePdf(pdfUrls[0]);
      }).catch((error: any) => {
        console.error('PDF upload error:', error);
        this.toastr.error('Failed to upload PDF');
      });

      // To test the pdf on go.
      // window.open(pdf.output('bloburl'), '_blank', "toolbar=no,status=no,menubar=no,scrollbars=no,resizable=no,modal=yes");/* ,top=200,left=350,width=600,height=400 */
    });
  }

  sendIntakePdf(pdfUrl: string) {
    const timestamp = Date.now();
    const uid = Math.floor(Math.random() * 10000);
    const messageId = uid + timestamp;    
    this.messageList.push({
      message: this.message,
      timestamp: timestamp,
      senderID: this.loginId,
      attachments: [{
        name: timestamp + '.pdf',
        type: 'application/pdf',
        data: pdfUrl,
      }],
      conversationId: this.activeGroup.groupId,
      isDeleted: false,
      isImportant: this.isImportant,
      messageId: messageId,
      status: 'SENT'
    });
    this.websocket.sendMessage(
      this.message,
      this.activeGroup.groupId,
      timestamp,
      [{
        name: timestamp + '.pdf',
        type: 'application/pdf',
        data: pdfUrl,
      }],
      this.isImportant,
      messageId
    );
    this.closeIntakeFormModel();
  }
  openImageModal(imageUrl: string): void {
    this.selectedImageForModal = imageUrl;
    this.selectedImageZoom = 1;
    this.selectedImageTranslateX = 0;
    this.selectedImageTranslateY = 0;
    this.isImagePreviewDragging = false;
  }

  // Function to close the modal
  closeModal(): void {
    this.selectedImageForModal = null;
    this.selectedImageZoom = 1;
    this.selectedImageTranslateX = 0;
    this.selectedImageTranslateY = 0;
    this.isImagePreviewDragging = false;
  }

  zoomInImagePreview(): void {
    this.selectedImageZoom = Math.min(3, this.selectedImageZoom + 0.2);
  }

  zoomOutImagePreview(): void {
    this.selectedImageZoom = Math.max(0.6, this.selectedImageZoom - 0.2);
    if (this.selectedImageZoom <= 1) {
      this.selectedImageTranslateX = 0;
      this.selectedImageTranslateY = 0;
      this.isImagePreviewDragging = false;
    }
  }

  resetImagePreviewZoom(): void {
    this.selectedImageZoom = 1;
    this.selectedImageTranslateX = 0;
    this.selectedImageTranslateY = 0;
    this.isImagePreviewDragging = false;
  }

  onImagePreviewWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomInImagePreview();
      return;
    }
    this.zoomOutImagePreview();
  }

  getImagePreviewTransform(): string {
    return `translate(${this.selectedImageTranslateX}px, ${this.selectedImageTranslateY}px) scale(${this.selectedImageZoom})`;
  }

  openPdfPreview(pdfUrl: string, fileName: string = '', event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!pdfUrl) {
      return;
    }

    this.selectedPdfForModal = pdfUrl;
    this.selectedPdfName = fileName || 'Document.pdf';
    this.selectedPdfPreviewUrl = this.safePdfUrl(pdfUrl);
  }

  closePdfPreview(): void {
    this.selectedPdfForModal = null;
    this.selectedPdfName = '';
    this.selectedPdfPreviewUrl = null;
  }

  downloadCurrentPdf(): void {
    if (!this.selectedPdfForModal) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = this.selectedPdfForModal;
    anchor.target = '_blank';
    anchor.download = this.selectedPdfName || 'document.pdf';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }

  safePdfUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  startImagePreviewDrag(event: MouseEvent | TouchEvent): void {
    if (this.selectedImageZoom <= 1) {
      return;
    }

    const point = this.getImagePreviewPoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    this.isImagePreviewDragging = true;
    this.imageDragStartX = point.x;
    this.imageDragStartY = point.y;
    this.imageDragOriginX = this.selectedImageTranslateX;
    this.imageDragOriginY = this.selectedImageTranslateY;
  }

  onImagePreviewDrag(event: MouseEvent | TouchEvent): void {
    if (!this.isImagePreviewDragging || this.selectedImageZoom <= 1) {
      return;
    }

    const point = this.getImagePreviewPoint(event);
    if (!point) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    this.selectedImageTranslateX = this.imageDragOriginX + (point.x - this.imageDragStartX);
    this.selectedImageTranslateY = this.imageDragOriginY + (point.y - this.imageDragStartY);
  }

  endImagePreviewDrag(): void {
    this.isImagePreviewDragging = false;
  }

  private getImagePreviewPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if (event instanceof MouseEvent) {
      return { x: event.clientX, y: event.clientY };
    }

    if (event.touches && event.touches.length > 0) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    if (event.changedTouches && event.changedTouches.length > 0) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }

    return null;
  }

  removeSelectedFilevalue(index: number): void {
    const selected = this.selectedimage[index];
    if (selected?.data && typeof selected.data === 'string' && selected.data.startsWith('blob:')) {
      URL.revokeObjectURL(selected.data);
    }
    this.selectedimage.splice(index, 1);
  }
  handleImportant() {
    this.isImportant = !this.isImportant

  }

  editGroupName(group: any) {

    this.showAddChatModalGroupName = true;
    this.groupName = group?.title
    if (group?.image) {
      this.previewUrl = this.backendUrl + `/user-uploads/profiles/${group?.image}`
    }

    this.is_edit = true

  }

  // for update group profile and name @shivam
  UpdateImageName() {
    const formData = new FormData();
    if (this.grouppicture && this.grouppicture !== '') {
      formData.append('profileImage', this.grouppicture);
    }
    formData.append('groupName', this.groupName);
    formData.append('groupId', this.activeGroup.groupId); // Ensure you're sending this!

    this.authService.updateGroupNameProfile(formData).subscribe(
      (response: any) => {
        this.showAddChatModalGroupName = false;
        this.previewUrl = ''
        this.groupName = ''
        this.is_edit = true
        this.getgrouplist();
        if (response?.data?.groupName) {
          this.activeGroup.title = response.data.groupName;
          this.activeGroup.image = response?.data?.groupPicture?.savedName
        }
        this.websocket.editGroup(this.activeGroup.groupId)
        this.toastr.success(response.message);
        // Optionally handle UI updates or success messages here
      },
      (error) => {
        this.toastr.error(error.error.message);
        // Optionally handle error messages here
      }
    );
  }

  editeMembers(group: any) {

    this.showAddChatModal = true;
    this.is_edit = true

    for (const user of group.actualgroupmemberid) {

      const object = {
        userid: user?._id,
        name: user?.fullName,
        profilePicture: user?.profilePicture,
        status: user?.status

      };
      const index = this.selecteduser.indexOf(object);

      if (index === -1) {
        // Add user if not already selected
        this.selecteduser.push(object);
      } else {
        // Remove user if already selected
        this.selecteduser.splice(index, 1);
      }
    }



  }

  updateGroupMember() {


    const payload = {
      members: this.selecteduser, // Adjust key as needed based on your API
      groupID: this.activeGroup?.groupId // Optional: include group ID if required
    };

    this.authService.updateGroupMembers(payload).subscribe(
      (res: any) => {
        this.getgrouplist();
        // const updatedGroup = this.userList.filter((ele: any) => ele.groupid === this.activeGroup?.groupId)
        // console.log("updatedGroup", updatedGroup)
        this.websocket.editGroup(this.activeGroup.groupId)
        this.showAddChatModal = false;
        const filtered = this.groupList.filter((item: any) => item.groupId === this.activeGroup.groupId);
        if (filtered.length > 0) {
          this.selectGroup(filtered[0])

        }
        this.is_edit = false
        this.selecteduser = []

        this.toastr.success(res.message);
        console.log("Group members updated successfully:", res);
      },
      (error) => {
        this.toastr.error(error.error.message);
        // console.error("Error updating group members:", error);
      }
    );
  }

  isUserSelected(id: string): boolean {
    return this.selecteduser.some((user: any) => user.userid === id); // quick fix
  }


  convertTimestampToDate(timestamp: any) {

    const date = new Date(parseInt(timestamp));

    return date.toISOString().split('T')[0];  // Get the date part (YYYY-MM-DD)

  }

  private getDateLabelByTimestamp(timestamp: any): string {
    const messageDate = new Date(parseInt(timestamp));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const currentMessageDate = new Date(messageDate);
    currentMessageDate.setHours(0, 0, 0, 0);

    if (currentMessageDate.getTime() === today.getTime()) {
      return 'Today';
    }

    if (currentMessageDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(messageDate);
  }

  isCallLogMessage(message: any): boolean {
    const currentMessage = (message?.message || '').toString().toLowerCase();
    return /(audio|video)\s+call\s+has\s+been\s+completed/.test(currentMessage);
  }

  isAudioCallLogMessage(message: any): boolean {
    const currentMessage = (message?.message || '').toString().toLowerCase();
    return this.isCallLogMessage(message) && currentMessage.includes('audio call');
  }

  isVideoCallLogMessage(message: any): boolean {
    const currentMessage = (message?.message || '').toString().toLowerCase();
    return this.isCallLogMessage(message) && currentMessage.includes('video call');
  }

  private formatCallDuration(durationText: string): string {
    const durationMatch = durationText.match(/(\d+)h\s*(\d+)m\s*(\d+)s/i);
    if (!durationMatch) {
      return durationText;
    }

    const hours = Number(durationMatch[1]);
    const minutes = Number(durationMatch[2]);
    const seconds = Number(durationMatch[3]);

    const durationParts: string[] = [];
    if (hours > 0) {
      durationParts.push(`${hours}h`);
    }
    if (minutes > 0) {
      durationParts.push(`${minutes}m`);
    }
    if (seconds > 0 || durationParts.length === 0) {
      durationParts.push(`${seconds}s`);
    }

    return durationParts.join(' ');
  }

  formatCallLogMessage(message: any): string {
    const rawMessage = (message?.message || '').toString().trim();
    if (!this.isCallLogMessage(message)) {
      return rawMessage;
    }

    const title = this.isVideoCallLogMessage(message)
      ? 'Video call completed'
      : 'Audio call completed';

    const durationMatch = rawMessage.match(/call\s*duration:\s*([0-9]+h\s*[0-9]+m\s*[0-9]+s)/i);
    if (!durationMatch) {
      return title;
    }

    const formattedDuration = this.formatCallDuration(durationMatch[1]);
    return `${title} • Duration ${formattedDuration}`;
  }

  dateWiseGroup(data: any) {
    data.sort((a: any, b: any) => a.timestamp - b.timestamp);
    const localAssignedDates = new Set<string>();

    for (const item of data) {
      const date = this.convertTimestampToDate(item.timestamp);
      item["group_date"] = '';

      if (!localAssignedDates.has(date)) {
        item["group_date"] = this.getDateLabelByTimestamp(item.timestamp);
        localAssignedDates.add(date);

      }
    }
    return data || []

  }

  openDeleteModel(messageId: any) {
    this.messageId = messageId
    this.showDeleteModal = !this.showDeleteModal
  }
  deleteMessage(type: any) {

    let ids = type === "me" ? [this.loginId] : [...this.activeGroup.actualgroupmemberid.map((ele: any) => ele._id), this.loginId]
    // console.log("type",this.messageId)
    this.websocket.deleteMessage(this.activeGroup?.groupId, this.messageId, ids)
  }
  updateDeleteMsg() {
    this.websocket.updateDeletedMessage().subscribe((res: any) => {
      this.showDeleteModal = false
      if (res?.hiddenBy.includes(this.loginId)) {
        this.messageList = this.messageList.filter((ele: any) => ele.messageId != res.messageId)
        this.messageId = ''

      }
    }, (error: any) => {
      console.log("error", error)
    })
  }

  editMsg(msg: any) {
    console.log("msg", msg.messageId)
    console.log("this.message", this.message)
    this.message = msg.message;
    this.messageId = msg.messageId
    this.is_msg_edit = true
  }

  updateMsg() {
    console.log("working", this.is_edit)
    this.websocket.editMessage(this.activeGroup?.groupId, this.messageId, this.message)

    this.is_msg_edit = false
    this.message = ''
  }
  getUpdatedMsg() {
    this.websocket.updateEditMessage().subscribe((res: any) => {
      this.updateLatestMessage(res.conversationId, res.message, res.timestamp, "checkcount");
      const parsed = this.parseReplyFromMessage(res.message);

      this.messageList = this.messageList.map((msg: any) => {
        console.log(msg, "==========123456");
        if (msg.messageId == res.messageId) {
          return { ...msg, message: parsed.text, replyMeta: parsed.replyMeta };

        }
        return msg;
      });

    }, (error) => {
      console.log("errror", error)
    })
  }

  getUpdatedGroup() {
    this.websocket.updatedGroup().subscribe((res: any) => {
      console.log("updatedresssssss", res)
      this.getgrouplist(0, 1, "groupUpdate");
      //   const filtered = this.groupList.filter((item:any) => item.groupId === res?.groupId);
      // if(filtered.length>0)
      // {
      // this.selectGroup(filtered[0])
      // }
      // this.selectGroup(res.groupId)
    }, (error) => {
      console.log("errror", error)
    })
  }


  downloadBase64File = (base64: any, fileName: any, mimeType: any) => {
    const link = document.createElement('a');
    link.href = `data:${mimeType};base64,${base64}`;
    link.download = fileName;
    link.click();
  };

  private isTextMimeType(mimeType: string): boolean {
    const normalizedType = (mimeType || '').toLowerCase();
    return normalizedType.includes('text/plain') || normalizedType.includes('application/text');
  }

  private decodeBase64Utf8(base64: string): string {
    try {
      const binary = atob(base64 || '');
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return atob(base64 || '');
    }
  }

  private formatDurationForExport(durationText: string): string {
    const durationMatch = (durationText || '').match(/(\d+)h\s*(\d+)m\s*(\d+)s/i);
    if (!durationMatch) {
      return durationText;
    }

    const hours = Number(durationMatch[1]);
    const minutes = Number(durationMatch[2]);
    const seconds = Number(durationMatch[3]);

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(' ');
  }

  private normalizeExportMessageBody(messageBody: string): string {
    const cleanBody = (messageBody || '').trim();
    const callMatch = cleanBody.match(/^(audio|video)\s+call\s+has\s+been\s+completed\.?\s*call\s*duration:\s*([0-9]+h\s*[0-9]+m\s*[0-9]+s)\.?$/i);

    if (!callMatch) {
      return cleanBody;
    }

    const callType = callMatch[1].charAt(0).toUpperCase() + callMatch[1].slice(1).toLowerCase();
    const duration = this.formatDurationForExport(callMatch[2]);
    return `${callType} call completed (Duration: ${duration})`;
  }

  private formatExportDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private formatExportTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  private tryParseExportTimestamp(timestampText: string): Date | null {
    const parsed = new Date((timestampText || '').trim());
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private getChatExportPdfFileName(chatTitle: string): string {
    const baseTitle = (chatTitle || 'chat').trim();
    const safeTitle = baseTitle
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    const finalTitle = safeTitle || 'chat';
    return `${finalTitle}-chat.pdf`;
  }

  private getSenderSide(sender: string, senderMap: Map<string, 'left' | 'right'>): 'left' | 'right' {
    const normalizedSender = (sender || 'Unknown').trim();
    if (senderMap.has(normalizedSender)) {
      return senderMap.get(normalizedSender)!;
    }

    const side: 'left' | 'right' = senderMap.size % 2 === 0 ? 'left' : 'right';
    senderMap.set(normalizedSender, side);
    return side;
  }

  private buildExportRows(rawText: string): Array<{ type: 'date' | 'message' | 'system'; date?: string; sender?: string; body: string; side?: 'left' | 'right'; time?: string }> {
    const lines = (rawText || '').split(/\r?\n/);
    const senderMap = new Map<string, 'left' | 'right'>();
    const rows: Array<{ type: 'date' | 'message' | 'system'; date?: string; sender?: string; body: string; side?: 'left' | 'right'; time?: string }> = [];

    let currentDateHeader = '';

    for (const rawLine of lines) {
      const line = (rawLine || '').trim();
      if (!line) {
        continue;
      }

      const lineMatch = line.match(/^\[(.+?)\]\s*([^:]+):\s*(.+)$/);
      if (!lineMatch) {
        rows.push({ type: 'system', body: line });
        continue;
      }

      const timestampText = lineMatch[1];
      const sender = lineMatch[2].trim();
      const normalizedBody = this.normalizeExportMessageBody(lineMatch[3]);
      const parsedDate = this.tryParseExportTimestamp(timestampText);

      if (!parsedDate) {
        rows.push({ type: 'message', sender, body: normalizedBody, side: 'left', time: '' });
        continue;
      }

      const dateHeader = this.formatExportDate(parsedDate);
      if (dateHeader !== currentDateHeader) {
        currentDateHeader = dateHeader;
        rows.push({ type: 'date', date: dateHeader, body: dateHeader });
      }

      const side = this.getSenderSide(sender, senderMap);
      const timeLabel = this.formatExportTime(parsedDate);
      rows.push({ type: 'message', sender, body: normalizedBody, side, time: timeLabel });
    }

    return rows;
  }

  private exportStyledChatPdf(rawText: string, timezone: string) {
    const rows = this.buildExportRows(rawText);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const maxBubbleWidth = pageWidth * 0.62;
    const minBubbleWidth = 120;
    const bubblePadding = 10;
    const lineHeight = 14;
    const rowGap = 10;
    let y = margin;

    const conversationTitle = this.activeGroup?.title || 'Chat Conversation';
    const exportedAt = new Date();

    const drawHeader = () => {
      doc.setFillColor(250, 252, 255);
      doc.setDrawColor(222, 226, 233);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 66, 8, 8, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Doc-Nock Chat Export', margin + 14, y + 24);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Conversation: ${conversationTitle}`, margin + 14, y + 42);
      doc.text(
        `Exported: ${this.formatExportDate(exportedAt)} ${this.formatExportTime(exportedAt)} (${timezone})`,
        margin + 14,
        y + 56
      );

      y += 82;
    };

    const ensureSpace = (requiredHeight: number) => {
      if (y + requiredHeight <= pageHeight - margin) {
        return;
      }
      doc.addPage();
      y = margin;
    };

    drawHeader();

    for (const row of rows) {
      if (row.type === 'date') {
        ensureSpace(28);
        doc.setFillColor(226, 232, 240);
        const pillText = row.date || '';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        const textWidth = doc.getTextWidth(pillText);
        const pillWidth = textWidth + 18;
        const pillX = (pageWidth - pillWidth) / 2;
        doc.roundedRect(pillX, y, pillWidth, 18, 9, 9, 'F');
        doc.setTextColor(51, 65, 85);
        doc.text(pillText, pageWidth / 2, y + 12, { align: 'center' });
        y += 28;
        continue;
      }

      if (row.type === 'system') {
        ensureSpace(20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(row.body || '', pageWidth / 2, y + 10, { align: 'center' });
        y += 20;
        continue;
      }

      const sender = row.sender || 'Unknown';
      const message = row.body || '';
      const time = row.time || '';
      const isRight = row.side === 'right';
      const isCallLog = this.isCallLogMessage({ message });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const senderWidth = doc.getTextWidth(sender);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const messageWrapWidth = maxBubbleWidth - bubblePadding * 2;
      const messageLines = doc.splitTextToSize(message, messageWrapWidth);
      const longestMessageWidth = Math.max(
        ...messageLines.map((line: string) => doc.getTextWidth(line)),
        senderWidth
      );

      const bubbleWidth = Math.min(maxBubbleWidth, Math.max(minBubbleWidth, longestMessageWidth + bubblePadding * 2));
      const bubbleHeight = 18 + messageLines.length * lineHeight + 14;
      const bubbleX = isRight ? pageWidth - margin - bubbleWidth : margin;

      ensureSpace(bubbleHeight + rowGap);

      if (isCallLog) {
        doc.setFillColor(238, 242, 255);
        doc.setDrawColor(199, 210, 254);
      } else if (isRight) {
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(187, 247, 208);
      } else {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(219, 234, 254);
      }

      doc.roundedRect(bubbleX, y, bubbleWidth, bubbleHeight, 10, 10, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(sender, bubbleX + bubblePadding, y + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(messageLines, bubbleX + bubblePadding, y + 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(time, bubbleX + bubbleWidth - bubblePadding, y + bubbleHeight - 6, { align: 'right' });

      y += bubbleHeight + rowGap;
    }

    const fileName = this.getChatExportPdfFileName(this.activeGroup?.title || 'chat');
    doc.save(fileName);
  }

  exportChat(conversationId: any) {
    // Get user's locale and timezone dynamically
    const locale = navigator.language || 'en-IN';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    
    this.chatservice.exportChat(conversationId, locale, timezone).subscribe((res: any) => {
      console.log("exportchat", res)
      if (res?.base64 && this.isTextMimeType(res?.mimeType)) {
        const rawText = this.decodeBase64Utf8(res.base64);
        this.exportStyledChatPdf(rawText, timezone);
        return;
      }

      this.downloadBase64File(res.base64, res.fileName, res.mimeType)
    }, (error) => {
      console.log("error", error)
    })
  }

  deleteConversation() {
    this.websocket.DeleteConversation(this.selectedConversationId?.groupId, this.loginId).subscribe((res: any) => {
      if (res.success) {
        this.toastr.success(res.message);
        const id = res.convResult?._id;
        if (id) {
          if (this.activeGroup.groupId == id) {
            this.activeGroup = ''

          }
          this.groupList = this.groupList.filter((group: any) => group.groupId !== id);
          this.deleteChat = false
          console.log("con deleted", res)
        }
      }
    }, (error: any) => {
      console.log("error", error)
    })
  }

  isGroup: boolean = false

  toggleDeleteChat(conversationId: any) {
    console.log("conversationId", conversationId)
    this.deleteChat = !this.deleteChat;
    this.selectedConversationId = conversationId
  }

  exitGroup() {
    this.loginId
    const users = this.selectedConversationId?.actualgroupmemberid.map((item: any) => ({
      userid: item._id,
      name: item.fullName,
      profilePicture: item.profilePicture,
      status: item.status
    }));
    console.log("exitgroup", users)
    const payload = {
      members: users, // Adjust key as needed based on your API
      groupID: this.selectedConversationId?.groupId, // Optional: include group ID if required
      isExit:true
    };

    this.authService.updateGroupMembers(payload).subscribe(
      (res: any) => {
        this.getgrouplist();
        // const updatedGroup = this.userList.filter((ele: any) => ele.groupid === this.activeGroup?.groupId)
        // console.log("updatedGroup", updatedGroup)
        this.websocket.editGroup(this.selectedConversationId?.groupId)
        
        const filtered = this.groupList.filter((item: any) => item.groupId === this.selectedConversationId?.groupId);
        if (filtered.length > 0) {
          this.selectGroup(filtered[0])

        }
       this.deleteChat = !this.deleteChat;

        this.toastr.success(res.message);
        console.log("exit from  Group  successfully:", res);
      },
      (error) => {
        this.toastr.error(error.error.message);
        // console.error("Error updating group members:", error);
      }
    );
    
  }


  ngOnDestroy() {
    console.log('discconect');
    if (this.callActionLockTimer) {
      clearTimeout(this.callActionLockTimer);
      this.callActionLockTimer = null;
    }
    if (this.callCapsuleInterval) {
      clearInterval(this.callCapsuleInterval);
      this.callCapsuleInterval = null;
    }
    this.websocket.leavepagename(this.loginId, '');
    this.websocket.leavepagename(this.loginId, this.activeGroup.groupId);
    this.releaseSelectedImageUrls();
    this.clearAllReminderAlerts();
    window.removeEventListener('pointerdown', this.reminderAudioUnlockHandler);
    window.removeEventListener('keydown', this.reminderAudioUnlockHandler);
    window.removeEventListener('touchstart', this.reminderAudioUnlockHandler);
    if (this.reminderAudioContext) {
      try {
        this.reminderAudioContext.close();
      } catch {}
      this.reminderAudioContext = null;
    }
    // this.websocket.disconnect();
  }

  // ─── PCC Patient Context Methods ──────────────────────────────────────────

  togglePatientPanel() {
    this.showPatientPanel = !this.showPatientPanel;
    if (this.showPatientPanel && this.activeGroup) {
      this.loadPatientContext();
    }
  }

  loadPatientContext() {
    if (!this.activeGroup?.groupId) return;
    this.patientSummaryLoading = true;
    this.patientLink = null;
    this.patientSummary = null;

    this.authService.getPatientLink(this.activeGroup.groupId).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.patientLink = res.data;
          this.loadPatientSummary();
        } else {
          this.patientSummaryLoading = false;
        }
      },
      error: () => {
        this.patientSummaryLoading = false;
      },
    });
  }

  loadPatientSummary() {
    if (!this.activeGroup?.groupId) return;
    this.authService.getPatientSummary(this.activeGroup.groupId).subscribe({
      next: (res: any) => {
        this.patientSummary = res?.data || null;
        this.patientSummaryLoading = false;
      },
      error: () => {
        this.patientSummaryLoading = false;
      },
    });
  }

  openLinkPatientModal() {
    this.showLinkPatientModal = true;
    this.pccSearchQuery = '';
    this.pccSearchResults = [];
  }

  closeLinkPatientModal() {
    this.showLinkPatientModal = false;
    this.pccSearchQuery = '';
    this.pccSearchResults = [];
  }

  searchPccPatients() {
    if (!this.pccSearchQuery?.trim()) return;
    this.pccSearchLoading = true;
    this.authService.searchPccPatients(this.pccSearchQuery).subscribe({
      next: (res: any) => {
        this.pccSearchResults = res?.data || [];
        this.pccSearchLoading = false;
      },
      error: () => {
        this.pccSearchResults = [];
        this.pccSearchLoading = false;
      },
    });
  }

  selectPccPatient(patient: any) {
    if (!this.activeGroup?.groupId) return;
    this.authService.linkPatient(
      this.activeGroup.groupId,
      patient.patientId || patient._id,
      patient.facilityId,
      patient.name || patient.fullName
    ).subscribe({
      next: () => {
        this.closeLinkPatientModal();
        this.loadPatientContext();
        this.toastr.success('Patient linked successfully');
      },
      error: () => {
        this.toastr.error('Failed to link patient');
      },
    });
  }

  unlinkPatient() {
    if (!this.activeGroup?.groupId) return;
    this.authService.unlinkPatient(this.activeGroup.groupId).subscribe({
      next: () => {
        this.patientLink = null;
        this.patientSummary = null;
        this.toastr.success('Patient unlinked');
      },
      error: () => {
        this.toastr.error('Failed to unlink patient');
      },
    });
  }

  // ─── AI Summarization ─────────────────────────────────────────────────

  catchMeUp() {
    if (!this.activeGroup?.groupId || this.aiSummaryLoading) return;
    this.aiSummaryLoading = true;
    this.showAiSummary = true;
    this.aiSummary = '';

    this.authService.summarizeConversation(this.activeGroup.groupId, 50).subscribe({
      next: (res: any) => {
        this.aiSummary = res.summary || 'Unable to generate summary.';
        this.aiSummaryLoading = false;
      },
      error: () => {
        this.aiSummary = 'Failed to generate summary. Please try again.';
        this.aiSummaryLoading = false;
      },
    });
  }

  dismissAiSummary() {
    this.showAiSummary = false;
    this.aiSummary = '';
  }

  // ─── Family Portal ──────────────────────────────────────────────────────────
  openInviteFamilyModal() {
    this.showInviteFamilyModal = true;
    this.inviteFamilyEmail = '';
    this.inviteFamilyName = '';
    this.inviteFamilyRelationship = 'spouse';
  }

  closeInviteFamilyModal() {
    this.showInviteFamilyModal = false;
  }

  sendFamilyInvite() {
    if (!this.inviteFamilyEmail || !this.activeGroup?.groupId) return;
    this.inviteFamilyLoading = true;
    this.authService.inviteFamily({
      conversationId: this.activeGroup.groupId,
      familyEmail: this.inviteFamilyEmail,
      familyName: this.inviteFamilyName,
      relationshipType: this.inviteFamilyRelationship,
    }).subscribe({
      next: (res: any) => {
        this.inviteFamilyLoading = false;
        if (res.success) {
          this.toastr.success('Family invitation sent successfully');
          this.closeInviteFamilyModal();
        }
      },
      error: (err: any) => {
        this.inviteFamilyLoading = false;
        this.toastr.error(err?.error?.message || 'Failed to send invitation');
      },
    });
  }

  toggleFamilyLinks() {
    this.showFamilyLinksPanel = !this.showFamilyLinksPanel;
    if (this.showFamilyLinksPanel && this.activeGroup?.groupId) {
      this.loadFamilyLinks();
    }
  }

  loadFamilyLinks() {
    if (!this.activeGroup?.groupId) return;
    this.authService.listFamilyLinks(this.activeGroup.groupId).subscribe({
      next: (res: any) => {
        this.familyLinks = res.links || [];
      },
      error: () => {
        this.familyLinks = [];
      },
    });
  }

  revokeFamilyLink(linkId: string) {
    this.authService.revokeFamilyAccess(linkId).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Family access revoked');
          this.loadFamilyLinks();
        }
      },
      error: () => {
        this.toastr.error('Failed to revoke access');
      },
    });
  }

  // ═══ Reactions ═══
  toggleReactionPicker(messageId: string) {
    this.showReactionPicker = this.showReactionPicker === messageId ? null : messageId;
  }

  addReaction(messageId: string, emoji: string) {
    const emojiName = this.reactionNameMap[emoji] || emoji;
    const userData = JSON.parse(localStorage.getItem('loginData') || '{}');
    this.websocket.addReaction(
      this.activeGroup.groupId, messageId, emojiName,
      this.loginId, userData.fullName || 'User'
    );
    this.showReactionPicker = null;
  }

  removeReaction(messageId: string, emoji: string) {
    const emojiName = this.reactionNameMap[emoji] || emoji;
    this.websocket.removeReaction(
      this.activeGroup.groupId, messageId, emojiName, this.loginId
    );
  }

  hasUserReacted(message: any, emojiName: string): boolean {
    return message.reactions?.some((r: any) => r.emoji === emojiName && r.userId === this.loginId) || false;
  }

  getReactionCount(message: any, emojiName: string): number {
    return message.reactions?.filter((r: any) => r.emoji === emojiName).length || 0;
  }

  getUniqueReactions(message: any): string[] {
    if (!message.reactions?.length) return [];
    return [...new Set(message.reactions.map((r: any) => r.emoji))] as string[];
  }

  toggleReaction(message: any, emojiName: string) {
    if (this.hasUserReacted(message, emojiName)) {
      this.removeReaction(message.messageId, this.reactionEmojiMap[emojiName] || emojiName);
    } else {
      this.addReaction(message.messageId, this.reactionEmojiMap[emojiName] || emojiName);
    }
  }

  // ═══ Pinning ═══
  pinMessage(message: any) {
    const userData = JSON.parse(localStorage.getItem('loginData') || '{}');
    this.websocket.pinMessage(
      this.activeGroup.groupId, message.messageId,
      this.loginId, userData.fullName || 'User'
    );
  }

  unpinMessage(messageId: string) {
    this.websocket.unpinMessage(
      this.activeGroup.groupId, messageId, this.loginId
    );
  }

  togglePinnedPanel() {
    this.showPinnedPanel = !this.showPinnedPanel;
    if (this.showPinnedPanel) this.loadPinnedMessages();
  }

  loadPinnedMessages() {
    this.pinnedLoading = true;
    this.authService.getPinnedMessages(this.activeGroup.groupId).subscribe({
      next: (res: any) => {
        this.pinnedMessages = res.data || [];
        this.pinnedLoading = false;
      },
      error: () => {
        this.pinnedLoading = false;
      }
    });
  }

  // ═══ Topics ═══
  startEditTopic() {
    this.editingTopic = true;
    this.topicDraft = this.conversationTopic;
  }

  saveTopic() {
    const userData = JSON.parse(localStorage.getItem('loginData') || '{}');
    this.websocket.setTopic(
      this.activeGroup.groupId, this.topicDraft,
      this.loginId, userData.fullName || 'User'
    );
    this.conversationTopic = this.topicDraft;
    this.editingTopic = false;
  }

  cancelEditTopic() {
    this.editingTopic = false;
    this.topicDraft = '';
  }

  // ═══ Mentions ═══
  onMessageInput(event: any) {
    const value = event.target?.value || '';
    const cursorPos = event.target?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      this.showMentionPopup = true;
      this.mentionQuery = mentionMatch[1];
      this.searchMentions(this.mentionQuery);
    } else {
      this.showMentionPopup = false;
      this.mentionResults = [];
    }
  }

  searchMentions(query: string) {
    if (!this.activeGroup?.groupId) return;
    this.mentionLoading = true;

    // Use local group member data for instant, offline-capable mentions
    const members = this.activeGroup.actualgroupmemberid || this.activeGroup.userIds || [];
    const lowerQuery = (query || '').toLowerCase();
    this.mentionResults = members
      .filter((u: any) => {
        const name = (u.fullName || u.name || '').toLowerCase();
        const id = typeof u === 'string' ? u : (u._id || '');
        // Exclude current user from mention list
        if (id === this.loginId) return false;
        return !lowerQuery || name.includes(lowerQuery);
      })
      .map((u: any) => ({
        _id: u._id || u,
        fullName: u.fullName || u.name || 'Unknown',
        role: u.role || u.rolename || '',
        profilePicture: u.profilePicture || null
      }));
    this.mentionLoading = false;
  }

  insertMention(user: any) {
    const mention = `@${user.fullName || user.name} `;
    const input = this.message;
    const mentionRegex = /@\w*$/;
    this.message = input.replace(mentionRegex, mention);
    this.showMentionPopup = false;
    this.mentionResults = [];
  }
}
