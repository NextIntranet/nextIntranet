import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ClipboardService } from '../../services/clipboard.service';

@Component({
  selector: 'app-copy-button',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule],
  template: `
    <button pButton 
            [icon]="icon" 
            (click)="copy($event)" 
            [class]="buttonClass"
            [pTooltip]="tooltip"
            [disabled]="!text">
    </button>
  `,
  styles: []
})
export class CopyButtonComponent {
  @Input() text: string = '';
  @Input() icon: string = 'pi pi-copy';
  @Input() buttonClass: string = 'p-button-sm p-button-text p-button-rounded';
  @Input() tooltip: string = 'Zkopírovat';
  @Input() successMessage?: string;
  @Input() errorMessage?: string;

  constructor(private clipboardService: ClipboardService) {}

  copy(event: Event): void {
    event.stopPropagation();
    if (this.text) {
      if (this.successMessage || this.errorMessage) {
        this.clipboardService.copyToClipboard(
          this.text, 
          this.successMessage, 
          this.errorMessage
        );
      } else {
        this.clipboardService.copyId(this.text);
      }
    }
  }
}
