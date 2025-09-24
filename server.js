const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// game constants
const TICK_RATE = 30; // internal simulation ticks per second
const BROADCAST_HZ = 8; // how many times per second server sends state
const RESPAWN_MS = 5000;
const ITEM_RESPAWN_MS = 7000;

const WIDTH = 800;
const HEIGHT = 480;

const ITEM_TYPES = [
  {name:'Stick', color:'#8d6e63', shape:'square', damage:1, uses:5},
  {name:'Dagger', color:'#9e9e9e', shape:'circle', damage:2, uses:5},
  {name:'Sword', color:'#90caf9', shape:'square', damage:3, uses:4},
  {name:'Axe', color:'#ef9a9a', shape:'circle', damage:4, uses:3},
  {name:'Spear', color:'#c5e1a5', shape:'square', damage:2, uses:6},
  {name:'Club', color:'#a1887f', shape:'square', damage:2, uses:5},
  {name:'Mace', color:'#ffcc80', shape:'circle', damage:3, uses:4},
  {name:'Wand', color:'#b39ddb', shape:'circle', damage:1, uses:8},
  {name:'Hammer', color:'#ffab91', shape:'square', damage:4, uses:2},
  {name:'Sickle', color:'#cfd8dc', shape:'circle', damage:2, uses:5},
  {name:'Greatsword', color:'#b0bec5', shape:'square', damage:5, uses:2}
];

let nextItemId = 1;
function spawnItemRandomly(typeIndex) {
  const x = Math.floor(20 + Math.random() * (WIDTH - 40));
  const y = Math.floor(20 + Math.random() * (HEIGHT - 40));
  const id = nextItemId++;
  return {id, x, y, typeIndex, picked: false, usesLeft: ITEM_TYPES[typeIndex].uses, respawnAt: 0};
}

// initial items
const items = [];
const initialSpawns = [[120,80],[220,140],[320,200],[420,260],[520,320],[620,120],[720,200],[180,360],[480,80],[560,420],[360,360]];
for (let i = 0; i < initialSpawns.length; i++) items.push(Object.assign(spawnItemRandomly(i % ITEM_TYPES.length), {x: initialSpawns[i][0], y: initialSpawns[i][1]}));

const players = new Map(); // socketId -> player
let nextPlayerNumber = 1;

function createPlayer(id) {
  const p = {
    id,
    x: Math.floor(50 + Math.random() * (WIDTH-100)),
    y: Math.floor(50 + Math.random() * (HEIGHT-100)),
    size: 28,
    color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'),
    name: 'Player' + (nextPlayerNumber++),
    speed: 3,
    itemId: null,
    health: 10,
    alive: true,
    respawnAt: 0,
    lastInputs: {},
  };
  return p;
}

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

// scoreboard helper
function buildSnapshot() {
  // compact arrays: players: [id,x,y,health,alive,colorHexNoHash,itemId?]
  const playersArr = [];
  for (const p of players.values()) {
    playersArr.push([p.id, Math.round(p.x), Math.round(p.y), p.health, p.alive ? 1 : 0, p.color.replace(/^#/,''), p.itemId]);
  }
  const itemsArr = [];
  for (const it of items) itemsArr.push([it.id, Math.round(it.x), Math.round(it.y), it.typeIndex, it.picked ? 1 : 0, it.usesLeft, it.respawnAt]);
  return {players: playersArr, items: itemsArr};
}

// game loop: process inputs, resolve attacks, pickup
const queuedUses = []; // {ownerId, targetX, targetY}

function processTick(dtMs) {
  // move players according to lastInputs
  for (const p of players.values()) {
    if (!p.alive) continue;
    const k = p.lastInputs || {};
    if (k.up) p.y -= p.speed;
    if (k.down) p.y += p.speed;
    if (k.left) p.x -= p.speed;
    if (k.right) p.x += p.speed;
    // clamp
    p.x = Math.max(p.size/2, Math.min(WIDTH - p.size/2, p.x));
    p.y = Math.max(p.size/2, Math.min(HEIGHT - p.size/2, p.y));
  }

  // handle uses (attacks)
  for (const u of queuedUses.splice(0)) {
    const owner = players.get(u.ownerId);
    if (!owner || !owner.alive) continue;
    // simple AOE: damage any other player within 36 px
    for (const p of players.values()) {
      if (p.id === owner.id || !p.alive) continue;
      const dx = p.x - owner.x; const dy = p.y - owner.y;
      const dist2 = dx*dx + dy*dy;
      if (dist2 <= 36*36) {
        p.health = Math.max(0, p.health - u.damage);
        if (p.health <= 0) {
          p.alive = false;
          p.respawnAt = Date.now() + RESPAWN_MS;
          // drop item if any
          if (p.itemId) {
            const it = items.find(x => x.id === p.itemId);
            if (it) {
              it.picked = false;
              it.x = p.x + 10;
              it.y = p.y + 10;
              it.respawnAt = 0;
            }
            p.itemId = null;
          }
        }
      }
    }
  }

  // pickup logic
  for (const p of players.values()) {
    if (!p.alive) continue;
    if (p.itemId) continue;
    for (const it of items) {
      if (it.picked) continue;
      const boxA = {x: it.x - 7, y: it.y - 7, w: 14, h: 14};
      const boxB = {x: p.x - p.size/2, y: p.y - p.size/2, w: p.size, h: p.size};
      if (rectsOverlap(boxA, boxB)) {
        it.picked = true;
        p.itemId = it.id;
        break;
      }
    }
  }

  // respawn items
  const now = Date.now();
  for (const it of items) {
    if (it.picked && it.respawnAt === 0) {
      // schedule respawn
      it.respawnAt = now + ITEM_RESPAWN_MS;
    }
    if (it.picked && it.respawnAt > 0 && now >= it.respawnAt) {
      // respawn at random loc
      const newIt = spawnItemRandomly(it.typeIndex);
      // replace this item in place
      it.x = newIt.x; it.y = newIt.y; it.picked = false; it.usesLeft = ITEM_TYPES[it.typeIndex].uses; it.respawnAt = 0;
    }
  }

  // player respawns
  for (const p of players.values()) {
    if (!p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
      p.alive = true; p.health = 10; p.x = Math.floor(50 + Math.random() * (WIDTH-100)); p.y = Math.floor(50 + Math.random() * (HEIGHT-100)); p.respawnAt = 0; p.itemId = null;
    }
  }
}

// broadcast loop
setInterval(() => {
  const snap = buildSnapshot();
  io.emit('state', snap);
}, 1000 / BROADCAST_HZ);

// tick loop
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick; lastTick = now;
  processTick(dt);
}, 1000 / TICK_RATE);

io.on('connection', (socket) => {
  console.log('connect', socket.id);
  const player = createPlayer(socket.id);
  players.set(socket.id, player);

  // send init: own id, world
  socket.emit('init', {id: socket.id, state: buildSnapshot(), yourId: socket.id, itemsMeta: ITEM_TYPES});

  socket.on('input', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.lastInputs = data || {};
  });

  socket.on('use', () => {
    const p = players.get(socket.id);
    if (!p || !p.alive) return;
    // find player's item
    if (!p.itemId) return;
    const it = items.find(x => x.id === p.itemId);
    if (!it) return;
    // queue use
    queuedUses.push({ownerId: p.id, damage: ITEM_TYPES[it.typeIndex].damage});
    it.usesLeft -= 1;
    if (it.usesLeft <= 0) {
      // item consumed
      it.picked = true; it.respawnAt = Date.now() + ITEM_RESPAWN_MS; p.itemId = null;
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    players.delete(socket.id);
  });
});

// debug endpoint
app.get('/_debug/state', (req, res) => {
  res.json(buildSnapshot());
});

server.listen(PORT, () => {
  console.log('Listening on http://localhost:' + PORT);
});
