// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.
console.log(window.location, window, 'window.location.host');

export const environment = {
  production: false,
  // apiUrl: `${window.location.protocol}//${window.location.hostname}:8055/api/v1`,
  // socketURl: `http://localhost:8056`,

  socketURl: `wss://socketapi.doc-nock.com`,
  apiUrl: `https://api.doc-nock.com/api/v1`,
  CRYPTOSECRET: 'DOCKNOCK@@@###',
  // imgUrl:`${window.location.protocol}//${window.location.hostname}:4200`,
  // backEndUrl: `${window.location.protocol}//${window.location.hostname}:8055`,
  imgUrl:`https://admin.doc-nock.com`,
  backEndUrl: `https://api.doc-nock.com`,
  APP_ID: "7b4ccbc409024d08a7d553d595a9c77d",
  appCertificates :'ba95cc20b5cf4a679151f0504e9183bb'

};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
