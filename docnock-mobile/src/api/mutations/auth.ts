import { useMutation } from '@tanstack/react-query';
import qs from 'qs';
import { Image } from 'react-native-image-crop-picker';
import { AxiosRequestConfig } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { devLogger } from '@utils';
import {
  defaultAxiosParams,
  defaultFormParams,
  axiosClient,
  axiosAuthClient,
} from '../client/axiosClient';
import { API_ENDPOINTS } from '../endpoints';
import { clearLoginDetails, setLoader, store } from '@store';
import { navigationRef } from '@navigation';

export type PostLocationPayload = {
  nurseID: string;
  lat: number;
  lang: number;
  email: string;
};

export type LoginPayload = {
  mobile: string;
  password: string;
  lat?: string | number;
  long?: string | number;
  // deviceType: string;
  // pushNotificationToken: string | null;
  // voip_push: string | null;
};

export type fcmTokenPayload = {
  fcm_token: string
  device_token: string
}

export type LoginResponse = {
  success?: boolean;
  token?: string;
  verify?: boolean;
};

export type LoginApiError = {
  success?: boolean;
  message?: string;
};

export type VerifyOtpPayload = {
  mobile: string;
  otp: string;
  // deviceType: string;
  // pushNotificationToken: string | null;
  // voip_push: string | null;
};

export type SignupPayload = {
  fullName: string;
  email: string;
  address: string;
  mobile: string;
  password: string;
  profileImage: Image | null;
  lat?: string | number;
  long?: string | number;
  geoLocation?: boolean;
  role?: string;
  userIds?: string[];
  token: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  newPassword: string;
  token: string;
};

export type UserProfileType = {
  profilePicture?: {
    savedName?: string;
  };
  _id: string;
  fullName: string;
  uniqueId: string | number;
  userIds: string[];
  createdBy: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
    _id: string;
  };
  email: string;
  mobile: number;
  role: string;
  isDeleted: boolean;
  geoLocation: boolean;
  status: boolean | string;
  lock: boolean;
  login_attempts: number;
  is_verified: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
  otp: string;
  otpExpires: string;
  address: string;
};

export type UpdateUserPayload = {
  fullName: string;
  email: string;
  address: string;
  mobile: string;
  profileImage?: { uri: string; name: string; type: string };
  lat?: string | number;
  long?: string | number;
  geoLocation?: string;
  role?: string;
  userIds?: string;
};

export type ChangePasswordPayload = {
  oldPassword: string;
  newPassword: string;
};

export type UploadImagePayload = Array<
  Image | { uri: string; name?: string; type?: string }
>;

export const usePostLocationMutation = () => {
  const postLocation = async (data: PostLocationPayload) => {
    try {
      const stringifiedData = qs.stringify(data);
      try {
        const response = await axiosClient.post(
          API_ENDPOINTS.GET_LAT_LONG,
          stringifiedData,
          defaultFormParams,
        );
        return response;
      } catch (error) {
        console.error('error', error);
      }
    } catch (error) {
      devLogger('🚀 ~ postLocation ~ error:', error);
    }
  };

  return useMutation({
    mutationFn: postLocation,
  });
};


export const useLoginMutation = () => {
  const login = async (data: LoginPayload) => {
    try {
      const payload = {
        ...data,
        type: 'mobile',
      };


      console.log(" API_ENDPOINTS.LOGIN", API_ENDPOINTS.LOGIN)
      const response = await axiosClient.post<LoginResponse>(
        API_ENDPOINTS.LOGIN,
        payload,
        defaultAxiosParams,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ login ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: login,
  });
};
export const useSendFcmToken = () => {
  const saveFcmToken = async (data: fcmTokenPayload) => {
    try {
      const payload = {
        ...data,
      };

      console.log(payload, 'saveFcmTokenpayload<><><><');
      const response = await axiosAuthClient.post(
        API_ENDPOINTS.FCM_TOKEN_SAVE,
        payload,
        defaultAxiosParams,
      );
      // console.log("savetokenres",response)
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ login ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: saveFcmToken,
  });
};

export const useVerifyOtpMutation = () => {
  const verifyOtp = async (data: VerifyOtpPayload) => {
    try {
      const response = await axiosClient.post(API_ENDPOINTS.VERIFY_OTP, data, defaultAxiosParams);
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ verifyOtp ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: verifyOtp,
  });
};

export const useForgotPasswordMutation = () => {
  const forgotPassword = async (payload: ForgotPasswordPayload) => {
    try {
      const response = await axiosClient.post(
        API_ENDPOINTS.FORGOT_PASSWORD,
        payload,
        defaultAxiosParams,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ forgotPassword ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: forgotPassword,
  });
};

export const useResetPasswordMutation = () => {
  const resetPassword = async (payload: ResetPasswordPayload) => {
    try {
      const response = await axiosClient.post(
        API_ENDPOINTS.RESET_PASSWORD,
        payload,
        defaultAxiosParams,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ resetPassword ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: resetPassword,
  });
};

export const useSignupMutation = () => {
  const signup = async (payload: SignupPayload) => {
    try {
      const formData = new FormData();
      for (const key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const element = payload[key as keyof SignupPayload];
          if (element?.toString() && key !== 'token' && key !== 'userIds') {
            formData.append(key, element);
          }
        }
      }
      (payload?.userIds ?? [])?.forEach((element: string) => {
        formData.append('userIds', element);
      });
      // return false;
      const headers: AxiosRequestConfig['headers'] = {
        ...defaultFormParams?.headers,
        Authorization: `Bearer ${payload?.token}`,
      };
      const response = await axiosClient.post(API_ENDPOINTS.UPDATE_USER, formData, { headers });
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ signup ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: signup,
  });
};

export const useGetUserInfoMutation = () => {
  const getUserInfo = async () => {
    try {
      const response = await axiosAuthClient.get(API_ENDPOINTS.GET_USER_BY_ID);
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ signup ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getUserInfo,
  });
};

export const useUpdateUserMutation = () => {
  const updateUser = async (payload: UpdateUserPayload) => {
    try {
      const formData = new FormData();
      for (const key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const element = payload[key as keyof UpdateUserPayload];
          if (element?.toString()) {
            formData.append(key, element);
          }
        }
      }
      const response = await axiosAuthClient.post(
        API_ENDPOINTS.UPDATE_USER,
        formData,
        defaultFormParams,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ updateUser ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: updateUser,
  });
};

export const useChangePasswordMutation = () => {
  const changePassword = async (data: ChangePasswordPayload) => {
    try {
      const response = await axiosAuthClient.post(
        API_ENDPOINTS.CHANGE_PASSWORD,
        data,
        defaultAxiosParams,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ changePassword ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: changePassword,
  });
};

export const useLogoutMutation = () => {
  const logout = async ({ id, userId }: { id: string; userId: string }) => {
    try {
      setLoader(true);
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected) {
        const response = await axiosAuthClient.get(`${API_ENDPOINTS.LOGOUT}?loginsessionid=${id}&userId=${userId}`, defaultAxiosParams);
        devLogger('🚀 ~ logout ~ response:', response);
        
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ logout ~ error:', error);
    }
    store.dispatch(clearLoginDetails());
    setLoader(false);
    navigationRef.reset({
      routes: [{ name: 'LoginScreen' }],
      index: 0,
    });
  };

  return useMutation({
    mutationFn: logout,
  });
  
};
export const useUploadImageMutation = () => {
  const uploadImage = async (files: UploadImagePayload, onProgress?: (percent: number) => void) => {
    try {
      const formData = new FormData();
      files?.forEach((file, index) => {
        if ('path' in file) {
          const extension = file?.mime?.split('/')?.[1] ?? 'jpg';
          formData.append('images', {
            uri: file.path,
            name: file.filename ?? `image-${index}.${extension}`,
            type: file.mime ?? 'image/jpeg',
          } as never);
        } else {
          formData.append('images', {
            uri: file.uri,
            name: file.name ?? `image-${index}.jpg`,
            type: file.type ?? 'image/jpeg',
          } as never);
        }
      });
      const response = await axiosAuthClient.post(
        API_ENDPOINTS.IMAGE_UPLOAD,
        formData,
        {
          ...defaultFormParams,
          onUploadProgress: (progressEvent: any) => {
            try {
              if (onProgress && progressEvent?.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percent);
              }
            } catch (e) {
              // ignore
            }
          },
        },
      );
      return response;
    } catch (error: any) {
      devLogger('🚀 ~ uploadImage ~ error:', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: uploadImage,
  });
};
