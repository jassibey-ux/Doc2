import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-side-bar',
  templateUrl: './side-bar.component.html',
  styleUrls: ['./side-bar.component.scss'],
})
export class SideBarComponent implements OnInit {
  loggedIn: any = false;
  showLogoutModal: boolean = false;
  profileName: any;
  role: any;
  dynamicpath:any= "";
  allowedModules: Set<string> = new Set();

  constructor(
    private authService: AuthServiceService,
    private _coreService: CoreService,
    private toastr: ToastrService,
    private websocket: WebsocketService,
    
  ) {}

  ngOnInit(): void {
    //this.cssClassActivation();
    this.dynamicpath = this.authService.getRole()
    this.getPermission()
  }
  cssClassActivation() {
    const incoBx = document.querySelectorAll<HTMLElement>('.incoBx');
    incoBx.forEach((item) => {
      item.addEventListener('click', function () {
        incoBx.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  openLogoutModal() {
    this.showLogoutModal = true;
  }

  closeLogoutModal() {
    this.showLogoutModal = false;
  }

  confirmLogout() {
    this.authService.logout();
    this.websocket.disconnect();
    this.closeLogoutModal();
  }


@Input() isCollapsed = false;
@Output() isCollapsedChange = new EventEmitter<boolean>();

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
    this.isCollapsedChange.emit(this.isCollapsed);
  }

  onMouseEnter() {
    // Keep sidebar collapsed — tooltip labels appear via CSS
  }

  onMouseLeave() {
    if (!this.isCollapsed) {
      this.isCollapsed = true;
      this.isCollapsedChange.emit(true);
    }
  }

  getPermission() {
    this.authService.getPermission().subscribe({
      next: (res: any) => {
        if (res.status) {
          let response = this._coreService.decryptObjectData({
            data: res.encryptDatauserdata,
          });
          if (Array.isArray(response)) {
            this.allowedModules = new Set(response.map((perm: any) => perm.moduleName));
          } else {
            this.allowedModules = new Set();
          }
        } else {
          this.toastr.error(res.message);
          this.allowedModules = new Set();
        }
      },
      error: (err: any) => {
        // Permissions API unavailable - fall back to core modules so sidebar remains usable
        console.warn('Permissions API failed, using default modules:', err?.error?.message);
        this.allowedModules = new Set(['C', 'D', 'SH', 'SBAR', 'CA', 'CONSULT', 'N', 'P', 'AS']);
      },
    });
  }
}
