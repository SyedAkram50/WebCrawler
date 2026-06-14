import axios from 'axios';

const RAW_API = import.meta.env.VITE_API || 'http://localhost:5000';
const API_BASE = RAW_API.endsWith('/api') ? RAW_API : `${RAW_API.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;
