import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private darkModeSubject = new BehaviorSubject<boolean>(localStorage.getItem('darkMode') === 'true');
  darkMode$ = this.darkModeSubject.asObservable();

  toggleDarkMode(value: boolean) {
    localStorage.setItem('darkMode', value ? 'true' : 'false');
    this.darkModeSubject.next(value);
  }

  isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}
