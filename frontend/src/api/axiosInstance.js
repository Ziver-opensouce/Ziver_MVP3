import axios from 'axios';

// IMPORTANT: Replace this with your actual backend URL when you deploy.
// For local development, it will be your FastAPI server's address.
const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// We can add more configurations here later, like automatically adding
// the user's authentication token to every request.

export default axiosInstance;

