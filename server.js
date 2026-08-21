const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const https = require('https'); // Native module to make secure API requests

app.use(express.static('public'));

const activeRooms = {}; 

function getPublicRooms() {
    const publicRooms = [];
    for (const roomId in activeRooms) {
        if (activeRooms[roomId].isPublic) {
            publicRooms.push({ 
                roomId, 
                users: activeRooms[roomId].users, 
                category: activeRooms[roomId].category || 'Movie Night' 
            });
        }
    }
    return publicRooms;
}

// ==========================================
// SECURE TURN CREDENTIAL GENERATOR
// ==========================================
app.get('/api/ice-servers', (req, res) => {
    // We call your specific Metered domain and pass the secret key securely from the backend!
    const meteredUrl = 'https://bingeplay.metered.live/api/v1/turn/credentials?apiKey=RsSdZsHkfCreATXxhTdjy7rO50tIRO5x0mytCDELpn5g3UGN';
    
    https.get(meteredUrl, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
            try {
                const iceServers = JSON.parse(data);
                res.json(iceServers); // Send the safe credentials to the frontend
            } catch (e) {
                // If the API fails, fallback to basic Google STUN servers
                res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
            }
        });
    }).on('error', (err) => {
        console.error("Error fetching ICE servers from Metered:", err);
        res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
    });
});

io.on('connection', (socket) => {
    socket.emit('update_rooms', getPublicRooms());

    socket.on('create_room', (data) => {
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { 
                isPublic: data.isPublic, 
                users: 0, 
                category: data.category || 'Movie Night'
            };
        }
        io.emit('update_rooms', getPublicRooms());
    });

    socket.on('join_room', (data) => {
        socket.join(data.roomId);
        socket.roomId = data.roomId;
        
        if (!activeRooms[data.roomId]) {
            activeRooms[data.roomId] = { isPublic: false, users: 0, category: 'Movie Night' };
        }
        activeRooms[data.roomId].users++;
        
        io.emit('update_rooms', getPublicRooms());
        socket.to(data.roomId).emit('user_connected', data.peerId);
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

    // Video Sync
    socket.on('play_video', (roomId) => socket.to(roomId).emit('receive_play'));
    socket.on('pause_video', (roomId) => socket.to(roomId).emit('receive_pause'));
    socket.on('seek_video', (data) => socket.to(data.roomId).emit('receive_seek', data.time));
    socket.on('change_video_url', (data) => socket.to(data.roomId).emit('receive_video_url', data));
    
    // Chat & Reactions
    socket.on('send_chat', (data) => socket.to(data.roomId).emit('receive_chat', data));
    socket.on('send_reaction', (data) => socket.to(data.roomId).emit('receive_reaction', data.emoji));

    // Soundboard
    socket.on('play_sound', (data) => socket.to(data.roomId).emit('receive_sound', data.soundId));

    // Study Hub (Whiteboard & Timer)
    socket.on('draw_line', (data) => socket.to(data.roomId).emit('receive_draw_line', data));
    socket.on('clear_board', (roomId) => socket.to(roomId).emit('receive_clear_board'));
    socket.on('sync_timer', (data) => socket.to(data.roomId).emit('receive_sync_timer', data));
    socket.on('toggle_board', (data) => socket.to(data.roomId).emit('receive_toggle_board', data.isOpen));

    // Hardware Sync (Mute / Cam Toggles)
    socket.on('toggle_mute', (data) => socket.to(data.roomId).emit('peer_muted', data));
    socket.on('toggle_cam', (data) => socket.to(data.roomId).emit('peer_cam_toggled', data));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
