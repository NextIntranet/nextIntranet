import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { RadioButtonModule } from 'primeng/radiobutton';
import { PrintService, PrintItem, PrintFormat } from '../../../store/services/ni-print.service';

@Component({
  selector: 'ni-driver-printer-tab',
  templateUrl: './ni-driver-printer-tab.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DropdownModule,
    ToastModule,
    TableModule,
    RadioButtonModule
  ],
})
export class NiDriverPrinterTabComponent implements OnInit {
  selectedPrinter: any = {label: 'PDF printer', value: 'pdf_printer'};
  selectedLayout: any;
  availablePrintFormats: PrintFormat[] = [];
  public printMode: 'queue' | 'direct' = 'queue'; // Výchozí režim tisku
  public componentId = Math.random().toString(36).substring(2, 9);

  constructor(public printService: PrintService) {
    console.log(`NiDriverPrinterTabComponent created with ID: ${this.componentId}`);
  }

  ngOnInit(): void {
    // Načteme formáty
    this.availablePrintFormats = this.printService.getAvailableFormats();

    // Nastavení výchozího formátu
    const currentFormat = this.printService.printFormat();
    this.selectedLayout = this.availablePrintFormats.find(f => f.value === currentFormat) ||
                         this.availablePrintFormats[0];

    console.log(`[Component ${this.componentId}] Initialized with printService queue:`, this.printService.printQueue());

    this.printService.debugPrintQueueState();
  }

  get labelsToPrint(): PrintItem[] {
    return this.printService.printQueue();
  }

  addLabel(type: string, uuid: string): void {
    this.printService.addPrintItem(type, uuid);
    console.log('Item added to queue:', { type, uuid });

    if (this.printMode === 'direct') {
      console.log('Direct print mode - printing immediately.');
      this.printService.print();

      // Vyčistíme frontu po tisku
      setTimeout(() => this.printService.clearQueue(), 100);
    }
  }

  deleteLabel(index: number): void {
    this.printService.removeItem(index);
  }

  deleteAllLabels(): void {
    this.printService.clearQueue();
  }

  printLabels(): void {
    console.log('Printing labels with:', {
      printer: this.selectedPrinter,
      layout: this.selectedLayout,
      labels: this.printService.printQueue()
    });
    this.printService.print();
  }

  // Metoda pro změnu formátu tisku při výběru v dropdown
  public onFormatChange(event: any): void {
    if (event && event.value) {
      console.log(`Changing format to: ${event.value.value}`);
      this.printService.setPrintFormat(event.value.value);
    }
  }

  // Metoda pro změnu režimu tisku
  public onPrintModeChange(event: any ): void {
    if (event && event.value) {
      console.log(`Changing print mode to: ${event.value}`);
      this.printService.setPrintMode(event.value.value);
      this.printMode = event.value.value;
    }
  }

  // Debug metoda pro testování
  debugAddLabel(): void {
    const testType = 'test';
    const testUuid = 'uuid-' + Date.now();
    console.log(`[Component ${this.componentId}] Adding debug label:`, testType, testUuid);

    this.printService.debugPrintQueueState();
    this.addLabel(testType, testUuid);

    setTimeout(() => {
      console.log(`[Component ${this.componentId}] Queue after adding debug label:`, this.printService.printQueue());
    }, 10);
  }
}

