import { Observable, Subject } from 'rxjs';
import { DeviceDriver, DeviceDataPayload } from '../driverManager/driver-manager.service';

export class NiBarcodeSerialDriver implements DeviceDriver {
  public readonly id = 'serial1';
  public readonly name = 'Serial Device';
  public readonly type = 'serial';
  public readonly dataType = 'string';

  private subject = new Subject<DeviceDataPayload>();
  public data$: Observable<DeviceDataPayload> = this.subject.asObservable();

  private port?: SerialPort;
  private reader?: ReadableStreamDefaultReader<string>;
  private isRunning = false;

  async start(): Promise<void> {
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = this.port.readable?.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      this.isRunning = true;
      this.readLoop();
    } catch (error) {
      console.error('Failed to start SerialDriver:', error);
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;

    try {
      while (this.isRunning) {
        const { value, done } = await this.reader.read();
        if (done) break;

        if (value) {
          const payload: DeviceDataPayload = {
            timestamp: Date.now(),
            value,
            dataType: 'barcode',
            dataAction: 'barcode',
            source: 'serial'
          };
          this.subject.next(payload);
          console.log('SerialDriver: received data', payload);
        }
      }
    } catch (error) {
      console.error('Error reading from serial port:', error);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    try {
      this.reader?.cancel();
      await this.port?.close();
    } catch (error) {
      console.error('Failed to stop SerialDriver:', error);
    }
  }

  async getStatus(): Promise<any> {
    return { running: this.isRunning, port: this.port?.getInfo() };
  }
}
