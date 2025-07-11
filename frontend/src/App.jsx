import React from 'react';
import { Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MiningPage from './pages/MiningPage';

function App() {
  return (
    <Routes>
      {/* Set the mining page as the default homepage for now */}
      <Route path="/" element={<MiningPage />} /> 
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* We will add more routes for Tasks, Jobs, etc. here later */}
    </Routes>
  );
}

export default App;
