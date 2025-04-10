const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

app.use(cors());
app.use(bodyParser.json());

let messages = [];

app.get('/messages', (req, res) => {
  res.json(messages);
});

app.post('/messages', (req, res) => {
  const newMsg = req.body;
  messages.push(newMsg);
  io.emit('chat message', newMsg); // Broadcast to all clients
  res.status(201).send('Message stored and broadcasted');
});

app.delete('/messages/:id', (req, res) => {
  const id = req.params.id;
  messages = messages.filter(msg => msg.id !== id);
  io.emit('delete message', id);
  res.status(200).send('Message deleted');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});





