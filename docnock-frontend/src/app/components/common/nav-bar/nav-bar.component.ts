import { Component, EventEmitter, Input, Output, SimpleChanges, HostListener, ElementRef, OnDestroy } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { WebsocketService } from '../../../services/websocket.service';
import { Router } from '@angular/router';
import { ChatService } from 'src/app/services/chat.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ThemeService } from 'src/app/services/themeservice';


@Component({
  selector: 'app-nav-bar',
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.scss'],
})
export class NavBarComponent implements OnDestroy {
  profileName: any;
  role: any;
  loginid: any = ''
  dynamicpath: any;
  profilePicture: any;
  showNotification = false;
  count: any = 0;
  @Input() notificationMessage: any[] = [];
  page: number = 1;
limit: number = 10;
loading: boolean = false;
hasMore: boolean = true;
activeCallSession: any = null;
private callCapsuleInterval: any;

  constructor(
    private authService: AuthServiceService,
    private _coreService: CoreService,
    private websocket: WebsocketService,
    private router: Router,
    private chatservice: ChatService,
    private toastr:ToastrService,
    private elementRef: ElementRef
  ) { }
  ngOnInit(): void {
    // Register user
    this.dynamicpath = this.authService.getRole()
    this.loginid = localStorage.getItem('userId');
    this.getReminderMsg()
    this.websocket.unreadnoti().subscribe((data: any) => {
      if (data.userId == this.loginid) {
        const incomingCount = typeof data?.count === 'number' ? data.count : null;

        if (incomingCount !== null) {
          this.count = incomingCount;
        } else {
          this.authService.getNotification().subscribe((res: any) => {
            this.count = res?.count ?? 0;
          });
        }

        if (this.showNotification) {
          this.page = 1;
          this.notificationMessage = [];
          this.hasMore = true;
          this.loadNotifications(true);
        }
      }
    });

    this.getgrouplist();
    this.refreshActiveCallSession();
    this.callCapsuleInterval = setInterval(() => this.refreshActiveCallSession(), 3000);
 
    this.getUserById();
    this.loadNotifications(true);
    this.websocket.registerUser();
    this.websocket.ringerstarted().subscribe((data: any) => {
      console.log("ddddddddddddddddwww");

      var actualgroupmemberid = data.activegrouuserids;
      var audio = data.audio;
      var groupid = data.groupId;
      var group=data.isGroup

      if (data.callerId != this.loginid && this.loginid != '679924d6559788ad4a3a88fb') {
        const path = `${this.dynamicpath}/video-call`;
        this.router.navigate([path], { state: { fromA: {   group: group,actualgroupmemberid, groupid, callerId: data.callerId, callerName: data.callerName, callerImage: data.callerImage, audio: audio, rejoin: false } } });
      }
    });

    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyTheme(isDarkMode);
  }

  ngOnDestroy(): void {
    if (this.callCapsuleInterval) {
      clearInterval(this.callCapsuleInterval);
      this.callCapsuleInterval = null;
    }
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

   getgrouplist(limit = 0, page = 1) {
    this.chatservice.getgrouplist(limit, page, '','').subscribe({
      next: (res: any) => {
        if (res.success) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatagroupdata,
          });
          console.log(response, 'responseresponse');
          // Fetch unread count for each group
          response.forEach((group: any) => {
               this.websocket.leavepagename(this.loginid,'');
    this.websocket.leavepagename(this.loginid,group.groupId);
    //           this.websocket.joinGroup({
    //   groupId: response.groupId,
    //   userId: response.userIds,
    // });
          });
          // prashant code end
        }
        //  else {
        //   this.toastr.error(res.message);
        // }
      },
      // error: (err: any) => {
      //   this.toastr.error(err.error.message);
      // },
    });
  }
  @Output() toggle = new EventEmitter<void>();

  onToggleSidebar() {
    this.toggle.emit();
  }
  isDark: boolean = false;
  darkSub!: Subscription;

  toggleTheme(): void {
    const nextMode = !this.isDark;
    this.applyTheme(nextMode);
    localStorage.setItem('darkMode', String(nextMode));
  }

  toggleDarkMode(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.applyTheme(isChecked);
    localStorage.setItem('darkMode', String(isChecked));
  }

  applyTheme(isDarkMode: boolean): void {
    this.isDark = isDarkMode;
    const root = document.documentElement;
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);

    if (isDarkMode) {
      root.style.setProperty('--bg', 'var(--darkmode-bg)');
      root.style.setProperty('--bg-light', 'var(--darkmode-bg-light)');
      root.style.setProperty('--p', 'var(--darkmode-p)');
      root.style.setProperty('--line', 'var(--darkmode-line)');
      root.style.setProperty('--scrollbar', 'var(--darkmode-scrollbar)');
      root.style.setProperty('--h', 'var(--darkmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#1f8f67');
      root.style.setProperty('--bubble-received-bg', '#1e2430');
    } else {
      root.style.setProperty('--bg', 'var(--lightmode-bg)');
      root.style.setProperty('--bg-light', 'var(--lightmode-bg-light)');
      root.style.setProperty('--p', 'var(--lightmode-p)');
      root.style.setProperty('--line', 'var(--lightmode-line)');
      root.style.setProperty('--scrollbar', 'var(--lightmode-scrollbar)');
      root.style.setProperty('--h', 'var(--lightmode-h)');
      root.style.setProperty('--bubble-sent-bg', '#dcf8c6');
      root.style.setProperty('--bubble-received-bg', '#ffffff');
    }
  }


  getReminderMsg() {
    this.websocket.getReminder().subscribe((res: any) => {
      console.log("res========111", res)
      this.toastr.warning(res.message.message, 'Reminder', {
        timeOut: 3000,
        positionClass: 'toast-top-right',
      });
    },
      (error: any) => {
      console.log("error",error)
    })
}

    getUserById() {
      this.authService.getUserById().subscribe({
  next: (res: any) => {
    const response = this._coreService.decryptObjectData({
      data: res.encryptDatauserdata,
    });

    this.profileName = response?.fullName;
    this.role = response?.role;
    this.profilePicture = response?.profilePicture;
  },

  error: (err) => {
    // 🔴 401 delete account case
    if (err?.status === 401 && err?.error?.message === 'delete_account') {
      this.authService.logout();
      this.toastr.error(err.error.message);

    }
  }
});



    this.authService.getNotification().subscribe((res: any) => {
      // let response = this._coreService.decryptObjectData({
      //   data: res.encryptDatauserdata,
      // });
      this.count = res?.count;
    });

    // this.chatservice.listNotifications().subscribe((res: any) => {
    //   console.log(res,"resresres");
      
    //   console.log(res.data, 'Encrypted data from API');
    //   let response = this._coreService.decryptObjectData({
    //     data: res.data,
    //   });
    //   this.notificationMessage = response
    //   console.log(response,"res");
    // });
  }
  noticlick(groupId:any)
    {
      console.log("group",groupId);
      
      const path = `${this.dynamicpath}/chats`;
          const currentUrl = this.router.url;
        const pageName = currentUrl.split('/').pop();
  if(pageName=='chats')
    {
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([path], {
        state: {
          fromA: {
            groupid: groupId,
          }
        }
      });
    });
    }  
    else{
  this.router.navigate([path], {
        state: {
          fromA: {
            groupid: groupId,
          }
        }
      });
    }  
      
    }

  // loadNotifications(initialLoad = false,newMessage='') {
  //   if (this.loading || !this.hasMore) return;
  
  //   this.loading = true;
  //   console.log(this.notificationMessage,"ffffffffff");
    
  //   if(newMessage === 'new'){
  //    this.page = 1
  //    this.notificationMessage = [];
  //   }
  
  //   this.chatservice.listNotifications(this.limit, this.page).subscribe(
  //     (res: any) => {
  //       console.log('Raw API response:', res);
  //       if (!res || !res.data) {
  //         console.warn('No data received from listNotifications API');
  //         this.loading = false;
  //         this.hasMore = false;
  //         return;
  //       }
  //       const notifications = res.data;
  //       if (!Array.isArray(notifications)) {
  //         this.notificationMessage = initialLoad ? [] : this.notificationMessage;
  //         this.hasMore = false;
  //       } else {
  //         if (notifications.length < this.limit) {
  //           this.hasMore = false;
  //         }
  //         this.notificationMessage = initialLoad
  //           ? notifications
  //           : [...this.notificationMessage, ...notifications];
  //         this.page++;
  //       }
  //       if (this.showNotification) {
  //         const ids = notifications.map((ele:any) => ele._id)
  //         this. handleReadnotification(ids)

  //        }
  //        console.log("notificationMessage",this.notificationMessage)
       
  //       this.loading = false;
  //     },
  //     error => {
  //       console.error('Failed to load notifications:', error);
  //       this.loading = false;
  //       this.hasMore = false;
  //     }
  //   );
  // }

  loadNotifications(initialLoad = false) {
  if (this.loading || !this.hasMore) return;

  this.loading = true;

  this.chatservice.listNotifications(this.limit, this.page).subscribe(
    (res: any) => {
      const notifications = res?.data || [];

      if (notifications.length < this.limit) {
        this.hasMore = false;
      }

      this.notificationMessage = initialLoad
        ? notifications
        : [...this.notificationMessage, ...notifications];

      // ✅ Open hote hi read mark karo
      if (this.page === 1 && notifications.length) {
        const ids = notifications.map((n: any) => n._id);
        this.handleReadnotification(ids);
      }

      this.page++;
      this.loading = false;
    },
    error => {
      this.loading = false;
    }
  );
}


  onScroll(event: any) {
    console.log('Scrolled!', event);
    const element = event.target;
  
    // Check if scrolled to bottom (with a small buffer)
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
  
    if (atBottom) {
      this.loadNotifications();
    }
  }
  
  // toggleNotification() {
  //   this.showNotification = !this.showNotification;
  //   console.log(this.showNotification,"showNotification",this.notificationMessage);
    
  //   this.loadNotifications(false,'new') 
  //   if (this.showNotification) {
      
  //     const ids = this.notificationMessage.map(ele => ele._id)
  //     this.handleReadnotification(ids)
      
  //   }
  // }

  toggleNotification() {
  this.showNotification = !this.showNotification;

  // Sirf open hone par hi API call
  if (this.showNotification) {
    this.page = 1;
    this.notificationMessage = [];
    this.hasMore = true;

    this.loadNotifications(true);
  }
}

  // handleReadnotification(ids:any) { 
  //   this.chatservice.ReadNotifications(ids).subscribe(
  //     (res: any) => {
  //       console.log("ress", res)
  //       this.authService.getNotification().subscribe((res: any) => {
  //         // let response = this._coreService.decryptObjectData({
  //         //   data: res.encryptDatauserdata,
  //         // });
  //         this.count = res?.count;
  //       });
  //      },
  //     (error: any) => { 
  //       console.error('Failed to load notifications:', error);
  //     })
  // }

  handleReadnotification(ids: any) {
  this.chatservice.ReadNotifications(ids).subscribe(() => {
    this.count = 0; // 🔥 instantly UI update
  });
}

  getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map(part => part.charAt(0).toUpperCase()).join('');
  }


  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.showNotification) {
      const clickedElement = event.target as HTMLElement;
      const notificationElement = this.elementRef.nativeElement.querySelector('.notification');
      
      if (notificationElement && !notificationElement.contains(clickedElement)) {
        this.showNotification = false;
      }
    }
  }
}
