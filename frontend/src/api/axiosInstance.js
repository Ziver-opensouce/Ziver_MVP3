import axios from 'axios';

const API_BASE_URL = 'https://ziver-mvp-backend.onrender.com ';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// This is the interceptor. It runs before every request is sent.
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ziver_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosInstance;
