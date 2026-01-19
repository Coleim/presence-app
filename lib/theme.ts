// Design System Theme
export const theme = {
  // Colors
  colors: {
    // Brand / Primary
    primary: {
      900: '#0F2A44', // header
      700: '#1F4E79',
      500: '#2F6DB3', // buttons
    },
    // Neutrals
    bg: '#F6F7F9',
    surface: '#FFFFFF',
    border: '#E2E5EA',
    text: {
      primary: '#1C1F24',
      secondary: '#6B7280',
    },
    // States
    success: '#2E9B50',
    successBg: '#EAF6EE',
    danger: '#D64545',
    dangerBg: '#FBECEC',
    // Disabled
    disabled: '#C9CDD3',
  },

  // Spacing (8px system)
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 48,
  },

  // Typography
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 22,
    },
    fontWeight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
  },

  // Border radius
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 12,
  },

  // Component styles
  components: {
    attendanceList: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E2E5EA',
      overflow: 'hidden',
    },
    attendanceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: '#E2E5EA',
    },
    attendanceItemPresent: {
      backgroundColor: '#EAF6EE',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: '#E2E5EA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: '#2E9B50',
      borderColor: '#2E9B50',
    },
    buttonPrimary: {
      backgroundColor: '#2F6DB3',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: '#E2E5EA',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attendanceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E2E5EA',
    },
  },
} as const;

export type Theme = typeof theme;