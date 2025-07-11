import React, { useState } from 'react';
import { registerUser } from '../api/services';
import { useNavigate } from 'react-router-dom';

// Using the same placeholder components for now
const Container = ({ children }) => <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>{children}</div>;
const TextField = (props) => <input {...props} style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box' }} />;
const Button = (props) => <button {...props} style={{ width: '100%', padding: '12px', background: '#00E676', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>{props.children}</button>;
const Typography = ({ children, variant }) => <h2 style={{ textAlign: 'center', color: '#00E676' }}>{children}</h2>;


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
            navigate('/login'); // Redirect to login page after successful registration
        } catch (err) {
            setError(err.response?.data?.detail || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container>
            <Typography variant="h4">Create Your Ziver Account</Typography>
            <form onSubmit={handleSubmit}>
                <TextField name="full_name" type="text" placeholder="Full Name" onChange={handleChange} required />
                <TextField name="email" type="email" placeholder="Email" onChange={handleChange} required />
                <TextField name="password" type="password" placeholder="Password (min 8 characters)" onChange={handleChange} required />
                <TextField name="telegram_handle" type="text" placeholder="Telegram Handle (optional)" onChange={handleChange} />
                <TextField name="twitter_handle" type="text" placeholder="Twitter Handle (optional)" onChange={handleChange} />

                {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

                <Button type="submit" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Register'}
                </Button>
            </form>
        </Container>
    );
}

export default RegisterPage;

