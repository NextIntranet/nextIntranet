import { HomeComponent } from "./home/home.component";
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { LoginComponent } from './auth/login.component';
import { LayoutComponent } from "./layout/layout.component";
import { StoreComponent } from './store/store.component';
import { ComponentComponent } from "./store/component.component";

import { SuppliersListComponent } from "./store/suppliers/suppliersList.component";
import { CategoriesListComponent } from "./store/categories/categoriesList.component";


export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'store', children: [
          { path: 'component/:id', component: ComponentComponent, data: { renderMode: 'client' } },
          { path: 'supplier', component: SuppliersListComponent },
          { path: 'category', component: CategoriesListComponent },
          { path: '', component: StoreComponent },
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