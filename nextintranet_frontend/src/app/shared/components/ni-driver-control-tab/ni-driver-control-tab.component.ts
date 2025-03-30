import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'ni-driver-control-tab',
  templateUrl: './ni-driver-control-tab.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ToastModule
  ],
  providers: [MessageService]
})
export class NiDriverControlTabComponent implements OnInit {
  runningDrivers: Record<string, any> = {};

  constructor(private messageService: MessageService) { }

  ngOnInit(): void {
    this.updateDriverStatus();
  }

  updateDriverStatus(): void {
    console.log('Updating driver status');
    this.runningDrivers = {
      'driver1': { status: 'running', config: { port: 9000 } },
      'driver2': { status: 'stopped', config: { ip: '192.168.1.1' } }
    };
    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Driver status updated' });
  }

  runFunction(driverName: string): void {
    console.log(`Starting driver: ${driverName}`);
    if (this.runningDrivers[driverName]) {
      this.runningDrivers[driverName].status = 'running';
      this.messageService.add({ severity: 'success', summary: 'Success', detail: `Driver ${driverName} started` });
    }
  }

  stopFunction(driverName: string): void {
    console.log(`Stopping driver: ${driverName}`);
    if (this.runningDrivers[driverName]) {
      this.runningDrivers[driverName].status = 'stopped';
      this.messageService.add({ severity: 'info', summary: 'Info', detail: `Driver ${driverName} stopped` });
    }
  }
}
