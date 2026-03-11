import { Injectable } from '@angular/core';
import * as branch from 'branch-sdk';


@Injectable({
  providedIn: 'root'
})
export class BranchService {

  constructor() {
    var options = { no_journeys: true };
    branch.init('key_test_nFkXOMdw6hqrMad3YeSDNfbizCj9EMed',options, (err:any, data:any) => {
      if (err) {
        console.error('Branch initialization failed:', err);
        alert(err)
      } else {
        console.log('Branch initialized:', data);
      }
    });
   }

   getBranchData(): Promise<any> {
    return new Promise((resolve, reject) => {
      branch.data((err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }
}
