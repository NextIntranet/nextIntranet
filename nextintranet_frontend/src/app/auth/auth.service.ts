import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { UniversalStorageService } from "../core/universal-storage.service";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { environment } from "../../environment";

interface TokenResponse {
  access: string;
  refresh: string;
}

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private readonly TOKEN_KEY = "authToken";
  private readonly TOKEN_REFRESH_KEY = "authTokenRefresh";
  private readonly API_URL = environment.apiUrl;

  constructor(
    private router: Router,
    private http: HttpClient,
    private storageService: UniversalStorageService,
  ) {}

  login(username: string, password: string): Observable<boolean> {
    return this.http
      .post<TokenResponse>(`${this.API_URL}/api/token/`, { username, password })
      .pipe(
        map(response => {
          if (response.access) {
            this.storageService.setItem(this.TOKEN_KEY, response.access);
            this.storageService.setItem(this.TOKEN_REFRESH_KEY, response.refresh);
            return true;
          }
          this.storageService.removeItem(this.TOKEN_KEY);
          return false;
        })
      );
  }

  refreshToken(): Observable<TokenResponse> {
    const refresh = this.storageService.getItem(this.TOKEN_REFRESH_KEY);
    return this.http
      .post<TokenResponse>(`${this.API_URL}/api/token/refresh/`, { refresh })
      .pipe(
        map(response => {
          this.storageService.setItem(this.TOKEN_KEY, response.access);
          this.storageService.setItem(this.TOKEN_REFRESH_KEY, response.refresh);
          return response;
        })
      );
  }

  logout(): void {
    this.storageService.removeItem(this.TOKEN_KEY);
    this.storageService.removeItem(this.TOKEN_REFRESH_KEY);
    this.router.navigate(["/login"]);
  }

  isAuthenticated(): boolean {
    return this.storageService.getItem(this.TOKEN_KEY) !== null;
  }

  getToken(): string | null {
    return this.storageService.getItem(this.TOKEN_KEY);
  }
}
