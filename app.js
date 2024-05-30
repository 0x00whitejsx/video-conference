const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');
const shareScreenButton = document.getElementById('shareScreen');
const recordButton = document.getElementById('record');
const stopRecordingButton = document.getElementById('stopRecording');
const socket = io();



let localStream;
let remoteStream;
let peerConnection;
let mediaRecorder;
let recordedChunks = [];

// ICE servers configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
    })
    .catch(error => console.error('Error accessing media devices.', error));

// Create Peer Connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = handleICECandidateEvent;
    peerConnection.ontrack = handleTrackEvent;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

// Handle ICE Candidate Event
function handleICECandidateEvent(event) {
    if (event.candidate) {
        // Send the candidate to the remote peer
        console.log('New ICE candidate', event.candidate);
    }
}

// Handle Track Event
function handleTrackEvent(event) {
    remoteVideo.srcObject = event.streams[0];
}

// Start Call
startCallButton.addEventListener('click', () => {
    createPeerConnection();
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            // Send the offer to the remote peer
            console.log('Offer sent:', peerConnection.localDescription);
        });
});

// Share Screen
shareScreenButton.addEventListener('click', () => {
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(screenStream => {
            let screenTrack = screenStream.getVideoTracks()[0];
            peerConnection.addTrack(screenTrack, screenStream);

            // Replace video track in local video element
            localVideo.srcObject = screenStream;

            // Listen for the screen track to stop (e.g., when the user stops sharing their screen)
            screenTrack.onended = () => {
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                localVideo.srcObject = localStream;
            };
        })
        .catch(error => console.error('Error sharing screen.', error));
});

// Record Conference
recordButton.addEventListener('click', () => {
    recordedChunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9' };
    mediaRecorder = new MediaRecorder(localStream, options);
    
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();
    console.log('Recording started.');
});

function handleDataAvailable(event) {
    if (event.data.size > 0) {
        recordedChunks.push(event.data);
    }
}

function handleStop(event) {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'recorded_conference.webm';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
}

stopRecordingButton.addEventListener('click', () => {
    mediaRecorder.stop();
    console.log('Recording stopped.');
});



// Send Offer
peerConnection.createOffer()
    .then(offer => {
        peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
    });

// Handle Offer
socket.on('offer', (offer) => {
    createPeerConnection();
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => {
            peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
        });
});

// Handle Answer
socket.on('answer', (answer) => {
    const remoteDesc = new RTCSessionDescription(answer);
    peerConnection.setRemoteDescription(remoteDesc);
});

// Handle ICE Candidate
socket.on('candidate', (candidate) => {
    const iceCandidate = new RTCIceCandidate(candidate);
    peerConnection.addIceCandidate(iceCandidate);
});

peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        socket.emit('candidate', event.candidate);
    }
};

peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
};