const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const os = require('os');

// Set port to 3000
const port = 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Find Local IP to generate correct QR codes and links
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    let allIPv4s = [];
    
    // Gather all external IPv4 addresses
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                allIPv4s.push({ name, address: iface.address });
            }
        }
    }
    
    // Sort to prioritize Wi-Fi or real Ethernet adapters over virtual machine adapters
    allIPv4s.sort((a, b) => {
        const aIsPref = a.name.includes('Wi-Fi') || (a.name.includes('Ethernet') && !a.name.match(/vEthernet|Virtual|VMware|\s\d/i));
        const bIsPref = b.name.includes('Wi-Fi') || (b.name.includes('Ethernet') && !b.name.match(/vEthernet|Virtual|VMware|\s\d/i));
        
        if (aIsPref && !bIsPref) return -1;
        if (!aIsPref && bIsPref) return 1;
        return 0;
    });

    if (allIPv4s.length > 0) {
        return allIPv4s[0].address;
    }
    
    return 'localhost';
}

const localIP = getLocalIP();

// Manage WebSockets
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Event: Viewer creates a room automatically or joins based on ID
    socket.on('joinRoom', ({ roomId, role }) => {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);
        
        // Notify others in the room that someone joined
        socket.to(roomId).emit('userJoined', { role });
    });

    // Real-time drawing events
    socket.on('drawEvent', (data) => {
        // Broadcast drawing data to all other clients in the same room
        socket.to(data.roomId).emit('drawEvent', data);
    });

    // Event for full canvas refresh (Undo/Redo logic)
    socket.on('syncCanvas', (data) => {
        // Sends the complete history of paths to refresh the viewer
        socket.to(data.roomId).emit('syncCanvas', data.paths);
    });

    // Event for clearing the canvas
    socket.on('clearCanvas', (data) => {
        socket.to(data.roomId).emit('clearCanvas');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Create endpoint to provide IP to the frontend
app.get('/api/config', (req, res) => {
    res.json({ localIP, port });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`🖌️  Remote Drawing App is running!`);
    console.log(`========================================`);
    console.log(`📱 Laptop Viewer URL: http://localhost:${port}`);
    console.log(`📱 Or from another device on the network:`);
    console.log(`   http://${localIP}:${port}`);
    console.log(`========================================\n`);
});
