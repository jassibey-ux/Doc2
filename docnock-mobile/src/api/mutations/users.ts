import { useMutation } from '@tanstack/react-query';
import { devLogger } from '@utils';
import { axiosAuthClient, axiosClient, defaultAxiosParams } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import { AxiosRequestConfig } from 'axios';

export type GetUserByIdPayload = {
  token: string;
  userId?: string;
};

export type readNotificationCount = {
  ids: any
}

export const useGetUserByIdMutation = () => {
  const getUserById = async (data: GetUserByIdPayload) => {
    try {
      const headers: AxiosRequestConfig['headers'] = {
        Authorization: `Bearer ${data?.token}`,
      };
      const response = await axiosClient.get<GetUserByIdPayload>(API_ENDPOINTS.GET_USER_BY_ID, {
        headers,
      });
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ getUserById ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getUserById,
  });
};

export const useGetUserPermissions = () => {
  const getPermissionByUserId = async () => {
    try {
      const response = await axiosAuthClient.get<GetUserByIdPayload>(
        API_ENDPOINTS.GET_PERMISSION_BY_USER_ID,
      );
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ getPermissionByUserId ~ error:', error);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getPermissionByUserId,
  });
};


export const useGetUserNotificationList = () => {
  const getUserNotificationList = async ({ limit, page }: { limit: number; page: number }) => {
    try {
      const response = await axiosAuthClient.get(`${API_ENDPOINTS.NOTIFICATION_LIST}?limit=${limit}&page=${page}`);
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ signup ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getUserNotificationList,
  });
};
export const useGetUserUnreadCount = () => {
  const getUserNotificationUnreadCount = async () => {
    try {
      const response = await axiosAuthClient.get(API_ENDPOINTS.NOTIFICATION_UNREAD_COUNT);
      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ signup ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getUserNotificationUnreadCount,
  });
};


export const useReadNotification = () => {
  const readNotification = async (data: readNotificationCount) => {
    try {
      const payload = {
        ...data,
      };
      const response = await axiosAuthClient.post(
        API_ENDPOINTS.READ_NOTIFICATION,
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
    mutationFn: readNotification,
  });
};