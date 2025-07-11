import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    // User is not authenticated, redirect to login page
    return <Navigate to="/login" />;
  }

  // User is authenticated, show the page
  return children;
}

export default ProtectedRoute;
