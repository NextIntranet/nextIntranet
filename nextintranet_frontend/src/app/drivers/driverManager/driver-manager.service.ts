import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { DefaultHandler } from './default-handler';

export interface DeviceDataPayload {
  timestamp: number;
  value: any;
  dataType?: string;           // Typ dat (např. "number", "json", "image")
  dataAction?: string;         // Účel/popis dat (např. "scan", "weight", "status")
  [key: string]: any;
}

export interface DeviceDriver {
  id: string;                  // Unikátní identifikátor (např. "scale1")
  name: string;                // Popisné jméno (např. "Váha u pokladny")
  type: string;                // Typ zařízení (např. "scale", "barcode", "rfid")
  dataType: string;            // Typ dat (např. "number", "string", "json")

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<any>;
  data$: Observable<DeviceDataPayload>;
  sendCommand?(command: any): Promise<any>;
}

@Injectable({ providedIn: 'root' })
export class DriverManagerService {
  private drivers = new Map<string, DeviceDriver>();
  private dataSubject = new Subject<{ id: string; data: DeviceDataPayload }>();
  private actionCallbacks = new Map<string, (data: DeviceDataPayload, id: string) => void>();
  private deviceActionCallbacks = new Map<string, Map<string, (data: DeviceDataPayload) => void>>();
  private defaultHandler?: (data: DeviceDataPayload, id: string) => void;

  public allData$ = this.dataSubject.asObservable();

  constructor() {
    console.log('Hello from DriverManagerService');
    console.log('---------------------------------');
    this.setupIPCListener();
    this.setDefaultHandler((data, id) => {
      switch (data.dataType) {
        case 'barcode':
          DefaultHandler.handleBarcode(data, id);
          break;
        case 'code':
          DefaultHandler.handleCode(data, id);
          break;
        case 'id':
          DefaultHandler.handleId(data, id);
          break;
        default:
          console.log(`Unhandled dataType '${data.dataType}' from device '${id}':`, data);
      }
    });
  }

  register(driver: DeviceDriver): void {
    if (this.drivers.has(driver.id)) return;
    this.drivers.set(driver.id, driver);
    driver.start();
    driver.data$.subscribe((data) => {
      const action = data.dataAction;
      const deviceId = driver.id;

      const deviceCallbacks = this.deviceActionCallbacks.get(deviceId);
      const deviceSpecificHandler = deviceCallbacks?.get(action || '');

      if (deviceSpecificHandler) {
        deviceSpecificHandler(data);
      } else if (action && this.actionCallbacks.has(action)) {
        this.actionCallbacks.get(action)!(data, deviceId);
      } else if (this.defaultHandler) {
        this.defaultHandler(data, deviceId);
      } else {
        this.dataSubject.next({ id: deviceId, data });
      }
    });
  }

  registerActionCallback(action: string, callback: (data: DeviceDataPayload, id: string) => void): void {
    this.actionCallbacks.set(action, callback);
  }

  unregisterActionCallback(action: string): void {
    this.actionCallbacks.delete(action);
  }

  registerDeviceActionCallback(deviceId: string, action: string, callback: (data: DeviceDataPayload) => void): void {
    if (!this.deviceActionCallbacks.has(deviceId)) {
      this.deviceActionCallbacks.set(deviceId, new Map());
    }
    this.deviceActionCallbacks.get(deviceId)!.set(action, callback);
  }

  unregisterDeviceActionCallback(deviceId: string, action: string): void {
    this.deviceActionCallbacks.get(deviceId)?.delete(action);
    if (this.deviceActionCallbacks.get(deviceId)?.size === 0) {
      this.deviceActionCallbacks.delete(deviceId);
    }
  }

  setDefaultHandler(handler: (data: DeviceDataPayload, id: string) => void): void {
    this.defaultHandler = handler;
  }

  getDriver(id: string): DeviceDriver | undefined {
    return this.drivers.get(id);
  }

  getDriversStatus(): any {
    const status: any = {};
    for (const driver of this.drivers.values()) {
      status[driver.id] = driver.getStatus();
    }
    return status;
  }

  listDrivers(): DeviceDriver[] {
    return Array.from(this.drivers.values());
  }

  async stopAll(): Promise<void> {
    for (const driver of this.drivers.values()) {
      await driver.stop();
    }
  }

  async sendCommandToDriver(id: string, command: any): Promise<any> {
    const driver = this.getDriver(id);
    if (driver?.sendCommand) {
      return await driver.sendCommand(command);
    }
    throw new Error(`Driver ${id} does not support commands.`);
  }

  async getDriverStatus(id: string): Promise<any> {
    const driver = this.getDriver(id);
    if (driver) {
      return await driver.getStatus();
    }
    throw new Error(`Driver ${id} not found.`);
  }

  private setupIPCListener(): void {
    if (typeof window !== 'undefined') {
    //Only run if Electron is available
    if ((window as any).electronAPI?.onDriverCommand) {
      (window as any).electronAPI.onDriverCommand(async (event: any) => {
        const { id, command } = event;
        try {
          const result = await this.sendCommandToDriver(id, command);
          (window as any).electronAPI.sendDriverResponse({ id, result });
        } catch (err: any) {
          (window as any).electronAPI.sendDriverResponse({ id, error: err.message });
        }
      });
    }
    }
  }
}
