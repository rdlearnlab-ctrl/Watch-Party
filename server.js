const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const activeRooms = {}; // Format: { roomId: { isPublic: boolean, users: number, hostSocketId: string } }

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
    socket.emit('update_rooms', getPublicRooms());

    socket.on('create_room', (data) => {
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { 
                isPublic: data.isPublic, 
                users: 0, 
                hostSocketId: socket.id // First person to create is the host
            };
        }
        io.emit('update_rooms', getPublicRooms());
    });

    socket.on('join_room', (data) => {
        socket.join(data.roomId);
        socket.roomId = data.roomId;
        
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { isPublic: false, users: 0, hostSocketId: socket.id };
        }
        activeRooms[data.roomId].users++;
        
        // Tell the user if they are the host
        const isHost = (activeRooms[data.roomId].hostSocketId === socket.id);
        socket.emit('set_host_status', isHost);

        io.emit('update_rooms', getPublicRooms());
        socket.to(data.roomId).emit('user_connected', data.peerId);
    });

    // Host Power: Transfer Host Control
    socket.on('transfer_host', (data) => {
        if (activeRooms[data.roomId] && activeRooms[data.roomId].hostSocketId === socket.id) {
            // Find target socket by name/peer or broadcast a custom event
            io.to(data.roomId).emit('notify_host_change', data.newHostName);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            activeRooms[socket.roomId].users--;
            if (activeRooms[socket.roomId].users <= 0) {
                delete activeRooms[socket.roomId];
            }
            io.emit('update_rooms', getPublicRooms());
        }
    });

    // Video Sync (Restricted to Host checks on frontend)
    socket.on('play_video', (roomId) => socket.to(roomId).emit('receive_play'));
    socket.on('pause_video', (roomId) => socket.to(roomId).emit('receive_pause'));
    socket.on('seek_video', (data) => socket.to(data.roomId).emit('receive_seek', data.time));
    socket.on('change_video_url', (data) => socket.to(data.roomId).emit('receive_video_url', data));
    
    // Chat & Reactions
    socket.on('send_chat', (data) => socket.to(data.roomId).emit('receive_chat', data));
    socket.on('send_reaction', (data) => socket.to(data.roomId).emit('receive_reaction', data.emoji));

    // Study Hub (Whiteboard & Timer)
    socket.on('draw_line', (data) => socket.to(data.roomId).emit('receive_draw_line', data));
    socket.on('clear_board', (roomId) => socket.to(roomId).emit('receive_clear_board'));
    socket.on('sync_timer', (data) => socket.to(data.roomId).emit('receive_sync_timer', data));
    
    socket.on('toggle_board', (data) => socket.to(data.roomId).emit('receive_toggle_board', data.isOpen));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
