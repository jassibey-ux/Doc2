import { store } from '@store';

export const checkIsLightTheme = () => {
  return store.getState().theme.theme === 'light';
};
