import { keepPreviousData, QueryFunction, useInfiniteQuery } from '@tanstack/react-query';
import { axiosAuthClient } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import { decryptData } from '@utils';
import { PageType } from './users';
import { UserProfileType } from '../mutations';

export type GetGroupListQueryProps = {
  page?: number;
  limit?: number;
  userId?: string;
  refreshingKey?: string;
  searchKey?: string;
};

export type GroupListItemUserType = {
  profilePicture?: {
    originalName?: string;
    savedName?: string;
  };
  userid?: string;
  name?: string;
  status?: boolean | string;
  _id?: string;
};

export type GroupUserIdType = Partial<GroupListItemUserType> & Partial<UserProfileType>;

export type GroupListItemType = {
  groupId?: string;
  title?: string;
  image?: string;
  latestMessage?: string;
  timestamp?: number;
  userIds?: Partial<GroupListItemUserType>[];
  group?: boolean;
  userid?: string;
  names?: string;
  actualgroupmemberid?: GroupUserIdType[];
  count?:number;
};

export type GroupPageType = {
  data?: GroupListItemType[];
  pagination?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPrevPage?: boolean;
  };
};


export const useGetGroupListQuery = ({
  limit = 20,
  userId = '',
  refreshingKey = '',
  searchKey = '',
}: GetGroupListQueryProps) => {
  const fetchGroups: QueryFunction = async props => {
    const params = {
      page: props?.pageParam ?? 1,
      limit,
      userId: userId,
      name: searchKey,
    };
    const response = await axiosAuthClient.get(API_ENDPOINTS.GROUP_LIST, {
      params,
    });
    if (response?.data?.success) {
      const data = await decryptData(response?.data?.encryptDatagroupdata);
      const pagination: GroupPageType = response?.data?.pagination;
      return { data: [...(data ?? [])], pagination };
    }
    return null;
  };

  return useInfiniteQuery({
    queryKey: [API_ENDPOINTS.GROUP_LIST, limit, userId, refreshingKey, searchKey],
    queryFn: fetchGroups,
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage, pages) => {
      const lastObj: GroupPageType = { ...(lastPage ?? {}) };
      const dataLength: number = Number(
        pages?.reduce((pre, cur) => (Number(pre) ?? 0) + ((cur as PageType)?.data?.length ?? 0), 0),
      );
      if (dataLength < (lastObj?.pagination?.total ?? 0) && lastObj?.data?.length !== 0) {
        return ((lastObj?.pagination?.page ?? 0) + 1) as never;
      }
    },
    initialPageParam: 1 as never,
  });
};
