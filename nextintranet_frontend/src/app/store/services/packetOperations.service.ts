import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from "../../../environment";

interface Operation {
  id: number;
  name: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PacketOperationsService {
  private apiUrl = `${environment.apiUrl}/api/v1/store/packet/operation/`;

  constructor(private http: HttpClient) { }

  getOperations(packetId: string): Observable<Operation[]> {
    const params = { packet: packetId.toString() };
    return this.http.get<Operation[]>(`${this.apiUrl}`, { params });
  }

  createOperation(operation: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, operation);
  }
}
