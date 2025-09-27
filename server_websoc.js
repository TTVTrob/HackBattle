const http = require('http');
const fs = require('fs');
const path = require('path');
// use socket.io for easier browser integration
const { Server } = require('socket.io');

// serve files from project root so index.html/game.js load correctly
const publicDir = __dirname;

// Simple static file server
const server = http.createServer((req, res) => {
    let urlPath = req.url === '/' ? '/index.html' : req.url;
    // strip possible query
    urlPath = urlPath.split('?')[0];
    const filePath = path.join(publicDir, decodeURIComponent(urlPath));

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
        }[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

const io = new Server(server, { /* defaults */ });

// server-side authoritative player state
const players = Object.create(null);
// lobbies: { code: { host: socketId, participants: { socketId: { name, bobIndex, color } }, started: bool, startAt: timestamp|null } }
const lobbies = Object.create(null);

io.on('connection', (socket) => {
    console.log('socket.io client connected', socket.id);
    // initialize player entry with defaults
    players[socket.id] = players[socket.id] || { x: 100, y: 100, color: '#999', name: `P-${socket.id.substring(0,4)}`, kills: 0, alive: true, health: 10, item: null, bobIndex: 0 };
    // send current state
    try { socket.emit('state', players); } catch (e) { console.error('initial state send err', e); }

    socket.on('update', (payload) => {
        if (!payload || !payload.id) return;
        // update position/visual state but preserve server-side authoritative health/kills if present
        const entry = players[payload.id] || {};
        entry.x = payload.x; entry.y = payload.y; entry.color = payload.color; entry.name = payload.name || entry.name; entry.item = payload.item || entry.item;
        // preserve bobIndex if provided by client
        entry.bobIndex = (typeof payload.bobIndex === 'number') ? payload.bobIndex : (entry.bobIndex || 0);
        // update kills/health/alive when client provides them (server may also override on damage events)
        entry.kills = (typeof payload.kills === 'number') ? payload.kills : (entry.kills || 0);
        if (typeof payload.alive === 'boolean') entry.alive = payload.alive;
        if (typeof payload.health === 'number') entry.health = payload.health;
        players[payload.id] = entry;
        // broadcast to all
        io.emit('update', Object.assign({}, entry, { id: payload.id }));
    });

    // Lobby events: create/join/leave/start
    socket.on('lobby-create', (payload) => {
        try{
            const code = payload && payload.code ? payload.code.toString().toUpperCase() : Math.random().toString(36).substring(2,6).toUpperCase();
            const pdata = { name: payload.name || `P-${socket.id.substring(0,4)}`, bobIndex: payload.bobIndex || 0, color: payload.color || '#999' };
            lobbies[code] = lobbies[code] || { host: socket.id, participants: Object.create(null), started: false };
            lobbies[code].participants[socket.id] = pdata;
            socket.join(code);
            // send current lobby state to room (include started/startAt)
            const list = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
            io.to(code).emit('lobby-update', { code, players: list, host: lobbies[code].host, started: !!lobbies[code].started, startAt: lobbies[code].startAt || null });
        }catch(e){ console.error('lobby-create err', e); }
    });

    socket.on('lobby-join', (payload) => {
        try{
            const code = payload && payload.code ? payload.code.toString().toUpperCase() : null;
            if(!code || !lobbies[code]){
                socket.emit('lobby-error', { message: 'Invalid lobby code' });
                return;
            }
            const pdata = { name: payload.name || `P-${socket.id.substring(0,4)}`, bobIndex: payload.bobIndex || 0, color: payload.color || '#999' };
            lobbies[code].participants[socket.id] = pdata;
            socket.join(code);
            const list = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
            io.to(code).emit('lobby-update', { code, players: list, host: lobbies[code].host, started: !!lobbies[code].started, startAt: lobbies[code].startAt || null });
        }catch(e){ console.error('lobby-join err', e); }
    });

        // allow clients to request a lobby sync (server will re-emit lobby-update to the room)
        socket.on('lobby-sync', (payload) => {
            try{
                const code = payload && payload.code ? payload.code.toString().toUpperCase() : null;
                if(!code || !lobbies[code]) return;
                const list = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
                io.to(code).emit('lobby-update', { code, players: list, host: lobbies[code].host, started: !!lobbies[code].started, startAt: lobbies[code].startAt || null });
            }catch(e){ console.error('lobby-sync err', e); }
        });

    socket.on('lobby-leave', (payload) => {
        try{
            const code = payload && payload.code ? payload.code.toString().toUpperCase() : null;
            if(!code || !lobbies[code]) return;
            delete lobbies[code].participants[socket.id];
            socket.leave(code);
            const list = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
            io.to(code).emit('lobby-update', { code, players: list, host: lobbies[code].host });
            // if lobby empty, delete it
            if(Object.keys(lobbies[code].participants).length === 0) delete lobbies[code];
        }catch(e){ console.error('lobby-leave err', e); }
    });

    socket.on('lobby-start', (payload) => {
        try{
            const code = payload && payload.code ? payload.code.toString().toUpperCase() : null;
            if(!code || !lobbies[code]) return;
            // Build players array to send to clients and emit assignments
            const list = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
            lobbies[code].started = true;
            lobbies[code].startAt = Date.now();
            // notify all clients in the lobby to start the game with the players list and authoritative startAt
            io.to(code).emit('lobby-start', { code, players: list, startAt: lobbies[code].startAt });
                        // send a per-socket assignment so each client knows which player they control
                        // participants is an array of { id: socket.id, name, bobIndex, color }
                        const participants = Object.keys(lobbies[code].participants).map(id => ({ id, ...lobbies[code].participants[id] }));
                        participants.forEach((p, idx) => {
                            try{
                                const sock = io.sockets.sockets.get(p.id);
                                if(sock){
                                    // assign by index in the players array; clients will match by the same index
                                    sock.emit('assign-player', { assignedIndex: idx, player: list[idx], startAt: lobbies[code].startAt || null });
                                }
                            }catch(e){
                                console.warn('assign-player emit failed for', p.id, e);
                            }
                        });
        }catch(e){ console.error('lobby-start err', e); }
    });

    // handle attack events from clients; server will do simple hit detection and apply damage
    socket.on('attack', (atk) => {
        try{
            if(!atk || !atk.id) return;
            const ownerId = atk.id;
            const ax = atk.x, ay = atk.y, dmg = Number(atk.damage) || 1;
            // scan players and apply damage to anyone colliding (excluding owner)
            const hitTargets = [];
            for(const id of Object.keys(players)){
                if(id === ownerId) continue;
                const p = players[id];
                if(!p || !p.alive) continue;
                const dx = (p.x || 0) - ax; const dy = (p.y || 0) - ay;
                const dist = Math.hypot(dx,dy);
                // use approximate radii: player radius ~21, attack radius ~12 -> collide if <33
                if(dist <= 33){
                    // apply damage
                    p.health = (typeof p.health === 'number') ? p.health - dmg : 10 - dmg;
                    if(p.health <= 0){ p.alive = false; p.health = 0; players[ownerId] = players[ownerId] || {}; players[ownerId].kills = (players[ownerId].kills||0) + 1; }
                    hitTargets.push({ id, health: p.health, alive: !!p.alive });
                }
            }
            // broadcast the raw attack for visual replication
            io.emit('attack', { id: ownerId, x: ax, y: ay, damage: dmg });
            // broadcast damage results and authoritative player snapshots so clients update health/alive/item
            for(const h of hitTargets){ 
                io.emit('damage', { id: h.id, health: h.health, alive: h.alive, by: ownerId });
                const snap = Object.assign({}, players[h.id], { id: h.id });
                io.emit('player-state', snap);
            }
        }catch(e){ console.error('attack handling err', e); }
    });

    // allow clients to request a respawn; server will reset health/alive and broadcast the authoritative snapshot
    socket.on('respawn', (info) => {
        try{
            if(!info || !info.id) return;
            const p = players[info.id] = (players[info.id] || {});
            p.x = (typeof info.x === 'number') ? info.x : (p.x || 100);
            p.y = (typeof info.y === 'number') ? info.y : (p.y || 100);
            p.health = 10;
            p.alive = true;
            if (info.item) p.item = info.item;
            // broadcast authoritative player snapshot
            io.emit('player-state', Object.assign({}, p, { id: info.id }));
        }catch(e){ console.error('respawn handling err', e); }
    });

    socket.on('remove', (payload) => {
        if (!payload || !payload.id) return;
        delete players[payload.id];
        io.emit('remove', { id: payload.id });
    });

    socket.on('disconnect', (reason) => {
        console.log('client disconnected', socket.id, reason);
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('remove', { id: socket.id });
        }
    });
});

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`HTTP + socket.io server running on http://localhost:${PORT}`);
    // print LAN addresses
    try {
        const os = require('os');
        const nets = os.networkInterfaces();
        const addresses = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
            }
        }
        if (addresses.length) {
            console.log('Accessible on your LAN at:');
            for (const a of addresses) console.log(`  http://${a}:${PORT}`);
        } else {
            console.log('No non-internal IPv4 addresses found.');
        }
    } catch (e) {}
});
