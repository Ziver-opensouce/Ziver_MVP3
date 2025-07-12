import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getMyProfile, linkWallet } from '../api/services';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';

// ... MUI imports
import { Box, Button, Container, Typography, CircularProgress, Alert, Paper, List, ListItem, ListItemText, Divider } from '@mui/material';


function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Get the connected wallet address from the TON Connect hook
  const userFriendlyAddress = useTonAddress();

  useEffect(() => {
    const fetchProfile = async () => {
      // ... same fetching logic as before
    };
    fetchProfile();
  }, []);

  // New effect to link the wallet to the backend when it connects
  useEffect(() => {
    if (userFriendlyAddress && profileData && !profileData.ton_wallet_address) {
      const linkUserWallet = async () => {
        try {
          await linkWallet(userFriendlyAddress);
          alert("Wallet linked successfully!");
          // Optionally refetch profile to show the linked address from DB
        } catch (err) {
          alert(err.response?.data?.detail || "Failed to link wallet.");
        }
      };
      linkUserWallet();
    }
  }, [userFriendlyAddress, profileData]);


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderProfile = () => {
    // ... same rendering logic as before
    // You can add a new ListItem to display `profileData.ton_wallet_address`
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h4" color="primary" gutterBottom>
          My Profile
        </Typography>

        {/* TON Connect Button will be rendered here */}
        <Box sx={{ my: 2 }}>
          <TonConnectButton />
        </Box>
        
        {renderProfile()}
        
        <Button
          onClick={handleLogout}
          fullWidth
          variant="contained"
          // ... same styling as before
        >
          Logout
        </Button>
      </Box>
    </Container>
  );
}

export default ProfilePage;
