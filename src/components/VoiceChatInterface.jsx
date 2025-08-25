import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Phone, PhoneOff, MessageSquare, Settings } from 'lucide-react';

const VoiceChatBot = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState(null);

  const roomRef = useRef(null);
  const localParticipantRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localAudioRef = useRef(null);
  const chatEndRef = useRef(null);

  // Token server configuration
  const TOKEN_SERVER_URL = 'http://localhost:3001';

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (isVoiceModeActive) {
          // Restart recognition if voice mode is still active
          setTimeout(() => {
            if (isVoiceModeActive) {
              recognition.start();
            }
          }, 100);
        }
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript.trim()) {
          addToChatHistory('user', finalTranscript.trim(), 'voice');
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      setSpeechRecognition(recognition);
    }
  }, []);

  const connectToRoom = async () => {
    setIsConnecting(true);
    setConnectionStatus('connecting');

    try {
      // Get token from your server
      const response = await fetch(`${TOKEN_SERVER_URL}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get token');
      }

      const { token, roomName, url } = await response.json();

      // Import LiveKit SDK dynamically
      const { Room, RoomEvent, Track, ConnectionState } = await import('livekit-client');

      // Create room instance
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      // Set up event listeners
      room.on(RoomEvent.Connected, () => {
        console.log('Connected to room');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionStatus('connected');
        addToChatHistory('system', 'Connected to voice assistant');
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        addToChatHistory('system', 'Disconnected from voice assistant');
        cleanup();
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && participant.isAgent) {
          const audioElement = remoteAudioRef.current;
          if (audioElement) {
            track.attach(audioElement);
            audioElement.play();
          }
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant connected:', participant.identity);
        if (participant.isAgent) {
          addToChatHistory('system', 'AI Assistant joined the conversation');
        }
      });

      room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
        const message = await reader.readAll();
        if (reader.info.attributes['lk.transcribed_track_id']) {
          console.log(`New transcription from ${participantInfo.identity}: ${message}`);
        } else {
          console.log(`New message from ${participantInfo.identity}: ${message}`);
        }
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const message = new TextDecoder().decode(payload);
          addToChatHistory('assistant', message, 'voice');
        } catch (error) {
          console.error('Error decoding message:', error);
        }
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      localParticipantRef.current = room.localParticipant;

    } catch (error) {
      console.error('Connection failed:', error);
      setIsConnecting(false);
      setConnectionStatus('error');
      addToChatHistory('system', `Connection failed: ${error.message}`);
    }
  };

  const disconnect = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
    if (speechRecognition && isListening) {
      speechRecognition.stop();
    }
    cleanup();
    setIsVoiceModeActive(false);
  };

  const cleanup = () => {
    roomRef.current = null;
    localParticipantRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionStatus('disconnected');
  };

  const toggleVoiceMode = async () => {
    if (!speechRecognition) {
      addToChatHistory('system', 'Speech recognition is not supported in this browser');
      return;
    }

    if (!isConnected) {
      await connectToRoom();
    }

    const newVoiceModeState = !isVoiceModeActive;
    setIsVoiceModeActive(newVoiceModeState);

    if (newVoiceModeState) {
      // Start voice mode
      try {
        speechRecognition.start();
        addToChatHistory('system', 'Voice mode activated - Start speaking');
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        addToChatHistory('system', 'Failed to start voice recognition');
        setIsVoiceModeActive(false);
      }
    } else {
      // Stop voice mode
      if (isListening) {
        speechRecognition.stop();
      }
      addToChatHistory('system', 'Voice mode deactivated');
    }

    if (isConnected && localParticipantRef.current) {
      await localParticipantRef.current.setMicrophoneEnabled(newVoiceModeState);
      setIsMuted(!newVoiceModeState);
    }
  };

  const toggleMute = async () => {
    if (localParticipantRef.current) {
      await localParticipantRef.current.setMicrophoneEnabled(isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleAudio = () => {
    const audioElement = remoteAudioRef.current;
    if (audioElement) {
      audioElement.muted = !audioElement.muted;
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const sendTextMessage = async () => {
    if (!textMessage.trim()) return;

    if (!isConnected) {
      await connectToRoom();
    }

    if (roomRef.current && isConnected) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(textMessage);
        await roomRef.current.localParticipant.publishData(data, { reliable: true });

        addToChatHistory('user', textMessage);
        setTextMessage('');
      } catch (error) {
        console.error('Failed to send message:', error);
        addToChatHistory('system', 'Failed to send message');
      }
    } else {
      addToChatHistory('user', textMessage);
      setTextMessage('');
      // Simulate assistant response for demo
      setTimeout(() => {
        addToChatHistory('assistant', 'I received your message. Please connect to the voice service for real-time interaction.');
      }, 1000);
    }
  };

  const addToChatHistory = (sender, message, type = 'text') => {
    setChatHistory(prev => [...prev, {
      id: Date.now(),
      sender,
      message,
      type, // 'text' or 'voice'
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    return () => {
      if (speechRecognition && isListening) {
        speechRecognition.stop();
      }
      cleanup();
    };
  }, []);

  return (
    <div className="flex h-screen bg-white text-gray-900">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden bg-gray-50 border-r border-gray-200 flex flex-col`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">AI Assistant</h2>

          {/* Connection Status */}
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Connection</span>
              <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500' :
                    connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                }`}></div>
            </div>
            <p className="text-xs text-gray-500">
              {connectionStatus === 'connected' ? 'Connected to voice service' :
                connectionStatus === 'connecting' ? 'Connecting...' :
                  connectionStatus === 'error' ? 'Connection failed' : 'Not connected'}
            </p>

            {!isConnected && (
              <button
                onClick={connectToRoom}
                disabled={isConnecting}
                className="w-full mt-2 bg-black text-white text-sm px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            )}

            {isConnected && (
              <button
                onClick={disconnect}
                className="w-full mt-2 bg-red-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Voice Controls */}
          {isConnected && isVoiceModeActive && (
            <div className="bg-white rounded-lg p-3 border border-gray-200 mt-3">
              <span className="text-sm font-medium text-gray-600 block mb-2">Voice Controls</span>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={toggleMute}
                  className={`flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded-md text-xs transition-colors ${isMuted ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}
                >
                  {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                  <span>{isMuted ? 'Muted' : 'Live'}</span>
                </button>

                <button
                  onClick={toggleAudio}
                  className={`flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded-md text-xs transition-colors ${!isAudioEnabled ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}
                >
                  {!isAudioEnabled ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span>Audio</span>
                </button>
              </div>

              {/* Voice Status Indicator */}
              <div className="flex items-center space-x-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-gray-600">
                  {isListening ? 'Listening...' : 'Voice inactive'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Chat History</h3>
          <div className="space-y-3">
            {chatHistory.map((entry) => (
              <div key={entry.id} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium ${entry.sender === 'user' ? 'text-blue-600' :
                      entry.sender === 'assistant' ? 'text-green-600' :
                        'text-gray-500'
                    }`}>
                    {entry.sender === 'user' ? 'You' :
                      entry.sender === 'assistant' ? 'Assistant' : 'System'}
                  </span>
                  <span className="text-xs text-gray-400">{entry.timestamp}</span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-3">
                  {entry.type === 'voice' && (
                    <span className="inline-flex items-center space-x-1 text-xs text-blue-600 mr-2">
                      <Mic size={12} />
                      <span>Voice</span>
                    </span>
                  )}
                  {entry.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <MessageSquare size={20} className="text-gray-600" />
          </button>

          <h1 className="text-xl font-semibold text-gray-800">AI Voice Assistant</h1>

          <div className="w-10"></div> {/* Spacer for centering */}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {chatHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare size={24} className="text-gray-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">Start a conversation</h2>
                <p className="text-gray-500">Type a message or use voice chat to begin talking with the AI assistant.</p>
              </div>
            ) : (
              chatHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${entry.sender === 'user'
                        ? 'bg-black text-white'
                        : entry.sender === 'assistant'
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-gray-50 text-gray-600 text-sm'
                      }`}
                  >
                    {/* Voice indicator for chat messages */}
                    {entry.type === 'voice' && entry.sender !== 'system' && (
                      <div className={`flex items-center space-x-1 text-xs mb-2 ${entry.sender === 'user' ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                        <Mic size={12} />
                        <span>Voice message</span>
                      </div>
                    )}

                    <div className="whitespace-pre-wrap">{entry.message}</div>
                    {entry.sender !== 'system' && (
                      <div className={`text-xs mt-2 ${entry.sender === 'user' ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                        {entry.timestamp}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Chat Input */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start space-x-3">

              {/* Text Input */}
              <div className="flex-1 relative">
                <textarea
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  rows={1}
                  className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
              </div>

              {/* Voice Button */}
              <button
                onClick={toggleVoiceMode}
                className={`p-3 rounded-lg transition-colors ${isVoiceModeActive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {isVoiceModeActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              {/* Send Button */}
              <button
                onClick={sendTextMessage}
                disabled={!textMessage.trim()}
                className="p-3 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={20} />
              </button>
            </div>

            {isVoiceModeActive && (
              <p className="text-sm text-gray-500 text-center mt-2">
                Voice mode active - Speak naturally
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio elements */}
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <audio ref={localAudioRef} muted playsInline />
    </div>
  );
};

export default VoiceChatBot;