import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddAssistedLivingComponent } from './add-assisted-living.component';

describe('AddAssistedLivingComponent', () => {
  let component: AddAssistedLivingComponent;
  let fixture: ComponentFixture<AddAssistedLivingComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddAssistedLivingComponent]
    });
    fixture = TestBed.createComponent(AddAssistedLivingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
