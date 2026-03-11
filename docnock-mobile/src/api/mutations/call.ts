import { useMutation } from '@tanstack/react-query';
import { devLogger } from '@utils';
import { axiosAuthClient } from '../client';
import { API_ENDPOINTS } from '../endpoints';

export type GenerateAgoraTokenPayload = {
  groupId: string;
  uid: string;
};

export const useGenerateAgoraTokenMutation = () => {
  const generateAgoraToken = async (data: GenerateAgoraTokenPayload) => {
    try {
      const { groupId, uid } = data;
      const response = await axiosAuthClient.get(
        `${API_ENDPOINTS.GENERATE_AGORA_TOKEN}?groupId=${groupId}&uid=${uid}`,
      );
      return response?.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      devLogger('🚀 ~ generateAgoraToken ~ error:', error.response);
      return error?.response ?? error;
    }
  };

  return useMutation({ mutationFn: generateAgoraToken });
};
