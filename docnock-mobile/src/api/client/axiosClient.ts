import axios, { AxiosRequestConfig } from 'axios';
import { LOCAL_BASE_URL } from '../endpoints';
import { clearLoginDetails, store } from '@store';
import { navigationRef } from '@navigation';
import qs from 'qs';
import { devLogger } from '@utils';

const axiosClient = axios.create({
  baseURL: LOCAL_BASE_URL,
  paramsSerializer: params => {
    return qs.stringify(params, {
      arrayFormat: 'brackets',
      encode: false,
    });
  },
});

export const defaultFormParams: AxiosRequestConfig = {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
  timeout: 15000,
};

export const defaultAxiosParams: AxiosRequestConfig = {
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
};

axiosClient.interceptors.request.use(async config => {
  // const firebaseJwtToken = await getFirebaseAuthToken();
  // console.log("🚀 ~ firebaseJwtToken:", firebaseJwtToken);
  // if (firebaseJwtToken) {
  // config.headers.setAuthorization(`Bearer ${firebaseJwtToken}`);
  // }
  return config;
});

const axiosAuthClient = axios.create({
  baseURL: LOCAL_BASE_URL,
  paramsSerializer: params => {
    return qs.stringify(params, {
      arrayFormat: 'brackets',
      encode: false,
    });
  },
});

axiosAuthClient.interceptors.request.use(async config => {
  if (!config.headers['Content-Type']) {
    config.headers.setContentType(defaultAxiosParams?.headers?.['Content-Type']);
  }
  const authToken = store?.getState()?.auth.loginDetails?.token;
  if (authToken) {
    config.headers.setAuthorization(`Bearer ${authToken}`);
  }
  return config;
});

axiosAuthClient.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    // devLogger('🚀 ~ error: interceptors', error?.request);
    if (error?.status === 401) {
      // const refreshToken = store?.getState()?.auth.loginDetails?.token;
      store.dispatch(clearLoginDetails());
      navigationRef.reset({
        routes: [{ name: 'LoginScreen' }],
        index: 0,
      });
    }
    return error;
  },
);

export { axiosAuthClient, axiosClient };
