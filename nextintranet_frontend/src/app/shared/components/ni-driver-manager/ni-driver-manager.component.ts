import { Component } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriverManagerService } from 'src/app/drivers/driverManager/driver-manager.service';
import { ToastModule } from 'primeng/toast';
import { BadgeModule } from 'primeng/badge';
import { OverlayBadgeModule } from 'primeng/overlaybadge';

import { MessageService } from 'primeng/api';
import { Ripple } from 'primeng/ripple';



@Component({
  selector: 'ni-driver-manager',
  templateUrl: './ni-driver-manager.component.html',
  styleUrls:  ['./ni-driver-manager.component.css'],
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, ToastModule, BadgeModule, OverlayBadgeModule, Ripple],
  providers: [MessageService],
})


export class NiDriverManagerComponent {
  visible = false;
  runningDrivers: any[] = [];
  badgeNumber = 0;

  constructor(
    private driverManager: DriverManagerService,
    private messageService: MessageService
  ) {
    this.runningDrivers = this.driverManager.getDriversStatus();
  }

  async connect() {
    const driver = this.driverManager.getDriver('serial1');
    if (driver) {
      try {
        await driver.start();
      } catch (e) {
        console.error('Chyba při připojování zařízení:', e);
      }
    }
  }

  runFunction(driver: any) {
    console.log('runFunction', driver);
    const driverObj = this.driverManager.getDriver(driver);
    if (driverObj) {
      try {
        driverObj.start();
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Driver {} started successfully' });
      } catch (e) {
        console.error('Chyba při spuštění funkce:', e);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Driver {} did not started..' });
      }
    }
  }

  stopFunction(driver: any) {
    console.log('stopFunction', driver);
    this.stopFunction(driver);
  }

  updateDriverStatus() {
    this.runningDrivers = this.driverManager.getDriversStatus();
    this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Driver statuses updated.' });
  }
}
