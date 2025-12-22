import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DynamicDialogConfig, DynamicDialogRef, DynamicDialogModule } from 'primeng/dynamicdialog';
import { PacketOperationsService } from '../../../store/services/packetOperations.service';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';

interface Operation {
  reference: string | null;
  operation_type: string;
  quantity: number;
  relative_quantity: boolean;
  unit_price: number;
  description: string;
  packet: string;
  previous_operation: string | null;
  author: string | null;
}

@Component({
  selector: 'ni-packet-operation-create',
  templateUrl: './ni-packet-operation-create.component.html',
  styleUrls: ['./ni-packet-operation-create.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, DynamicDialogModule, DialogModule, InputTextModule, SelectModule]
})
export class NiPacketOperationCreateComponent {
  operation: Operation = {
    reference: null,
    operation_type: 'add',
    quantity: 0,
    relative_quantity: true,
    unit_price: 0,
    description: '',
    packet: '',
    previous_operation: null,
    author: null
  };

  constructor(
    private operationsService: PacketOperationsService,
    public ref: DynamicDialogRef,
    public config: DynamicDialogConfig
  ) {
    this.operation.packet = this.config.data.packetId;
  }
  operationTypes = [
    { label: 'Add', value: 'add' },
    { label: 'Remove', value: 'remove' },
    { label: 'Adjust', value: 'adjust' },
    { label: 'Transfer in', value: 'trans_in' },
    { label: 'Transfer out', value: 'trans_out' },
    { label: 'Inventory', value: 'inventory' },
    { label: 'Service withdrawal', value: 'service' },
    { label: 'Buy', value: 'buy' },
    { label: 'Sell', value: 'sell' },
  ];

  saveOperation() {
    this.operationsService.createOperation(this.operation).subscribe((newOperation) => {
      this.ref.close(newOperation);
    });
  }

  cancel() {
    this.ref.close();
  }
}

