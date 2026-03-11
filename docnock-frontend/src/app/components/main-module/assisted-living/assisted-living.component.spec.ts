import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssistedLivingComponent } from './assisted-living.component';

describe('AssistedLivingComponent', () => {
  let component: AssistedLivingComponent;
  let fixture: ComponentFixture<AssistedLivingComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssistedLivingComponent]
    });
    fixture = TestBed.createComponent(AssistedLivingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
