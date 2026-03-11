import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ForgetPassowordComponent } from './forget-passoword.component';

describe('ForgetPassowordComponent', () => {
  let component: ForgetPassowordComponent;
  let fixture: ComponentFixture<ForgetPassowordComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ForgetPassowordComponent]
    });
    fixture = TestBed.createComponent(ForgetPassowordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
