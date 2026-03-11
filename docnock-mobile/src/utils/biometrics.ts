import ReactNativeBiometrics from 'react-native-biometrics';
import { Platform } from 'react-native';

// Initialize the biometrics library
const rnBiometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true, // Allow fallback to device PIN/pattern/password
});

/**
 * Check if biometric authentication is available on the device
 * @returns {Promise<Object>} Object containing isBiometricsAvailable and biometryType
 */
export const checkBiometricsAvailability = async () => {
  try {
    const { available, biometryType } = await rnBiometrics.isSensorAvailable();

    // Get the friendly name of the biometry type
    let biometryTypeName = 'None';
    if (available) {
      if (biometryType === 'TouchID') {
        biometryTypeName = 'Touch ID';
      } else if (biometryType === 'FaceID') {
        biometryTypeName = 'Face ID';
      } else if (biometryType === 'Biometrics') {
        biometryTypeName = Platform.OS === 'android' ? 'Fingerprint' : 'Biometrics';
      } else {
        biometryTypeName = 'Biometrics';
      }
    }

    return {
      isBiometricsAvailable: available,
      biometryType,
      biometryTypeName,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Error checking biometrics availability:', error);
    return {
      isBiometricsAvailable: false,
      biometryType: null,
      biometryTypeName: 'None',
      error: error.message,
    };
  }
};

/**
 * Authenticate the user with device biometrics (fingerprint, Face ID, etc.)
 * This method only checks if the user successfully authenticates with
 * the enrolled biometrics on their device - no server verification needed.
 *
 * @param {string} promptMessage - Message to display to the user
 * @returns {Promise<Object>} Object containing success status
 */
export const authenticateWithBiometrics = async (promptMessage: string) => {
  try {
    // First check if biometrics is available
    const { isBiometricsAvailable, biometryTypeName } = await checkBiometricsAvailability();

    if (!isBiometricsAvailable) {
      return {
        success: false,
        error: `${biometryTypeName} is not available on this device`,
      };
    }

    // Use simple prompt for authentication
    const { success } = await rnBiometrics.simplePrompt({
      promptMessage: promptMessage || `Verify your identity with ${biometryTypeName}`,
      cancelButtonText: 'Cancel',
    });

    return {
      success,
      // If authentication was successful, you can store this in AsyncStorage
      // to remember that the user has authenticated during this session
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Error during biometric authentication:', error);
    return {
      success: false,
      error: error.message || 'Authentication failed',
    };
  }
};
