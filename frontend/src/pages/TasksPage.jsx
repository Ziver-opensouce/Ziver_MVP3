import React from 'react';

// Using placeholder styles for consistency
const containerStyle = {
  padding: '20px',
  textAlign: 'center',
  color: 'white'
};
const headerStyle = {
  color: '#00E676'
};

function TasksPage() {
  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>Tasks</h1>
      <p>Complete simple tasks to earn bonus ZP.</p>
      <p style={{ marginTop: '50px', color: '#aaa' }}>
        Feature coming soon...
      </p>
    </div>
  );
}

export default TasksPage;

