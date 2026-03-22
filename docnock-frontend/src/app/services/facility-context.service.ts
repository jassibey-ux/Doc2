import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthServiceService } from './auth-service.service';
import { CoreService } from '../shared/core.service';

export interface FacilityInfo {
  _id: string;
  name: string;
  slug?: string;
  type?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FacilityContextService {
  private facilitiesSubject = new BehaviorSubject<FacilityInfo[]>([]);
  private activeFacilitySubject = new BehaviorSubject<FacilityInfo | null>(null);

  /** Observable list of facilities the current user can access */
  facilities$ = this.facilitiesSubject.asObservable();

  /** Observable active facility (null = "All Facilities" / no filter) */
  activeFacility$ = this.activeFacilitySubject.asObservable();

  /** Quick synchronous access to active facility ID */
  get currentFacilityId(): string | null {
    return this.activeFacilitySubject.value?._id || null;
  }

  get currentFacility(): FacilityInfo | null {
    return this.activeFacilitySubject.value;
  }

  constructor(
    private authService: AuthServiceService,
    private coreService: CoreService
  ) {}

  /**
   * Initialize from localStorage on app start.
   * Call this from NavBarComponent ngOnInit or APP_INITIALIZER.
   */
  init(): void {
    const savedId = localStorage.getItem('active_facility_id');
    const savedName = localStorage.getItem('active_facility_name');
    if (savedId && savedName) {
      this.activeFacilitySubject.next({ _id: savedId, name: savedName });
    }
    this.loadMyFacilities();
  }

  /** Fetch the list of facilities the current user has access to */
  loadMyFacilities(): void {
    this.authService.getMyFacilities().subscribe({
      next: (res: any) => {
        let facilities: FacilityInfo[] = [];
        if (res.success) {
          const encData = res.encryptDatauserdata || res.data;
          const decrypted =
            typeof encData === 'string'
              ? this.coreService.decryptObjectData({ data: encData })
              : encData;
          facilities = Array.isArray(decrypted) ? decrypted : [];
        }
        this.facilitiesSubject.next(facilities);

        // If we had a saved facility, verify it's still in the list
        const savedId = localStorage.getItem('active_facility_id');
        if (savedId && facilities.length > 0) {
          const match = facilities.find((f) => f._id === savedId);
          if (match) {
            this.activeFacilitySubject.next(match);
          }
        }
      },
      error: () => {
        // Silently fail — facilities list stays empty
        this.facilitiesSubject.next([]);
      },
    });
  }

  /**
   * Switch the active facility context.
   * Calls backend to get a new JWT with the facilityId claim,
   * then updates localStorage and the observable.
   */
  switchFacility(facilityId: string): void {
    const facility = this.facilitiesSubject.value.find(
      (f) => f._id === facilityId
    );
    if (!facility) return;

    this.authService.switchFacility(facilityId).subscribe({
      next: (res: any) => {
        if (res.success || res.token || res.data?.token) {
          const token = res.token || res.data?.token;
          if (token) {
            localStorage.setItem('auth_token', token);
          }
          localStorage.setItem('active_facility_id', facility._id);
          localStorage.setItem('active_facility_name', facility.name);
          this.activeFacilitySubject.next(facility);
        }
      },
      error: () => {
        // Switch failed — keep current context
      },
    });
  }

  /**
   * Clear facility filter (show all facilities).
   * Does NOT call backend — just removes the local filter.
   */
  clearFacility(): void {
    localStorage.removeItem('active_facility_id');
    localStorage.removeItem('active_facility_name');
    this.activeFacilitySubject.next(null);
  }
}
