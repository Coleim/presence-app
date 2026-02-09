// Note: @testing-library/jest-native is deprecated, using built-in matchers from react-native

// Mock Expo vector icons
jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
  MaterialIcons: 'MaterialIcons',
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock Supabase
jest.mock('./lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        limit: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ 
        data: { session: { user: { id: 'test-user-id' } } }, 
        error: null 
      })),
      getUser: jest.fn(() => Promise.resolve({ 
        data: { user: { id: 'test-user-id', email: 'test@example.com' } }, 
        error: null 
      })),
      signInWithPassword: jest.fn(() => Promise.resolve({ 
        data: { user: { id: 'test-user-id' }, session: {} }, 
        error: null 
      })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  },
}));

// Mock expo modules
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'success', url: '' })),
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
  maybeCompleteAuthSession: jest.fn(() => ({ type: 'success' })),
  dismissBrowser: jest.fn(),
}));

jest.mock('expo-auth-session/build/QueryParams', () => ({
  getQueryParams: jest.fn(() => ({})),
}));

jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeListener: jest.fn(),
    emit: jest.fn(),
  })),
  NativeModulesProxy: {},
  requireNativeViewManager: jest.fn(),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ idToken: 'mock-token' })),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

// Mock React Navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  }),
  useRoute: () => ({
    params: {},
  }),
}));

// Silence console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
