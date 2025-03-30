import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';
import { UniversalStorageService } from '../core/universal-storage.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

@NgModule({
  imports: [
    CommonModule
  ],
  providers: [
    AuthService,
    UniversalStorageService,
    provideHttpClient(withInterceptorsFromDi())
  ]
})
export class AuthModule { }

