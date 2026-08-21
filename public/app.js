// ==========================================
// FIREBASE MODULAR AUTHENTICATION SETUP
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCGkUPgeetqOHPHuED207A1vmrGos6Jr9M",
    authDomain: "bingeplay-67edc.firebaseapp.com",
    projectId: "bingeplay-67edc",
    storageBucket: "bingeplay-67edc.firebasestorage.app",
    messagingSenderId: "478808476965",
    appId: "1:478808476965:web:94bc09c303eed8a7a85ecc",
    measurementId: "G-D1W3BJY37W"
};

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const authOverlay = document.getElementById('authOverlay');
const mainApp = document.getElementById('mainApp');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authError = document.getElementById('authError');
const currentUserDisplay = document.getElementById('currentUserDisplay');

let appUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        appUser = user;
        authOverlay.style.display = 'none';
        mainApp.style.display = 'flex';
        currentUserDisplay.innerText = user.displayName || (user.email ? user.email.split('@')[0] : "User"); 
        startLocalVideo(); // Only initialize media after login
    } else {
        appUser = null;
        authOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

// Email Login Logic
loginBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(error => {
            authError.innerText = error.message;
            authError.style.display = 'block';
        });
});

// Email Signup Logic
signupBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(error => {
            authError.innerText = error.message;
            authError.style.display = 'block';
        });
});

// Google Login Logic
googleLoginBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    signInWithPopup(auth, googleProvider)
        .catch(error => {
            authError.innerText = error.message;
            authError.style.display = 'block';
        });
});

// Logout Logic
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// ==========================================
// EXISTING APP LOGIC
// ==========================================
const socket = io(); 
const video = document.getElementById('videoPlayer');

// PEERJS INITIALIZATION
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
    if (!myPeerId) myPeerId = "fallback-id-" + Math.random().toString(36).substring(7);
});

// 1. ROOM LOGIC
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

// 2. YOUTUBE API & VIDEO SYNC LOGIC
let ytPlayer;
let isYouTubeActive = false;
let ytEmitLock = false;

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('ytPlayer', {
        height: '100%',
        width: '100%',
        videoId: '',
        events: { 'onStateChange': onPlayerStateChange }
    });
}

function onPlayerStateChange(event) {
    if (ytEmitLock || !currentRoom) return;
    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('play_video', currentRoom);
        socket.emit('seek_video', { roomId: currentRoom, time: ytPlayer.getCurrentTime() });
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('pause_video', currentRoom);
    }
}

video.addEventListener('play', () => { if (currentRoom && !isYouTubeActive) socket.emit('play_video', currentRoom); });
video.addEventListener('pause', () => { if (currentRoom && !isYouTubeActive) socket.emit('pause_video', currentRoom); });
video.addEventListener('seeked', () => { if (currentRoom && !isYouTubeActive) socket.emit('seek_video', { roomId: currentRoom, time: video.currentTime }); });

socket.on('receive_play', () => {
    if (isYouTubeActive && ytPlayer && ytPlayer.playVideo) {
        ytEmitLock = true; ytPlayer.playVideo(); setTimeout(() => ytEmitLock = false, 500);
    } else { video.play(); }
});

socket.on('receive_pause', () => {
    if (isYouTubeActive && ytPlayer && ytPlayer.pauseVideo) {
        ytEmitLock = true; ytPlayer.pauseVideo(); setTimeout(() => ytEmitLock = false, 500);
    } else { video.pause(); }
});

socket.on('receive_seek', (time) => {
    if (isYouTubeActive && ytPlayer && ytPlayer.seekTo) {
        if (Math.abs(ytPlayer.getCurrentTime() - time) > 2) {
            ytEmitLock = true; ytPlayer.seekTo(time, true); setTimeout(() => ytEmitLock = false, 500);
        }
    } else {
        if (Math.abs(video.currentTime - time) > 1) video.currentTime = time;
    }
});

const videoUrlInput = document.getElementById('videoUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const localFileInput = document.getElementById('localFileInput');
const uploadBtn = document.getElementById('uploadBtn');

function parseYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function processVideoLink(url) {
    const ytId = parseYouTubeId(url);
    if (ytId) {
        isYouTubeActive = true;
        if (!isBoardOpen) {
            document.getElementById('videoPlayer').style.display = 'none';
            document.getElementById('ytPlayer').style.display = 'block';
        }
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytEmitLock = true; ytPlayer.loadVideoById(ytId); setTimeout(() => ytEmitLock = false, 500);
        }
    } else {
        isYouTubeActive = false;
        if (!isBoardOpen) {
            document.getElementById('ytPlayer').style.display = 'none';
            document.getElementById('videoPlayer').style.display = 'block';
        }
        video.src = url;
    }
}

loadUrlBtn.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();
    if (url && currentRoom) {
        processVideoLink(url);
        socket.emit('change_video_url', { roomId: currentRoom, url: url });
        videoUrlInput.value = ''; 
    } else if (!currentRoom) { alert("Please join a room first!"); }
});

socket.on('receive_video_url', (newUrl) => {
    processVideoLink(newUrl);
    appendMessage("The host changed the video!", "System");
});

uploadBtn.addEventListener('click', () => { localFileInput.click(); });
localFileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        processVideoLink(URL.createObjectURL(file));
        alert("Playing local file! (Note: Friends won't see this unless you Share Screen).");
    }
});

// 3. TABS & CHAT LOGIC
const tabChatBtn = document.getElementById('tabChatBtn');
const tabStudyBtn = document.getElementById('tabStudyBtn');
const chatSection = document.getElementById('chatSection');
const studySection = document.getElementById('studySection');

tabChatBtn.addEventListener('click', () => {
    tabChatBtn.classList.add('active');
    tabStudyBtn.classList.remove('active');
    chatSection.style.display = 'flex';
    studySection.style.display = 'none';
});

tabStudyBtn.addEventListener('click', () => {
    tabStudyBtn.classList.add('active');
    tabChatBtn.classList.remove('active');
    studySection.style.display = 'flex';
    chatSection.style.display = 'none';
});

const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatBox = document.getElementById('chatBox');

function appendMessage(msg, sender) {
    const msgElement = document.createElement('div');
    msgElement.classList.add('chat-message');
    msgElement.classList.add(sender === "You" ? 'self' : 'other');
    msgElement.innerHTML = `<strong>${sender}:</strong>${msg}`;
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

chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatBtn.click(); } });
socket.on('receive_chat', (msg) => { appendMessage(msg, "Friend"); });

// 4. MAIN SCREEN WHITEBOARD LOGIC
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const clearBoardBtn = document.getElementById('clearBoardBtn');
const openBoardBtn = document.getElementById('openBoardBtn');
const whiteboardContainer = document.getElementById('whiteboardContainer');

let isDrawing = false;
let current = { x: 0, y: 0 };
let isBoardOpen = false;

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

function toggleBoardUI(isOpen) {
    if (isOpen) {
        whiteboardContainer.style.display = 'block';
        openBoardBtn.innerText = "Close Whiteboard";
        openBoardBtn.style.background = "#f43f5e";
        openBoardBtn.style.color = "white";
        document.getElementById('videoPlayer').style.display = 'none';
        document.getElementById('ytPlayer').style.display = 'none';
        setTimeout(resizeCanvas, 50);
    } else {
        whiteboardContainer.style.display = 'none';
        openBoardBtn.innerText = "Open Whiteboard";
        openBoardBtn.style.background = "#a78bfa";
        openBoardBtn.style.color = "#111827";
        if (isYouTubeActive) {
            document.getElementById('ytPlayer').style.display = 'block';
        } else {
            document.getElementById('videoPlayer').style.display = 'block';
        }
    }
}

openBoardBtn.addEventListener('click', () => {
    isBoardOpen = !isBoardOpen;
    toggleBoardUI(isBoardOpen);
    if (currentRoom) socket.emit('toggle_board', { roomId: currentRoom, isOpen: isBoardOpen });
});

socket.on('receive_toggle_board', (isOpen) => {
    isBoardOpen = isOpen;
    toggleBoardUI(isBoardOpen);
});

function drawLine(x0, y0, x1, y1, color, emit) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();

    if (!emit || !currentRoom) return;
    const w = canvas.width;
    const h = canvas.height;
    socket.emit('draw_line', {
        roomId: currentRoom,
        x0: x0 / w, y0: y0 / h,
        x1: x1 / w, y1: y1 / h,
        color: color
    });
}

const getEventPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const evt = e.touches ? e.touches[0] : e;
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
};

const onMouseDown = (e) => {
    isDrawing = true;
    const pos = getEventPos(e);
    current.x = pos.x; current.y = pos.y;
};

const onMouseUp = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const pos = getEventPos(e);
    drawLine(current.x, current.y, pos.x, pos.y, colorPicker.value, true);
};

const onMouseMove = (e) => {
    if (!isDrawing) return;
    const pos = getEventPos(e);
    drawLine(current.x, current.y, pos.x, pos.y, colorPicker.value, true);
    current.x = pos.x; current.y = pos.y;
};

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseout', onMouseUp);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('touchstart', onMouseDown, { passive: true });
canvas.addEventListener('touchend', onMouseUp, { passive: true });
canvas.addEventListener('touchcancel', onMouseUp, { passive: true });
canvas.addEventListener('touchmove', onMouseMove, { passive: true });

socket.on('receive_draw_line', (data) => {
    const w = canvas.width;
    const h = canvas.height;
    drawLine(data.x0 * w, data.y0 * h, data.x1 * w, data.y1 * h, data.color, false);
});

clearBoardBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentRoom) socket.emit('clear_board', currentRoom);
});

socket.on('receive_clear_board', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// 5. STUDY HUB: POMODORO TIMER LOGIC
const timerDisplay = document.getElementById('timerDisplay');
const startTimerBtn = document.getElementById('startTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');

let timerInterval;
let timeLeft = 25 * 60; // 25 Minutes
let isTimerRunning = false;

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startSyncTimer() {
    if (isTimerRunning) return;
    isTimerRunning = true;
    startTimerBtn.innerText = "Pause Sync";
    
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft % 5 === 0 && currentRoom) {
                socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: isTimerRunning });
            }
        } else {
            clearInterval(timerInterval);
            isTimerRunning = false;
            startTimerBtn.innerText = "Start Sync";
            alert("Focus session complete!");
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    startTimerBtn.innerText = "Start Sync";
    if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: false });
}

startTimerBtn.addEventListener('click', () => {
    if (isTimerRunning) pauseTimer();
    else {
        startSyncTimer();
        if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: true });
    }
});

resetTimerBtn.addEventListener('click', () => {
    pauseTimer();
    timeLeft = 25 * 60;
    updateTimerDisplay();
    if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: false });
});

socket.on('receive_sync_timer', (data) => {
    timeLeft = data.timeLeft;
    updateTimerDisplay();
    
    if (data.isRunning && !isTimerRunning) {
        startSyncTimer();
    } else if (!data.isRunning && isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        startTimerBtn.innerText = "Start Sync";
    }
});

// 6. WEBRTC & HARDWARE CONTROLS
const videoGrid = document.getElementById('video-grid');
const myCam = document.getElementById('myCam');
const muteBtn = document.getElementById('muteBtn');
const camToggleBtn = document.getElementById('camToggleBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');

let localStream; 
let activeCalls = []; 
let screenCalls = []; 
let currentScreenStream = null; 
let isScreenSharing = false;
let isCamEnabled = true;

async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        myCam.srcObject = localStream;
        makeVideoClickable(myCam, localStream);

        const devices = await navigator.mediaDevices.enumerateDevices();
        cameraSelect.innerHTML = ''; micSelect.innerHTML = '';
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

        peer.on('call', (call) => {
            call.answer(localStream); 
            const newFriendCam = document.createElement('video');
            if (call.metadata && call.metadata.type === 'screenshare') {
                call.on('stream', (friendStream) => {
                    addVideoStream(newFriendCam, friendStream);
                    isBoardOpen = false; toggleBoardUI(false);
                    isYouTubeActive = false;
                    document.getElementById('ytPlayer').style.display = 'none';
                    document.getElementById('videoPlayer').style.display = 'block';
                    video.removeAttribute('src'); video.srcObject = friendStream; video.play();
                });
            } else {
                activeCalls.push(call); 
                call.on('stream', (friendStream) => { addVideoStream(newFriendCam, friendStream); });
            }
            call.on('close', () => { newFriendCam.remove(); });
        });
    } catch (error) { console.error("Error accessing media:", error); }
}

socket.on('user_connected', (newPeerId) => { connectToNewUser(newPeerId, localStream); });

function connectToNewUser(peerId, stream) {
    const call = peer.call(peerId, stream); 
    activeCalls.push(call); 
    const newFriendCam = document.createElement('video');
    call.on('stream', (friendStream) => { addVideoStream(newFriendCam, friendStream); });
    call.on('close', () => { newFriendCam.remove(); });

    if (isScreenSharing && currentScreenStream) {
        const screenCall = peer.call(peerId, currentScreenStream, { metadata: { type: 'screenshare' } });
        screenCalls.push(screenCall);
    }
}

function addVideoStream(videoElement, stream) {
    videoElement.srcObject = stream; videoElement.autoplay = true; videoElement.playsInline = true;
    makeVideoClickable(videoElement, stream);
    let exists = false;
    for (let i = 0; i < videoGrid.children.length; i++) { if (videoGrid.children[i].srcObject === stream) exists = true; }
    if (!exists) videoGrid.append(videoElement);
}

function makeVideoClickable(videoElement, stream) {
    videoElement.style.cursor = "pointer"; videoElement.title = "Click to Pin to Center";
    videoElement.addEventListener('click', () => {
        isBoardOpen = false; toggleBoardUI(false);
        isYouTubeActive = false;
        document.getElementById('ytPlayer').style.display = 'none';
        document.getElementById('videoPlayer').style.display = 'block';
        video.removeAttribute('src'); video.srcObject = stream; video.play();
    });
}

function setMicState(enabled) {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = enabled; muteBtn.innerText = enabled ? "Mute Mic" : "Unmute Mic";
        if (enabled) { muteBtn.classList.add('talking'); } else { muteBtn.classList.remove('talking'); }
    }
}

muteBtn.addEventListener('click', () => {
    if (!localStream || isPttMode) return;
    setMicState(!localStream.getAudioTracks()[0].enabled);
});

camToggleBtn.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCamEnabled = !isCamEnabled; videoTrack.enabled = isCamEnabled;
        camToggleBtn.innerText = isCamEnabled ? "Disable Cam" : "Enable Cam";
        myCam.classList.toggle('video-off', !isCamEnabled);
    }
});

const pttToggleBtn = document.getElementById('pttToggleBtn');
const holdToTalkBtn = document.getElementById('holdToTalkBtn');
const pttHint = document.getElementById('pttHint');
let isPttMode = false;
let isSpacePressed = false;

pttToggleBtn.addEventListener('click', () => {
    isPttMode = !isPttMode; pttToggleBtn.innerText = isPttMode ? "PTT: ON" : "PTT: OFF"; pttToggleBtn.classList.toggle('active', isPttMode);
    holdToTalkBtn.style.display = isPttMode ? "block" : "none"; pttHint.style.display = isPttMode ? "block" : "none";
    setMicState(!isPttMode);
});

window.addEventListener('keydown', (e) => {
    if (!isPttMode || isSpacePressed || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); isSpacePressed = true; setMicState(true); holdToTalkBtn.style.background = "#10b981"; holdToTalkBtn.style.color = "white"; }
});

window.addEventListener('keyup', (e) => {
    if (!isPttMode || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); isSpacePressed = false; setMicState(false); holdToTalkBtn.style.background = ""; holdToTalkBtn.style.color = ""; }
});

function startTalking(e) { if (!isPttMode) return; e.preventDefault(); setMicState(true); }
function stopTalking(e) { if (!isPttMode) return; e.preventDefault(); setMicState(false); }
holdToTalkBtn.addEventListener('mousedown', startTalking); holdToTalkBtn.addEventListener('mouseup', stopTalking); holdToTalkBtn.addEventListener('mouseleave', stopTalking);
holdToTalkBtn.addEventListener('touchstart', startTalking, { passive: false }); holdToTalkBtn.addEventListener('touchend', stopTalking, { passive: false }); holdToTalkBtn.addEventListener('touchcancel', stopTalking, { passive: false });

screenShareBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            currentScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            activeCalls.forEach(call => { screenCalls.push(peer.call(call.peer, currentScreenStream, { metadata: { type: 'screenshare' } })); });
            isBoardOpen = false; toggleBoardUI(false);
            isYouTubeActive = false; document.getElementById('ytPlayer').style.display = 'none'; document.getElementById('videoPlayer').style.display = 'block';
            video.removeAttribute('src'); video.srcObject = currentScreenStream; video.play();
            isScreenSharing = true; screenShareBtn.innerText = "Stop Sharing"; screenShareBtn.style.background = "#f43f5e"; screenShareBtn.style.color = "white";
            if (currentRoom) socket.emit('send_chat', { roomId: currentRoom, message: "I am sharing my screen!" });
            currentScreenStream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
        } catch (error) { console.error("Error sharing screen:", error); }
    } else { stopScreenShare(); }
});

function stopScreenShare() {
    if (!isScreenSharing) return;
    if (currentScreenStream) currentScreenStream.getTracks().forEach(track => track.stop()); 
    screenCalls.forEach(call => call.close()); screenCalls = []; currentScreenStream = null; video.srcObject = null;
    isScreenSharing = false; screenShareBtn.innerText = "Share Screen"; screenShareBtn.style.background = ""; screenShareBtn.style.color = "";
}

async function switchDevice() {
    if (isScreenSharing) return; 
    const constraints = { audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }, video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined } };
    try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        myCam.srcObject = newStream;
        const newVideoTrack = newStream.getVideoTracks()[0]; const newAudioTrack = newStream.getAudioTracks()[0];
        activeCalls.forEach(call => {
            const senderVideo = call.peerConnection.getSenders().find(s => s.track.kind === 'video'); const senderAudio = call.peerConnection.getSenders().find(s => s.track.kind === 'audio');
            if (senderVideo) senderVideo.replaceTrack(newVideoTrack); if (senderAudio) senderAudio.replaceTrack(newAudioTrack);
        });
        localStream.getTracks().forEach(track => track.stop()); localStream = newStream; makeVideoClickable(myCam, localStream);
    } catch (err) { console.error("Error switching devices", err); }
}
cameraSelect.addEventListener('change', switchDevice); micSelect.addEventListener('change', switchDevice);

// 7. FLOATING REACTIONS LOGIC
const reactionBtns = document.querySelectorAll('.reaction-btn');
const reactionContainer = document.getElementById('reaction-container');

if (reactionBtns.length > 0 && reactionContainer) {
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji'); showReaction(emoji);
            if (currentRoom) socket.emit('send_reaction', { roomId: currentRoom, emoji: emoji });
        });
    });
    socket.on('receive_reaction', (emoji) => { showReaction(emoji); });
}

function showReaction(emoji) {
    if (!reactionContainer) return;
    const el = document.createElement('div'); el.classList.add('floating-emoji'); el.innerText = emoji;
    el.style.left = `${Math.floor(Math.random() * 80) + 10}%`; reactionContainer.appendChild(el);
    setTimeout(() => { el.remove(); }, 2500);
}
