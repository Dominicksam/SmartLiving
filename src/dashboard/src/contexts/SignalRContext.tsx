import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { useIsAuthenticated } from '@azure/msal-react';

interface SignalRContextType {
  connection: HubConnection | null;
  isConnected: boolean;
  connectionState: HubConnectionState;
  sendMessage: (target: string, message: any) => Promise<void>;
  joinGroup: (groupName: string) => Promise<void>;
  leaveGroup: (groupName: string) => Promise<void>;
}

const SignalRContext = createContext<SignalRContextType | null>(null);

interface TelemetryUpdate {
  deviceId: string;
  messageType: string;
  value: number;
  unit?: string;
  timestamp: string;
  additionalData?: any;
}

interface SignalRProviderProps {
  children: React.ReactNode;
}

export const SignalRProvider: React.FC<SignalRProviderProps> = ({ children }) => {
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [connectionState, setConnectionState] = useState<HubConnectionState>(HubConnectionState.Disconnected);
  const isAuthenticated = useIsAuthenticated();

  const isConnected = connectionState === HubConnectionState.Connected;

  useEffect(() => {
    if (!isAuthenticated) return;

    const newConnection = new HubConnectionBuilder()
      .withUrl(`${process.env.REACT_APP_API_BASE_URL}/api/signalr/negotiate`)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.elapsedMilliseconds < 60000) {
            // If we've been reconnecting for less than 60 seconds so far,
            // wait between 0 and 10 seconds before the next reconnect attempt.
            return Math.random() * 10000;
          } else {
            // If we've been reconnecting for more than 60 seconds so far, stop reconnecting.
            return null;
          }
        }
      })
      .build();

    setConnection(newConnection);

    // Set up event handlers
    newConnection.onclose((error) => {
      console.log('SignalR connection closed:', error);
      setConnectionState(newConnection.state);
    });

    newConnection.onreconnecting((error) => {
      console.log('SignalR reconnecting:', error);
      setConnectionState(newConnection.state);
    });

    newConnection.onreconnected((connectionId) => {
      console.log('SignalR reconnected:', connectionId);
      setConnectionState(newConnection.state);
    });

    // Listen for telemetry updates
    newConnection.on('telemetryUpdate', (data: TelemetryUpdate) => {
      console.log('Received telemetry update:', data);
      // Dispatch custom event for components to listen to
      window.dispatchEvent(new CustomEvent('telemetryUpdate', { detail: data }));
    });

    // Listen for device status updates
    newConnection.on('deviceStatusUpdate', (data: { deviceId: string; isOnline: boolean; lastSeen: string }) => {
      console.log('Received device status update:', data);
      window.dispatchEvent(new CustomEvent('deviceStatusUpdate', { detail: data }));
    });

    // Listen for automation rule executions
    newConnection.on('automationRuleExecuted', (data: { ruleId: string; ruleName: string; success: boolean }) => {
      console.log('Received automation rule execution:', data);
      window.dispatchEvent(new CustomEvent('automationRuleExecuted', { detail: data }));
    });

    return () => {
      if (newConnection) {
        newConnection.stop();
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!connection) return;

    const startConnection = async () => {
      try {
        await connection.start();
        console.log('SignalR connection established');
        setConnectionState(connection.state);
      } catch (error) {
        console.error('Error starting SignalR connection:', error);
        // Retry after 5 seconds
        setTimeout(startConnection, 5000);
      }
    };

    if (connection.state === HubConnectionState.Disconnected) {
      startConnection();
    }

    // Update connection state when it changes
    const stateInterval = setInterval(() => {
      if (connection.state !== connectionState) {
        setConnectionState(connection.state);
      }
    }, 1000);

    return () => {
      clearInterval(stateInterval);
    };
  }, [connection, connectionState]);

  const sendMessage = useCallback(async (target: string, message: any) => {
    if (connection && isConnected) {
      try {
        await connection.invoke(target, message);
      } catch (error) {
        console.error('Error sending SignalR message:', error);
        throw error;
      }
    } else {
      throw new Error('SignalR connection is not active');
    }
  }, [connection, isConnected]);

  const joinGroup = useCallback(async (groupName: string) => {
    if (connection && isConnected) {
      try {
        await connection.invoke('JoinGroup', groupName);
        console.log(`Joined SignalR group: ${groupName}`);
      } catch (error) {
        console.error('Error joining SignalR group:', error);
        throw error;
      }
    }
  }, [connection, isConnected]);

  const leaveGroup = useCallback(async (groupName: string) => {
    if (connection && isConnected) {
      try {
        await connection.invoke('LeaveGroup', groupName);
        console.log(`Left SignalR group: ${groupName}`);
      } catch (error) {
        console.error('Error leaving SignalR group:', error);
        throw error;
      }
    }
  }, [connection, isConnected]);

  const value: SignalRContextType = {
    connection,
    isConnected,
    connectionState,
    sendMessage,
    joinGroup,
    leaveGroup,
  };

  return <SignalRContext.Provider value={value}>{children}</SignalRContext.Provider>;
};

export const useSignalR = () => {
  const context = useContext(SignalRContext);
  if (!context) {
    throw new Error('useSignalR must be used within a SignalRProvider');
  }
  return context;
};