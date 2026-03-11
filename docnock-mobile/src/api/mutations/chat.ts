import { devLogger, getImageObjectFromUrl } from '@utils';
import { axiosAuthClient, defaultAxiosParams, defaultFormParams } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import { useMutation } from '@tanstack/react-query';
import { GroupDataType } from '@navigation';

export interface CreateGroupUser {
  userid: string;
  name: string;
  profilePicture: unknown;
  status: boolean;
}

export interface CreateGroupPayload {
  groupName: string;
  userlist?: CreateGroupUser[];
  senderID?: string;
  grouppicture?: string;
  isEdit?: boolean;
  groupId?: string;
}

export interface CreateGroupResponse {
  success: boolean;
  message: string;
  data: Partial<GroupDataType>;
}

export const useCreateUpdateGroupMutation = () => {
  const createOrUpdateGroup = async (data: CreateGroupPayload) => {
    try {
      const { groupName, grouppicture, senderID, userlist, isEdit, groupId } = data;
      const formdata = new FormData();

      formdata.append('groupName', groupName);
      grouppicture && formdata.append('profileImage', getImageObjectFromUrl(grouppicture));

      if (!isEdit) {
        formdata.append('userlist', JSON.stringify(userlist));
        formdata.append('senderID', senderID);
      } else {
        formdata.append('groupId', groupId);
      }
      const response = await axiosAuthClient.post<CreateGroupResponse>(
        isEdit ? API_ENDPOINTS.UPDATE_GROUP_NAME : API_ENDPOINTS.CREATE_GROUP,
        formdata,
        {
          ...defaultFormParams,
          validateStatus: function (status) {
            return status <= 400; // ! DON'T REMOVE OR CHANGE THIS LINE ELSE IT WOULD BREAK DIRECT ONE TO ONE CHAT FLOW CREATION IN NurseCard.tsx
          },
        },
      );

      devLogger('🚀 ~ createOrUpdateGroup ~ response:', response);
      return response.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ createOrUpdateGroup ~ error:', error.response);
      return error?.response ?? error;
    }
  };

  return useMutation({ mutationFn: createOrUpdateGroup });
};

export const useUpdateGroupMemberMutation = () => {
  const updateGroupMembers = async (data: any) => {
    try {
      const response = await axiosAuthClient.post<any>(
        API_ENDPOINTS.UPDATE_GROUP_MEMBERS,
        data,
        defaultAxiosParams,
      );

      devLogger('🚀 ~ updateGroupMember ~ response:', response);
      return response?.data;
    } catch (error: any) {
      devLogger('🚀 ~ updateGroupMember ~ error:', error.response);
      return error?.response ?? error;
    }
  };

  return useMutation({ mutationFn: updateGroupMembers });
};


export const useExportChat = (id: string, locale: string, timezone: string) => {
  const getExportChatInfo = async () => {
    try {
      const response = await axiosAuthClient.get(`${API_ENDPOINTS.EXPORT_CHATS}/${id}?locale=${locale}&timezone=${timezone}`);
      console.log('🚀 ~ export ~ response:', response);
      return response;
    } catch (error: any) {
      devLogger('🚀 ~ export ~ error  :', error?.response?.data);
      return error?.response ?? error;
    }
  };

  return useMutation({
    mutationFn: getExportChatInfo,
  });
};