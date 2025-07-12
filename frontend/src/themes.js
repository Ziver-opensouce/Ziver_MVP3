import { createTheme } from '@mui/material/styles';

// Your primary dark theme
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E676', // Ziver Green
      contrastText: '#000000', // Black text on green buttons
    },
    background: {
      default: '#0D0D0D',
      paper: '#1e1e1e',
    },
  },
});

// A professional light theme alternative
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#009650', // A slightly darker green for better contrast on a light background
      contrastText: '#ffffff', // White text on green buttons
    },
    background: {
      default: '#f7f7f7', // Off-white background
      paper: '#ffffff',
    },
  },
});
