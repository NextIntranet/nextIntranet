import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DriverManagerService } from './drivers/driverManager/driver-manager.service';
import { MockBarcodeScannerDriver } from './drivers/mockBarcodeScanner/mock-barcode-scanner.driver';
import { NiBarcodeSerialDriver } from './drivers/niBarcodeSerial/ni-barcode-serial.driver';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'NextIntranet';

  constructor(private driverManager: DriverManagerService) {
    if (typeof window !== 'undefined') {

/*
//
//  Register the drivers
//
*/
      // const mock = new MockBarcodeScannerDriver();
      // this.driverManager.register(mock);

      const serial = new NiBarcodeSerialDriver();
      this.driverManager.register(serial);
    }
  }
}
