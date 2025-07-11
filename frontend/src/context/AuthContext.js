import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser as loginApiService } from '../api/services'; // Renaming for clarity

// 1. Create the context
const AuthContext = createContext(null);

// 2. Create the provider component
export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null); // We can store user profile here later
  const [loading, setLoading] = useState(true);

  // Check for a token in local storage on initial app load
  useEffect(() => {
    const storedToken = localStorage.getItem('ziver_token');
    if (storedToken) {
      setToken(storedToken);
      // TODO: Fetch user profile using the token
    }
    setLoading(false);
  }, []);

  const login = async (loginData) => {
    const response = await loginApiService(loginData);
    if (response.access_token) {
      setToken(response.access_token);
      localStorage.setItem('ziver_token', response.access_token);
      // TODO: Fetch and set user profile
    }
    return response;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('ziver_token');
  };

  const value = {
    token,
    user,
    login,
    logout,
    isAuthenticated: !!token,
  };

  // Don't render the app until we've checked for a token
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// 3. Create a custom hook to use the context easily
export function useAuth() {
  return useContext(AuthContext);
}

