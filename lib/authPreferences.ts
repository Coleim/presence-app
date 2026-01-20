import AsyncStorage from '@react-native-async-storage/async-storage';

const NEVER_ASK_AGAIN_KEY = '@presence_app:never_ask_login';

/**
 * Sauvegarde la préférence "ne plus me demander de me connecter"
 */
export const setNeverAskAgain = async (value: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(NEVER_ASK_AGAIN_KEY, value.toString());
  } catch (error) {
    console.error('Error saving never ask again preference:', error);
  }
};

/**
 * Récupère la préférence "ne plus me demander de me connecter"
 */
export const getNeverAskAgain = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(NEVER_ASK_AGAIN_KEY);
    return value === 'true';
  } catch (error) {
    console.error('Error reading never ask again preference:', error);
    return false;
  }
};

/**
 * Réinitialise la préférence "ne plus me demander de me connecter"
 * Utile si l'utilisateur veut se connecter plus tard
 */
export const resetNeverAskAgain = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(NEVER_ASK_AGAIN_KEY);
  } catch (error) {
    console.error('Error resetting never ask again preference:', error);
  }
};
