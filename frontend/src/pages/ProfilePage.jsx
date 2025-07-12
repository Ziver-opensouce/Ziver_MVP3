import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getMyProfile } from '../api/services';

// Import MUI components
import {
  Box,
  Button,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';

function ProfilePage() {
  const { logout, token } = useAuth();
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        setError("Not authenticated.");
        return;
      }
      try {
        setLoading(true);
        const data = await getMyProfile();
        setProfileData(data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to fetch profile data.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]); // The effect runs when the component loads or the token changes

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const renderProfile = () => {
    if (loading) {
      return <CircularProgress color="primary" sx={{ mt: 4 }} />;
    }
    
    if (error) {
      return <Alert severity="error" sx={{ mt: 4, width: '100%' }}>{error}</Alert>;
    }

    if (profileData) {
      return (
        <Paper elevation={3} sx={{ mt: 4, p: 3, width: '100%' }}>
          <List>
            <ListItem>
              <ListItemText primary="Full Name" secondary={profileData.full_name || 'Not set'} />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Email" secondary={profileData.email} />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Telegram Handle" secondary={profileData.telegram_handle || 'Not set'} />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="ZP Balance" secondary={profileData.zp_balance.toLocaleString()} />
            </ListItem>
            <Divider />
             <ListItem>
              <ListItemText primary="Social Capital Score" secondary={profileData.social_capital_score.toLocaleString()} />
            </ListItem>
          </List>
        </Paper>
      );
    }
    
    return null;
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h4" color="primary" gutterBottom>
          My Profile
        </Typography>
        
        {renderProfile()}
        
        <Button
          onClick={handleLogout}
          fullWidth
          variant="contained"
          sx={{ mt: 4, mb: 2, py: 1.5, fontWeight: 'bold', backgroundColor: '#E60000', '&:hover': { backgroundColor: '#c40000'} }}
        >
          Logout
        </Button>
      </Box>
    </Container>
  );
}

export default ProfilePage;
