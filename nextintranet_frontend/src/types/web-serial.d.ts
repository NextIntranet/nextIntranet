interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

interface Navigator {
  serial: {
    requestPort(options?: { filters: Array<{ usbVendorId: number; usbProductId: number }> }): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  };
}
