import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { AuthServiceService } from '../services/auth-service.service';
import { ToastrService } from 'ngx-toastr';
import { GlobalLoaderService } from '../services/global-loader.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(
    private authService: AuthServiceService,
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
      catchError((error: HttpErrorResponse) => {

        // 🔴 401 delete account case (global handling)
        if (
          error.status === 401 &&
          error.error?.message === 'delete_account'
        ) {
          this.authService.logout();
          const message = 'Your account has been deleted. You have been logged out.';
          this.toastr.error(message);
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
