import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { PanelMenuModule } from 'primeng/panelmenu';
import { MenuItem } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ChipModule } from 'primeng/chip';
import { HostBinding } from '@angular/core';
import { MessageService } from 'primeng/api';
import { NiDriverManagerComponent } from '../shared/components/ni-driver-manager/ni-driver-manager.component';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ScreenService } from './../shared/services/screen.service';
import { environment } from 'src/environment';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MenubarModule,
    DrawerModule,
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
export class LayoutComponent implements OnInit, OnDestroy {
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
      items: [
        {
          label: 'Warehouse',
          icon: 'pi pi-box',
          routerLink: '/store'
        },
        {
          label: 'Locations',
          icon: 'pi pi-map-marker',
          routerLink: '/store/locations'
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
      label: 'Výroba',
      icon: 'pi pi-cog',
      items: [
        {
          label: 'Výrobní projekty',
          icon: 'pi pi-folder',
          routerLink: '/production'
        }
      ]
    },
    {
      label: 'Uživatel',
      icon: 'pi pi-user',
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

  private routerSubscription: Subscription | undefined;

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  constructor(private router: Router, private screenService: ScreenService) {}

  ngOnInit() {
    this.checkScreenSize();
    this.updateMenuExpansion();

    // Subscribe to router events to update menu expansion on navigation
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateMenuExpansion();
      });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  updateMenuExpansion() {
    const currentUrl = this.router.url;

    this.menu.forEach(item => {
      if (item.items) {
        // Check if any child item matches the current route
        const hasActiveChild = item.items.some(subItem =>
          subItem.routerLink &&
          currentUrl.startsWith(subItem.routerLink.toString())
        );

        // Expand parent item if a child is active
        item.expanded = hasActiveChild;
      }
    });
  }

  checkScreenSize() {
    this.isMobile = window.innerWidth < 768;
    this.screenService.setIsMobile(this.isMobile); // Update the service with the current state

    if (this.isMobile) {
      this.isSidebarVisible = false;
    } else {
      this.isSidebarVisible = true;
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

  onDrawerContentClick(event: Event) {
    event.stopPropagation();
  }
}
