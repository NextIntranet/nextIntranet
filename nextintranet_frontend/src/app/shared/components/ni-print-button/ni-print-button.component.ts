import { Component, Input, OnInit } from '@angular/core';
import { PrintService } from '../../../store/services/ni-print.service';
import { MenuItem } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'ni-print-button',
  standalone: true,
  imports: [ButtonModule, MenuModule, CommonModule],
  providers: [PrintService],
  template: `
    <div class="print-button-container">
      PRINT..
      <p-button icon="pi pi-print" [label]="'Tisk'" [style]="{'margin-right':'10px'}"></p-button>
      <p-menu #menu [model]="items"></p-menu>
    </div>
  `,
  styleUrls: ['./print-button.component.scss']
})
export class NiPrintButtonComponent implements OnInit {
  @Input() type: string = '';
  @Input() id: string = '';

  items: MenuItem[] = [];

  constructor(
    private printService: PrintService
  ) { }

  ngOnInit() {
    this.items = [
      {
        label: 'Tisk hned',
        icon: 'pi pi-print',
        command: () => {
          this.printNow();
        }
      },
      {
        label: 'Přidat do seznamu',
        icon: 'pi pi-plus',
        command: () => {
          this.addToList();
        }
      }
    ];
  }

  printNow(): void {
    this.printService.addPrintItem(this.type, this.id);
    this.printService.print();
  }

  addToList(): void {
    this.printService.addPrintItem(this.type, this.id);
  }
}
