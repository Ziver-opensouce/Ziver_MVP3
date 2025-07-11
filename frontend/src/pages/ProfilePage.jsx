import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Using placeholder styles
const containerStyle = {
  padding: '20px',
  textAlign: 'center',
  color: 'white'
};
const headerStyle = {
  color: '#00E676'
};
const buttonStyle = {
  background: '#E60000', // A red for logout
  color: 'white',
  border: 'none',
  padding: '15px 30px',
  borderRadius: '8px',
  fontSize: '18px',
  fontWeight: 'bold',
  cursor: 'pointer',
  marginTop: '30px'
};

function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login'); // Redirect to login page after logout
  };

  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>My Profile</h1>
      <p>Link your TON wallet and manage your account.</p>
      
      {/* We will display user info here later */}

      <button onClick={handleLogout} style={buttonStyle}>
        Logout
      </button>
    </div>
  );
}

export default ProfilePage;

