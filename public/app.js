// ==========================================
// FIREBASE MODULAR AUTHENTICATION & DATABASE SETUP
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
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCGkUPgeetqOHPHuED207A1vmrGos6Jr9M",
    authDomain: "bingeplay-67edc.firebaseapp.com",
    projectId: "bingeplay-67edc",
    storageBucket: "bingeplay-67edc.firebasestorage.app",
    messagingSenderId: "478808476965",
    appId: "1:478808476965:web:94bc09c303eed8a7a85ecc",
    measurementId: "G-D1W3BJY37W"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); 
const googleProvider = new GoogleAuthProvider();

const authOverlay = document.getElementById('authOverlay');
const mainApp = document.getElementById('mainApp');
const lobbySection = document.getElementById('lobbySection');
const roomSection = document.getElementById('roomSection');

const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authError = document.getElementById('authError');
const currentUserDisplay = document.getElementById('currentUserDisplay');

let appUser = null;
let myName = "User"; 
let globalRooms = [];

// ==========================================
// SOUNDBOARD SETUP (LOCAL FILES)
// ==========================================
const sounds = {
    'ding': new Audio('./soundeffects/ding-sound-effect_2.mp3'),
    'crack': new Audio('./soundeffects/bone-crack.mp3'),
    'rizz': new Audio('./soundeffects/rizz-sound-effect.mp3'),
    'omg': new Audio('./soundeffects/oh-my-god-bro-oh-hell-nah-man.mp3'),
    'fahhh': new Audio('./soundeffects/fahhh_KcgAXfs.mp3')
};

sounds['ding'].volume = 0.5;
sounds['crack'].volume = 0.6;
sounds['rizz'].volume = 0.5;
sounds['omg'].volume = 0.5;
sounds['fahhh'].volume = 0.5;

function playSound(soundId) {
    const originalAudio = sounds[soundId];
    if (originalAudio) {
        // Clone node so rapid clicking won't interrupt ongoing sound buffers
        const soundClone = originalAudio.cloneNode();
        soundClone.volume = originalAudio.volume;
        soundClone.play().catch(() => {}); 
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        appUser = user;
        myName = user.displayName || (user.email ? user.email.split('@')[0] : "User");
        
        authOverlay.style.display = 'none';
        mainApp.style.display = 'flex';
        lobbySection.style.display = 'block'; 
        roomSection.style.display = 'none';
        currentUserDisplay.innerText = myName; 

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                document.getElementById('profileBioInput').value = data.bio || "";
                document.getElementById('profileGenreSelect').value = data.favoriteGenre || "Sci-Fi & Fantasy";
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        }
    } else {
        appUser = null;
        myName = "User";
        authOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

loginBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(error => { authError.innerText = error.message; authError.style.display = 'block'; });
});

signupBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(error => { authError.innerText = error.message; authError.style.display = 'block'; });
});

googleLoginBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    signInWithPopup(auth, googleProvider)
        .catch(error => { authError.innerText = error.message; authError.style.display = 'block'; });
});

logoutBtn.addEventListener('click', () => { signOut(auth); });

const openProfileBtn = document.getElementById('openProfileBtn');
const profileModal = document.getElementById('profileModal');
const closeProfileBtn = document.getElementById('closeProfileBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');

openProfileBtn.addEventListener('click', () => profileModal.style.display = 'flex');
closeProfileBtn.addEventListener('click', () => profileModal.style.display = 'none');

saveProfileBtn.addEventListener('click', async () => {
    if (!appUser) return;
    saveProfileBtn.innerText = "Saving...";
    
    const bio = document.getElementById('profileBioInput').value;
    const genre = document.getElementById('profileGenreSelect').value;

    try {
        await setDoc(doc(db, "users", appUser.uid), {
            displayName: myName,
            bio: bio,
            favoriteGenre: genre
        }, { merge: true });
        
        alert("Profile saved successfully!");
        profileModal.style.display = 'none';
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Failed to save profile. Make sure Firestore is enabled.");
    }
    
    saveProfileBtn.innerText = "Save Profile";
});

// ==========================================
// PEERJS, WEBTORRENT & SOCKET SETUP
// ==========================================
const socket = io(); 
const video = document.getElementById('videoPlayer');
const wtClient = new WebTorrent();

let peer = null; 
let myPeerId = null;

async function initializeWebRTC() {
    try {
        const response = await fetch('/api/ice-servers');
        const iceServers = await response.json();

        peer = new Peer({
            secure: true,
            config: {
                iceServers: iceServers
            }
        }); 

        peer.on('open', (id) => { myPeerId = id; });
        peer.on('error', (err) => { 
            console.error("PeerJS Error:", err);
            if (!myPeerId) myPeerId = "fallback-id-" + Math.random().toString(36).substring(7); 
        });
    } catch (error) {
        console.error("Failed to fetch secure ICE servers:", error);
    }
}
initializeWebRTC();

// ==========================================
// 1. LOBBY & ROOM LOGIC
// ==========================================
const newRoomInput = document.getElementById('newRoomInput');
const roomCategory = document.getElementById('roomCategory');
const roomVisibility = document.getElementById('roomVisibility');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinPrivateRoomInput = document.getElementById('joinPrivateRoomInput');
const joinPrivateRoomBtn = document.getElementById('joinPrivateRoomBtn');
const publicRoomsList = document.getElementById('publicRoomsList');
const filterCategory = document.getElementById('filterCategory');
const roomDisplay = document.getElementById('roomDisplay');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
let currentRoom = null;

function enterRoom(roomId, isPublic = false, category = 'Movie Night', isCreating = false) {
    if (!myPeerId || !peer) return alert("Waiting for connection servers... try again in a moment.");
    currentRoom = roomId;
    roomDisplay.innerText = currentRoom;
    
    if (isCreating) {
        socket.emit('create_room', { roomId, isPublic, category });
    }
    socket.emit('join_room', { roomId, peerId: myPeerId });
    
    lobbySection.style.display = 'none';
    roomSection.style.display = 'flex';
    startLocalVideo(); 
}

createRoomBtn.addEventListener('click', () => {
    const roomId = newRoomInput.value.trim();
    if (roomId) enterRoom(roomId, roomVisibility.value === 'public', roomCategory.value, true);
});

joinPrivateRoomBtn.addEventListener('click', () => {
    const roomId = joinPrivateRoomInput.value.trim();
    if (roomId) enterRoom(roomId, false, 'Private', false);
});

leaveRoomBtn.addEventListener('click', () => { window.location.reload(); });

socket.on('update_rooms', (rooms) => {
    globalRooms = rooms;
    renderRoomList();
});

filterCategory.addEventListener('change', renderRoomList);

function renderRoomList() {
    publicRoomsList.innerHTML = '';
    const selectedFilter = filterCategory.value;
    const filtered = globalRooms.filter(r => selectedFilter === 'all' || r.category === selectedFilter);

    if (filtered.length === 0) {
        publicRoomsList.innerHTML = '<p style="color: #4b5563; font-weight: 600;">No rooms found in this category.</p>';
        return;
    }

    filtered.forEach(room => {
        const el = document.createElement('div');
        el.classList.add('room-item');
        el.innerHTML = `
            <div>
                <h4 style="font-size: 20px; font-weight: 700;">${room.roomId}</h4>
                <span style="font-size: 13px; background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${room.category}</span>
                <span style="font-size: 14px; font-weight: 600; color: #4b5563; margin-left: 8px;">👥 ${room.users} User(s)</span>
            </div>
            <button class="join-public-btn">Join Party</button>
        `;
        el.querySelector('button').addEventListener('click', () => enterRoom(room.roomId, true, room.category, false));
        publicRoomsList.appendChild(el);
    });
}

// ==========================================
// 2. VIDEO SYNC LOGIC (WEBTORRENT, HTML5, YOUTUBE)
// ==========================================
let ytPlayer;
let isYouTubeActive = false;
let ytEmitLock = false;
let isRemoteAction = false; // Prevents recursive sync feedback loops

function initYouTubePlayer() {
    ytPlayer = new YT.Player('ytPlayer', { 
        height: '100%', 
        width: '100%', 
        videoId: '', 
        events: { 'onStateChange': onPlayerStateChange } 
    });
}
if (window.YT && window.YT.Player) { initYouTubePlayer(); } else { window.onYouTubeIframeAPIReady = initYouTubePlayer; }

function onPlayerStateChange(event) {
    if (ytEmitLock || !currentRoom) return;
    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('play_video', currentRoom); 
        socket.emit('seek_video', { roomId: currentRoom, time: ytPlayer.getCurrentTime() });
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('pause_video', currentRoom);
    }
}

// Native Video Listeners (Broadcasting local play, pause, seek)
video.addEventListener('play', () => { 
    if (!isRemoteAction && currentRoom && !isYouTubeActive) {
        socket.emit('play_video', currentRoom); 
    } 
});

video.addEventListener('pause', () => { 
    if (!isRemoteAction && currentRoom && !isYouTubeActive) {
        socket.emit('pause_video', currentRoom); 
    } 
});

video.addEventListener('seeked', () => { 
    if (!isRemoteAction && currentRoom && !isYouTubeActive) {
        socket.emit('seek_video', { roomId: currentRoom, time: video.currentTime }); 
    } 
});

// Receiving Sync Commands From Other Users
socket.on('receive_play', () => { 
    if (isYouTubeActive && ytPlayer && ytPlayer.playVideo) { 
        ytEmitLock = true; 
        ytPlayer.playVideo(); 
        setTimeout(() => ytEmitLock = false, 600); 
    } else { 
        isRemoteAction = true;
        video.play().catch(() => {}).finally(() => {
            setTimeout(() => { isRemoteAction = false; }, 400);
        });
    } 
});

socket.on('receive_pause', () => { 
    if (isYouTubeActive && ytPlayer && ytPlayer.pauseVideo) { 
        ytEmitLock = true; 
        ytPlayer.pauseVideo(); 
        setTimeout(() => ytEmitLock = false, 600); 
    } else { 
        isRemoteAction = true;
        video.pause();
        setTimeout(() => { isRemoteAction = false; }, 400);
    } 
});

socket.on('receive_seek', (time) => { 
    if (isYouTubeActive && ytPlayer && ytPlayer.seekTo) { 
        if (Math.abs(ytPlayer.getCurrentTime() - time) > 1.5) { 
            ytEmitLock = true; 
            ytPlayer.seekTo(time, true); 
            setTimeout(() => ytEmitLock = false, 600); 
        } 
    } else { 
        if (Math.abs(video.currentTime - time) > 1.5) { 
            isRemoteAction = true;
            video.currentTime = time; 
            setTimeout(() => { isRemoteAction = false; }, 400);
        } 
    } 
});

const videoUrlInput = document.getElementById('videoUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const localFileInput = document.getElementById('localFileInput');
const uploadBtn = document.getElementById('uploadBtn');

function parseYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp); return (match && match[2].length === 11) ? match[2] : null;
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
            ytEmitLock = true; 
            ytPlayer.loadVideoById(ytId); 
            setTimeout(() => ytEmitLock = false, 600); 
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
        socket.emit('change_video_url', { roomId: currentRoom, url: url, isTorrent: false }); 
        videoUrlInput.value = ''; 
    }
});

socket.on('receive_video_url', (data) => { 
    if (data.isTorrent) {
        appendMessage("Host started a local P2P stream! Downloading & buffering...", "System");
        wtClient.add(data.url, (torrent) => {
            const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.mkv')) || torrent.files[0];
            file.renderTo(video);
            isYouTubeActive = false;
            if (!isBoardOpen) { 
                document.getElementById('ytPlayer').style.display = 'none'; 
                document.getElementById('videoPlayer').style.display = 'block'; 
            }
        });
    } else {
        processVideoLink(data.url); 
        appendMessage("Video changed by room member.", "System"); 
    }
});

// WebTorrent Local Streaming (Host Seed)
uploadBtn.addEventListener('click', () => { localFileInput.click(); });
localFileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) { 
        if (!currentRoom) return alert("Please join or create a room first!");
        uploadBtn.innerText = "Seeding..."; 
        uploadBtn.disabled = true;
        
        wtClient.seed(file, (torrent) => {
            torrent.files[0].renderTo(video);
            isYouTubeActive = false;
            if (!isBoardOpen) { 
                document.getElementById('ytPlayer').style.display = 'none'; 
                document.getElementById('videoPlayer').style.display = 'block'; 
            }
            socket.emit('change_video_url', { roomId: currentRoom, url: torrent.magnetURI, isTorrent: true });
            socket.emit('send_chat', { roomId: currentRoom, message: "Started streaming a local movie via WebTorrent P2P!", sender: "System" });
            uploadBtn.innerText = "Stream Local P2P"; 
            uploadBtn.disabled = false;
        });
    }
});

// ==========================================
// 3. TABS, CHAT, ICEBREAKERS & THEATER MODE 
// ==========================================
const tabChatBtn = document.getElementById('tabChatBtn');
const tabStudyBtn = document.getElementById('tabStudyBtn');
const chatSection = document.getElementById('chatSection');
const studySection = document.getElementById('studySection');
const theaterModeBtn = document.getElementById('theaterModeBtn');
let isTheaterMode = false;

theaterModeBtn.addEventListener('click', () => {
    isTheaterMode = !isTheaterMode;
    document.body.classList.toggle('theater-mode', isTheaterMode);
    theaterModeBtn.innerText = isTheaterMode ? "☀️ Lights On" : "🎬 Theater Mode";
    theaterModeBtn.style.background = isTheaterMode ? "#fef08a" : "#1f2937";
    theaterModeBtn.style.color = isTheaterMode ? "#111827" : "white";
});

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
    msgElement.classList.add(sender === "You" || sender === "System" ? 'self' : 'other');
    msgElement.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight; 
}

sendChatBtn.addEventListener('click', () => {
    const msg = chatInput.value;
    if (msg.trim() !== "" && currentRoom) {
        appendMessage(msg, "You");
        socket.emit('send_chat', { roomId: currentRoom, message: msg, sender: myName });
        chatInput.value = ''; 
    }
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatBtn.click(); } });
socket.on('receive_chat', (data) => { appendMessage(data.message, data.sender || "Friend"); });

const icebreakers = [
    "What is the absolute best movie soundtrack of all time?",
    "If you could live inside any animated movie universe, which would you pick?",
    "What's a hot take opinion you have about cinema?",
    "If you were hosting a talk show, who would be your first guest?"
];
document.getElementById('icebreakerBtn').addEventListener('click', () => {
    const randomQuestion = icebreakers[Math.floor(Math.random() * icebreakers.length)];
    const fullMsg = `🎲 Icebreaker: ${randomQuestion}`;
    appendMessage(fullMsg, "System");
    if (currentRoom) socket.emit('send_chat', { roomId: currentRoom, message: fullMsg, sender: "System" });
});

// SOUNDBOARD CLICK LISTENERS
const soundBtns = document.querySelectorAll('.sound-btn');
soundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const soundId = btn.getAttribute('data-sound');
        playSound(soundId);
        if (currentRoom) {
            socket.emit('play_sound', { roomId: currentRoom, soundId: soundId });
        }
    });
});

socket.on('receive_sound', (soundId) => {
    playSound(soundId);
});

// ==========================================
// 4. WHITEBOARD & 5. POMODORO TIMER LOGIC
// ==========================================
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const clearBoardBtn = document.getElementById('clearBoardBtn');
const openBoardBtn = document.getElementById('openBoardBtn');
const whiteboardContainer = document.getElementById('whiteboardContainer');

let isDrawing = false; let current = { x: 0, y: 0 }; let isBoardOpen = false;

function resizeCanvas() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
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
socket.on('receive_toggle_board', (isOpen) => { isBoardOpen = isOpen; toggleBoardUI(isBoardOpen); });

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
    socket.emit('draw_line', { roomId: currentRoom, x0: x0 / canvas.width, y0: y0 / canvas.height, x1: x1 / canvas.width, y1: y1 / canvas.height, color: color });
}

const getEventPos = (e) => { const rect = canvas.getBoundingClientRect(); const evt = e.touches ? e.touches[0] : e; return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }; };
const onMouseDown = (e) => { isDrawing = true; const pos = getEventPos(e); current.x = pos.x; current.y = pos.y; };
const onMouseUp = (e) => { if (!isDrawing) return; isDrawing = false; const pos = getEventPos(e); drawLine(current.x, current.y, pos.x, pos.y, colorPicker.value, true); };
const onMouseMove = (e) => { if (!isDrawing) return; const pos = getEventPos(e); drawLine(current.x, current.y, pos.x, pos.y, colorPicker.value, true); current.x = pos.x; current.y = pos.y; };

canvas.addEventListener('mousedown', onMouseDown); canvas.addEventListener('mouseup', onMouseUp); canvas.addEventListener('mouseout', onMouseUp); canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('touchstart', onMouseDown, { passive: true }); canvas.addEventListener('touchend', onMouseUp, { passive: true }); canvas.addEventListener('touchcancel', onMouseUp, { passive: true }); canvas.addEventListener('touchmove', onMouseMove, { passive: true });

socket.on('receive_draw_line', (data) => { drawLine(data.x0 * canvas.width, data.y0 * canvas.height, data.x1 * canvas.width, data.y1 * canvas.height, data.color, false); });
clearBoardBtn.addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); if (currentRoom) socket.emit('clear_board', currentRoom); });
socket.on('receive_clear_board', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });

const timerDisplay = document.getElementById('timerDisplay');
const startTimerBtn = document.getElementById('startTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');
let timerInterval; let timeLeft = 25 * 60; let isTimerRunning = false;

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60); const seconds = timeLeft % 60;
    timerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
function startSyncTimer() {
    if (isTimerRunning) return; isTimerRunning = true; startTimerBtn.innerText = "Pause Sync";
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--; updateTimerDisplay();
            if (timeLeft % 5 === 0 && currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: isTimerRunning });
        } else { clearInterval(timerInterval); isTimerRunning = false; startTimerBtn.innerText = "Start Sync"; alert("Focus session complete!"); }
    }, 1000);
}
function pauseTimer() { clearInterval(timerInterval); isTimerRunning = false; startTimerBtn.innerText = "Start Sync"; if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: false }); }
startTimerBtn.addEventListener('click', () => { if (isTimerRunning) pauseTimer(); else { startSyncTimer(); if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: true }); } });
resetTimerBtn.addEventListener('click', () => { pauseTimer(); timeLeft = 25 * 60; updateTimerDisplay(); if (currentRoom) socket.emit('sync_timer', { roomId: currentRoom, timeLeft: timeLeft, isRunning: false }); });
socket.on('receive_sync_timer', (data) => { timeLeft = data.timeLeft; updateTimerDisplay(); if (data.isRunning && !isTimerRunning) { startSyncTimer(); } else if (!data.isRunning && isTimerRunning) { clearInterval(timerInterval); isTimerRunning = false; startTimerBtn.innerText = "Start Sync"; } });

// ==========================================
// 6. WEBRTC & HARDWARE CONTROLS (ROBUST AUDIO)
// ==========================================
const videoGrid = document.getElementById('video-grid');
const myCam = document.getElementById('myCam');
const muteBtn = document.getElementById('muteBtn');
const camToggleBtn = document.getElementById('camToggleBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');

let localStream = null; 
const peers = {}; 
let currentScreenStream = null; 
let isScreenSharing = false; 
let isCamEnabled = true;

async function startLocalVideo() {
    if (localStream) return localStream; 

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            } 
        });
        myCam.srcObject = localStream;
        makeVideoClickable(myCam, localStream);

        const devices = await navigator.mediaDevices.enumerateDevices();
        cameraSelect.innerHTML = ''; micSelect.innerHTML = '';
        devices.forEach(device => {
            const option = document.createElement('option'); option.value = device.deviceId;
            if (device.kind === 'videoinput') { option.text = device.label || 'Camera ' + (cameraSelect.length + 1); cameraSelect.appendChild(option); } 
            else if (device.kind === 'audioinput') { option.text = device.label || 'Microphone ' + (micSelect.length + 1); micSelect.appendChild(option); }
        });

        peer.on('call', (call) => {
            call.answer(localStream); 
            const friendVideo = document.createElement('video');
            friendVideo.id = `video-${call.peer}`;

            call.on('stream', (friendStream) => {
                if (call.metadata && call.metadata.type === 'screenshare') {
                    isBoardOpen = false; toggleBoardUI(false); isYouTubeActive = false;
                    document.getElementById('ytPlayer').style.display = 'none'; document.getElementById('videoPlayer').style.display = 'block';
                    video.removeAttribute('src'); video.srcObject = friendStream; video.play();
                } else { 
                    addVideoStream(friendVideo, friendStream); 
                }
            });

            call.on('close', () => friendVideo.remove());
            call.on('error', (err) => { console.error("Peer call error:", err); friendVideo.remove(); });

            peers[call.peer] = call;
        });

        return localStream;
    } catch (error) { console.error("Error accessing media:", error); }
}

socket.on('user_connected', async (newPeerId) => { 
    const stream = localStream || await startLocalVideo();
    if (stream && newPeerId !== myPeerId) connectToNewUser(newPeerId, stream); 
});

function connectToNewUser(peerId, stream) {
    if (peers[peerId]) peers[peerId].close(); 

    const call = peer.call(peerId, stream); 
    const friendVideo = document.createElement('video');
    friendVideo.id = `video-${peerId}`;

    call.on('stream', (friendStream) => addVideoStream(friendVideo, friendStream));
    call.on('close', () => { friendVideo.remove(); delete peers[peerId]; });
    call.on('error', (err) => { console.error("Call error:", err); friendVideo.remove(); delete peers[peerId]; });

    peers[peerId] = call;

    if (isScreenSharing && currentScreenStream) { 
        peer.call(peerId, currentScreenStream, { metadata: { type: 'screenshare' } }); 
    }
}

function addVideoStream(videoElement, stream) {
    videoElement.srcObject = stream; videoElement.autoplay = true; videoElement.playsInline = true; makeVideoClickable(videoElement, stream);
    const existing = document.getElementById(videoElement.id);
    if (!existing) videoGrid.append(videoElement);
}

function makeVideoClickable(videoElement, stream) {
    videoElement.style.cursor = "pointer"; videoElement.title = "Click to Pin to Center";
    videoElement.addEventListener('click', () => {
        isBoardOpen = false; toggleBoardUI(false); isYouTubeActive = false;
        document.getElementById('ytPlayer').style.display = 'none'; document.getElementById('videoPlayer').style.display = 'block';
        video.removeAttribute('src'); video.srcObject = stream; video.play();
    });
}

function setMicState(enabled) {
    if (!localStream) return; 
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) { 
        audioTrack.enabled = enabled; 
        muteBtn.innerText = enabled ? "Mute Mic" : "Unmute Mic"; 
        if (enabled) { muteBtn.classList.add('talking'); } else { muteBtn.classList.remove('talking'); }
        if (currentRoom) { socket.emit('toggle_mute', { roomId: currentRoom, peerId: myPeerId, isMuted: !enabled }); }
    }
}

muteBtn.addEventListener('click', () => { if (!localStream || isPttMode) return; setMicState(!localStream.getAudioTracks()[0].enabled); });
camToggleBtn.addEventListener('click', () => { 
    if (!localStream) return; 
    const videoTrack = localStream.getVideoTracks()[0]; 
    if (videoTrack) { 
        isCamEnabled = !isCamEnabled; videoTrack.enabled = isCamEnabled; 
        camToggleBtn.innerText = isCamEnabled ? "Disable Cam" : "Enable Cam"; 
        myCam.classList.toggle('video-off', !isCamEnabled); 
        if (currentRoom) { socket.emit('toggle_cam', { roomId: currentRoom, peerId: myPeerId, isCamOff: !isCamEnabled }); }
    } 
});

socket.on('peer_muted', (data) => {
    const friendVid = document.getElementById(`video-${data.peerId}`);
    if (friendVid) friendVid.classList.toggle('peer-muted', data.isMuted);
});

socket.on('peer_cam_toggled', (data) => {
    const friendVid = document.getElementById(`video-${data.peerId}`);
    if (friendVid) friendVid.classList.toggle('peer-cam-off', data.isCamOff);
});

const pttToggleBtn = document.getElementById('pttToggleBtn'); const holdToTalkBtn = document.getElementById('holdToTalkBtn'); const pttHint = document.getElementById('pttHint');
let isPttMode = false; let isSpacePressed = false;
pttToggleBtn.addEventListener('click', () => { isPttMode = !isPttMode; pttToggleBtn.innerText = isPttMode ? "PTT: ON" : "PTT: OFF"; pttToggleBtn.classList.toggle('active', isPttMode); holdToTalkBtn.style.display = isPttMode ? "block" : "none"; pttHint.style.display = isPttMode ? "block" : "none"; setMicState(!isPttMode); });
window.addEventListener('keydown', (e) => { if (!isPttMode || isSpacePressed || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; if (e.code === 'Space') { e.preventDefault(); isSpacePressed = true; setMicState(true); holdToTalkBtn.style.background = "#10b981"; holdToTalkBtn.style.color = "white"; } });
window.addEventListener('keyup', (e) => { if (!isPttMode || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; if (e.code === 'Space') { e.preventDefault(); isSpacePressed = false; setMicState(false); holdToTalkBtn.style.background = ""; holdToTalkBtn.style.color = ""; } });

function startTalking(e) { if (!isPttMode) return; e.preventDefault(); setMicState(true); } function stopTalking(e) { if (!isPttMode) return; e.preventDefault(); setMicState(false); }
holdToTalkBtn.addEventListener('mousedown', startTalking); holdToTalkBtn.addEventListener('mouseup', stopTalking); holdToTalkBtn.addEventListener('mouseleave', stopTalking);
holdToTalkBtn.addEventListener('touchstart', startTalking, { passive: false }); holdToTalkBtn.addEventListener('touchend', stopTalking, { passive: false }); holdToTalkBtn.addEventListener('touchcancel', stopTalking, { passive: false });

screenShareBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            currentScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            Object.values(peers).forEach(call => { peer.call(call.peer, currentScreenStream, { metadata: { type: 'screenshare' } }); });
            isBoardOpen = false; toggleBoardUI(false); isYouTubeActive = false; document.getElementById('ytPlayer').style.display = 'none'; document.getElementById('videoPlayer').style.display = 'block';
            video.removeAttribute('src'); video.srcObject = currentScreenStream; video.play();
            isScreenSharing = true; screenShareBtn.innerText = "Stop Sharing"; screenShareBtn.style.background = "#f43f5e"; screenShareBtn.style.color = "white";
            if (currentRoom) socket.emit('send_chat', { roomId: currentRoom, message: "I am sharing my screen!", sender: myName });
            currentScreenStream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
        } catch (error) { console.error("Error sharing screen:", error); }
    } else { stopScreenShare(); }
});

function stopScreenShare() { if (!isScreenSharing) return; if (currentScreenStream) currentScreenStream.getTracks().forEach(track => track.stop()); currentScreenStream = null; video.srcObject = null; isScreenSharing = false; screenShareBtn.innerText = "Share Screen"; screenShareBtn.style.background = ""; screenShareBtn.style.color = ""; }

async function switchDevice() {
    if (isScreenSharing) return; const constraints = { audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }, video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined } };
    try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints); myCam.srcObject = newStream;
        const newVideoTrack = newStream.getVideoTracks()[0]; const newAudioTrack = newStream.getAudioTracks()[0];
        Object.values(peers).forEach(call => { 
            const senderVideo = call.peerConnection.getSenders().find(s => s.track.kind === 'video'); const senderAudio = call.peerConnection.getSenders().find(s => s.track.kind === 'audio'); 
            if (senderVideo) senderVideo.replaceTrack(newVideoTrack); if (senderAudio) senderAudio.replaceTrack(newAudioTrack); 
        });
        if (localStream) localStream.getTracks().forEach(track => track.stop()); 
        localStream = newStream; makeVideoClickable(myCam, localStream);
    } catch (err) { console.error("Error switching devices", err); }
}
cameraSelect.addEventListener('change', switchDevice); micSelect.addEventListener('change', switchDevice);

// 7. FLOATING REACTIONS LOGIC (Visual Only)
const reactionBtns = document.querySelectorAll('.reaction-btn'); const reactionContainer = document.getElementById('reaction-container');

if (reactionBtns.length > 0 && reactionContainer) { 
    reactionBtns.forEach(btn => { 
        btn.addEventListener('click', () => { 
            const emoji = btn.getAttribute('data-emoji'); 
            showReaction(emoji); 
            if (currentRoom) socket.emit('send_reaction', { roomId: currentRoom, emoji: emoji }); 
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
    el.style.left = `${Math.floor(Math.random() * 80) + 10}%`; 
    reactionContainer.appendChild(el); 
    setTimeout(() => { el.remove(); }, 2500); 
}
