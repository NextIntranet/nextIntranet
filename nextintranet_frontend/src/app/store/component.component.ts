import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule, Routes, provideRouter } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG imports
import { CardModule } from 'primeng/card';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ChipModule } from 'primeng/chip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ImageModule } from 'primeng/image';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
// Fix the import for InputTextarea
//import { InputTextareaModule } from 'primeng/inputtextarea';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { ViewChild } from '@angular/core';

import { NiIdPrintComponent } from '../shared/components/ni-id-print/ni-id-print.component';
import { NiSelectCategoryComponent } from "../shared/components/ni-select-category/ni-select-category.component";
import { NiSelectTagsComponent } from "../shared/components/ni-select-tags/ni-select-tags.component";
import { NiParametersListComponent } from "../shared/components/ni-parametres-list/ni-parametres-list.component";
import { NiSuppliersListComponent } from "../shared/components/ni-suppliers-list/ni-suppliers-list.component";
// import { NiPacketEditDialogComponent } from '../shared/components/ni-packet-edit-dialog/ni-packet-edit-dialog.component';
import { NiPacketCardComponent } from '../shared/components/ni-packet-card/ni-packet-card.component';
import { PacketService } from './services/packet.service';


@Component({
  selector: 'app-component',
  templateUrl: './component.component.html',
  styleUrls: ['./component.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HttpClientModule,
    FormsModule,
    CardModule,
    TabViewModule,
    TableModule,
    ChipModule,
    ProgressSpinnerModule,
    MessageModule,
    ImageModule,
    BadgeModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    //InputTextareaModule,
    DropdownModule,
    ToastModule,
    InputNumberModule,
    NiSelectCategoryComponent,
    NiSelectTagsComponent,
    NiParametersListComponent,
    NiSuppliersListComponent,
    NiPacketCardComponent,
    NiIdPrintComponent,
],
  providers: [MessageService]
})
export class ComponentComponent implements OnInit {
  componentData: any;
  loading = false;
  error: string | null = null;

  // Edit mode properties
  editMode = false;
  editedComponent: any = {};
  toSave: any = {};
  savingChanges = false;

  // Properties for expandable operations section
  expandedLocationId: string | null = null;
  operations: any[] = [];
  loadingOperations = false;

  // New tag management
  newTag: string = '';

  // Packets
  creatingPacket = false;


  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private packetService: PacketService
  ) { }

  ngOnInit(): void {
    this.loading = true;
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.fetchComponentData(id);
    });
  }

  fetchComponentData(id: string): void {
    const token = localStorage.getItem('authToken');

    // Create headers with the Bearer token
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get(`http://localhost:8080/api/v1/store/component/${id}`, { headers })
      .pipe(
        catchError(error => {
          console.log('Chyba při načítání dat:', error);
          this.loading = false;
          this.error = 'Nepodařilo se načíst data komponenty';
          console.error('Chyba při načítání dat:', error);

          // Handle redirection if needed
          if (error.status === 302 || error.status === 301) {
            const redirectUrl = error.headers.get('Location');
            if (redirectUrl) {
              this.router.navigateByUrl(redirectUrl);
            }
          }

          return throwError(() => error);
        })
      )
      .subscribe(data => {
        console.log('Data komponenty načtena:', data);
        this.loading = false;
        this.componentData = data;
      });
  }

  // Method to toggle location expansion and fetch operations
  toggleLocationOperations(packet: any, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // If already expanded, collapse it
    if (this.expandedLocationId === packet.id) {
      this.expandedLocationId = null;
      return;
    }

    // Otherwise expand and load operations
    this.expandedLocationId = packet.id;
    this.operations = [];
    this.fetchOperationsForLocation(packet.id);
  }

  // Method to fetch operations for a selected location
  fetchOperationsForLocation(packetId: string): void {
    this.loadingOperations = true;

    const token = localStorage.getItem('authToken');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    // Adjust this endpoint to match your actual API
    this.http.get<any[]>(`http://localhost:8080/api/v1/store/packet/${packetId}/operations`, { headers })
      .pipe(
        catchError(error => {
          console.error('Chyba při načítání operací:', error);
          this.loadingOperations = false;
          return throwError(() => error);
        })
      )
      .subscribe(data => {
        console.log('Operace načteny:', data);
        this.operations = data;
        this.loadingOperations = false;
      });
  }

  // Toggle edit mode
  toggleEditMode(): void {
    if (!this.editMode) {

      this.editedComponent = {
        name: this.componentData.name,
        category: this.componentData.category? this.componentData.category.id : null,
        description: this.componentData.description.length > 0 ? this.componentData.description : null,
        internal_price: this.componentData.internal_price > 0 ? this.componentData.internal_price : null,
        selling_price: this.componentData.selling_price > 0 ? this.componentData.selling_price : null,
        primary_image: this.componentData.primary_image.length > 0 ? this.componentData.primary_image : null,
        tags: this.componentData.tags ? this.componentData.tags.map((tag: any) => tag.id) : []
        //tags: this.componentData.tags
      };
    }
    this.editMode = !this.editMode;
  }

  // Cancel edits
  cancelEdit(): void {
    this.editMode = false;
    this.editedComponent = {};
  }

  // Save changes
  saveChanges(): void {
    this.savingChanges = true;

    const token = localStorage.getItem('authToken');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    this.toSave = this.editedComponent;
    this.toSave.category = this.editedComponent.category ? this.editedComponent.category : null;

    this.http.patch(
      `http://localhost:8080/api/v1/store/component/${this.componentData.id}/`,
      this.toSave,
      { headers }
    )
    .pipe(
      catchError(error => {
        this.savingChanges = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba při ukládání',
          detail: 'Nepodařilo se uložit změny komponenty'
        });
        console.error('Chyba při ukládání dat:', error);
        return throwError(() => error);
      })
    )
    .subscribe(response => {
      this.savingChanges = false;
      this.editMode = false;

      // Update the local data with the response or refetch
      this.fetchComponentData(this.componentData.id);

      this.messageService.add({
        severity: 'success',
        summary: 'Uloženo',
        detail: 'Změny byly úspěšně uloženy'
      });
    });
  }

  createNewPacket(): void {
   this.creatingPacket = true;
  }

  openLocationEdit(location: any): void {
    console.log('Editing location:', location);

  }

}