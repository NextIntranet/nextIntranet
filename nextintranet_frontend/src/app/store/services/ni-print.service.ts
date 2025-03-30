import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environment';
import { tap } from 'rxjs/operators';
import { UniversalStorageService } from '../../core/universal-storage.service';
import { saveAs } from 'file-saver';
import { format } from 'path';

export interface PrintItem {
  type: string;
  uuid: string;
}

@Injectable({
  providedIn: 'root'
})
export class PrintService {
  private printQueue: PrintItem[] = [];
  private printApiUrl = 'http://localhost:8080/api/v1/print/';

  constructor(
    private http: HttpClient,
    private universalStorageService: UniversalStorageService
  ) { }

  addPrintItem(type: string, uuid: string): void {
    this.printQueue.push({ type, uuid });
    console.log('Přidáno do tiskové fronty:', { type, uuid });
  }

  print(): void {
    if (this.printQueue.length === 0) {
      console.warn('Tisková fronta je prázdná.');
      return;
    }

    const token = this.universalStorageService.getItem('authToken');
    let headers: Record<string, string> = {};
    if (token) {
      headers = { 'Authorization': `Bearer ${token}` };
    }

    this.http.post<any>(this.printApiUrl, {
      items: this.printQueue,
      //format: 'a4_3x7'
    }, { headers: headers, responseType: 'blob' as 'json' }).subscribe((response: Blob) => {
      saveAs(response, 'tisk.pdf');
      //this.printQueue = [];
      console.log('PDF staženo a uloženo.');
    }, (error) => {
      console.error('Chyba při stahování PDF:', error);
    });
  }

  private printElectron(): void {
    if (typeof (window as any).require !== 'undefined') {
      const { remote } = (window as any).require('electron');
      const win = remote.getCurrentWindow();
      const webContents = win.webContents;

      const printWindow = new remote.BrowserWindow({ show: false });
      const printUrl = `${this.printApiUrl}`;

      printWindow.loadURL(printUrl);

      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({ silent: false, printBackground: true }, (success: boolean, error: any) => {
          if (success) {
            console.log('Tisk v Electronu byl úspěšný.');
            this.printQueue = [];
          } else {
            console.error('Chyba při tisku v Electronu:', error);
          }
          printWindow.close();
        });
      });
    } else {
      console.warn('Electron runtime nebyl detekován.');
    }
  }

  private isElectron(): boolean {
    return !!(window && (window as any).process && (window as any).process.type === 'renderer');
  }
}
