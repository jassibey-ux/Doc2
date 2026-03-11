import { pick, DocumentPickerOptions } from '@react-native-documents/picker';
import { devLogger } from '@utils';

export const useDocumentPicker = () => {
  const pickDocument = async (pickerOptions: DocumentPickerOptions = {}) => {
    try {
      const result = await pick({
        allowMultiSelection: true,
        mode: 'import',
        ...pickerOptions,
      });
      devLogger('🚀 ~ pickDocument ~ result:', result);
      return result;
    } catch (error) {
      devLogger('🚀 ~ pickDocument ~ error:', error);
      return false;
    }
  };

  return {
    pickDocument,
  };
};
