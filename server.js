const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        socket.join(data.roomId);
        socket.to(data.roomId).emit('user_connected', data.peerId);
    });

    // Video Sync
    socket.on('play_video', (roomId) => socket.to(roomId).emit('receive_play'));
    socket.on('pause_video', (roomId) => socket.to(roomId).emit('receive_pause'));
    socket.on('seek_video', (data) => socket.to(data.roomId).emit('receive_seek', data.time));
    socket.on('change_video_url', (data) => socket.to(data.roomId).emit('receive_video_url', data.url));
    
    // Chat & Reactions
    socket.on('send_chat', (data) => socket.to(data.roomId).emit('receive_chat', data.message));
    socket.on('send_reaction', (data) => socket.to(data.roomId).emit('receive_reaction', data.emoji));

    // NEW: Study Hub (Whiteboard & Timer)
    socket.on('draw_line', (data) => socket.to(data.roomId).emit('receive_draw_line', data));
    socket.on('clear_board', (roomId) => socket.to(roomId).emit('receive_clear_board'));
    socket.on('sync_timer', (data) => socket.to(data.roomId).emit('receive_sync_timer', data));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
