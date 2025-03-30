import { Component, EventEmitter, Input, Output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { NiSelectLocationComponent } from '../ni-select-location/ni-select-location.component';
import { PacketOperationsService } from '../../../store/services/packetOperations.service';
import { PacketService } from '../../../store/services/packet.service';
import { NiIdPrintComponent } from '../ni-id-print/ni-id-print.component';
import { NiPacketOperationCreateComponent } from '../ni-packet-operation-create/ni-packet-operation-create.component';
import { NiPrintButtonComponent } from '../ni-print-button/ni-print-button.component';

@Component({
  selector: 'ni-packet-card',
  styleUrls: ['./ni-packet-card.component.scss'],
  templateUrl: './ni-packet-card.component.html',
  standalone: true,
  imports: [
    CommonModule,
    TagModule,
    ProgressSpinnerModule,
    TableModule,
    FormsModule,
    TooltipModule,
    DynamicDialogModule,
    NiSelectLocationComponent,
    NiIdPrintComponent,
    NiPacketOperationCreateComponent,
    NiPrintButtonComponent
],
  providers: [DialogService]
})
export class NiPacketCardComponent {
  @Input() packet!: any;
  @Input() componentId!: string;
  readonly expandedLocationId = input<string | null>(null);
  @Input() isDummy: boolean = false;
  @Input() component: any;

  @Output() savePacket: EventEmitter<any> = new EventEmitter<any>();
  @Output() cancelEdit: EventEmitter<void> = new EventEmitter<void>();

  constructor(
    private operationsService: PacketOperationsService,
    private packetService: PacketService,
    private dialogService: DialogService
  ) {}

  isEditMode: boolean = false;
  localPacket: any = {
    location: { id: '', full_path: '', name: '' },
    reference: '',
    description: ''
  };
  expandedOperations: boolean = false;
  loadingOperations: boolean = false;
  operations: any[] = [];

  ngOnChanges() {
    if (this.packet) {
      this.localPacket = { ...this.packet };
      if (this.isDummy) {
        this.localPacket.id = null;
        this.isEditMode = true;
      }
    }
  }

  ngOninit() {
    if (this.isDummy) {
      console.log('Creating dummy packet');
      this.createDummyPacket();
      this.openPacketEdit();
    }
  }

  openPacketEdit() {
    console.log('openPacketEdit');
    this.isEditMode = true;
    if(!this.isDummy) {
      this.toggleOperations(true);
    }
  }

  createDummyPacket() {
    this.localPacket = {
      id: null,
      component: { id: '', name: '' },
      location: { id: '', full_path: '', name: '' },
      reference: '',
      description: '',
      quantity: 0,
      total_price: 0,
      unit_price: 0,
      created_at: new Date(),
      supplier: null
    };
    this.packet = { ...this.localPacket };
    this.isEditMode = true;
    this.isDummy = true;
  }

  onSaveClick(event: Event) {
    event.stopPropagation();
    console.log('onSaveClick', this.isDummy);
    if (this.isDummy) {

      console.log("Creating new packet with location");

      this.packetService.createPacket(
        {
          component: this.componentId,
          location: this.localPacket.location.id,
          description: this.localPacket.description
        }
      ).subscribe((newPacket) => {
        console.log('newPacket', newPacket);
        this.localPacket = newPacket;
        this.packet = { ...newPacket };
        // this.savePacket.emit(this.localPacket);
      });

    } else {
      const packet = { ...this.localPacket };
      packet.location = packet.location.id;
      packet.component = packet.component.id;
      this.packetService.updatePacket(this.localPacket.id, packet).subscribe(() => {
        this.savePacket.emit(this.localPacket);
        this.isEditMode = false;
      });
    }
    this.updatePacketInfo();
  }

  onCancelClick(event: Event) {
    event.stopPropagation();
    this.cancelEdit.emit();
    this.isEditMode = false;
  }


  onDeleteClick(event: Event) {
    event.stopPropagation();
    console.log('onDeleteClick');
    this.packetService.deletePacket(this.localPacket.id).subscribe(() => {
      console.log('Packet deleted');
      this.cancelEdit.emit();
    });
  }

  toggleOperations(state?: boolean) {
    if (state == undefined) {
      this.expandedOperations = !this.expandedOperations;
    } else {
      this.expandedOperations = state;
    }

    if (this.expandedOperations && !this.operations.length) {
      this.loadingOperations = true;
      this.operationsService.getOperations(this.packet.id).pipe(

      ).subscribe(operations => {
        this.loadingOperations = false;
        this.operations = operations
      }
      );
    }
  }

  openPacketDialog() {
    console.log('openPacketDialog');
  }

  openCreateOperationDialog() {
    const ref = this.dialogService.open(NiPacketOperationCreateComponent, {
      header: 'Create New Operation',
      width: '50%',
      data: { packetId: this.packet.id }
    });

    ref.onClose.subscribe((newOperation) => {
      if (newOperation) {
        this.operations.push(newOperation);
      }
    });
  }

  updatePacketInfo(){
    console.log('updatePacketInfo');
    this.packetService.getPacketById(this.localPacket.id).subscribe((packet) => {
      this.localPacket = packet;
      this.packet = { ...packet };
    });
  }


  recalculateStock() {
    this.packetService.calculatePacketPrice(this.localPacket.id).subscribe((packet) => {
      this.localPacket = packet;
      this.packet = { ...packet };
    });
  }


}
