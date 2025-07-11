import React from 'react';
import { NavLink } from 'react-router-dom';
import MiningIcon from '@mui/icons-material/Whatshot'; // Example Icon
import TasksIcon from '@mui/icons-material/CheckCircle';
import JobsIcon from '@mui/icons-material/Work';
import ProfileIcon from '@mui/icons-material/Person';

// Basic styling for the navigation bar
const navStyle = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  height: '60px',
  background: '#1e1e1e',
  borderTop: '1px solid #333',
};

const linkStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textDecoration: 'none',
  color: '#888', // Inactive color
  fontSize: '12px'
};

// This style will be applied to the active link
const activeLinkStyle = {
  color: '#00E676', // Active color (Ziver Green)
};

function BottomNav() {
  return (
    <nav style={navStyle}>
      <NavLink 
        to="/app/mining" 
        style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeLinkStyle : {}) })}
      >
        <MiningIcon />
        <span>Mine</span>
      </NavLink>
      <NavLink 
        to="/app/tasks" 
        style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeLinkStyle : {}) })}
      >
        <TasksIcon />
        <span>Tasks</span>
      </NavLink>
      <NavLink 
        to="/app/jobs" 
        style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeLinkStyle : {}) })}
      >
        <JobsIcon />
        <span>Jobs</span>
      </NavLink>
      <NavLink 
        to="/app/profile" 
        style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeLinkStyle : {}) })}
      >
        <ProfileIcon />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

export default BottomNav;

