import { DeviceDataPayload } from './driver-manager.service';

export class DefaultHandler {
  static handleBarcode(data: DeviceDataPayload, id: string): void {
    console.log(`Handling barcode data from device '${id}':`, data);

    // Here we can add some custom logic for handling barcode data

    try {
      const url = new URL(data.value);
      const prefix = 'https://ust.cz/ni/';

      if (url.href.startsWith(prefix)) {
      const params = new URLSearchParams(url.search);
      console.log('Extracted parameters:', Object.fromEntries(params.entries()));

      // Logic to handle the extracted parameters
      console.log('Opening URL with extracted parameters...');
      } else {
      console.warn('URL does not have the required prefix.');
      }
    } catch (error) {
      console.warn('The provided data is not a valid URL.');
    }

  }

  static handleCode(data: DeviceDataPayload, id: string): void {
    console.log(`Handling code data from device '${id}':`, data);
  }

  static handleId(data: DeviceDataPayload, id: string): void {
    console.log(`Handling ID data from device '${id}':`, data);
  }
}
