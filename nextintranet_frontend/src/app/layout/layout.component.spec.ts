import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LayoutComponent } from './layout.component';
import { SidebarModule } from 'primeng/sidebar';
import { RouterTestingModule } from '@angular/router/testing';

describe('LayoutComponent', () => {
  let component: LayoutComponent;
  let fixture: ComponentFixture<LayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutComponent, SidebarModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle drawer visibility', () => {
    expect(component.isDrawerVisible).toBeFalse();
    component.toggleDrawer();
    expect(component.isDrawerVisible).toBeTrue();
    component.toggleDrawer();
    expect(component.isDrawerVisible).toBeFalse();
  });
});