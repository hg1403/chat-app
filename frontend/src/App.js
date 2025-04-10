import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';
import * as openpgp from 'openpgp';
import 'emoji-mart/css/emoji-mart.css';
import { Picker } from 'emoji-mart';

const socket = io('http://localhost:5000');

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [username, setUsername] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [inCall, setInCall] = useState(false); // to track if the video call is ongoing

  useEffect(() => {
    const generateKeys = async () => {
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'rsa',
        rsaBits: 2048,
        userIDs: [{ name: 'You', email: 'you@example.com' }],
        passphrase: 'my-passphrase'
      });

      setPrivateKey(privateKey);
      setPublicKey(publicKey);
      localStorage.setItem('pgpPublicKey', publicKey);
      localStorage.setItem('pgpPrivateKey', privateKey);
    };

    const savedPrivate = localStorage.getItem('pgpPrivateKey');
    const savedPublic = localStorage.getItem('pgpPublicKey');
    if (savedPrivate && savedPublic) {
      setPrivateKey(savedPrivate);
      setPublicKey(savedPublic);
    } else {
      generateKeys();
    }

    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const decryptMessages = async (messagesToDecrypt) => {
      if (!privateKey) return [];

      const decryptedMessages = await Promise.all(messagesToDecrypt.map(async (msg) => {
        try {
          const messageObj = await openpgp.readMessage({ armoredMessage: msg.text });

          const { data } = await openpgp.decrypt({
            message: messageObj,
            decryptionKeys: await openpgp.decryptKey({
              privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
              passphrase: 'my-passphrase'
            })
          });

          return { ...msg, text: data };
        } catch (err) {
          return null; // Skip if decryption fails
        }
      }));

      return decryptedMessages.filter(m => m !== null); // Remove failed ones
    };

    const fetchAndMergeMessages = async () => {
      try {
        const local = JSON.parse(localStorage.getItem('chatMessages')) || [];
        const response = await axios.get('http://localhost:5000/messages');
        const backendMsgs = response.data;

        const unseen = backendMsgs.filter(msg =>
          !local.some(localMsg => localMsg.id === msg.id)
        );

        const decryptedUnseen = await decryptMessages(unseen);
        const merged = [...local, ...decryptedUnseen];

        setMessages(merged);
        localStorage.setItem('chatMessages', JSON.stringify(merged));
      } catch (err) {
        console.error('Error fetching/decrypting:', err);
      }
    };

    fetchAndMergeMessages();

    socket.on('chat message', async (message) => {
      const decryptedList = await decryptMessages([message]);
      const decrypted = decryptedList[0];

      if (!decrypted) return;

      setMessages(prev => {
        const exists = prev.some(msg => msg.id === decrypted.id);
        if (exists) return prev;

        const updated = [...prev, decrypted];
        localStorage.setItem('chatMessages', JSON.stringify(updated));

        if (Notification.permission === 'granted') {
          new Notification('New Message', {
            body: decrypted.text,
          });
        }

        return updated;
      });
    });

    socket.on('delete message', (id) => {
      setMessages(prev => {
        const updated = prev.filter(msg => msg.id !== id);
        localStorage.setItem('chatMessages', JSON.stringify(updated));
        return updated;
      });
    });

    return () => {
      socket.off('chat message');
      socket.off('delete message');
    };
  }, [privateKey]);

  const sendMessage = async () => {
    if (!input.trim()) return;
  
    try {
      const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: input }),
        encryptionKeys: await openpgp.readKey({ armoredKey: publicKey })
      });
  
      const newMsg = {
        id: crypto.randomUUID(),
        text: encrypted,
        sender: username || 'You',
        timestamp: new Date().toLocaleTimeString(),
      };
  
      await axios.post('http://localhost:5000/messages', newMsg);
      socket.emit('chat message', newMsg);
      setInput('');
  
    
      setMessages(prev => {
        const updated = [...prev, { ...newMsg, text: input }];
        localStorage.setItem('chatMessages', JSON.stringify(updated));
        return updated;
      });
  
    } catch (err) {
      console.error('Encryption error:', err);
    }
  };
  

  const deleteMessage = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/messages/${id}`);
      socket.emit('delete message', id);
  
      // Immediately update local UI
      setMessages(prev => {
        const updated = prev.filter(msg => msg.id !== id);
        localStorage.setItem('chatMessages', JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(err);
    }
  };
  
  const deleteAllMessages = async () => {
    try {
      for (let message of messages) {
        await axios.delete(`http://localhost:5000/messages/${message.id}`);
        socket.emit('delete message', message.id);
      }
      setMessages([]);
    } catch (err) {
      console.error('Error deleting all messages:', err);
    }
  };

  const addEmoji = (emoji) => {
    setInput(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  const handleLogin = () => {
    if (nameInput.trim()) {
      setUsername(nameInput.trim());
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUsername('');
    setNameInput('');
    setMessages([]);
  };

  // Start Video Call
  const startVideoCall = () => {
    setInCall(true);

    // Request video and audio stream
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        // Create a video element to show local video
        const localVideo = document.createElement('video');
        localVideo.srcObject = stream;
        localVideo.play();

        // Append the local video to the body (or a container div)
        document.body.appendChild(localVideo);  // You can add a specific container instead

        // Store the stream to stop it later
        window.localStream = stream;

        // Optionally, if you're setting up peer-to-peer communication with others, you would use this stream
        // You can use socket.io or any other signaling method for peer connection setup
      })
      .catch(err => {
        console.error('Error accessing media devices.', err);
        alert('Could not access camera and microphone.');
      });
  };

  // End Video Call
  const endVideoCall = () => {
    setInCall(false);

    // Stop the stream and remove the video element
    if (window.localStream) {
      const tracks = window.localStream.getTracks();
      tracks.forEach(track => track.stop());
    }

    // Remove video element from the DOM
    const videoElement = document.querySelector('video');
    if (videoElement) {
      videoElement.remove();
    }
  };

  if (!username) {
    return (
      <div className="login-screen">
        <h2>Enter Your Name to Start Chatting 💬</h2>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
        />
        <button onClick={handleLogin}>Join Chat</button>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <h2>Real-Time Chat App 💬</h2>
      <p style={{ fontSize: '14px', color: '#888' }}>
        Welcome, {username}! 👋
        <button onClick={handleLogout} style={{ marginLeft: '10px', fontSize: '12px' }}>
          Logout
        </button>
        <button onClick={deleteAllMessages} style={{ marginLeft: '10px', fontSize: '12px' }}>
          Delete All Messages
        </button>
      </p>

      <div className="messages">
        {messages.map(msg => (
          <div className={`message ${msg.sender === username ? 'you' : 'other'}`} key={msg.id}>
            <div className="sender">{msg.sender}:</div>
            <div className="text">{msg.text}</div>
            <div className="timestamp">{msg.timestamp}</div>
            {msg.sender === username && (
              <button
                onClick={() => deleteMessage(msg.id)}
                style={{ fontSize: '10px', padding: '4px 6px', marginTop: '5px' }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      {showEmojiPicker && (
        <div style={{ position: 'absolute', bottom: '100px', zIndex: 10 }}>
          <Picker onSelect={addEmoji} />
        </div>
      )}

      <div className="input-area">
        <button onClick={() => setShowEmojiPicker(prev => !prev)} style={{ marginRight: '5px' }}>
          😊
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>

      {/* Video Call Button */}
      {!inCall ? (
        <button onClick={startVideoCall} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#1d72b8' }}>
          Start Video Call
        </button>
      ) : (
        <button onClick={endVideoCall} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#e74c3c' }}>
          End Video Call
        </button>
      )}
    </div>
  );
}

export default App;
