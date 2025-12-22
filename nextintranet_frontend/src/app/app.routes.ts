import { HomeComponent } from "./home/home.component";
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { LoginComponent } from './auth/login.component';
import { LayoutComponent } from "./layout/layout.component";
import { StoreComponent } from './store/store.component';
import { ComponentComponent } from "./store/component.component";
import { ProductionListComponent } from './production/production-list/production-list.component';
import { ProductionEditComponent } from './production/production-edit/production-edit.component';
import { ProductionDetailComponent } from './production/production-detail/production-detail.component';
import { TemplateDetailComponent } from './production/template-detail/template-detail.component';
import { Manufacturing } from './production/manufacturing/manufacturing';

import { SuppliersListComponent } from "./store/suppliers/suppliersList.component";
import { SupplierDetailComponent } from "./store/supplier-detail/supplier-detail.component";
import { CategoriesListComponent } from "./store/categories/categoriesList.component";
import { CategoryDetailComponent } from "./store/category-detail/category-detail.component";
import { LocationsComponent } from "./store/locations/locations.component";
import { LocationDetailComponent } from "./store/location-detail/location-detail.component";
import { PacketDetailComponent } from "./store/packet-detail/packet-detail.component";


export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'store', children: [
          { path: 'component/:id', component: ComponentComponent, data: { renderMode: 'client' } },
          { path: 'supplier/:id', component: SupplierDetailComponent },
          { path: 'supplier', component: SuppliersListComponent },
          { path: 'category/:id', component: CategoryDetailComponent },
          { path: 'categories', component: CategoriesListComponent },
          { path: 'locations', component: LocationsComponent },
          { path: 'location/:id', component: LocationDetailComponent },
          { path: 'packet/:id', component: PacketDetailComponent },
          { path: '', component: StoreComponent },
        ]
      },
      {
        path: 'production', children: [
          { path: '', component: ProductionListComponent },
          { path: 'create', component: ProductionEditComponent },
          { path: 'manufacturing/:id', component: Manufacturing },
          { path: 'template/:id', component: TemplateDetailComponent },
          { path: ':id', component: ProductionDetailComponent },
          { path: ':id/edit', component: ProductionEditComponent },
        ]
      },
      { path: '', component: HomeComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }