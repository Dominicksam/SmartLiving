import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { Box, CircularProgress } from '@mui/material';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import DeviceDetail from './pages/DeviceDetail';
import AutomationRules from './pages/AutomationRules';
import Settings from './pages/Settings';
import Layout from './components/Layout/Layout';
import { SignalRProvider } from './contexts/SignalRContext';
import './App.css';

function App() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    // Handle redirect promise
    instance.handleRedirectPromise().catch((error) => {
      console.error('Redirect promise error:', error);
    });
  }, [instance]);

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <SignalRProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/device/:deviceId" element={<DeviceDetail />} />
          <Route path="/automation" element={<AutomationRules />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </SignalRProvider>
  );
}

export default App;