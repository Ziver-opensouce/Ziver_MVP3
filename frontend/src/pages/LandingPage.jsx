import React from 'react';
import { Link } from 'react-router-dom';

// Simple placeholder styling to match your design's dark theme
const pageStyle = {
  background: '#0D0D0D',
  color: 'white',
  padding: '20px',
  fontFamily: 'sans-serif',
  textAlign: 'center',
};

const buttonStyle = {
  background: '#00E676',
  color: 'black',
  border: 'none',
  padding: '15px 30px',
  borderRadius: '8px',
  fontSize: '18px',
  fontWeight: 'bold',
  cursor: 'pointer',
  textDecoration: 'none',
};

const sectionStyle = {
  padding: '40px 20px',
  borderTop: '1px solid #2a2a2a',
};

function LandingPage() {
  return (
    <div style={pageStyle}>
      {/* Hero Section */}
      <section style={{ padding: '60px 20px' }}>
        <h1 style={{ color: '#00E676', fontSize: '2.5rem' }}>Where Value Greets Participation</h1>
        <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '40px' }}>
          Welcome to Ziver, the nexus where your digital engagement transcends into real-world value.
        </p>
        <Link to="/register" style={buttonStyle}>
          Embark on Your Ziver Journey
        </Link>
      </section>

      {/* "What is Ziver?" Section */}
      <section style={sectionStyle}>
        <h2>Discover Ziver</h2>
        <p style={{ maxWidth: '700px', margin: 'auto', color: '#aaa', lineHeight: '1.6' }}>
          Ziver is a pioneering multi-blockchain platform meticulously crafted to revolutionize user engagement through seamless, reward-based incentives. We are not just a platform; we are a burgeoning ecosystem where every interaction is an opportunity, and every participant is a valued member of a dynamic community. Our mission is to empower you, turning your time and engagement into tangible, appreciating assets.
        </p>
      </section>

      {/* Features Section */}
      <section style={sectionStyle}>
        <h2>The Ziver Ecosystem</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px', background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
            <h3>✨ ZP Mining</h3>
            <p style={{color: '#aaa'}}>Dive into Ziver's core by mining Ziver Points (ZP). It's simple, intuitive, and the first step to unlocking the full potential of your engagement. Upgrade your mining capabilities to accelerate your journey.</p>
          </div>
          <div style={{ flex: 1, minWidth: '250px', background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
            <h3>💼 Micro-Job Marketplace</h3>
            <p style={{color: '#aaa'}}>Connect, collaborate, and create. Our marketplace is a hub for opportunities, allowing you to complete tasks and get rewarded in TON, all under the security of our on-chain escrow system.</p>
          </div>
          <div style={{ flex: 1, minWidth: '250px', background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
            <h3>🏆 Social Capital & DeFi</h3>
            <p style={{color: '#aaa'}}>Your reputation, quantified. Build your on-chain Social Capital, gain influence, and unlock exclusive access to our integrated DeFi services, amplifying your earning potential.</p>
          </div>
        </div>
      </section>
      
      {/* Final Call to Action */}
      <section style={sectionStyle}>
        <h2>Your Journey Starts Now</h2>
        <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '40px' }}>
          Step into a world where your engagement is not just seen, but valued.
        </p>
        <Link to="/register" style={buttonStyle}>
          Create Account & Start Earning
        </Link>
      </section>
    </div>
  );
}

export default LandingPage;
