import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { AuthServiceService } from '../services/auth-service.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { GlobalLoaderService } from '../services/global-loader.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor(
    private authService: AuthServiceService,
    private router: Router,
    private toastr: ToastrService,
    private globalLoader: GlobalLoaderService
  ) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const isCallTokenRequest = request.url.includes('/generate-agora-token');
    const skipLoaderHeader = request.headers.get('X-Skip-Loader') === 'true';
    const shouldSkipLoader = isCallTokenRequest || skipLoaderHeader;

    const requestToSend = request.headers.has('X-Skip-Loader')
      ? request.clone({ headers: request.headers.delete('X-Skip-Loader') })
      : request;

    if (!shouldSkipLoader) {
      this.globalLoader.show();
    }

    return next.handle(requestToSend).pipe(
      timeout(this.REQUEST_TIMEOUT),
      catchError((error: HttpErrorResponse | any) => {

        // Timeout error
        if (error?.name === 'TimeoutError') {
          this.toastr.error('Request timed out. Please try again.');
          return throwError(() => error);
        }

        // Network error (no internet, server unreachable)
        if (error.status === 0) {
          this.toastr.error('Unable to connect to server. Check your connection.');
          return throwError(() => error);
        }

        // 401 Unauthorized — session expired or deleted account
        if (error.status === 401) {
          if (error.error?.message === 'delete_account') {
            this.toastr.error('Your account has been deleted. You have been logged out.');
          } else if (error.error?.message === 'status_inactive') {
            this.toastr.error('Your account has been deactivated.');
          } else {
            this.toastr.warning('Session expired. Please log in again.');
          }
          this.authService.logout();
          this.router.navigate(['/login'], { replaceUrl: true });
          return throwError(() => error);
        }

        // 403 Forbidden — insufficient permissions
        if (error.status === 403) {
          this.toastr.error('You do not have permission to perform this action.');
          return throwError(() => error);
        }

        // 429 Too Many Requests
        if (error.status === 429) {
          this.toastr.warning('Too many requests. Please wait and try again.');
          return throwError(() => error);
        }

        // 500+ Server errors
        if (error.status >= 500) {
          this.toastr.error('Server error. Please try again later.');
          return throwError(() => error);
        }

        return throwError(() => error);
      }),
      finalize(() => {
        if (!shouldSkipLoader) {
          this.globalLoader.hide();
        }
      })
    );
  }
}
