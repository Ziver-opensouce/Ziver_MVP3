import { styled } from '@mui/material/styles';
import Button from '@mui/material/Button';

export const ZiverButton = styled(Button)(({ theme }) => ({
  // Use the primary color from your theme.js file
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  padding: '12px 24px',
  fontWeight: 'bold',
  fontSize: '1rem',
  '&:hover': {
    // A slightly darker shade on hover for a nice effect
    backgroundColor: theme.palette.mode === 'dark' ? '#00B862' : '#007A41',
  },
}));

// You can export it as the default if you only have one button style
export default ZiverButton;

