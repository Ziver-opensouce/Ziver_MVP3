import React, { useState } from 'react';
import { loginUser } from '../api/services';

// We are using placeholder components for now. We will install MUI next.
// For now, these will just look like standard HTML elements.
const Container = ({ children }) => <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>{children}</div>;
const TextField = (props) => <input {...props} style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box' }} />;
const Button = (props) => <button {...props} style={{ width: '100%', padding: '12px', background: '#00E676', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>{props.children}</button>;
const Typography = ({ children, variant }) => {
    if (variant === 'h4') return <h2 style={{ textAlign: 'center', color: '#00E676' }}>{children}</h2>;
    return <p>{children}</p>;
};

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFaCode, setTwoFaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const loginData = {
      username: email, // Your backend expects 'username' for the form data
      password: password,
      two_fa_code: twoFaCode || null,
    };

    try {
      const data = await loginUser(loginData);
      // TODO: Handle successful login
      // We will add logic here later to save the token and redirect the user.
      alert('Login successful! Token: ' + data.access_token);
    } catch (err) {
      setError(err.response?.data?.detail || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Typography variant="h4">Login to Ziver</Typography>
      <form onSubmit={handleSubmit}>
        <TextField
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          type="text"
          placeholder="2FA Code (if enabled)"
          value={twoFaCode}
          onChange={(e) => setTwoFaCode(e.target.value)}
        />
        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </Button>
      </form>
    </Container>
  );
}

export default LoginPage;

