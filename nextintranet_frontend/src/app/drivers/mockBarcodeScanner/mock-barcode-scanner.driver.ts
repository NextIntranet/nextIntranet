import { interval, Observable, Subject } from 'rxjs';
import { DeviceDriver, DeviceDataPayload } from '../driverManager/driver-manager.service';

export class MockBarcodeScannerDriver implements DeviceDriver {
  public readonly id = 'scanner1';
  public readonly name = 'Demo čtečka';
  public readonly type = 'barcode';
  public readonly dataType = 'string';

  private subject = new Subject<DeviceDataPayload>();
  public data$: Observable<DeviceDataPayload> = this.subject.asObservable();

  private intervalSub?: any;

  async start(): Promise<void> {
    this.intervalSub = interval(10000).subscribe(() => {
      const fakeCode = 'EAN' + Math.floor(5000 + Math.random() * 9000);
      const payload: DeviceDataPayload = {
        timestamp: Date.now(),
        value: fakeCode,
        dataType: 'barcode',
        dataAction: 'scan',
        source: 'mock'
      };
      this.subject.next(payload);
      console.log('MockBarcodeScannerDriver: sending data', payload);
    });
  }

  async stop(): Promise<void> {
    this.intervalSub?.unsubscribe();
  }

  async getStatus(): Promise<any> {
    return { running: !!this.intervalSub };
  }
}
