import { createTheme } from '@mui/material/styles';

// This theme defines your app's color palette (dark mode with Ziver green)
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E676', // Ziver Green
      contrastText: '#000000', // Black text on green buttons
    },
    background: {
      default: '#0D0D0D', // Main background
      paper: '#1e1e1e',   // Card background
    },
    text: {
      primary: '#ffffff',
    },
  },
});
