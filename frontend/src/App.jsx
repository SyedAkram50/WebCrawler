import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar';
import SearchInterface from './components/SearchInterface';
import CrawlConsole from './components/CrawlConsole';
import Auth from './components/Auth';
import api from './api/axiosClient';

// Use VITE_API as socket host when available, otherwise default to localhost:5000
const RAW_API = import.meta.env.VITE_API || 'http://localhost:5000';
const SOCKET_HOST = RAW_API.replace(/\/$/, '');
const socket = io(SOCKET_HOST);

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [socketConnected, setSocketConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check for saved user/token
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      // Setup api default header using centralized axios client
      api.defaults.headers.common['x-auth-token'] = savedToken;
    }

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Check initial state
    setSocketConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    api.defaults.headers.common['x-auth-token'] = userToken;
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['x-auth-token'];
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        socketConnected={socketConnected} 
        user={user}
        onLogout={handleLogout}
      />
      
      <main className="relative flex-1 flex flex-col">
        {/* Render both but hide the inactive one so that state/socket doesn't reset when switching tabs */}
        <div className={activeTab === 'search' ? 'block w-full' : 'hidden'}>
          <SearchInterface />
        </div>
        <div className={activeTab === 'console' ? 'block w-full' : 'hidden'}>
          <CrawlConsole socket={socket} />
        </div>
      </main>
    </div>
  );
}

export default App;
