import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResetPassowordComponent } from './reset-passoword.component';

describe('ResetPassowordComponent', () => {
  let component: ResetPassowordComponent;
  let fixture: ComponentFixture<ResetPassowordComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ResetPassowordComponent]
    });
    fixture = TestBed.createComponent(ResetPassowordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
