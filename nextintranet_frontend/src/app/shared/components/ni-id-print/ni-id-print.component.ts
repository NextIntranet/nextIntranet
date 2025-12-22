import { Component, Input } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'ni-id-print',
  standalone: true,
  template: `
    <div class="id-container {{ class }}" pTooltip="{{ id }}" tooltipPosition="top">
      <span class="id-text">{{ formattedId }}</span>
      <button class="copy-button" (click)="copyToClipboard()">
        <i class="pi pi-copy"></i>
      </button>
    </div>
  `,
  imports: [CommonModule, TooltipModule],
  styles: [
    `
      .id-container {
        display: flex;
        align-items: center;
        font-family: 'Courier New', Courier, monospace;
      }

      .id-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
      }

      .copy-button {
        background: none;
        border: none;
        cursor: pointer;
        margin-left: 8px;
        display: flex;
        align-items: center;
      }

      .copy-button i {
        font-size: 16px;
      }
    `,
  ],
})
export class NiIdPrintComponent {
  @Input() id: string = '';
  @Input() class: string = '';

  constructor(private clipboard: Clipboard) {}

  get formattedId(): string {
    return this.id.length > 8 ? `${this.id.substring(0, 8)}\u2026` : this.id;
  }

  copyToClipboard(): void {
    this.clipboard.copy(this.id);
    alert('ID copied to clipboard!');
  }
}