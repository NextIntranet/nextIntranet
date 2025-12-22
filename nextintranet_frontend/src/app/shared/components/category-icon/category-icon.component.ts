import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-category-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img *ngIf="isElectronicSymbol" 
         [src]="imageUrl" 
         class="category-icon electronic-symbol"
         [alt]="icon">
    <img *ngIf="isImageIcon" 
         [src]="imageUrl" 
         class="category-icon image-icon"
         [alt]="icon">
    <i *ngIf="isPrimeIcon" 
       [class]="iconClass" 
       [style.color]="color || '#666'">
    </i>
  `,
  styles: [`
    .category-icon {
      display: inline-block;
      font-size: 1rem;
      vertical-align: middle;
    }
    
    .electronic-symbol {
      width: 1.25rem;
      height: 1.25rem;
      object-fit: contain;
      vertical-align: middle;
    }
    
    .image-icon {
      width: 1.25rem;
      height: 1.25rem;
      object-fit: contain;
      vertical-align: middle;
    }
  `]
})
export class CategoryIconComponent implements OnInit {
  @Input() icon: string = '';
  @Input() color: string = '';
  
  isElectronicSymbol: boolean = false;
  isImageIcon: boolean = false;
  isPrimeIcon: boolean = true;
  imageUrl: string = '';
  iconClass: string = 'pi pi-tag category-icon';

  constructor() {}

  ngOnInit() {
    console.log('CategoryIcon - icon:', this.icon, 'color:', this.color);
    
    if (this.icon && this.icon.startsWith('symbol:')) {
      this.isPrimeIcon = false;
      this.isElectronicSymbol = true;
      const symbolName = this.icon.replace('symbol:', '');
      this.imageUrl = `/assets/electronic-symbols/SVG/${symbolName}.svg`;
    } else if (this.icon && this.icon.startsWith('img:')) {
      this.isPrimeIcon = false;
      this.isImageIcon = true;
      const imagePath = this.icon.replace('img:', '');
      this.imageUrl = `/assets/icons/${imagePath}`;
    } else {
      // PrimeNG icon
      this.isPrimeIcon = true;
      if (this.icon) {
        // If icon doesn't start with pi-, add it
        if (!this.icon.startsWith('pi-')) {
          this.iconClass = 'pi pi-' + this.icon + ' category-icon';
        } else {
          this.iconClass = 'pi ' + this.icon + ' category-icon';
        }
      } else {
        // Default icon
        this.iconClass = 'pi pi-tag category-icon';
      }
    }
  }
}
