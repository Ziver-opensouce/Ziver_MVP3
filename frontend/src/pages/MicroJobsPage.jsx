import React from 'react';

// Using placeholder styles
const containerStyle = {
  padding: '20px',
  textAlign: 'center',
  color: 'white'
};
const headerStyle = {
  color: '#00E676'
};

function MicroJobsPage() {
  return (
    <div style={containerStyle}>
      <h1 style={headerStyle}>Job Marketplace</h1>
      <p>Complete jobs for TON rewards, secured by our on-chain escrow.</p>
      <p style={{ marginTop: '50px', color: '#aaa' }}>
        Feature coming soon...
      </p>
    </div>
  );
}

export default MicroJobsPage;

