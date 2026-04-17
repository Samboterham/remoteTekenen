const socket = io();
const canvas = document.getElementById('viewerCanvas');
const ctx = canvas.getContext('2d');
let roomId;

// Make the canvas full screen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set initially

// Generate a random 6 character room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function init() {
    roomId = generateRoomCode();
    document.getElementById('roomCodeDisplay').innerText = roomId;
    
    // Attempt to grab local IP for the QR code
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        // Use the IP to generate the link
        const drawUrl = `http://${config.localIP}:${config.port}/draw.html?room=${roomId}`;
        
        // Generate QR Code
        document.getElementById('qrcode').innerHTML = ""; // Clear existing just in case
        new QRCode(document.getElementById('qrcode'), {
            text: drawUrl,
            width: 200,
            height: 200,
            colorDark: '#11121A',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.L
        });
        
        // Join the socket room
        socket.emit('joinRoom', { roomId, role: 'viewer' });
        
    } catch(err) {
        console.error("Failed to load config, fallback to localhost URL", err);
    }
}

init();

// When someone joins the room (a drawer), hide the modal
socket.on('userJoined', (data) => {
    if (data.role === 'drawer') {
        document.getElementById('joinModal').classList.add('hidden');
    }
});

// Helper function to draw a line segment
function drawSegment(x0, y0, x1, y1, color, size, isEraser) {
    ctx.beginPath();
    ctx.moveTo(x0 * canvas.width, y0 * canvas.height); // Expand normalized coordinates
    ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
        ctx.globalCompositeOperation = "source-over";
    }

    ctx.stroke();
    ctx.closePath();
}

// Receive real-time drawing actions
socket.on('drawEvent', (data) => {
    drawSegment(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.isEraser);
});

// Sync full canvas (Undo/Redo usually triggers this)
socket.on('syncCanvas', (paths) => {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw all paths
    paths.forEach(path => {
        for (let i = 1; i < path.points.length; i++) {
            const p0 = path.points[i - 1];
            const p1 = path.points[i];
            drawSegment(p0.x, p0.y, p1.x, p1.y, path.color, path.size, path.isEraser);
        }
    });
});

// Clear canvas event
socket.on('clearCanvas', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
