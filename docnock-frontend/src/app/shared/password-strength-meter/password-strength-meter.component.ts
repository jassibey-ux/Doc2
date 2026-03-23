import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-password-strength-meter',
  templateUrl: './password-strength-meter.component.html',
  styleUrls: ['./password-strength-meter.component.scss']
})
export class PasswordStrengthMeterComponent implements OnChanges {
  @Input() password: string = '';

  strengthLevel: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
  strengthScore: number = 0;

  checks = {
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['password']) {
      this.evaluateStrength();
    }
  }

  private evaluateStrength(): void {
    const pw = this.password || '';

    this.checks.minLength = pw.length >= 8;
    this.checks.hasUppercase = /[A-Z]/.test(pw);
    this.checks.hasLowercase = /[a-z]/.test(pw);
    this.checks.hasNumber = /[0-9]/.test(pw);
    this.checks.hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw);

    const passed = Object.values(this.checks).filter(Boolean).length;
    this.strengthScore = passed;

    if (passed <= 1) {
      this.strengthLevel = 'weak';
    } else if (passed <= 2) {
      this.strengthLevel = 'fair';
    } else if (passed <= 3) {
      this.strengthLevel = 'good';
    } else {
      this.strengthLevel = 'strong';
    }
  }

  get strengthLabel(): string {
    switch (this.strengthLevel) {
      case 'weak': return 'Weak';
      case 'fair': return 'Fair';
      case 'good': return 'Good';
      case 'strong': return 'Strong';
    }
  }
}
