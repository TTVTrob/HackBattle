const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

class Player {
  constructor(x, y, color, controls) {
    this.x = x;
    this.y = y;
    this.size = 28;
    this.color = color;
    this.controls = controls;
    this.speed = 3;
    this.item = null; // holds an Item instance when picked
    this.health = 10; // health starts at 10; reaches 0 -> dead
    this.alive = true;
  }

  boundingBox() {
    return {x: this.x - this.size/2, y: this.y - this.size/2, w: this.size, h: this.size};
  }

  draw() {
    if (!this.alive) return;
    ctx.fillStyle = this.color;
    const b = this.boundingBox();
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // draw item indicator
    if (this.item) {
      ctx.fillStyle = this.item.type.color;
      ctx.fillRect(this.x - 8, this.y - this.size/2 - 14, 16, 10);
      ctx.fillStyle = '#000';
      ctx.fillText(`${this.item.type.name} (${this.item.usesLeft})`, this.x - 28, this.y - this.size/2 - 18);
    }

    // draw health bar (numeric + bar)
    const barW = 40;
    const barH = 6;
    const px = this.x - barW/2;
    const py = this.y + this.size/2 + 6;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(px, py, barW, barH);
    const remaining = Math.max(0, this.health / 10);
    ctx.fillStyle = remaining > 0.5 ? '#4caf50' : remaining > 0.2 ? '#ff9800' : '#f44336';
    ctx.fillRect(px, py, barW * remaining, barH);
    // numeric health above bar
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText(`HP: ${this.health}`, px, py - 2);
  }

  update(keys) {
    if (!this.alive) return;
    if (keys[this.controls.up]) this.y -= this.speed;
    if (keys[this.controls.down]) this.y += this.speed;
    if (keys[this.controls.left]) this.x -= this.speed;
    if (keys[this.controls.right]) this.x += this.speed;

    // clamp
    this.x = Math.max(this.size/2, Math.min(WIDTH - this.size/2, this.x));
    this.y = Math.max(this.size/2, Math.min(HEIGHT - this.size/2, this.y));
  }

  pickOrUse() {
    if (!this.alive) return;
    if (this.item) {
      // using the item is an attack: spawn a short-range hit in front of player
      return {type: 'attack', owner: this, damage: this.item.type.damage};
    }
    return {type: 'noop'};
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.alive = false;
  }
}

class Item {
  // itemType: {name, color, shape, damage, uses}
  constructor(x, y, itemType) {
    this.x = x;
    this.y = y;
    this.size = 14;
    this.picked = false;
    this.type = itemType;
    // remaining uses before breaking
    this.usesLeft = itemType.uses;
  }

  boundingBox() {
    return {x: this.x - this.size/2, y: this.y - this.size/2, w: this.size, h: this.size};
  }

  draw() {
    if (this.picked) return;
    ctx.fillStyle = this.type.color;
    const b = this.boundingBox();
    if (this.type.shape === 'square') ctx.fillRect(b.x, b.y, b.w, b.h);
    else if (this.type.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size/2, 0, Math.PI*2);
      ctx.fill();
    } else {
      // default square
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    // small inner marker
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
  }
}

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

const player1 = new Player(100, 100, '#2196f3', {up:'w', down:'s', left:'a', right:'d'});
const player2 = new Player(700, 380, '#e91e63', {up:'arrowup', down:'arrowdown', left:'arrowleft', right:'arrowright'});

// Define several item types with different damage and uses
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
  {name:'Greatsword', color:'#b0bec5', shape:'square', damage:5, uses:2},
];

// populate the map with several items (at least 10) using different types
const items = [];
const spawnPositions = [
  [120,80],[220,140],[320,200],[420,260],[520,320],[620,120],[720,200],[180,360],[480,80],[560,420],[360,360]
];
for (let i = 0; i < spawnPositions.length && i < ITEM_TYPES.length; i++) {
  const pos = spawnPositions[i];
  items.push(new Item(pos[0], pos[1], ITEM_TYPES[i]));
}


const attacks = []; // short-lived attack objects

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

function update() {
  player1.update(keys);
  player2.update(keys);

  // pickup logic: if player intersects an item and presses pick key (f for p1, l for p2)
  if (keys['f']) {
    // p1 pick/use
    if (player1.item) {
      // use: create attack with damage and reduce uses
      attacks.push({owner: player1, x: player1.x + player1.size, y: player1.y, ttl: 8, damage: player1.item.type.damage});
      player1.item.usesLeft -= 1;
      if (player1.item.usesLeft <= 0) player1.item = null; // break and vanish
      keys['f'] = false; // prevent continuous use on key hold
    } else {
      for (const it of items) {
        if (!it.picked && rectsOverlap(it.boundingBox(), player1.boundingBox())) {
          it.picked = true;
          // assign the item object to player (transfer ownership)
          player1.item = it;
          break;
        }
      }
      keys['f'] = false;
    }
  }

  if (keys['l']) {
    if (player2.item) {
      attacks.push({owner: player2, x: player2.x - player2.size, y: player2.y, ttl: 8, damage: player2.item.type.damage});
      player2.item.usesLeft -= 1;
      if (player2.item.usesLeft <= 0) player2.item = null;
      keys['l'] = false;
    } else {
      for (const it of items) {
        if (!it.picked && rectsOverlap(it.boundingBox(), player2.boundingBox())) {
          it.picked = true;
          player2.item = it;
          break;
        }
      }
      keys['l'] = false;
    }
  }

  // resolve attacks
  for (const a of attacks) {
    a.ttl -= 1;
    // simple collision: check with other player
    const target = a.owner === player1 ? player2 : player1;
    if (target.alive) {
      const attackBox = {x: a.x - 8, y: a.y - 8, w: 16, h: 16};
      if (rectsOverlap(attackBox, target.boundingBox())) {
        const dmg = a.damage || 1;
        target.takeDamage(dmg);
        // mark attack consumed
        a.ttl = 0;
      }
    }
  }

  // remove expired attacks
  for (let i = attacks.length - 1; i >= 0; --i) if (attacks[i].ttl <= 0) attacks.splice(i,1);

  // if a player died, make them spectator: they stop moving and get a message
  if (!player1.alive && player1) {
    // drop any carried item (with its remaining uses)
    if (player1.item) {
      const dropped = new Item(player1.x + 20, player1.y, player1.item.type);
      dropped.usesLeft = player1.item.usesLeft;
      items.push(dropped);
      player1.item = null;
    }
  }
  if (!player2.alive && player2) {
    if (player2.item) {
      const dropped = new Item(player2.x - 20, player2.y, player2.item.type);
      dropped.usesLeft = player2.item.usesLeft;
      items.push(dropped);
      player2.item = null;
    }
  }
}

function draw() {
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  // draw items
  for (const it of items) it.draw();

  // draw players
  player1.draw();
  player2.draw();

  // draw attacks
  for (const a of attacks) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(a.x, a.y, 8, 0, Math.PI*2);
    ctx.fill();
  }

  // draw messages for dead players
  ctx.fillStyle = '#000';
  ctx.font = '14px sans-serif';
  if (!player1.alive) ctx.fillText('Player 1 is dead (spectator)', 10, 20);
  if (!player2.alive) ctx.fillText('Player 2 is dead (spectator)', WIDTH - 220, 20);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
