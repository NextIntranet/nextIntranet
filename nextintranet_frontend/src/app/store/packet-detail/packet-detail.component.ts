import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { PacketOperationsService } from '../services/packetOperations.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environment';
import { NiSelectLocationComponent } from '../../shared/components/ni-select-location/ni-select-location.component';
import { NiPrintButtonComponent } from '../../shared/components/ni-print-button/ni-print-button.component';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { NiPacketOperationCreateComponent } from '../../shared/components/ni-packet-operation-create/ni-packet-operation-create.component';

@Component({
  selector: 'app-packet-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    InputNumberModule,
    ToastModule,
    ProgressSpinnerModule,
    TagModule,
    ChartModule,
    TableModule,
    TooltipModule,
    NiSelectLocationComponent,
    NiPrintButtonComponent,
    DynamicDialogModule
  ],
  providers: [MessageService, PacketOperationsService, DialogService],
  templateUrl: './packet-detail.component.html',
  styleUrl: './packet-detail.component.css'
})
export class PacketDetailComponent implements OnInit {
  packet: any = null;
  loading = true;
  editMode = false;
  editedPacket: any = {};
  operations: any[] = [];
  loadingOperations = false;
  chartData: any;
  chartOptions: any;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    public messageService: MessageService,
    private operationsService: PacketOperationsService,
    private dialogService: DialogService
  ) {
    this.initChart();
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadPacket(id);
        this.loadOperations(id);
      }
    });
  }

  loadPacket(id: string) {
    this.loading = true;
    const token = localStorage.getItem('authToken') ?? '';
    
    this.http.get(`${environment.apiUrl}/api/v1/store/packet/${id}/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).subscribe({
      next: (data: any) => {
        console.log('Packet data:', data);
        this.packet = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Packet load error:', err);
        this.loading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to load packet: ${err.message || err.statusText}`
        });
      }
    });
  }

  toggleEditMode() {
    this.editMode = true;
    this.editedPacket = {
      ...this.packet,
      location: this.packet?.location ? { ...this.packet.location } : { id: null },
      component: this.packet?.component ? { ...this.packet.component } : { id: null, name: '' }
    };
  }

  cancelEdit() {
    this.editMode = false;
    this.editedPacket = {};
  }

  saveChanges() {
    console.log('Saving packet:', this.packet.id, this.editedPacket);
    
    const token = localStorage.getItem('authToken') ?? '';
    const headers = { 'Authorization': `Bearer ${token}` } as any;
    const dataToSend = {
      description: this.editedPacket.description,
      location: this.editedPacket.location?.id || this.editedPacket.location
    };
    
    const nameChanged = this.packet?.component?.name !== this.editedPacket?.component?.name;
    const patchComponent$ = nameChanged && this.packet?.component?.id
      ? this.http.patch(`${environment.apiUrl}/api/v1/store/component/${this.packet.component.id}/`, { name: this.editedPacket.component.name }, { headers })
      : null;

    const updatePacket = () => this.http.put(`${environment.apiUrl}/api/v1/store/packet/${this.packet.id}/`, dataToSend, { headers }).subscribe({
      next: (data: any) => {
        console.log('Packet updated:', data);
        this.packet = data;
        this.editMode = false;
        this.messageService.add({ severity: 'success', summary: 'Uloženo', detail: 'Packet aktualizován' });
      },
      error: (err) => {
        console.error('Failed to update packet:', err);
        this.messageService.add({ severity: 'error', summary: 'Chyba', detail: `Nepodařilo se uložit packet: ${err.message || err.statusText}` });
      }
    });

    if (patchComponent$) {
      patchComponent$.subscribe({
        next: () => updatePacket(),
        error: (err) => {
          console.error('Failed to update component name:', err);
          this.messageService.add({ severity: 'error', summary: 'Chyba', detail: 'Nepodařilo se změnit název součástky' });
        }
      });
    } else {
      updatePacket();
    }
  }

  loadOperations(packetId: string) {
    this.loadingOperations = true;
    this.operationsService.getOperations(packetId).subscribe({
      next: (data: any[]) => {
        this.operations = data.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        this.updateChart();
        this.loadingOperations = false;
      },
      error: (err) => {
        console.error('Failed to load operations:', err);
        this.loadingOperations = false;
      }
    });
  }

  initChart() {
    this.chartOptions = {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Datum'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Množství'
          },
          beginAtZero: true
        }
      }
    };
  }

  updateChart() {
    const labels: string[] = [];
    const stockData: number[] = [];
    let currentStock = 0;

    this.operations.forEach(op => {
      currentStock += op.quantity || 0;
      labels.push(new Date(op.created_at).toLocaleDateString('cs-CZ'));
      stockData.push(currentStock);
    });

    // Append 'now' as the last point label
    labels.push('now');

    // Main dataset ends before 'now' (gap at last index)
    const stockDataMain: (number | null)[] = [...stockData, null];

    // Dashed projection from last real point to 'now'
    const dashedData: (number | null)[] = new Array(labels.length).fill(null);
    if (labels.length >= 2) {
      // If we have at least one real point, draw dashed line to 'now'
      const lastValue = stockData.length ? stockData[stockData.length - 1] : 0;
      if (stockData.length) {
        dashedData[labels.length - 2] = lastValue;
      }
      dashedData[labels.length - 1] = lastValue;
    } else {
      // No operations at all, show single point at now
      dashedData[labels.length - 1] = 0;
    }

    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Skladová zásoba',
          data: stockDataMain,
          fill: true,
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgb(59, 130, 246)',
          tension: 0.4
        },
        {
          label: 'Aktuální stav',
          data: dashedData,
          fill: false,
          borderColor: 'rgb(59, 130, 246)',
          borderDash: [6, 6],
          pointBackgroundColor: 'rgb(59, 130, 246)',
          pointRadius: 3,
          tension: 0
        }
      ]
    };
  }
  openCreateOperationDialog() {
    const ref = this.dialogService.open(NiPacketOperationCreateComponent, {
      header: 'Nová operace',
      width: '50%',
      data: { packetId: this.packet.id }
    });

    if (ref && ref.onClose) {
      ref.onClose.subscribe((newOperation: any) => {
        if (newOperation) {
          this.operations.push(newOperation);
          this.updateChart();
          this.messageService.add({ severity: 'success', summary: 'Uloženo', detail: 'Operace vytvořena' });
        }
      });
    }
  }
}
