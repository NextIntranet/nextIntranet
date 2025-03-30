import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { PanelMenuModule } from 'primeng/panelmenu';
import { MenuItem } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ChipModule } from 'primeng/chip';
import { HostBinding } from '@angular/core';
import { MessageService } from 'primeng/api';
import { NiDriverManagerComponent } from '../shared/components/ni-driver-manager/ni-driver-manager.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MenubarModule,
    SidebarModule,
    ButtonModule,
    RippleModule,
    PanelMenuModule,
    ToastModule,
    ChipModule,
    NiDriverManagerComponent
  ],
  providers: [
    MessageService
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
})
export class LayoutComponent implements OnInit {
  isSidebarVisible: boolean = true;
  isSidebarCollapsed: boolean = false;
  isDrawerVisible: boolean = false;
  isMobile: boolean = false;
  ViewerType: string = 'client';

  menu: MenuItem[] = [
    {
      label: 'Domů',
      icon: 'pi pi-home',
      routerLink: '/'
    },
    {
      label: 'Warehouse',
      icon: 'pi pi-shopping-cart',
      expanded: true,
      items: [
        {
          label: 'Locations',
          icon: 'pi pi-list',
          routerLink: '/store'
        },
        {
          label: 'Suppliers',
          icon: 'pi pi-users',
          routerLink: '/store/supplier'
        },
        {
          label: 'Kategorie',
          icon: 'pi pi-tags',
          routerLink: '/store/categories'
        }
      ]
    },
    {
      label: 'Uživatel',
      icon: 'pi pi-user',
      expanded: true,
      items: [
        {
          label: 'Přihlášení',
          icon: 'pi pi-sign-in',
          routerLink: '/login'
        },
        {
          label: 'Profil',
          icon: 'pi pi-user-edit',
          routerLink: '/profile'
        }
      ]
    }
  ];

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  ngOnInit() {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isMobile = window.innerWidth < 768;

    if (this.isMobile) {
      this.isSidebarVisible = false;
    } else {
      this.isSidebarVisible = true; // Always ensure sidebar is visible on large screens
      this.isDrawerVisible = false;
    }

    if (navigator.userAgent.toLowerCase().includes(' electron/')) {
      this.ViewerType = 'App';
    } else if (window.matchMedia('(display-mode: standalone)').matches) {
      this.ViewerType = 'Pwa';
    } else {
      this.ViewerType = 'Browser';
    }

  }


  getChipColor(ViewerType: string) {
    switch (ViewerType) {
      case 'App':
        return 'green';
      case 'Pwa':
        return 'blue';
      case 'Browser':
        return 'gray';
      default:
        return 'gray';
    }
  }


  toggleSidebar() {
    if (this.isMobile) {
      this.toggleDrawer();
    } else {
      this.toggleSidebarCollapse();
    }
  }

  toggleSidebarCollapse() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleDrawer() {
    this.isDrawerVisible = !this.isDrawerVisible;
  }

  // Method to prevent drawer closing when clicking inside
  onDrawerContentClick(event: Event) {
    event.stopPropagation();
  }
}
