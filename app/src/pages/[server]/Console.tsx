import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, SendIcon, Play, Square, RefreshCw, 
  Server, Cpu, MemoryStick, HardDrive, Clock, Info 
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import AnsiToHtml from 'ansi-to-html';

interface Node {
  id: string;
  name: string;
  fqdn: string;
  port: number;
  isOnline: boolean;
  lastChecked: string;
}

interface ServerStatus {
  docker_id: string;
  name: string;
  image: string;
  state: string;
  memory_limit: number;
  cpu_limit: number;
  startup_command: string;
  allocation: string;
}

interface ServerDetails {
  id: string;
  internalId: string;
  name: string;
  memoryMiB: number;
  diskMiB: number;
  cpuPercent: number;
  state: string;
  createdAt: string;
  node: Node;
  status: ServerStatus;
}

interface ConsoleMessage {
  event: string;
  data: {
    message?: string;
    status?: string;
    state?: string;
    logs?: string[];
    action?: string;
    cpu_percent?: number;
    memory?: {
      used: number;
      limit: number;
      percent: number;
    };
    network?: {
      rx_bytes: number;
      tx_bytes: number;
    };
  };
}

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const ServerConsolePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState<ServerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const [powerLoading, setPowerLoading] = useState(false);
  const [liveStats, setLiveStats] = useState<{
    cpuPercent: number;
    memory: { used: number; limit: number; percent: number };
    network: { rxBytes: number; txBytes: number };
  }>({
    cpuPercent: 0,
    memory: { used: 0, limit: 0, percent: 0 },
    network: { rxBytes: 0, txBytes: 0 }
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const ansiToHtml = new AnsiToHtml({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    colors: {
      0: '#000000', 1: '#d16969', 2: '#b5cea8', 3: '#d7ba7d', 
      4: '#569cd6', 5: '#c586c0', 6: '#9cdcfe', 7: '#d4d4d4', 
      8: '#808080', 9: '#d16969', 10: '#b5cea8', 11: '#d7ba7d', 
      12: '#569cd6', 13: '#c586c0', 14: '#9cdcfe', 15: '#ffffff'
    }
  });

  useEffect(() => {
    const fetchServer = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/servers/${id}?include[node]=true&include[status]=true`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch server');
        const data = await response.json();
        
        if (!data.node?.fqdn || !data.node?.port) {
          throw new Error('Server node information is missing');
        }
        
        setServer(data);
        initWebSocket(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchServer();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [messages]);

  const initWebSocket = (serverData: ServerDetails) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication token not found');
      return;
    }

    // Check if WebSocket is already open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    // Add token as URL parameter instead of header
    const wsUrl = `ws://${serverData.node.fqdn}:${serverData.node.port}?server=${serverData.internalId}&token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const message: ConsoleMessage = JSON.parse(event.data);
      
      switch (message.event) {
        case 'console_output':
          setMessages(prev => [...prev, ansiToHtml.toHtml(message.data.message || '')]);
          break;
        
        case 'auth_success':
          if (message.data.logs) {
            setMessages(message.data.logs.map(log => ansiToHtml.toHtml(log)));
          }
          break;
        
        case 'stats':
          if (message.data.cpu_percent !== undefined) {
            setLiveStats({
              cpuPercent: message.data.cpu_percent || 0,
              memory: message.data.memory || { used: 0, limit: 0, percent: 0 },
              network: message.data.network 
                ? { rxBytes: message.data.network.rx_bytes, txBytes: message.data.network.tx_bytes }
                : { rxBytes: 0, txBytes: 0 }
            });
          }
          
          if (message.data.state) {
            setServer(prev => prev ? { ...prev, state: message.data.state || prev.state } : null);
          }
          break;
        
        case 'power_status':
          if (message.data.status) {
            setMessages(prev => [...prev, ansiToHtml.toHtml(message.data.status || '')]);
          }
          setPowerLoading(false);
          break;
        
        case 'error':
          const errorMsg = message.data.message || 'An unknown error occurred';
          setError(errorMsg);
          setMessages(prev => [...prev, ansiToHtml.toHtml(`Error: ${errorMsg}`)]);
          setPowerLoading(false);
          break;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          initWebSocket(serverData);
        }
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Failed to connect to server console');
    };
  };

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      event: 'send_command',
      data: command
    }));

    setCommand('');
  };

  const handlePowerAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!server || powerLoading || !wsRef.current) return;
    
    setPowerLoading(true);
    try {
      wsRef.current.send(JSON.stringify({
        event: 'power_action',
        data: { action }
      }));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} server`);
    } finally {
      setPowerLoading(false);
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'running': return 'text-green-500';
      case 'stopped': return 'text-red-500';
      case 'installing': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="text-red-600 text-xs">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header with Back and Server Name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/servers`)}
              className="flex items-center text-gray-600 hover:bg-gray-100 p-2 rounded-md transition hover:text-gray-900"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{server?.name}</h1>
              <p className="text-xs text-gray-500">{server?.internalId}</p>
            </div>
          </div>
          
          {/* Power Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePowerAction('start')}
              disabled={powerLoading || server?.state === 'running'}
              className="flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Start
            </button>
            <button
              onClick={() => handlePowerAction('stop')}
              disabled={powerLoading || server?.state !== 'running'}
              className="flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop
            </button>
            <button
              onClick={() => handlePowerAction('restart')}
              disabled={powerLoading || server?.state !== 'running'}
              className="flex items-center px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Restart
            </button>
          </div>
        </div>

        {/* Server Details and Resource Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Server Information */}
          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-gray-600" />
              <h2 className="text-sm font-semibold">Server Details</h2>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">State:</span>
                <span className={`font-medium ${getStateColor(server?.state || '')}`}>
                  {server?.state || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Image:</span>
                <span>{server?.status.image || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Node:</span>
                <span>{server?.node.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span>{new Date(server?.createdAt || '').toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Resource Stats */}
          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Info className="w-5 h-5 text-gray-600" />
              <h2 className="text-sm font-semibold">Resource Stats</h2>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600">CPU:</span>
                </div>
                <span>{liveStats.cpuPercent.toFixed(2)}% / {server?.status.cpu_limit || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <MemoryStick className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600">Memory:</span>
                </div>
                <span>
                  {formatBytes(liveStats.memory.used)} / {formatBytes(server?.status.memory_limit || 0)} 
                  ({liveStats.memory.percent.toFixed(2)}%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600">Disk:</span>
                </div>
                <span>{formatBytes((server?.diskMiB ?? 0) * 1024 * 1024)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600">Network:</span>
                </div>
                <span>
                  ↓ {formatBytes(liveStats.network.rxBytes)}/s | 
                  ↑ {formatBytes(liveStats.network.txBytes)}/s
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Console Container */}
        <div className="bg-gray-900 border border-gray-800 rounded-md shadow-sm">
          {/* Console Output */}
          <div 
            ref={consoleRef}
            className="h-[600px] p-4 text-xs text-gray-300 overflow-y-auto whitespace-pre-wrap font-mono"
            dangerouslySetInnerHTML={{ __html: messages.join('<br/>') }}
          />

          {/* Command Input */}
          <div className="border-t border-gray-800 p-4">
            <form onSubmit={sendCommand} className="flex items-center space-x-3">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter a command..."
                className="flex-1 bg-gray-800 text-gray-100 text-xs rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-700"
              />
              <button
                type="submit"
                disabled={!connected}
                className="flex items-center px-3 py-2 text-xs font-medium text-gray-300 bg-gray-800 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SendIcon className="w-3.5 h-3.5 mr-1.5" />
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerConsolePage;