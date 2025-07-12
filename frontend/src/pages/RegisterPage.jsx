import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../api/services';

// Import MUI components
import { Box, Button, Container, TextField, Typography, CircularProgress, Alert } from '@mui/material';

function RegisterPage() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: '',
        telegram_handle: '',
        twitter_handle: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await registerUser(formData);
            alert('Registration successful! Please login.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.detail || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <Typography component="h1" variant="h4" color="primary" gutterBottom>
                    Create Your Ziver Account
                </Typography>
                <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="full_name"
                        label="Full Name"
                        name="full_name"
                        autoComplete="name"
                        autoFocus
                        onChange={handleChange}
                    />
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="email"
                        label="Email Address"
                        name="email"
                        autoComplete="email"
                        onChange={handleChange}
                    />
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Password"
                        type="password"
                        id="password"
                        autoComplete="new-password"
                        onChange={handleChange}
                    />
                    <TextField
                        margin="normal"
                        fullWidth
                        name="telegram_handle"
                        label="Telegram Handle (optional)"
                        id="telegram_handle"
                        onChange={handleChange}
                    />
                    <TextField
                        margin="normal"
                        fullWidth
                        name="twitter_handle"
                        label="Twitter Handle (optional)"
                        id="twitter_handle"
                        onChange={handleChange}
                    />
                    
                    {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        color="primary"
                        disabled={loading}
                        sx={{ mt: 3, mb: 2, py: 1.5, fontWeight: 'bold' }}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Register'}
                    </Button>
                    <Typography variant="body2" align="center">
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#00E676' }}>
                            Sign In
                        </Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
}

export default RegisterPage;
