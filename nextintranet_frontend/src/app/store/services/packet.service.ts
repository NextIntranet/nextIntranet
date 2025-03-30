import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PacketService {
  private baseUrl = 'http://localhost:8080/api/v1/store/packet/';
  private componentUrl = 'http://localhost:8080/api/v1/store/component/';

  constructor(private http: HttpClient) {}

  getPackets(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}`);
  }

  getPacketById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}${id}`);
  }

  createPacket(payload: any): Observable<any> {
    console.log("Creating packet", payload);
    return this.http.post<any>(`${this.baseUrl}`, payload);
  }

  updatePacket(id: string, packet: any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}${id}/`, packet);
  }

  deletePacket(id: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}${id}/`);
  }

  calculatePacketPrice(id: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}${id}/calculate/`, {});
  }
}
