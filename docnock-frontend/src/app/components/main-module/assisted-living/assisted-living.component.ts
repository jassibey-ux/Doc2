import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
export interface UserData {
  _id: string,
  fullName: string,
  email: string,
  mobile: string,
  status: boolean,
  role: string,
  userIds: any,
  location: any,
  geoLocation: boolean,
  isDeleted: boolean,
  profilePicture: any,
  address: string,
  userNames: any
}
// import { ActivatedRoute } from '@angular/router';
import { ActivatedRoute, Router } from "@angular/router"
import { ToastrService } from 'ngx-toastr';
import { debounceTime, distinctUntilChanged, Subscription, switchMap } from 'rxjs';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';
import { ChatService } from 'src/app/services/chat.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { environment } from 'src/environments/environment';
@Component({
  selector: 'app-assisted-living',
  templateUrl: './assisted-living.component.html',
  styleUrls: ['./assisted-living.component.scss']
})
export class AssistedLivingComponent implements OnInit {

  displayedColumns: string[] = ['profile', 'actions'];
  dataSource = new MatTableDataSource<UserData>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  backendUrl = environment.backEndUrl; // Replace with your API URL
  imgUrl = environment.imgUrl;
  sampleImage:any=''
  isOpen = false;
  dynamicPath: any = '';
  dynamicPathDetails: string = '';
  routeSub!: Subscription;
  showLogoutModal: boolean = false;
  userId: any = ""
  totalItems = 0;
  pageSize = 10;
  currentPage = 1;
  statusFilter: any = ''
  searchkey: any = ''
  userIds: any = '';
  showInfoModal = false;
  selectedInfo: any = null;
  loginRecordList: any;
  sendPasswordMail:boolean = false;

  // Call confirmation modal state
  showCallConfirmModal: boolean = false;
  callType: 'audio' | 'video' | null = null;
  callTarget: any = null;
  showPersonBusyModal: boolean = false;
  userCallingparticipantInfo: boolean = false;

  constructor(private route: ActivatedRoute, private authService: AuthServiceService,
    private toastr: ToastrService,
    private _coreService: CoreService,
    private chatservice: ChatService,
    private websocket: WebsocketService,
    private router: Router,
  ) { }

  ngOnInit(): void {
    this.sampleImage = `${this.imgUrl}/assets/images/profile_sample_image.png`;
    this.routeSub = this.route.params.subscribe((params: any) => {
      this.dynamicPath = this.authService.getRole();
      this.dynamicPathDetails = params['dynamicPathDetails']; // Access the dynamic path value  
      this.getUserDetails()
    });
  }
  startAudioCall(data:any) {
    let formData = new FormData();
   console.log("data", data)
   const path = `${this.dynamicPath}/chats`
   var userlist: any = [
    {
      userid: data._id,
      name: data.fullName,
      profilePicture: {},
      status: data.status,
    }
  ];
  formData.append('groupName', '');
  formData.append('userlist', JSON.stringify(userlist));
  formData.append('senderID', '');
  var message = this.chatservice.createGroup(formData).subscribe({
    next: (res: any) => {
      if (res.success) {
        this.toastr.success(res.message);
        const userIds = res.conversation.userlist.map(
          (item: any) => item.userid
        );
     this.websocket.registerUser();
     this.websocket.joinGroup({
       groupId: res.conversation._id,
       userId: res.conversation.userlist,
     });
     console.log(res,"kkkkkkkkkkkkkkkkkkkk");
     const path1 = `${this.dynamicPath}/video-call`;
     this.router.navigate([path1], {
     state: {
       fromA: {
         actualgroupmemberid: userIds,
         groupid: res.conversation._id,
        group: false,
         type: 'callby',
         title: data.fullName,
         image: data.profilePicture?.savedName
           ? this.backendUrl + '/user-uploads/profiles/' + data.profilePicture?.savedName
           : this.sampleImage,
         audio: true,
         rejoin:false
       }
     }
   });
       
      } else {
         this.toastr.error(res.message);
      }
    },
    error: (err: any) => {
     console.log(err.error,"kkkkkkkkkkkkkkkkk");
     if(err.error.message=="A conversation with the same combination of users, group name, and sender already exists.")
     {
const path1 = `${this.dynamicPath}/video-call`;
     this.router.navigate([path1], {
     state: {
       fromA: {
         actualgroupmemberid: err.error.data.userlist,
         groupid: err.error.data._id,
         group: false,
         type: 'callby',
         title: data.fullName,
         image: data.profilePicture?.savedName
           ? this.backendUrl + '/user-uploads/profiles/' + data.profilePicture?.savedName
           : this.sampleImage,
         audio: true,
         rejoin:false
       }
     }
   });
     }
     else{
      this.router.navigateByUrl(path);
     }
    },
  });

 }

  startVideoCall(data:any) {
    let formData = new FormData();
   console.log("data", data)
   const path = `${this.dynamicPath}/chats`
   var userlist: any = [
    {
      userid: data._id,
      name: data.fullName,
      profilePicture: {},
      status: data.status,
    }
  ];
  formData.append('groupName', '');
  formData.append('userlist', JSON.stringify(userlist));
  formData.append('senderID', '');
  var message = this.chatservice.createGroup(formData).subscribe({
    next: (res: any) => {
      if (res.success) {
        this.toastr.success(res.message);
        const userIds = res.conversation.userlist.map(
          (item: any) => item.userid
        );
        this.websocket.joinGroup({
          groupId: res.conversation._id,
          userId: userIds,
        });
        console.log(res,"kkkkkkkkkkkkkkkkkkkk");
     this.websocket.registerUser();
     this.websocket.joinGroup({
       groupId: res.conversation._id,
       userId: res.conversation.userlist,
     });
     const path1 = `${this.dynamicPath}/video-call`;
     this.router.navigate([path1], {
     state: {
       fromA: {
         actualgroupmemberid: userIds,
         groupid: res.conversation._id,
         group: false,
         type: 'callby',
         title: data.fullName,
         image: data.profilePicture?.savedName
           ? this.backendUrl + '/user-uploads/profiles/' + data.profilePicture?.savedName
           : this.sampleImage,
         audio: false,
         rejoin:false
       }
     }
   });
       
      } else {
         this.toastr.error(res.message);
      }
    },
    error: (err: any) => {
     console.log(err.error,"kkkkkkkkkkkkkkkkk");
     if(err.error.message=="A conversation with the same combination of users, group name, and sender already exists.")
     {
const path1 = `${this.dynamicPath}/video-call`;
     this.router.navigate([path1], {
     state: {
       fromA: {
         actualgroupmemberid: err.error.data.userlist,
         groupid: err.error.data._id,
         group: false,
         type: 'callby',
         title: data.fullName,
         image: data.profilePicture?.savedName
           ? this.backendUrl + '/user-uploads/profiles/' + data.profilePicture?.savedName
           : this.sampleImage,
         audio: false,
         rejoin:false
       }
     }
   });
     }
     else{
      this.router.navigateByUrl(path);
     }
    },
   });
 
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();  // Unsubscribe to avoid memory leaks
    }
  }

  createChat(data: any) {
    let formData = new FormData();
    console.log("data", data)
    const path = `${this.dynamicPath}/chats`
    var userlist: any = [
      {
        userid: data._id,
        name: data.fullName,
        profilePicture: {},
        status: data.status,
      }
    ];
    formData.append('groupName', '');
    formData.append('userlist', JSON.stringify(userlist));
    formData.append('senderID', '');


    var message = this.chatservice.createGroup(formData).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success(res.message);
          const userIds = res.conversation.userlist.map(
            (item: any) => item.userid
          );
          this.websocket.joinGroup({
            groupId: res.conversation._id,
            userId: userIds,
          });
          //this.router.navigateByUrl(path);
          this.router.navigate([path], {
                  state: {
                    fromA: {
                      groupid: res.conversation._id,
                    }
                  }
                });
        } else {
          this.toastr.error(res.message);

        }
      },
      error: (err: any) => {
      if(err?.error?.data)
      {  this.router.navigate([path], {
                  state: {
                    fromA: {
                      groupid: err?.error?.data?._id,
                    }
                  }
                });}
                else{
                  this.toastr.error(err);
                }
       // this.router.navigateByUrl(path);
      },
    });
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  selectOption(option: string) {
    console.log('Selected:', option);
    this.isOpen = false;
  }


  getTitle(dynamic: any) {
    return dynamic === 'facilitycenter'
      ? 'Facility Center'
      : dynamic === 'subadmin'
        ? 'Sub-Admin'
        : dynamic;
  }

  getRole(dynamic: any) {
    return dynamic === 'facilitycenter' ? "facility_center" : dynamic;
  }

  getList(role: any, limit = 10, page = 1, searchKey = '', status = '', userId = '') {
    this.authService.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter, this.userIds)
      .subscribe({
        next: (res: any) => {
          if (res.success) {
            let response = this._coreService.decryptObjectData({
              data: res.encryptDatauserdata
            });
            this.dataSource.data = response; // Assign the response to the dataSource
            this.totalItems = res.totalRecords
            //this.toastr.success(res.message);
          } else {
            this.toastr.error(res.message);
          }
        },
        error: (err: any) => {
          this.toastr.error(err.error.message);
        }
      });
  }

  onPageChange(event: any) {
    this.currentPage = event.pageIndex + 1; // MatPaginator uses zero-based index
    this.pageSize = event.pageSize;
    this.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter);
  }

  // onKeyPress(event: KeyboardEvent) {
  //   const query = (event.target as HTMLInputElement).value.trim();
  //     this.searchkey = query
  //     this.getList(this.getRole(this.dynamicPathDetails), this.pageSize,this.currentPage,this.searchkey,this.statusFilter);
  //     // Emit value to trigger search
  // }

  onKeyPress(event: Event) {
    const query = (event.target as HTMLInputElement).value.trim();
    this.searchkey = query;
    this.currentPage = 1;
    if (query === "") {
      // If the search is cleared, reset the list with the full data
      this.currentPage = 1; // Optionally reset to the first page
    }

    this.getList(
      this.getRole(this.dynamicPathDetails),
      this.pageSize,
      this.currentPage,
      this.searchkey,
      this.statusFilter
    );
  }

  getInitials(name: string): string {
    const nameParts = name.split(' ');
    return nameParts.map(part => part.charAt(0).toUpperCase()).join('');
  }

  get hasData(): boolean {
    return this.dataSource?.data && this.dataSource.data.length > 0;
  }

  openLogoutModal(user_id: any) {
    this.userId = user_id;
    this.showLogoutModal = true;
  }

  openCallConfirmModal(type: 'audio' | 'video', element: any) {
    // Check if person is busy first
    this.websocket
      .getcallingparticipantinfo(element._id)
      .subscribe((callstart: any) => {
        this.userCallingparticipantInfo = JSON.parse(callstart);
        // If person is busy, show busy modal
        if (this.userCallingparticipantInfo) {
          this.showPersonBusyModal = true;
        } else {
          // If not busy, show call confirmation modal
          this.callType = type;
          this.callTarget = element;
          this.showCallConfirmModal = true;
        }
      });
  }

  closeCallConfirmModal() {
    this.showCallConfirmModal = false;
    this.callType = null;
    this.callTarget = null;
  }

  closePersonBusyModal() {
    this.showPersonBusyModal = false;
  }

  confirmCall() {
    const target = this.callTarget;
    const type = this.callType;
    this.closeCallConfirmModal();
    if (!target || !type) return;
    if (type === 'audio') {
      this.startAudioCall(target);
    } else {
      this.startVideoCall(target);
    }
  }

  closeLogoutModal() {
    this.showLogoutModal = false;
  }

  confirmLogout() {
    let data = {
      status: "true",
      type: "delete",
      userId: this.userId
    }

    this.authService.changeStatusAndDelete(data).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter)
          this.toastr.success(res.message);
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      }
    });
    this.closeLogoutModal();
  }

  encryptID(id: any) {
    return this._coreService.encrypt(id);
  }

  onStatusChange(event: any) {
    const selectedStatus = event.value;
    this.statusFilter = selectedStatus == 'active' ? true : false

    this.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter);
  }

  toggleStatus(event: Event, element: any) {
    const isChecked = (event.target as HTMLInputElement).checked;

    let data = {
      status: isChecked ? "true" : "false",
      type: "status",
      userId: element._id
    }

    this.authService.changeStatusAndDelete(data).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter)
          this.toastr.success(res.message);
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      }
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
          console.log(this.userIds.length, "###########################");

          this.getList(this.getRole(this.dynamicPathDetails), this.pageSize, this.currentPage, this.searchkey, this.statusFilter, this.userIds)
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
  }

  openInfoModal(element: any) {
    this.selectedInfo = element._id;
    console.log(`this.selectedInfo`, this.selectedInfo);
    this.showInfoModal = true;
    this.listLoginRecords(this.selectedInfo);
  }

  closeInfoModal() {
    this.showInfoModal = false;
    this.selectedInfo = null;
  }

  listLoginRecords(userId: string) {
    this.authService.listLoginRecords(userId).subscribe({
      next: (res: any) => {
        const response = this._coreService.decryptObjectData({ data: res.data });
        // Sort by createdAt descending
        this.loginRecordList = response
        .sort((a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .map((record: any) => {
          const logoutTime = record.logoutDate ? new Date(record.logoutDate) : null;
          return {
            ...record,
            logoutTime,
          };
        });
      
      },
      error: (err) => {
        console.error('Error fetching login records:', err);
      }
    });
  }
  
  openResetPasswordModal(user_id:any) {
    this.userId= user_id;
    this.sendPasswordMail = true;
  }
 
  closeResetPasswordModal() {
    this.sendPasswordMail = false;
  }
 
  sendMailPassword() {
    let data = {
      userId:this.userId
    }
    this.authService.sendPasswordResetEmail(data).subscribe({
      next: (res: any) => {
        if (res.success) {          
          this.toastr.success(res.message);
          this.closeResetPasswordModal()
        } else {
          this.toastr.error(res.message);
        }
      },
      error: (err: any) => {
        this.toastr.error(err.error.message);
      },
    });
 
  }
}


