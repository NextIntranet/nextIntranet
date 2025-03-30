import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { PrintService } from '../../../store/services/ni-print.service';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ni-print-button',
  standalone: true,
  imports: [ButtonModule, MenuModule, CommonModule],
  template: `
    <div class="print-button-container">
      <p-button
        icon="pi pi-print"
        styleClass="p-button-icon-only"
        (onClick)="print()">
      </p-button>
    </div>
  `
})
export class NiPrintButtonComponent implements OnInit {
  @Input() type: string = '';
  @Input() id: string = '';
  @ViewChild('menu') menu: any;

  constructor(private printService: PrintService) { }

  ngOnInit() {
  }

  print(): void {
    this.printService.addPrintItem(this.type, this.id);
  }

}
