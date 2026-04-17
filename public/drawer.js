const socket = io();
const canvas = document.getElementById('drawerCanvas');
const ctx = canvas.getContext('2d');

// Grab Room ID
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (!roomId) {
    alert("No room code found. Please connect via QR code.");
} else {
    socket.emit('joinRoom', { roomId, role: 'drawer' });
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// State Variables
let isDrawing = false;
let currentMode = 'pen'; 
let currentColor = '#000000';
let currentSize = 6; 
let lastX = 0; let lastY = 0;

let paths = [];
let redoStack = [];
let currentPath = null;

// ==================================
// New UI Event Listeners
// ==================================
const btnPen = document.getElementById('btnPen');
const btnEraser = document.getElementById('btnEraser');
const btnClear = document.getElementById('btnClear');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

const colorDots = document.querySelectorAll('.color-dot[data-color]');
const sizeDots = document.querySelectorAll('.dot[data-size]');

// Tool Selection
function setActiveTool(toolBtn, mode) {
    currentMode = mode;
    // Clear styles
    btnPen.classList.remove('active');
    btnPen.style.background = 'transparent';
    btnPen.style.color = 'var(--inactive-icon)';
    
    btnEraser.classList.remove('active');
    btnEraser.style.background = 'transparent';
    btnEraser.style.color = 'var(--inactive-icon)';
    
    // Apply styles to active
    toolBtn.classList.add('active');
    toolBtn.style.background = 'var(--text-dark)';
    toolBtn.style.color = 'white';
}

btnPen.addEventListener('click', () => setActiveTool(btnPen, 'pen'));
btnEraser.addEventListener('click', () => setActiveTool(btnEraser, 'eraser'));

// Color Selection
colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
        // Remove active class from all
        colorDots.forEach(d => d.classList.remove('active'));
        // Add to clicked
        dot.classList.add('active');
        currentColor = dot.getAttribute('data-color');
        
        // Auto-switch to pen if eraser was active
        if (currentMode === 'eraser') btnPen.click();
    });
});

// Size Selection
sizeDots.forEach(dot => {
    dot.addEventListener('click', () => {
        sizeDots.forEach(d => d.classList.remove('active'));
        if(currentMode !== 'eraser') {
            dot.classList.add('active');
        }
        currentSize = parseInt(dot.getAttribute('data-size'));
    });
});

btnUndo.addEventListener('click', () => {
    if (paths.length > 0) {
        redoStack.push(paths.pop());
        refreshCanvasLocally();
        socket.emit('syncCanvas', { roomId, paths });
    }
});

btnRedo.addEventListener('click', () => {
    if (redoStack.length > 0) {
        paths.push(redoStack.pop());
        refreshCanvasLocally();
        socket.emit('syncCanvas', { roomId, paths });
    }
});

btnClear.addEventListener('click', () => {
    paths = [];
    redoStack = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clearCanvas', { roomId });
});

// ==================================
// Canvas Drawing Logic
// ==================================
function startDraw(e) {
    isDrawing = true;
    const { x, y } = getCoords(e);
    lastX = x; lastY = y;
    redoStack = [];

    currentPath = {
        color: currentColor,
        size: currentMode === 'eraser' ? currentSize * 4 : currentSize,
        isEraser: currentMode === 'eraser',
        points: []
    };
    currentPath.points.push({ x: x / canvas.width, y: y / canvas.height });
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault(); 
    const { x, y } = getCoords(e);
    
    drawSegmentLocally(lastX, lastY, x, y, currentPath.color, currentPath.size, currentPath.isEraser);

    const normX0 = lastX / canvas.width;
    const normY0 = lastY / canvas.height;
    const normX1 = x / canvas.width;
    const normY1 = y / canvas.height;

    currentPath.points.push({ x: normX1, y: normY1 });

    socket.emit('drawEvent', {
        roomId, x0: normX0, y0: normY0, x1: normX1, y1: normY1,
        color: currentPath.color, size: currentPath.size, isEraser: currentPath.isEraser
    });
    lastX = x; lastY = y;
}

function stopDraw() {
    if (isDrawing) {
        isDrawing = false;
        paths.push(currentPath);
        currentPath = null;
    }
}

function getCoords(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
}

function drawSegmentLocally(x0, y0, x1, y1, color, size, isEraser) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)"; // Must be black for destination-out
    } else {
        ctx.globalCompositeOperation = "source-over";
    }

    ctx.stroke();
    ctx.closePath();
}

function refreshCanvasLocally() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paths.forEach(path => {
        for (let i = 1; i < path.points.length; i++) {
            const p0 = path.points[i - 1]; const p1 = path.points[i];
            drawSegmentLocally(
                p0.x * canvas.width, p0.y * canvas.height, 
                p1.x * canvas.width, p1.y * canvas.height, 
                path.color, path.size, path.isEraser
            );
        }
    });
}

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseout', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw, { passive: false });
