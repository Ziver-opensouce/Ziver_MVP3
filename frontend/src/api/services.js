import axiosInstance from './axiosInstance';

// --- Authentication Services ---

export const loginUser = async (loginData) => {
  // Creating a URLSearchParams object because the /token endpoint expects form data
  const formData = new URLSearchParams();
  formData.append('username', loginData.username);
  formData.append('password', loginData.password);
  if (loginData.two_fa_code) {
    // This is a custom way to handle 2FA with form data; your backend needs to expect it
    // Or adjust the backend to accept JSON for this endpoint
  }
  
  try {
    const response = await axiosInstance.post('/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    throw error;
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await axiosInstance.post('/register', userData);
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
    throw error;
  }
};

// --- User & Profile Services ---

export const getMyProfile = async () => {
  try {
    const response = await axiosInstance.get('/users/me');
    return response.data;
  } catch (error) {
    console.error('Failed to get profile:', error.response?.data || error.message);
    throw error;
  }
};

export const linkWallet = async (walletAddress) => {
    try {
        const response = await axiosInstance.post('/users/me/link-wallet', { wallet_address: walletAddress });
        return response.data;
    } catch (error) {
        console.error('Failed to link wallet:', error.response?.data || error.message);
        throw error;
    }
};

// --- Mining Services ---

export const startMiningCycle = async () => {
  try {
    const response = await axiosInstance.post('/mining/start');
    return response.data;
  } catch (error) {
    console.error('Failed to start mining:', error.response?.data || error.message);
    throw error;
  }
};

export const claimMinedZp = async () => {
  try {
    const response = await axiosInstance.post('/mining/claim');
    return response.data;
  } catch (error) {
    console.error('Failed to claim ZP:', error.response?.data || error.message);
    throw error;
  }
};

export const upgradeMiner = async (upgradeData) => {
  try {
    // upgradeData should be an object like { upgrade_type: "mining_speed", level: 1 }
    const response = await axiosInstance.post('/mining/upgrade', upgradeData);
    return response.data;
  } catch (error) {
    console.error('Failed to upgrade miner:', error.response?.data || error.message);
    throw error;
  }
};

// --- Task Services ---

export const getAvailableTasks = async () => {
    try {
        const response = await axiosInstance.get('/tasks');
        return response.data;
    } catch (error) {
        console.error('Failed to fetch tasks:', error.response?.data || error.message);
        throw error;
    }
};

export const completeTask = async (taskId) => {
    try {
        const response = await axiosInstance.post(`/tasks/${taskId}/complete`);
        return response.data;
    } catch (error) {
        console.error('Failed to complete task:', error.response?.data || error.message);
        throw error;
    }
};
