import { Injectable } from "@angular/core";
import * as CryptoJS from "crypto-js";
import { BehaviorSubject, Subject } from "rxjs";
import { ToastrService } from "ngx-toastr";
import { environment } from "src/environments/environment";
@Injectable({
    providedIn: 'root', // This makes it globally available without adding it to `providers`
  })


export class CoreService {
  fingerprint: any;
  deviceId: any;
  constructor(private toastrService: ToastrService) {
    // this.getDeviceId();
  }

  SharingData = new BehaviorSubject("default");
  SharingMenu = new BehaviorSubject("default");
  SharingProfile = new BehaviorSubject("default");
  SharingInsId = new BehaviorSubject("default");
  SharingEprescriptionData = new BehaviorSubject("default");
  SharingInsObjectId = new BehaviorSubject("default");
  SharingCategory = new BehaviorSubject("default");
  SharingDocumentId = new BehaviorSubject("default");
  SharingRoutingUrl = new BehaviorSubject("default");
  SharingLocation = new BehaviorSubject("default");


  decryptObjectData(response: any) {
  
    // console.log(response.data,"respo");
    
    if (!response.data) return false;
    // console.log('coreService',response.data);
    const decPassword = environment.CRYPTOSECRET;
    const decryptedOutput = CryptoJS.AES.decrypt(
      response.data.toString().trim(),
      decPassword.toString().trim()
    ).toString(CryptoJS.enc.Utf8);
    // console.log('outputcoreservice',decryptedOutput);
    // console.log(decryptedOutput,"decryptedOutput");
    
    return JSON.parse(decryptedOutput);
  }

public uploadImages(files: File[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      files.forEach((file: File) => {
        formData.append('images', file);
      });

      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      fetch(`${environment.apiUrl}/upload-image`, {
        method: 'POST',
        headers: headers,
        body: formData
      })
      .then(response => response.json())
      .then((res: any) => {
        if (res.imageUrls && Array.isArray(res.imageUrls)) {
          resolve(res.imageUrls);
        } else {
          reject('Invalid response from server');
        }
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  encryptObjectData(request: any) {
    // if (environment.apiUrl == "http://localhost:8055")
    // return request;
    const dataToEncrypt = JSON.stringify(request);
    const encPassword = environment.CRYPTOSECRET;
    const encryptedData = CryptoJS.AES.encrypt(
      dataToEncrypt.trim(),
      encPassword.trim()
    ).toString();
    return encryptedData;
  }

  

  encrypt(value: string): string {
    return CryptoJS.AES.encrypt(value, environment.CRYPTOSECRET).toString();
  }

  // Decrypt function
  decrypt(encryptedValue: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedValue, environment.CRYPTOSECRET);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      // console.error('Decryption error:', error);
      return '';
    }
  }
 
  setSharingData(data: any) {
    this.SharingData.next(data);
  }

  setDocumentData(data: any) {
    this.SharingDocumentId.next(data);
  }

  setMenuInHeader(data: any) {
    this.SharingMenu.next(data);
  }

  setUrlRoute(data: any) {
    this.SharingRoutingUrl.next(data);
  }

  setProfileDetails(data: any) {
    this.SharingProfile.next(data);
  }

  setInsuranceId(data: any) {
    this.SharingInsId.next(data);
  }

  setEprescriptionData(data: any) {
    this.SharingEprescriptionData.next(data);
  }

  setInsObjectid(data: any) {
    this.SharingInsObjectId.next(data);
  }

  setCategoryForService(data: any) {
    this.SharingCategory.next(data);
  }

  setLocationData(data: any) {
    this.SharingLocation.next(data);
  }

  public showSuccess(message: any, title: any): void {
    this.toastrService.success(message, title);
  }

  public showInfo(message: any, title: any): void {
    this.toastrService.info(message, title);
  }

  public showWarning(message: any, title: any): void {
    this.toastrService.warning(message, title);
  }

  public showError(message: any, title: any): void {
    this.toastrService.error(message, title);
  }

  public setLocalStorage(data: any, key: any) {
    localStorage.setItem(key, JSON.stringify(data));
  }

//   public getLocalStorage(key: any) {
// //     let getLocalData = localStorage.getItem(key);
// //     return JSON.parse(getLocalData);
// //   }

  public removeLocalStorage(key: any) {
    localStorage.removeItem(key);
  }

  public setSessionStorage(data: any, key: any) {
    sessionStorage.setItem(key, JSON.stringify(data));
  }

 

  public removeSessionStorage(key: any) {
    sessionStorage.removeItem(key);
  }

  public createDate(date: Date) {
    const newDay = `0${date.getDate()}`;
    const newMonth = `0${date.getMonth() + 1}`;
    return `${date.getFullYear()}-${newMonth.length > 2 ? newMonth.slice(1) : newMonth
      }-${newDay.length > 2 ? newDay.slice(1) : newDay}`;
  }

 

 

  public convertTwentyFourToTwelve(hours: string) {
    // console.log(new Date("07:35"),"hours")
    // if(hours!=null && hours!=undefined){
    //   return moment(new Date(hours)).format("hh:mm");
    // }else{
    //   return '0000';
    // }
    if (hours) {
      if (hours != null && hours != undefined) {
        return hours.split(":")[0] + "" + hours.split(":")[1];
      } else {
        return "0000";
      }
    } else if (hours === '0000') {
      return "0000";
    } else {
      return "0000";
    }
  }

  public convertIntohours(hours: string) {
    return hours.slice(0, 2) + ":" + hours.slice(2, 4);
  }

}