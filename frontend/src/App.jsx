import React from 'react';
import { Route, Routes } from 'react-router-dom';

// Import all the pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MiningPage from './pages/MiningPage';

// Import the layout and protection components
import ProtectedRoute from './components/layout/ProtectedRoute';
import MainAppLayout from './components/layout/MainAppLayout'; // We will create this next

function App() {
  return (
    <Routes>
      {/* === Public Routes === */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* === Protected Application Routes === */}
      {/* All app routes will be nested under /app and will have the main layout */}
      <Route 
        path="/app" 
        element={
          <ProtectedRoute>
            <MainAppLayout />
          </ProtectedRoute>
        }
      >
        {/* The "index" route is the default page for /app */}
        <Route index element={<MiningPage />} /> 
        <Route path="mining" element={<MiningPage />} />
        
        {/* We will create these page components soon */}
        {/* <Route path="tasks" element={<TasksPage />} /> */}
        {/* <Route path="jobs" element={<MicroJobsPage />} /> */}
        {/* <Route path="profile" element={<ProfilePage />} /> */}
      </Route>
      
    </Routes>
  );
}

export default App;
