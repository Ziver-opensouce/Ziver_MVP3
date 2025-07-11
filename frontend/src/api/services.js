import axiosInstance from './axiosInstance';

// --- Authentication Services ---

export const loginUser = async (loginData) => {
  try {
    const response = await axiosInstance.post('/token', loginData);
    // In a real app, you would save the token to local storage here
    console.log('Login successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    throw error;
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await axiosInstance.post('/register', userData);
    console.log('Registration successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
    throw error;
  }
};

// --- User & Mining Services (examples) ---
// We will build these out more later

export const getMyProfile = async (token) => {
  // Example of how to send a request with an auth token
  try {
    const response = await axiosInstance.get('/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Failed to get profile:', error.response?.data || error.message);
    throw error;
  }
};

export const startMiningCycle = async (token) => {
  // Placeholder for starting the mining cycle
  console.log("Pretending to send 'start mining' request...");
  // const response = await axiosInstance.post('/mining/start', {}, { headers: { Authorization: `Bearer ${token}` } });
  // return response.data;
};

// Add more functions here for tasks, micro-jobs, etc. as we build them.

