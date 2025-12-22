import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductionService } from '../services/production.service';
import { Production, Template, Realization } from '../models/production.models';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-production-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    CardModule,
    TabsModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './production-detail.component.html',
  styleUrls: ['./production-detail.component.scss']
})
export class ProductionDetailComponent implements OnInit {
  production?: Production;
  templates: Template[] = [];
  realizations: Realization[] = [];
  loading = false;
  productionId?: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productionService: ProductionService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.productionId = id;
        this.loadProduction(id);
      }
    });
  }

  loadProduction(id: string): void {
    this.loading = true;
    this.productionService.getProduction(id).subscribe({
      next: (production) => {
        this.production = production;
        this.templates = production.templates || [];
        this.realizations = production.realizations || [];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading production:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se načíst výrobní projekt'
        });
        this.loading = false;
      }
    });
  }

  onEdit(): void {
    if (this.productionId) {
      this.router.navigate(['/production', this.productionId, 'edit']);
    }
  }

  onDelete(): void {
    if (!this.productionId) return;
    
    if (confirm('Opravdu chcete smazat tento výrobní projekt?')) {
      this.productionService.deleteProduction(this.productionId).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Úspěch',
            detail: 'Projekt byl smazán'
          });
          this.router.navigate(['/production']);
        },
        error: (error) => {
          console.error('Error deleting production:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Chyba',
            detail: 'Nepodařilo se smazat projekt'
          });
        }
      });
    }
  }

  onCreateTemplate(): void {
    // TODO: Navigate to template creation
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: 'Vytváření šablon bude implementováno později'
    });
  }

  onCreateRealization(): void {
    // TODO: Navigate to realization creation
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: 'Vytváření realizací bude implementováno později'
    });
  }
}
