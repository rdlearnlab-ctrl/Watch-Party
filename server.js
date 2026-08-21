const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Tell Express to serve the frontend files from the 'public' folder
app.use(express.static('public'));

// Initialize Socket.IO
const io = new Server(server);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (data) => {
    socket.join(data.roomId);
    console.log(`User joined room: ${data.roomId} with PeerID: ${data.peerId}`);
    
    // Broadcast to everyone ELSE in the room to call this new peer
    socket.to(data.roomId).emit('user_connected', data.peerId);
  });

  socket.on('play_video', (roomId) => {
    socket.to(roomId).emit('receive_play');
  });

  socket.on('pause_video', (roomId) => {
    socket.to(roomId).emit('receive_pause');
  });
  // Add this right below socket.on('pause_video' ...)
  socket.on('seek_video', (data) => {
    // Send the specific timestamp to everyone else in the room
    socket.to(data.roomId).emit('receive_seek', data.time);
  });
  // When a user changes the main video link
  socket.on('change_video_url', (data) => {
    // Send the new URL to everyone ELSE in the room
    socket.to(data.roomId).emit('receive_video_url', data.url);
  });
  // Add this right below your seek_video event
  socket.on('send_chat', (data) => {
    // Send the message to everyone else in the room
    socket.to(data.roomId).emit('receive_chat', data.message);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Use process.env.PORT for Render, or 3001 for local testing
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});