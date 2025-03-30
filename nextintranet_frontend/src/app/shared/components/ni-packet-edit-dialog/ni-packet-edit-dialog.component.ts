import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'ni-packet-edit-dialog',
  templateUrl: './ni-packet-edit-dialog.component.html',
  styleUrls: ['./ni-packet-edit-dialog.component.scss'],
  providers: [MessageService],
  imports: [DialogModule, ButtonModule]
})

export class NiPacketEditDialogComponent implements OnInit {
  visible: boolean = false;
  packetForm: any;
  packet: any;
  operations: any[] = [];
  packetId: string | undefined;


  ngOnInit(): void {
  }

  showDialog(packetId: string) {
    this.packetId = packetId;
    this.loadData(packetId);
    this.visible = true;
  }

  loadData(packetId: string): void {

  }


  save(): void {

  }

  cancel(): void {
    this.visible = false;
  }
}
