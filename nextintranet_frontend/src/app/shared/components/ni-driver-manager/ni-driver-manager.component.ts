import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { NiDriverControlTabComponent } from '../ni-driver-control-tab/ni-driver-control-tab.component';
import { NiDriverPrinterTabComponent } from '../ni-driver-printer-tab/ni-driver-printer-tab.component';

@Component({
  selector: 'ni-driver-manager',
  templateUrl: './ni-driver-manager.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    TabsModule,
    ToastModule,
    NiDriverControlTabComponent,
    NiDriverPrinterTabComponent
  ],
  providers: [MessageService]
})
export class NiDriverManagerComponent implements OnInit {
  visible = false;

  @ViewChild(NiDriverControlTabComponent) driverControlTab!: NiDriverControlTabComponent;

  constructor() { }

  ngOnInit(): void {
  }

  refreshDrivers(): void {
    if (this.driverControlTab) {
      this.driverControlTab.updateDriverStatus();
    }
  }
}
