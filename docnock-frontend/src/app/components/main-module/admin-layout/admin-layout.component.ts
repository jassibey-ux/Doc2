import { Component, OnInit } from '@angular/core';


@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
})
export class AdminLayoutComponent implements OnInit {
  isSidebarCollapsed = false;
  isMobileView: boolean = false;
  ngOnInit() {
    this.checkIfMobileView();
    window.addEventListener('resize', () => this.checkIfMobileView());
  }

  checkIfMobileView() {
    this.isMobileView = window.innerWidth <= 768; // Or your chosen breakpoint
    if (this.isMobileView) {
      this.isSidebarCollapsed = true; // Ensure it's collapsed on initial load
    }
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }
}
