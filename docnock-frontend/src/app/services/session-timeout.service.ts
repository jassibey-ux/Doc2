import { Injectable, NgZone } from '@angular/core';
import { AuthServiceService } from './auth-service.service';
import { fromEvent, merge, Subject, timer } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class SessionTimeoutService {
  private readonly TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private destroy$ = new Subject<void>();
  private timeoutTimer: any;

  constructor(
    private authService: AuthServiceService,
    private ngZone: NgZone
  ) {}

  start() {
    this.stop(); // Clear any existing

    // Run outside Angular zone to avoid change detection on every event
    this.ngZone.runOutsideAngular(() => {
      const activity$ = merge(
        fromEvent(document, 'mousemove'),
        fromEvent(document, 'keydown'),
        fromEvent(document, 'click'),
        fromEvent(document, 'scroll'),
        fromEvent(document, 'touchstart')
      ).pipe(
        debounceTime(1000),
        takeUntil(this.destroy$)
      );

      activity$.subscribe(() => {
        this.resetTimer();
      });

      this.resetTimer();
    });
  }

  private resetTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }
    this.timeoutTimer = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.authService.isAuthenticated()) {
          this.authService.logout();
        }
      });
    }, this.TIMEOUT_MS);
  }

  stop() {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroy$ = new Subject<void>();
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
