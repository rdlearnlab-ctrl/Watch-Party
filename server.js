const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const activeRooms = {}; // Format: { roomId: { isPublic: boolean, users: number } }

function getPublicRooms() {
    const publicRooms = [];
    for (const roomId in activeRooms) {
        if (activeRooms[roomId].isPublic) {
            publicRooms.push({ roomId, users: activeRooms[roomId].users });
        }
    }
    return publicRooms;
}

io.on('connection', (socket) => {
    // Send the active public rooms to the user as soon as they connect
    socket.emit('update_rooms', getPublicRooms());

    socket.on('create_room', (data) => {
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { isPublic: data.isPublic, users: 0 };
        }
        io.emit('update_rooms', getPublicRooms());
    });

    socket.on('join_room', (data) => {
        socket.join(data.roomId);
        socket.roomId = data.roomId; // Tag socket for disconnect tracking
        
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { isPublic: false, users: 0 }; // Fallback
        }
        activeRooms[data.roomId].users++;
        
        io.emit('update_rooms', getPublicRooms());
        socket.to(data.roomId).emit('user_connected', data.peerId);
    });

    socket.on('disconnect', () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            activeRooms[socket.roomId].users--;
            if (activeRooms[socket.roomId].users <= 0) {
                delete activeRooms[socket.roomId]; // Clean up empty rooms
            }
            io.emit('update_rooms', getPublicRooms());
        }
    });

    // Video Sync
    socket.on('play_video', (roomId) => socket.to(roomId).emit('receive_play'));
    socket.on('pause_video', (roomId) => socket.to(roomId).emit('receive_pause'));
    socket.on('seek_video', (data) => socket.to(data.roomId).emit('receive_seek', data.time));
    socket.on('change_video_url', (data) => socket.to(data.roomId).emit('receive_video_url', data.url));
    
    // Chat & Reactions
    socket.on('send_chat', (data) => socket.to(data.roomId).emit('receive_chat', data));
    socket.on('send_reaction', (data) => socket.to(data.roomId).emit('receive_reaction', data.emoji));

    // Study Hub (Whiteboard & Timer)
    socket.on('draw_line', (data) => socket.to(data.roomId).emit('receive_draw_line', data));
    socket.on('clear_board', (roomId) => socket.to(roomId).emit('receive_clear_board'));
    socket.on('sync_timer', (data) => socket.to(data.roomId).emit('receive_sync_timer', data));
    
    // Sync Whiteboard Screen Swap
    socket.on('toggle_board', (data) => socket.to(data.roomId).emit('receive_toggle_board', data.isOpen));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
