const socket = io(); 
const video = document.getElementById('videoPlayer');

// ==========================================
// PEERJS INITIALIZATION (SECURE + STUN SERVERS)
// ==========================================
const peer = new Peer({
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ]
    }
}); 
let myPeerId = null;

peer.on('open', (id) => {
    myPeerId = id; 
    console.log("Connected to Peer Server with ID:", id);
});

peer.on('error', (err) => {
    console.error("PeerJS error details:", err);
    // Fallback: ensures the join button never gets stuck if cloud flakes out
    if (!myPeerId) myPeerId = "fallback-id-" + Math.random().toString(36).substring(7);
});

// ==========================================
// 1. ROOM LOGIC
// ==========================================
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomDisplay = document.getElementById('roomDisplay');
let currentRoom = null;

joinRoomBtn.addEventListener('click', () => {
    const roomName = roomInput.value.trim();
    if (roomName && myPeerId) {
        currentRoom = roomName;
        roomDisplay.innerText = currentRoom;
        socket.emit('join_room', { roomId: currentRoom, peerId: myPeerId });
        alert(`Successfully joined room: ${currentRoom}`);
    } else {
        alert("Please enter a valid room name, or wait for PeerJS to connect.");
    }
});

// ==========================================
// 2. VIDEO SYNC LOGIC
// ==========================================
video.addEventListener('play', () => {
    if (currentRoom) socket.emit('play_video', currentRoom);
});

video.addEventListener('pause', () => {
    if (currentRoom) socket.emit('pause_video', currentRoom);
});

video.addEventListener('seeked', () => {
    if (currentRoom) socket.emit('seek_video', { roomId: currentRoom, time: video.currentTime });
});

socket.on('receive_play', () => { video.play(); });
socket.on('receive_pause', () => { video.pause(); });
socket.on('receive_seek', (time) => {
    if (Math.abs(video.currentTime - time) > 1) {
        video.currentTime = time;
    }
});

// ==========================================
// 3. CHAT LOGIC
// ==========================================
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatBox = document.getElementById('chatBox');

function appendMessage(msg, sender) {
    const msgElement = document.createElement('div');
    msgElement.classList.add('chat-message');
    msgElement.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight; 
}

sendChatBtn.addEventListener('click', () => {
    const msg = chatInput.value;
    if (msg.trim() !== "" && currentRoom) {
        appendMessage(msg, "You");
        socket.emit('send_chat', { roomId: currentRoom, message: msg });
        chatInput.value = ''; 
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        sendChatBtn.click(); 
    }
});

socket.on('receive_chat', (msg) => {
    appendMessage(msg, "Friend");
});

// ==========================================
// 4. CUSTOM URL & LOCAL FILE LOGIC
// ==========================================
const videoUrlInput = document.getElementById('videoUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');

loadUrlBtn.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();
    if (url) {
        if (!currentRoom) {
            alert("Please join a room first!");
            return;
        }
        video.src = url;
        socket.emit('change_video_url', { roomId: currentRoom, url: url });
        videoUrlInput.value = ''; 
    }
});

socket.on('receive_video_url', (newUrl) => {
    video.src = newUrl;
    appendMessage("The host changed the video!", "System");
});

const localFileInput = document.getElementById('localFileInput');
const uploadBtn = document.getElementById('uploadBtn');

uploadBtn.addEventListener('click', () => {
    localFileInput.click(); 
});

localFileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const fileURL = URL.createObjectURL(file);
        video.src = fileURL;
        alert("Playing local file! (Note: Friends won't see this unless you Share Screen or they select the same file).");
    }
});

// ==========================================
// 5. WEBRTC (CAMS & SCREEN SHARE)
// ==========================================
const videoGrid = document.getElementById('video-grid');
const myCam = document.getElementById('myCam');
const muteBtn = document.getElementById('muteBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');

let localStream; 
let activeCalls = []; 
let screenCalls = []; 
let currentScreenStream = null; 

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localStream = stream;
        myCam.srcObject = stream;
        makeVideoClickable(myCam, stream);

        peer.on('call', (call) => {
            call.answer(localStream); 
            
            const newFriendCam = document.createElement('video');
            
            if (call.metadata && call.metadata.type === 'screenshare') {
                call.on('stream', (friendStream) => {
                    addVideoStream(newFriendCam, friendStream);
                    video.removeAttribute('src'); 
                    video.srcObject = friendStream;
                    video.play();
                });
            } else {
                activeCalls.push(call); 
                call.on('stream', (friendStream) => {
                    addVideoStream(newFriendCam, friendStream);
                });
            }

            call.on('close', () => {
                newFriendCam.remove();
            });
        });
    })
    .catch((error) => console.error("Error accessing media devices.", error));

socket.on('user_connected', (newPeerId) => {
    connectToNewUser(newPeerId, localStream);
});

function connectToNewUser(peerId, stream) {
    const call = peer.call(peerId, stream); 
    activeCalls.push(call); 
    const newFriendCam = document.createElement('video');
    
    call.on('stream', (friendStream) => {
        addVideoStream(newFriendCam, friendStream);
    });

    call.on('close', () => {
        newFriendCam.remove();
    });

    if (isScreenSharing && currentScreenStream) {
        const screenCall = peer.call(peerId, currentScreenStream, { metadata: { type: 'screenshare' } });
        screenCalls.push(screenCall);
    }
}

function addVideoStream(videoElement, stream) {
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    
    makeVideoClickable(videoElement, stream);
    
    let exists = false;
    for (let i = 0; i < videoGrid.children.length; i++) {
        if (videoGrid.children[i].srcObject === stream) exists = true;
    }
    if (!exists) videoGrid.append(videoElement);
}

function makeVideoClickable(videoElement, stream) {
    videoElement.style.cursor = "pointer";
    videoElement.title = "Click to Pin to Center";
    
    videoElement.addEventListener('click', () => {
        video.removeAttribute('src'); 
        video.srcObject = stream;
        video.play();
    });
}

muteBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.innerText = audioTrack.enabled ? "Mute Mic" : "Unmute Mic";
    }
});

let isScreenSharing = false;

screenShareBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            currentScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

            activeCalls.forEach(call => {
                const screenCall = peer.call(call.peer, currentScreenStream, { metadata: { type: 'screenshare' } });
                screenCalls.push(screenCall);
            });

            video.removeAttribute('src'); 
            video.srcObject = currentScreenStream;
            video.play();
            
            isScreenSharing = true;
            screenShareBtn.innerText = "Stop Sharing";
            screenShareBtn.style.background = "#f43f5e"; 
            screenShareBtn.style.color = "white";

            if (currentRoom) {
                socket.emit('send_chat', { roomId: currentRoom, message: "I am sharing my screen! (It should auto-pin for you)" });
            }

            currentScreenStream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };
        } catch (error) {
            console.error("Error sharing screen:", error);
        }
    } else {
        stopScreenShare();
    }
});

function stopScreenShare() {
    if (!isScreenSharing) return;
    
    if (currentScreenStream) {
        currentScreenStream.getTracks().forEach(track => track.stop()); 
    }
    
    screenCalls.forEach(call => call.close());
    screenCalls = [];
    currentScreenStream = null;

    video.srcObject = null;

    isScreenSharing = false;
    screenShareBtn.innerText = "Share Screen";
    screenShareBtn.style.background = ""; 
    screenShareBtn.style.color = "";
}

// ==========================================
// 6. DEVICE SELECTION LOGIC
// ==========================================
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');

async function getDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameraSelect.innerHTML = '';
        micSelect.innerHTML = '';

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            
            if (device.kind === 'videoinput') {
                option.text = device.label || 'Camera ' + (cameraSelect.length + 1);
                cameraSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                option.text = device.label || 'Microphone ' + (micSelect.length + 1);
                micSelect.appendChild(option);
            }
        });
    } catch (err) {
        console.error("Error fetching devices", err);
    }
}

async function switchDevice() {
    if (isScreenSharing) return; 

    const audioSource = micSelect.value;
    const videoSource = cameraSelect.value;

    const constraints = {
        audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
        video: { deviceId: videoSource ? { exact: videoSource } : undefined }
    };

    try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        myCam.srcObject = newStream;

        const newVideoTrack = newStream.getVideoTracks()[0];
        const newAudioTrack = newStream.getAudioTracks()[0];

        activeCalls.forEach(call => {
            const senderVideo = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            const senderAudio = call.peerConnection.getSenders().find(s => s.track.kind === 'audio');
            
            if (senderVideo) senderVideo.replaceTrack(newVideoTrack);
            if (senderAudio) senderAudio.replaceTrack(newAudioTrack);
        });

        localStream.getTracks().forEach(track => track.stop());
        localStream = newStream;
        makeVideoClickable(myCam, localStream);

    } catch (err) {
        console.error("Error switching devices", err);
    }
}

cameraSelect.addEventListener('change', switchDevice);
micSelect.addEventListener('change', switchDevice);

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(() => {
        getDevices();
    })
    .catch(() => {});

// ==========================================
// 7. FLOATING REACTIONS LOGIC
// ==========================================
const reactionBtns = document.querySelectorAll('.reaction-btn');
const reactionContainer = document.getElementById('reaction-container');

if (reactionBtns.length > 0 && reactionContainer) {
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji');
            
            // Show it on our own screen instantly
            showReaction(emoji);

            // Send it to friends if we are in a room
            if (currentRoom) {
                socket.emit('send_reaction', { roomId: currentRoom, emoji: emoji });
            }
        });
    });

    socket.on('receive_reaction', (emoji) => {
        showReaction(emoji);
    });
}

function showReaction(emoji) {
    if (!reactionContainer) return;
    
    const el = document.createElement('div');
    el.classList.add('floating-emoji');
    el.innerText = emoji;
    
    // Pick a random spot along the bottom 80% of the video width
    const randomX = Math.floor(Math.random() * 80) + 10; 
    el.style.left = `${randomX}%`;
    
    reactionContainer.appendChild(el);
    
    // Clean up the DOM after the animation finishes (2.5 seconds)
    setTimeout(() => {
        el.remove();
    }, 2500);
}
