import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductionService } from '../services/production.service';
import { Production } from '../models/production.models';
import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-production-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DataViewModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    FormsModule
  ],
  templateUrl: './production-list.component.html',
  styleUrls: ['./production-list.component.scss']
})
export class ProductionListComponent implements OnInit {
  productions: Production[] = [];
  totalRecords = 0;
  loading = false;
  searchTerm = '';
  page = 1;
  pageSize = 25;

  constructor(private productionService: ProductionService) {}

  ngOnInit(): void {
    this.loadProductions();
  }

  loadProductions(): void {
    this.loading = true;
    const filters = this.searchTerm ? { search: this.searchTerm } : undefined;
    
    this.productionService.getProductions(this.page, this.pageSize, filters)
      .subscribe({
        next: (response) => {
          this.productions = response.results;
          this.totalRecords = response.count;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading productions:', error);
          this.loading = false;
        }
      });
  }

  onSearch(): void {
    this.page = 1;
    this.loadProductions();
  }

  onPageChange(event: any): void {
    this.page = (event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadProductions();
  }
}
