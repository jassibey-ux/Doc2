import { keepPreviousData, QueryFunction, useInfiniteQuery } from '@tanstack/react-query';
import { axiosAuthClient } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import { decryptData } from '@utils';
import { UserProfileType } from '../mutations';
import { useAppSelector } from '@hooks';

export type PageType = {
  data?: GetUserListUserType[];
  totalRecords?: number;
  page?: number;
};

export type GetUserListQueryProps = {
  page?: number;
  limit?: number;
  role: string;
  searchKey?: string;
  userId?: string[];
  appendId?: string;
};

export type GetUserListUserType = Omit<
  UserProfileType,
  | 'createdBy'
  | 'lock'
  | 'login_attempts'
  | 'is_verified'
  | 'createdAt'
  | 'updatedAt'
  | '__v'
  | 'otp'
  | 'otpExpires'
> & {
  userNames?: string[];
  address?: string;
  screenName?: string;
};

export const useGetUserListQuery = ({
  limit = 10,
  role = 'physician',
  searchKey = '',
  userId = [],
  appendId = '',
}: GetUserListQueryProps) => {
  const userProfile = useAppSelector(({ auth }) => auth.loginDetails?.profile);

  const userIds = userId?.length ? userId : userProfile?.userIds;
  const userIdParam = JSON.stringify(userIds);

  const fetchUsers: QueryFunction = async props => {
    const params = {
      page: props?.pageParam ?? 1,
      limit,
      role,
      searchKey,
      userId: userIds && userIds?.length ? userIdParam : '',
      status: '',
    };
    const response = await axiosAuthClient.get(API_ENDPOINTS.LIST_USERS, {
      params,
    });
    if (response?.data?.success) {
      const data = await decryptData(response?.data?.encryptDatauserdata);
      const totalRecords = response?.data?.totalRecords;
      return { data: [...(data ?? [])], totalRecords, page: props?.pageParam };
    }
    return null;
  };

  return useInfiniteQuery({
    queryKey: [role, searchKey, appendId, userIdParam, userId],
    queryFn: fetchUsers,
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage, pages) => {
      const lastObj: PageType = { ...(lastPage ?? {}) };
      const dataLength: number = Number(
        pages?.reduce((pre, cur) => (Number(pre) ?? 0) + ((cur as PageType)?.data?.length ?? 0), 0),
      );
      if (dataLength < (lastObj?.totalRecords ?? 0) && lastObj?.data?.length !== 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((lastObj?.page ?? 0) + 1) as any;
      }
    },
    initialPageParam: 1 as never,
  });
};
