import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root'
})
export class ClipboardService {

  constructor(private messageService: MessageService) {}

  /**
   * Copy text to clipboard and show toast notification
   * @param text Text to copy
   * @param successMessage Optional custom success message
   * @param errorMessage Optional custom error message
   */
  copyToClipboard(
    text: string, 
    successMessage: string = 'Zkopírováno do schránky',
    errorMessage: string = 'Nepodařilo se zkopírovat'
  ): Promise<void> {
    return navigator.clipboard.writeText(text).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Úspěch',
        detail: successMessage,
        life: 2000
      });
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'Chyba',
        detail: errorMessage,
        life: 3000
      });
      throw err;
    });
  }

  /**
   * Copy ID to clipboard with default message
   * @param id ID to copy
   */
  copyId(id: string): Promise<void> {
    return this.copyToClipboard(id, `ID ${id} bylo zkopírováno`, 'Nepodařilo se zkopírovat ID');
  }
}
