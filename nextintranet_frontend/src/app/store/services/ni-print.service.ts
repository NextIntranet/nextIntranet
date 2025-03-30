import { Injectable, signal, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environment';
import { UniversalStorageService } from '../../core/universal-storage.service';
import { saveAs } from 'file-saver';
import { isPlatformBrowser } from '@angular/common';

export interface PrintItem {
  type: string;
  uuid: string;
}

export interface PrintFormat {
  label: string;
  value: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PrintService {
  // Unikátní ID instance pro diagnostiku
  private readonly instanceId = Math.random().toString(36).substring(2, 9);

  // Soukromé signály pro reaktivní stav tiskové fronty a aktuální formát
  private readonly _printQueue = signal<PrintItem[]>([]);
  private readonly _printFormat = signal<string>('a4_3x7');
  private readonly _printMode = signal<'queue' | 'direct'>('queue');

  // Veřejné read-only signály, do kterých se komponenty mohou přihlásit
  public readonly printQueue = this._printQueue.asReadonly();
  public readonly printFormat = this._printFormat.asReadonly();
  public readonly printMode = this._printMode.asReadonly();

  // URL tiskového API
  private printApiUrl = `${environment.apiUrl}/api/v1/print/`;

  // Seznam dostupných tiskových formátů
  private availableFormats: PrintFormat[] = [
    { label: 'Single', value: 'single', description: 'Single label per page' },
    { label: 'A4 3x7', value: 'a4_3x7', description: '3 columns, 7 rows on A4' },
    { label: 'A4 2x5', value: 'a4_2x5', description: '2 columns, 5 rows on A4' },
    { label: 'A3 4x10', value: 'a3_4x10', description: '4 columns, 10 rows on A3' },
  ];

  constructor(
    private http: HttpClient,
    private universalStorageService: UniversalStorageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    console.log(`PrintService instance created with ID: ${this.instanceId}`);
  }

  // Vrátí seznam dostupných tiskových formátů
  getAvailableFormats(): PrintFormat[] {
    return this.availableFormats;
  }

  // Přidá položku do tiskové fronty
  addPrintItem(type: string, uuid: string): void {
    const newItem: PrintItem = { type, uuid };
    console.log(`[Instance ${this.instanceId}] Adding item:`, newItem);
    console.log(`[Instance ${this.instanceId}] Queue before update (length: ${this._printQueue().length}):`, this._printQueue());
    this._printQueue.update(queue => [...queue, newItem]);
    console.log(`[Instance ${this.instanceId}] Queue after update (length: ${this._printQueue().length}):`, this._printQueue());

    if (this._printMode() === 'direct') {
      console.log(`[Instance ${this.instanceId}] Direct print mode - printing immediately.`);
      this.print();
    }
  }

  // Odstraní položku z tiskové fronty dle indexu
  removeItem(index: number): void {
    if (index >= 0 && index < this._printQueue().length) {
      console.log(`[Instance ${this.instanceId}] Removing item at index: ${index}`);
      this._printQueue.update(queue => queue.filter((_, i) => i !== index));
      console.log(`[Instance ${this.instanceId}] New queue length: ${this._printQueue().length}`);
    } else {
      console.warn(`[Instance ${this.instanceId}] Invalid index: ${index}`);
    }
  }

  // Vyčistí celou tiskovou frontu
  clearQueue(): void {
    console.log(`[Instance ${this.instanceId}] Clearing print queue`);
    this._printQueue.set([]);
    console.log(`[Instance ${this.instanceId}] Queue cleared, length: ${this._printQueue().length}`);
  }

  // Nastaví tiskový formát
  setPrintFormat(formatValue: string): void {
    console.log(`[Instance ${this.instanceId}] Setting print format to: ${formatValue}`);
    this._printFormat.set(formatValue);
  }

  setPrintMode(mode: 'queue' | 'direct'): void {
    console.log(`[Instance ${this.instanceId}] Setting print mode to: ${mode}`);
    this._printMode.set(mode);
  }

  // Spustí tisk – odeslání tiskové fronty na API a stažení PDF
  print(): void {
    const currentQueue = this._printQueue();
    if (currentQueue.length === 0) {
      console.warn('Print queue is empty.');
      return;
    }

    console.log(`[Instance ${this.instanceId}] Initiating print with queue length ${currentQueue.length}`);
    const token = this.universalStorageService.getItem('authToken');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    this.http.post(this.printApiUrl, {
      items: currentQueue,
      format: this._printFormat()
    }, {
      headers: headers,
      responseType: 'blob'
    }).subscribe({
      next: (response: Blob) => {
        saveAs(response, 'print.pdf');
        console.log(`[Instance ${this.instanceId}] PDF saved successfully.`);
      },
      error: (error) => {
        console.error(`[Instance ${this.instanceId}] Error printing:`, error);
      }
    });
  }

  // Tisk pomocí Electronu (pokud je dostupný)
  private printElectron(): void {
    if (typeof (window as any).require !== 'undefined') {
      const { remote } = (window as any).require('electron');
      const win = remote.getCurrentWindow();
      const printWindow = new remote.BrowserWindow({ show: false });
      const printUrl = this.printApiUrl;

      printWindow.loadURL(printUrl);
      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({ silent: false, printBackground: true }, (success: boolean, error: any) => {
          if (success) {
            console.log(`[Instance ${this.instanceId}] Electron print succeeded.`);
            this._printQueue.set([]);
          } else {
            console.error(`[Instance ${this.instanceId}] Electron print failed:`, error);
          }
          printWindow.close();
        });
      });
    } else {
      console.warn(`[Instance ${this.instanceId}] Electron runtime not detected.`);
    }
  }

  // Pomocná metoda pro diagnostiku aktuálního stavu tiskové fronty a formátu
  debugPrintQueueState(): void {
    console.log(`[Instance ${this.instanceId}] Debug state: Queue length ${this._printQueue().length}, Format: ${this._printFormat()}`);
  }
}
