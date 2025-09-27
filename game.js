// merged game: combines visuals/charging from game_pygame.js with group-based merging rules
(function(){
  // ---- Config ----
  const WIDTH = 1200, HEIGHT = 720;
  const BG = '#f5f5f5';
  const bgImage = new Image(); bgImage.src = './Images/background_1.jpg';
  const pondImage = new Image(); pondImage.src = './Images/pondpng.png';
  const polyImage = new Image(); polyImage.src = './Images/tree.png';
  // Preload item images and merged images
  const IMAGE_FILES = {
    'wood': './Images/wood.png',
    'vines': './Images/vines.png',
    'mud': './Images/mud.png',
    'stone': './Images/stone.png',
    'magma': './Images/magma.png',
    'glass': './Images/glass.png',
    'iron': './Images/iron.png',
    'ice': './Images/ice.png',
    'electricity': './Images/electricity.png',
    // merged images
    'magma+wood': './Images/wood+magma.png',
    'mud+wood': './Images/wood+mud.png',
    'vines+wood': './Images/wood+vines.png',
    'glass+wood': './Images/wood+glass.png',
    'ice+wood': './Images/wood+ice.png',
    'spark+wood': './Images/wood+spark.png',
    'mud+vines': './Images/vines+mud.png',
    'stone+vines': './Images/vines+stone.png',
    'glass+vines': './Images/glass+vines.png',
    'iron+vines': './Images/iron+vines.png',
    'spark+vines': './Images/spark+vines.png',
    'mud+stone': './Images/mud+stone.png',
    'magma+mud': './Images/mud+magma.png',
    'iron+mud': './Images/mud+iron.png',
    'ice+mud': './Images/mud+ice.png',
    'magma+stone': './Images/stone+magma.png',
    'glass+stone': './Images/stone+glass.png',
    'ice+stone': './Images/stone+ice.png',
    'spark+stone': './Images/stone+spark.png',
    'glass+iron': './Images/iron+glass.png',
    'glass+ice': './Images/ice+glass.png',
    'ice+iron': './Images/iron+ice.png',
    'iron+spark': './Images/iron+spark.png',
    'glass+magma': './Images/magma+glass.png',
    'iron+magma': './Images/magma+iron.png',
    'magma+spark': './Images/magma+spark.png',
  };
  const IMAGES = {};
  for(const k of Object.keys(IMAGE_FILES)){
    const img = new Image(); img.src = IMAGE_FILES[k]; IMAGES[k] = img;
  }

  // Preload bob avatar images (bob1..bob5)
  const BOB_FILES = ['./Images/bob1.png','./Images/bob2.png','./Images/bob3.png','./Images/bob4.png','./Images/bob5.png'];
  const BOBS = [];
  for(let i=0;i<BOB_FILES.length;i++){ const im = new Image(); im.src = BOB_FILES[i]; BOBS[i] = im; }

  // obtain canvas
  let canvas = document.getElementById('gameCanvas') || document.getElementById('game');
  if(!canvas){ canvas = document.createElement('canvas'); canvas.id = 'gameCanvas'; canvas.width = WIDTH; canvas.height = HEIGHT; document.body.appendChild(canvas); }
  else { canvas.width = WIDTH; canvas.height = HEIGHT; }
  try{ canvas.tabIndex = canvas.tabIndex || 0; }catch(e){}
  canvas.addEventListener('click', ()=>{ try{ canvas.focus(); }catch(e){} });
  setTimeout(()=>{ try{ canvas.focus(); }catch(e){} }, 200);
  const ctx = canvas.getContext('2d');

  // networking: remote players map keyed by id
  const remotePlayers = Object.create(null);
  let socket = null;
  try {
    if (typeof window !== 'undefined') {
      // reuse the lobby socket the launcher creates when available
      if (window.__elemenz_socket) {
        socket = window.__elemenz_socket;
      } else if (typeof window.io !== 'undefined') {
        // create a shared socket and store it globally so launcher/game share the same connection
        try { window.__elemenz_socket = window.__elemenz_socket || io(); } catch(e) { /* fallthrough */ }
        socket = window.__elemenz_socket || null;
      } else {
        // window.io not available yet; leave socket null. getLobbySocket()/launcher will create it later.
        socket = window.__elemenz_socket || null;
      }
      if (socket) {
        socket.on('connect', () => {
          console.log('connected to server via socket.io', socket.id);
          // clear any synthetic lobby placeholders we may have created earlier
          try { for (const id of Object.keys(remotePlayers)) { if (id && id.startsWith('lobby-')) delete remotePlayers[id]; } } catch (e) {}
          try { if (typeof players !== 'undefined') { for (let i = players.length - 1; i >= 1; i--) { const pp = players[i]; if (pp && pp.name && (String(pp.name).startsWith('P') || String(pp.name).startsWith('lobby-'))) players.splice(i, 1); } } } catch (e) {}
        });

        socket.on('lobby-update', (s) => {
          try {
            if (!s || !s.players) return;
            console.debug('socket:lobby-update', s);
            for (const p of s.players) { if (!p || !p.id) continue; if (p.id === socket.id) continue; remotePlayers[p.id] = Object.assign({}, remotePlayers[p.id] || {}, p); }
            if (s && s.startAt) try { window.__ELEMEMZ_START_AT = s.startAt; gameStart = Number(s.startAt) || gameStart; if(gameStart){ gameStarted = true; gameEndAt = gameStart + GAME_LENGTH_MS; } } catch (e) {}
          } catch (e) {}
        });

        // lobby-start: authoritative room start time
        socket.on('lobby-start', (s) => {
          try{
            console.debug('socket:lobby-start', s);
            if(s && s.startAt){ window.__ELEMEMZ_START_AT = s.startAt; gameStart = Number(s.startAt) || gameStart; if(gameStart){ gameStarted = true; gameEndAt = gameStart + GAME_LENGTH_MS; } }
            // seed remote players list if provided
            if(s && s.players){ for(const p of s.players){ if(p && p.id && p.id !== socket.id) remotePlayers[p.id] = Object.assign({}, remotePlayers[p.id] || {}, p); } }
          }catch(e){}
        });

        socket.on('state', (s) => {
          try {
            console.debug('socket:state', s && Object.keys(s).length);
            if (!s) return;
            for (const id of Object.keys(s)) { if (id === socket.id) continue; remotePlayers[id] = Object.assign({}, remotePlayers[id] || {}, s[id]); }
          } catch (e) {}
        });
        // authoritative single-player snapshots for health/item/alive updates
        socket.on('player-state', (snap) => {
          try {
            console.debug('socket:player-state', snap && snap.id, snap && snap.health);
            if (!snap || !snap.id) return;
            const id = snap.id;
            const existing = remotePlayers[id] || {};
            // merge snapshot over existing, but prefer snapshot values
            remotePlayers[id] = Object.assign({}, existing, snap);
            // ensure defaults
            remotePlayers[id].health = (typeof remotePlayers[id].health === 'number') ? remotePlayers[id].health : 10;
            remotePlayers[id].alive = (typeof remotePlayers[id].alive === 'boolean') ? remotePlayers[id].alive : true;
          } catch (e) {}
        });

        socket.on('update', (payload) => {
          try {
            console.debug('socket:update', payload && payload.id);
            if (!payload || !payload.id) return;
            if (payload.id === socket.id) return;
            const existing = remotePlayers[payload.id] || {};
            const bobIndex = (typeof payload.bobIndex === 'number') ? payload.bobIndex : existing.bobIndex;
            const rp = Object.assign({}, existing, payload, { bobIndex });
            // normalize item shape if provided
            if (rp.item) {
              rp.item = (rp.item.imageKey) ? Object.assign({}, rp.item, { name: rp.item.name || rp.item.imageKey }) : rp.item;
            }
            remotePlayers[payload.id] = rp;
          } catch (e) {}
        });

        socket.on('remove', (p) => { try { if (p && p.id) delete remotePlayers[p.id]; } catch (e) {} });

        socket.on('attack', (a) => { try { if (a && a.x !== undefined && a.y !== undefined) { const atk = new Attack(null, a.x, a.y, 18, a.damage, 0, 0); attacks.push(atk); } } catch (e) {} });

        socket.on('damage', (d) => {
          try {
            if (!d || !d.id) return;
            const id = d.id;
            // ensure we have a remotePlayers entry to reflect the damage
            if (!remotePlayers[id]) remotePlayers[id] = { id, name: (d.name || id.substring(0,4)), color: '#999', health: 10, alive: true };
            remotePlayers[id].health = d.health;
            remotePlayers[id].alive = d.alive;
            // if the damage targets this client, update local player authoritative state
            if (id === socket.id) { try { player1.health = typeof d.health === 'number' ? d.health : player1.health; player1.alive = !!d.alive; if (!player1.alive) player1.respawnAt = performance.now() + 3000; } catch (e) {} }
            // credit the killer
            if (d.by) { try { const by = d.by; if (by === socket.id) { player1.kills = (player1.kills || 0) + 1; } else { if (!remotePlayers[by]) remotePlayers[by] = { id: by, name: by.substring(0,4), color: '#999', health: 10, alive: true }; remotePlayers[by].kills = (remotePlayers[by].kills || 0) + 1; } } catch (e) {} }
          } catch (e) {}
        });

        socket.on('assign-player', (a) => {
          try {
            if (!a) return;
            try { window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX = (a && typeof a.assignedIndex === 'number') ? a.assignedIndex : window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX; } catch (e) {}
            try { window.__ELEMEMZ_ASSIGNED_PLAYER = (a && a.player) ? a.player : window.__ELEMEMZ_ASSIGNED_PLAYER; } catch (e) {}
            if (a && a.startAt) try { window.__ELEMEMZ_START_AT = a.startAt; gameStart = Number(a.startAt) || gameStart; if(gameStart){ gameStarted = true; gameEndAt = gameStart + GAME_LENGTH_MS; } } catch (e) {}
            try { const ap = (typeof window !== 'undefined') ? window.__ELEMEMZ_ASSIGNED_PLAYER : null; if (ap) { if (ap.name) player1.name = ap.name; if (ap.color) player1.color = ap.color; if (typeof ap.bobIndex === 'number') player1.bobIndex = ap.bobIndex; } } catch (e) {}
          } catch (e) { console.warn('assign-player handling error', e); }
        });
      }
    }
  } catch (e) { console.warn('socket.io not available', e); }

  // ---- Utilities ----
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  function rectsOverlap(a,b){ return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h); }
  function circleRectCollide(circle, rect){ const closestX = clamp(circle.x, rect.x, rect.x+rect.w); const closestY = clamp(circle.y, rect.y, rect.y+rect.h); const dx = closestX - circle.x, dy = closestY - circle.y; return dx*dx + dy*dy < circle.r*circle.r; }
  function randRange(a,b){ return a + Math.random() * (b - a); }

  // ---- Item catalog: 3 groups ----
  // Group A: wood, vines, mud
  // Group B: stone, magma, glass
  // Group C: iron, ice, electricity
  const ITEM_TYPES = [
    {name:'wood', color:'#8d6e63', shape:'square', damage:2, uses:6},
    {name:'vines', color:'#6aa84f', shape:'square', damage:1, uses:7},
    {name:'mud', color:'#7f5539', shape:'circle', damage:1, uses:8},
    {name:'stone', color:'#9e9e9e', shape:'square', damage:3, uses:5},
    {name:'magma', color:'#ff7043', shape:'circle', damage:4, uses:3},
    {name:'glass', color:'#cfe8ff', shape:'circle', damage:2, uses:6},
    {name:'iron', color:'#b0b0b0', shape:'square', damage:4, uses:4},
    {name:'ice', color:'#a7e0ff', shape:'circle', damage:2, uses:6},
    {name:'electricity', color:'#fff176', shape:'square', damage:5, uses:3}
  ];

  const SPAWN_POSITIONS = [[180,120],[330,210],[480,300],[630,390],[780,480],[930,180],[1080,300],[270,540],[720,120],[840,630],[540,540]];

  // ---- Classes (condensed from original files) ----
  class Item{ constructor(x,y,type){ this.x=x; this.y=y; this.size=21; this.type=type; this.picked=false; this.usesLeft = type.uses; // ensure imageKey exists on type
      if(!this.type.imageKey && this.type.name) this.type.imageKey = this.type.name.toString().toLowerCase(); }
    rect(){ return {x:this.x-this.size/2,y:this.y-this.size/2,w:this.size,h:this.size}; }
    draw(ctx){ if(this.picked) return; const key = (this.type && this.type.imageKey) ? this.type.imageKey.toString().toLowerCase() : (this.type && this.type.name ? this.type.name.toString().toLowerCase() : null); const img = key ? IMAGES[key] : null; if(img && img.complete && img.naturalWidth){ const w = this.size * 1.6, h = this.size * 1.6; ctx.drawImage(img, this.x - w/2, this.y - h/2, w, h); return; }
      // fallback to colored shape if image missing
      ctx.fillStyle=this.type.color; if(this.type.shape==='square') ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size); else { ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.size/2, 0, Math.PI*2); ctx.fill(); } ctx.fillStyle='#000'; ctx.fillRect(this.x-1,this.y-1,2,2); }
  }
  class HeldWeapon{ constructor(type, usesLeft, isMerged = false){ this.type = type; this.usesLeft = usesLeft; // mark as a merged/constructed weapon so pickup logic can distinguish
      this.isMerged = !!isMerged;
    } }
  class Attack{ constructor(owner,x,y,ttl,damage,dirX=1,dirY=0){ this.owner=owner; this.x=x; this.y=y; this.ttl=ttl; this.damage=damage; this.r=4; const base = randRange(0.6,1.2); this.vx=dirX*base + randRange(-0.08,0.08); this.vy=dirY*base + randRange(-0.08,0.08); } rect(){ return {x:this.x-this.r,y:this.y-this.r,w:this.r*2,h:this.r*2}; } update(){ this.ttl -= 1; this.x += this.vx * 4; this.y += this.vy * 4; } draw(ctx){ ctx.fillStyle='rgba(34,34,34,0.95)'; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.max(2, this.r),0,Math.PI*2); ctx.fill(); } }
  class HitEffect{ constructor(x,y){ this.x=x; this.y=y; this.ttl=12; this.r=9; } update(){ this.ttl -= 1; this.r += 1; } draw(ctx){ const a = Math.max(0, this.ttl/12); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); } }
  class Player{ constructor(x,y,color,controls,name){ this.x=x; this.y=y; this.color=color; this.controls=controls; this.size=42; this.speed=4.8; this.health=10; this.alive=true; this.spawnX=x; this.spawnY=y; this.respawnAt=null; this.item=null; this.name=name||'P'; this.kills=0; this.hitAt=0; this.lastDirX=1; this.lastDirY=0; this.charging=false; this.chargeStart=0; this.facing='right'; } rect(){ return {x:this.x - this.size/2, y:this.y - this.size/2, w:this.size, h:this.size}; }
    update(keys, obstacles){ if(!this.alive) return; const oldX=this.x, oldY=this.y; if(keys[this.controls.up]) this.y -= this.speed; if(keys[this.controls.down]) this.y += this.speed; if(keys[this.controls.left]) this.x -= this.speed; if(keys[this.controls.right]) this.x += this.speed; const half = this.size/2; this.x = clamp(this.x, half, WIDTH-half); this.y = clamp(this.y, half, HEIGHT-half); const r = this.rect(); for(const obs of obstacles){ if(obs.collidesRect && obs.collidesRect(r)){ this.x = oldX; this.y = oldY; break; } } const dx = this.x - oldX, dy = this.y - oldY; const mag = Math.hypot(dx,dy); if(mag > 0.001){ this.lastDirX = dx/mag; this.lastDirY = dy/mag; if(Math.abs(dx) > Math.abs(dy)){ this.facing = dx > 0 ? 'right' : 'left'; } else { this.facing = dy > 0 ? 'down' : 'up'; } } }
    draw(ctx){ if(!this.alive) return; const now = performance.now(); const hitDur = 300; const since = now - this.hitAt; if(since < hitDur){ ctx.save(); const a = 0.6 * (1 - since / hitDur); ctx.globalAlpha = a; ctx.fillStyle = '#ff4444'; const r = this.rect(); ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); ctx.restore(); }
      const r2 = this.rect();
      // draw bob avatar if available
      try{
        if(typeof this.bobIndex === 'number' && BOBS[this.bobIndex] && BOBS[this.bobIndex].complete && BOBS[this.bobIndex].naturalWidth){ const img = BOBS[this.bobIndex]; const w = r2.w, h = r2.h; ctx.drawImage(img, Math.round(r2.x), Math.round(r2.y), Math.round(w), Math.round(h)); }
        else { ctx.fillStyle = this.color; ctx.fillRect(r2.x, r2.y, r2.w, r2.h); }
      }catch(e){ ctx.fillStyle = this.color; ctx.fillRect(r2.x, r2.y, r2.w, r2.h); }
    // held item: show image if present, otherwise colored rectangle
    if(this.item){
      const key = (this.item.type && this.item.type.imageKey) ? this.item.type.imageKey.toString().toLowerCase() : (this.item.type && this.item.type.name ? this.item.type.name.toString().toLowerCase() : null);
      const img = key ? IMAGES[key] : null;
      if(img && img.complete && img.naturalWidth){ const w = 28, h = 28; ctx.drawImage(img, this.x - w/2, this.y - this.size/2 - 34, w, h); }
      else { ctx.fillStyle = this.item.type.color; ctx.fillRect(this.x - 12, this.y - this.size/2 - 21, 24, 15); }
      ctx.fillStyle = '#000'; ctx.font = '16px Arial'; ctx.fillText(`${this.item.type.name}(${this.item.usesLeft})`, this.x - 42, this.y - this.size/2 - 36);
    } if(this.charging){ const now = performance.now(); const elapsed = Math.min(1500, now - this.chargeStart); const frac = elapsed / 1500; const bx = this.x - 33, by = this.y - this.size/2 - 54, bw = 66, bh = 9; ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = '#ffd54f'; ctx.fillRect(bx, by, Math.round(bw * frac), bh); ctx.strokeStyle = '#000'; ctx.strokeRect(bx, by, bw, bh); } const barW = 60, barH = 9; const px = this.x - barW/2, py = this.y + this.size/2 + 9; ctx.strokeStyle = '#000'; ctx.strokeRect(px,py,barW,barH); const rem = Math.max(0, this.health/10); let col = '#4caf50'; if(rem<=0.5) col = rem>0.2 ? '#ff9800' : '#f44336'; ctx.fillStyle = col; ctx.fillRect(px,py,Math.floor(barW*rem),barH); ctx.fillStyle = '#000'; ctx.font = '18px Arial'; ctx.fillText(this.name, px, py + barH + 18); }
    takeDamage(amount, attacker){ if(!this.alive) return; this.health = Math.max(0, this.health - amount); this.hitAt = performance.now(); if(this.health <= 0){ this.alive = false; this.respawnAt = performance.now() + 3000; if(attacker && attacker.kills !== undefined) attacker.kills += 1; } }
  }

  class CircleObstacle{ constructor(x,y,r,color='#b4b4b4'){ this.x=x; this.y=y; this.r=r; this.color=color; } draw(ctx){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.r), 0, Math.PI*2); ctx.closePath(); if(pondImage && pondImage.complete && pondImage.naturalWidth){ try{ ctx.save(); ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.r), 0, Math.PI*2); ctx.clip(); ctx.drawImage(pondImage, this.x - this.r, this.y - this.r, this.r*2, this.r*2); ctx.restore(); }catch(e){ ctx.fill(); } } else { ctx.fill(); } } collidesRect(rect){ return circleRectCollide(this, rect); } }
  class PolyObstacle{ constructor(points,color='#8c8c8c'){ this.points = points.slice(); this.color = color; let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity; for(const p of points){ minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]); maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]); } this.bbox={x:Math.floor(minx),y:Math.floor(miny),w:Math.max(1,Math.ceil(maxx-minx)),h:Math.max(1,Math.ceil(maxy-miny))}; this.off=document.createElement('canvas'); this.off.width=this.bbox.w; this.off.height=this.bbox.h; this.offCtx=this.off.getContext('2d'); this._prepared=false; this.contour=null; if(polyImage && polyImage.complete && polyImage.naturalWidth) this.prepareFromImage(); else polyImage.addEventListener('load', ()=>this.prepareFromImage(), {once:true}); }
  }

  // ---- State ----
  const items = []; for(let i=0;i<SPAWN_POSITIONS.length && i<ITEM_TYPES.length;i++){ const p = SPAWN_POSITIONS[i]; items.push(new Item(p[0], p[1], ITEM_TYPES[i])); }
  const obstacles = []; obstacles.push(new CircleObstacle(600, 180, 75, '#b4b4b4')); obstacles.push(new CircleObstacle(300, 360, 60, '#a0a0c8')); obstacles.push(new PolyObstacle([[750,75],[870,120],[840,210],[720,165]], '#96c890')); obstacles.push(new PolyObstacle([[180,450],[240,495],[210,570],[150,540]], '#cfa0a0'));
  // determine spawn and identity for the local controlled player
  let p1x = 150, p1y = 150;
  // If launched from the lobby, allow the launcher to supply a player name/color via window.__ELEMEMZ_LOBBY_PLAYERS
  let initialName = 'P1';
  let initialColor = '#2196f3';
  try{
    const lobby = (typeof window !== 'undefined') ? window.__ELEMEMZ_LOBBY_PLAYERS : null;
    const assignedIndex = (typeof window !== 'undefined' && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== undefined && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== null) ? window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX : null;
    const assignedPlayer = (typeof window !== 'undefined' && window.__ELEMEMZ_ASSIGNED_PLAYER) ? window.__ELEMEMZ_ASSIGNED_PLAYER : null;
    if(assignedPlayer){ if(assignedPlayer.name) initialName = assignedPlayer.name; if(assignedPlayer.color) initialColor = assignedPlayer.color; }
    else if(lobby && lobby.length){ const idx = (assignedIndex !== null && assignedIndex >=0 && assignedIndex < lobby.length) ? assignedIndex : 0; const lp = lobby[idx]; if(lp && lp.name) initialName = lp.name; if(lp && lp.color) initialColor = lp.color; }
    // spawn position: if assignedIndex available, use corresponding spawn slot
    if(typeof SPAWN_POSITIONS !== 'undefined' && lobby && lobby.length && assignedIndex !== null && assignedIndex >= 0){ const sp = SPAWN_POSITIONS[assignedIndex % SPAWN_POSITIONS.length] || [150,150]; p1x = sp[0]; p1y = sp[1]; }
  }catch(e){}
  const player1 = new Player(p1x,p1y, initialColor, {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',use:'KeyF'}, initialName);
  player1.lastDirX=1; player1.lastDirY=0;
  // ensure controlled player's bobIndex is set from assignment or lobby data
  try{
    const assigned = (typeof window !== 'undefined') ? (window.__ELEMEMZ_ASSIGNED_PLAYER || (window.__ELEMEMZ_LOBBY_PLAYERS && window.__ELEMEMZ_LOBBY_PLAYERS[0])) : null;
    if(assigned && typeof assigned.bobIndex === 'number') player1.bobIndex = assigned.bobIndex; else player1.bobIndex = (typeof player1.bobIndex === 'number' ? player1.bobIndex : 0);
  }catch(e){ player1.bobIndex = 0; }
  // If server provided a room start time, set gameStart/gameEndAt so timer is room-local
  try{
    if(typeof window !== 'undefined' && window.__ELEMEMZ_START_AT){
      gameStart = Number(window.__ELEMEMZ_START_AT) || 0;
      if(gameStart){ gameStarted = true; gameEndAt = gameStart + GAME_LENGTH_MS; }
    }
  }catch(e){}
  // Build players array: include player1 and any additional lobby players (local-only placeholders)
  const players = [player1];
  try{
    const lobby = (typeof window !== 'undefined') ? window.__ELEMEMZ_LOBBY_PLAYERS : null;
    const assignedIndex = (typeof window !== 'undefined' && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== undefined && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== null) ? window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX : null;
    // Only create local placeholder players when not connected to server
    if((!socket || !socket.connected) && lobby && lobby.length){
      for(let i = 0; i < lobby.length; i++){
        if(i === assignedIndex) continue; // skip the assigned one (we already created player1 for it)
        const lp = lobby[i]; if(!lp) continue;
        // choose a spawn position from SPAWN_POSITIONS to avoid overlap
        const sp = SPAWN_POSITIONS[i % SPAWN_POSITIONS.length] || [200 + i*40, 200 + i*30];
        // use empty control keys so update() doesn't throw when checking keys
        const emptyControls = { up: '', down: '', left: '', right: '', use: '' };
        const p = new Player(sp[0], sp[1], lp.color || '#999', emptyControls, lp.name || `P${i+1}`);
        p.lastDirX = 1; p.lastDirY = 0;
        p.bobIndex = (typeof lp.bobIndex === 'number') ? lp.bobIndex : i;
        players.push(p);
      }
    }
  }catch(e){}
  // Diagnostics: log lobby-supplied players and local players count
  try{
    console.log('ELEMEMZ: lobby players raw ->', typeof window !== 'undefined' ? window.__ELEMEMZ_LOBBY_PLAYERS : null);
    console.log('ELEMEMZ: local players array length ->', players.length);
    players.forEach((pp, idx) => console.log(`ELEMEMZ: player[${idx}] name=${pp.name} color=${pp.color} at (${pp.x},${pp.y})`));
  }catch(e){}

  // Fallback: if we don't have a socket connection and lobby supplied more players,
  // create synthetic remotePlayers entries so they appear in the game and scoreboard.
  try{
    const lobby = (typeof window !== 'undefined') ? window.__ELEMEMZ_LOBBY_PLAYERS : null;
    const assignedIndex = (typeof window !== 'undefined' && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== undefined && window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX !== null) ? window.__ELEMEMZ_ASSIGNED_PLAYER_INDEX : null;
    if((!socket || !socket.connected) && lobby && lobby.length){
      for(let i = 0; i < lobby.length; i++){
        if(i === assignedIndex) continue; // skip local controlled player
        const lp = lobby[i]; if(!lp) continue;
        const id = `lobby-${i}`;
        // pick spawn coords consistent with players created earlier
        const sp = SPAWN_POSITIONS[i % SPAWN_POSITIONS.length] || [220 + i*30, 220 + i*20];
  remotePlayers[id] = { id, x: sp[0], y: sp[1], color: lp.color || '#999', name: lp.name || `P${i+1}`, kills: 0, health: 10, alive: true, bobIndex: (typeof lp.bobIndex === 'number' ? lp.bobIndex : i) };
      }
      console.log('ELEMEMZ: populated synthetic remotePlayers from lobby ->', Object.keys(remotePlayers));
    }
  }catch(e){}
  let attacks = []; let hitEffects = []; let keys = {}; let lastKey=null, lastKeyAt=0;
  // Game timer: 10 minutes
  const GAME_LENGTH_MS = 10 * 60 * 1000; // 10 minutes
  let gameStart = 0;
  let gameEndAt = 0;
  let gameStarted = false; // set true on first frame
  let gameOver = false;
  let gameWinnerText = '';
  // Server-tick based spawning: every 5 seconds, spawn until MAX_GROUND_ITEMS on the ground
  const SERVER_TICK_MS = 5000;
  const MAX_GROUND_ITEMS = 15;
  let lastSpawnTick = 0;

  // helper: group identification
  const groupA = new Set(['wood','vines','mud']);
  const groupB = new Set(['stone','magma','glass']);
  const groupC = new Set(['iron','ice','electricity']);
  function groupOf(name){ const n = (name||'').toString().toLowerCase(); if(groupA.has(n)) return 'A'; if(groupB.has(n)) return 'B'; if(groupC.has(n)) return 'C'; return null; }

  // explicit merge mapping (order-insensitive). null => nullify (consume both, no new item)
  const MERGE_MAP = new Map();
  function mk(k,v){ MERGE_MAP.set(k, v); }
  // helper to normalize key (alphabetical order)
  function keyFor(a,b){ const x = a.toString().toLowerCase(); const y = b.toString().toLowerCase(); return (x < y) ? `${x}+${y}` : `${y}+${x}`; }
  // populate map according to your list (use null for nullify; undefined damage/uses means fallback)
  mk(keyFor('wood','stone'), null);
  mk(keyFor('wood','vines'), {name:'trellis', damage:9, uses:5});
  mk(keyFor('wood','mud'), {name:'wooden_dam', damage:8, uses:5});
  mk(keyFor('wood','magma'), {name:'torch', damage:1, uses:5});
  mk(keyFor('wood','glass'), {name:'prickly_wood', damage:2, uses:5});
  mk(keyFor('wood','iron'), null);
  mk(keyFor('wood','ice'), {name:'frozen_log', damage:2, uses:5});
  mk(keyFor('wood','electricity'), {name:'ashy_wood', damage:3, uses:5});
  mk(keyFor('vines','mud'), {name:'swamp', damage:7, uses:4});
  mk(keyFor('vines','stone'), {name:'mossy_stone'});
  mk(keyFor('magma','vines'), null);
  mk(keyFor('glass','vines'), {name:'prickly_vines'});
  mk(keyFor('iron','vines'), {name:'rusted_iron', damage:1, uses:5});
  mk(keyFor('ice','vines'), null);
  mk(keyFor('electricity','vines'), {name:'sparky_vines', damage:1, uses:5});
  mk(keyFor('mud','stone'), {name:'slime', damage:2, uses:5});
  mk(keyFor('mud','magma'), {name:'firey_mud', damage:1, uses:5});
  mk(keyFor('mud','glass'), null);
  mk(keyFor('mud','iron'), {name:'dirty_iron', damage:2, uses:5});
  mk(keyFor('mud','ice'), {name:'dirty_ice', damage:1, uses:5});
  mk(keyFor('mud','electricity'), null);
  mk(keyFor('stone','magma'), {name:'hot_rock', damage:9, uses:2});
  mk(keyFor('stone','glass'), {name:'prickly_stone', damage:8, uses:2});
  mk(keyFor('stone','iron'), null);
  mk(keyFor('stone','ice'), {name:'frozen_stone', damage:2, uses:5});
  mk(keyFor('stone','electricity'), {name:'sparky_stone', damage:3, uses:4});
  mk(keyFor('iron','glass'), {name:'prickly_metal', damage:2, uses:5});
  mk(keyFor('ice','glass'), {name:'prickly_ice', damage:1, uses:5});
  mk(keyFor('electricity','glass'), null);
  mk(keyFor('iron','ice'), {name:'frozen_metal', damage:8, uses:2});
  mk(keyFor('iron','electricity'), {name:'charged_rod', damage:7, uses:2});
  mk(keyFor('magma','ice'), null);
  mk(keyFor('magma','glass'), {name:'hot_glass', damage:7, uses:2});
  mk(keyFor('magma','iron'), {name:'hot_rod', damage:2, uses:5});
  mk(keyFor('magma','electricity'), {name:'charged_fire', damage:1, uses:5});
  mk(keyFor('glass','electricity'), null);

  function spawnRandomItem(){ const [x,y] = randomSpawnPosition(); const typ = ITEM_TYPES[Math.floor(Math.random()*ITEM_TYPES.length)]; items.push(new Item(x,y,typ)); }

  // ensure safe spawns (simple version)
  function isValidSpawn(x,y){ const padding = 30; if(x < padding || x > WIDTH - padding || y < padding || y > HEIGHT - padding) return false; for(const p of players){ if(Math.hypot(p.x-x,p.y-y) < 60) return false; } const r={x:x-12,y:y-12,w:24,h:24}; for(const obs of obstacles){ if(obs.collidesRect && obs.collidesRect(r)) return false; } return true; }
  function randomSpawnPosition(){ for(let tries=0;tries<40;tries++){ const x = randRange(45, WIDTH-45); const y = randRange(45, HEIGHT-45); if(isValidSpawn(x,y)) return [x,y]; } const p = SPAWN_POSITIONS[Math.floor(Math.random()*SPAWN_POSITIONS.length)]; return [p[0]+randRange(-12,12), p[1]+randRange(-12,12)]; }

  // merge helper used when player attempts to pick up a second item
  function tryMergeWithNearby(player){
    if(!player.item) return false;
    // If player already holds a merged weapon, they cannot merge/pick more until it's fully used up
    if(player.item instanceof HeldWeapon && player.item.isMerged){
      return false;
    }
    for(const it of items){
      if(!it.picked && rectsOverlap(it.rect(), player.rect())){
        const firstType = player.item.type;
        const secondType = it.type;
        const firstName = (firstType && firstType.name) ? firstType.name.toString().toLowerCase() : '';
        const secondName = (secondType && secondType.name) ? secondType.name.toString().toLowerCase() : '';
        const k = keyFor(firstName, secondName);
        const entry = MERGE_MAP.has(k) ? MERGE_MAP.get(k) : undefined;

        // consume second item from world
        it.picked = true;

        // If both items are the same element, treat them as a single element:
        // add the remaining uses of the second item to the held item's usesLeft
        if(firstName && secondName && firstName === secondName){
          const extra = (it.usesLeft || secondType.uses || 0);
          // Ensure player.item has usesLeft (it should be a HeldWeapon or similar)
          if(player.item && typeof player.item.usesLeft === 'number'){
            player.item.usesLeft = (player.item.usesLeft || 0) + extra;
          } else if(player.item){
            player.item.usesLeft = (firstType.uses || 1) + extra;
          }
          return true;
        }

        if(entry === null){
          // nullify => both consumed, held item removed
          player.item = null;
          return true;
        }

        // build combinedType
        let combinedName, combinedDamage, combinedUses;
        if(entry){
          combinedName = entry.name || `${firstName}+${secondName}`;
          combinedDamage = (typeof entry.damage === 'number') ? entry.damage : null;
          combinedUses = (typeof entry.uses === 'number') ? entry.uses : null;
        }

        // fallback behavior: if mapping missing or fields missing, use group rules
        const g1 = groupOf(firstName);
        const g2 = groupOf(secondName);
        if(combinedDamage === null){
          if(g1 && g2 && g1 === g2) combinedDamage = (firstType.damage || 0) + (secondType.damage || 0);
          else combinedDamage = Math.abs((firstType.damage || 0) - (secondType.damage || 0));
        }
        if(combinedUses === null){
          // per previous behavior, uses default to first item's remaining uses
          combinedUses = player.item.usesLeft || firstType.uses || 1;
        }

        combinedName = combinedName || `${firstName}+${secondName}`;
    const combinedType = { name: combinedName, color: firstType.color || secondType.color, shape: firstType.shape || secondType.shape, damage: combinedDamage, uses: combinedUses };
    // set imageKey for merged type if we have a composed image (try both name orders)
    const mergedKey = keyFor(firstName, secondName);
    if(IMAGES[mergedKey]) combinedType.imageKey = mergedKey;

  // set held weapon to combined type; mark as merged; do NOT spawn a new world item
  player.item = new HeldWeapon(combinedType, combinedUses, true);
        return true;
      }
    }
    return false;
  }

  // Input: charge on keydown, release does either merge/pickup (quick tap) or fire (long press)
  window.addEventListener('keydown',(e)=>{ if(!e||!e.code) return; if(gameOver) return; const gameplay = ['KeyW','KeyA','KeyS','KeyD','KeyF']; if(gameplay.indexOf(e.code)!==-1) e.preventDefault(); keys[e.code]=true; lastKey=e.code; lastKeyAt=performance.now(); if(e.code === player1.controls.use && !player1.charging){ player1.charging = true; player1.chargeStart = performance.now(); } });
  window.addEventListener('keyup',(e)=>{ if(!e||!e.code) return; if(gameOver) return; keys[e.code]=false; if(e.code === player1.controls.use && player1.charging){ player1.charging = false; releaseUse(player1); } });


  function releaseUse(player){
    if(!player.alive) return;
    const now = performance.now();
    const charge = Math.min(1500, Math.max(0, now - (player.chargeStart || 0))); // quick tap threshold (ms)
    if(gameOver) return; // no actions after game ends

    const quickTap = charge < 220;
    if(player.item){
      // quick tap: try merge with nearby ground items
      if(quickTap){
        const merged = tryMergeWithNearby(player);
        if(merged) return;
      }

      // otherwise fire with scaled damage
      const power = 0.5 + (charge / 1500) * 1.5;
      const dirX = (player.lastDirX !== undefined) ? player.lastDirX : (player === player1 ? 1 : -1);
      const dirY = (player.lastDirY !== undefined) ? player.lastDirY : 0;
      const spawnX = player.x + dirX * (player.size + 12);
      const spawnY = player.y + dirY * (player.size + 12);
      const dmg = Math.max(1, Math.round(player.item.type.damage * power));
      const atk = new Attack(player, spawnX, spawnY, 18, dmg, dirX, dirY);
      atk.vx *= (0.9 + power);
      atk.vy *= (0.9 + power);
      attacks.push(atk);

      // notify server to apply damage authoritatively
      try{ if(socket && socket.connected) socket.emit('attack', { id: socket.id, x: spawnX, y: spawnY, damage: dmg }); }catch(e){}

      player.item.usesLeft -= 1;
      if(player.item.usesLeft <= 0) player.item = null;
    } else {
      // no held item: quick tap picks up a nearby ground item
      if(quickTap){
        for(const it of items){
          if(!it.picked && rectsOverlap(it.rect(), player.rect())){
            // pick it up
            it.picked = true;
            const uses = (it.usesLeft !== undefined) ? it.usesLeft : (it.type && it.type.uses ? it.type.uses : 1);
            player.item = new HeldWeapon(it.type, uses, false);
            // immediately tell server our new item state (best-effort)
            try{ if(socket && socket.connected) socket.emit('update', { id: socket.id, x: player1.x, y: player1.y, color: player1.color, name: player1.name, kills: player1.kills, alive: player1.alive, bobIndex: (typeof player1.bobIndex === 'number' ? player1.bobIndex : 0), item: player1.item ? { name: player1.item.type.name, usesLeft: player1.item.usesLeft } : null }); }catch(e){}
            return;
          }
        }
      }
    }
  }
  // game loop (simplified drawing update harness)
  let last = performance.now(); function step(){ const perfNow = performance.now(); const dt = perfNow - last; last = perfNow; const epochNow = Date.now();
    if(!gameStarted){
      // If server provided a room start time, honor it (epoch ms). Otherwise start now (epoch)
      if(typeof window !== 'undefined' && window.__ELEMEMZ_START_AT){
        gameStart = Number(window.__ELEMEMZ_START_AT) || epochNow; gameStarted = true; gameEndAt = gameStart + GAME_LENGTH_MS;
      } else {
        gameStarted = true; gameStart = epochNow; gameEndAt = gameStart + GAME_LENGTH_MS;
      }
    }
    update(perfNow, dt);
    draw(perfNow, epochNow);
    requestAnimationFrame(step);
  }
  function update(now, dt){ players.forEach(p=>p.update(keys, obstacles)); for(const atk of attacks){ atk.update(); for(const p of players){ if(p===atk.owner) continue; if(!p.alive) continue; if(rectsOverlap(atk.rect(), p.rect())){ p.takeDamage(atk.damage, atk.owner); /* hit visual suppressed */ atk.ttl = 0; break; } } } for(let i=attacks.length-1;i>=0;i--) if(attacks[i].ttl<=0) attacks.splice(i,1); /* hitEffects removed */ for(const p of players){ if(!p.alive && p.respawnAt === null){ p.respawnAt = now + 5000; if(p.item){ const typ = p.item.type; const uses_left = p.item.usesLeft || 0; const dropped = new Item(p.x + (p===player1 ? 20 : -20), p.y, typ); dropped.usesLeft = uses_left; items.push(dropped); p.item = null; } } } for(const p of players){ if(!p.alive && p.respawnAt !== null && now >= p.respawnAt){ p.alive = true; p.health = 10; const [rx,ry] = randomSpawnPosition(); p.x = rx; p.y = ry; p.respawnAt = null; } }
    // networking: send position updates for player1 at ~10Hz
    if(socket && socket.connected){
      // throttle updates to avoid flooding
      if(!socket._lastSent || now - socket._lastSent > 95){
        socket._lastSent = now;
        try{
          // prepare item payload with normalized imageKey if available
          let itemPayload = null;
          if(player1.item && player1.item.type){
            const name = (player1.item.type.name || '').toString();
            const imageKey = (player1.item.type.imageKey) ? player1.item.type.imageKey : name.toLowerCase();
            itemPayload = { name: name, usesLeft: player1.item.usesLeft, imageKey };
          }
          socket.emit('update', { id: socket.id, x: player1.x, y: player1.y, color: player1.color, name: player1.name, kills: player1.kills, alive: player1.alive, bobIndex: (typeof player1.bobIndex === 'number' ? player1.bobIndex : 0), health: player1.health, item: itemPayload });
        }catch(e){}
      }
    }
    // Timer and game-over check (use epoch time for timer comparisons)
    if(!gameOver){
      if(Date.now() >= gameEndAt){
        gameOver = true;
        // single player: show final score
        gameWinnerText = `${player1.name} score: ${player1.kills}`;
        // disable movement by clearing keys
        keys = {};
      }
    }

    // Server-tick spawning: every SERVER_TICK_MS, ensure up to MAX_GROUND_ITEMS are present
    if(!gameStarted){} else {
      if(!lastSpawnTick) lastSpawnTick = now;
      if(now - lastSpawnTick >= SERVER_TICK_MS){
        lastSpawnTick = now;
        const groundCount = items.filter(it => !it.picked).length;
        const toSpawn = Math.max(0, MAX_GROUND_ITEMS - groundCount);
        for(let i=0;i<toSpawn;i++){
          // attempt a safe spawn
          let [x,y] = randomSpawnPosition();
          // pick a random type
          const typ = ITEM_TYPES[Math.floor(Math.random()*ITEM_TYPES.length)];
          items.push(new Item(x,y,typ));
        }
      }
    }
    // auto-respawn items
    if(items.filter(it=>!it.picked).length < Math.min(ITEM_TYPES.length, SPAWN_POSITIONS.length)){ if(Math.random() < 0.002){ for(let i=0;i<SPAWN_POSITIONS.length;i++){ const t = ITEM_TYPES[i % ITEM_TYPES.length]; const pos = SPAWN_POSITIONS[i]; const exists = items.some(it => !it.picked && Math.hypot(it.x-pos[0], it.y-pos[1]) < 6); if(!exists){ items.push(new Item(pos[0]+(Math.random()-0.5)*18, pos[1]+(Math.random()-0.5)*18, t)); break; } } } }
  }

  function draw(perfNow, epochNow){ if(bgImage && bgImage.complete && bgImage.naturalWidth){ try{ ctx.drawImage(bgImage,0,0,WIDTH,HEIGHT); }catch(e){ ctx.fillStyle=BG; ctx.fillRect(0,0,WIDTH,HEIGHT); } } else { ctx.fillStyle = BG; ctx.fillRect(0,0,WIDTH,HEIGHT); }
    // debug overlay: socket status and remote players info (small, unobtrusive)
    try{
      const dbgX = 10, dbgY = 8; const dbgW = 320; const dbgH = 68;
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(dbgX, dbgY, dbgW, dbgH);
      ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.textAlign = 'left';
      const sConnected = (socket && socket.connected) ? 'yes' : 'no';
      const sid = (socket && socket.id) ? String(socket.id).substring(0,8) : '(none)';
      const rpCount = Object.keys(remotePlayers).length;
      ctx.fillText(`socket.connected: ${sConnected}  id:${sid}`, dbgX + 8, dbgY + 18);
      ctx.fillText(`remotePlayers: ${rpCount}`, dbgX + 8, dbgY + 36);
      const keys = Object.keys(remotePlayers).slice(0,6).map(k=>k.substring(0,6)).join(', ');
      ctx.fillText(`ids: ${keys}`, dbgX + 8, dbgY + 54);
      ctx.restore();
    }catch(e){}
    // top-center large ticking countdown (use epoch time to match server startAt)
    try{
      const nowT = epochNow || Date.now();
      const end = gameStarted ? gameEndAt : (gameStart || nowT) + GAME_LENGTH_MS;
      const remainingMs = Math.max(0, end - nowT);
      const remainingSec = Math.ceil(remainingMs/1000);
      const mins = Math.floor(remainingSec/60); const secs = remainingSec % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2,'0')}`;
      ctx.save();
      ctx.font = 'bold 34px Arial';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, WIDTH/2, 44);
      ctx.restore();
    }catch(e){}
    for(const obs of obstacles) obs.draw && obs.draw(ctx);
    for(const it of items) it.draw && it.draw(ctx);
    for(const p of players) p.draw && p.draw(ctx);
    // draw remote players (simple box + name) 
    try{
      for(const id of Object.keys(remotePlayers)){
        const rp = remotePlayers[id];
        if(!rp) continue;
        const rx = rp.x || 0; const ry = rp.y || 0; const color = rp.color || '#999';
        ctx.save();
        // draw bob avatar for remote player if available
        try{
          if(typeof rp.bobIndex === 'number' && BOBS[rp.bobIndex] && BOBS[rp.bobIndex].complete && BOBS[rp.bobIndex].naturalWidth){ ctx.drawImage(BOBS[rp.bobIndex], Math.round(rx-21), Math.round(ry-21), 42, 42); }
          else { ctx.fillStyle = color; ctx.fillRect(rx-21, ry-21, 42, 42); }
        }catch(e){ ctx.fillStyle = color; ctx.fillRect(rx-21, ry-21, 42, 42); }
        // health bar
        const hp = (typeof rp.health === 'number') ? rp.health : 10;
        const hpFrac = Math.max(0, Math.min(1, hp / 10));
        ctx.fillStyle = '#333'; ctx.fillRect(rx-22, ry+24, 44, 8);
        ctx.fillStyle = hpFrac > 0.5 ? '#4caf50' : (hpFrac > 0.2 ? '#ff9800' : '#f44336');
        ctx.fillRect(rx-22, ry+24, Math.round(44 * hpFrac), 8);
        ctx.fillStyle = '#000'; ctx.font = '14px Arial'; ctx.fillText(rp.name || id.substring(0,4), rx - 16, ry + 34);
        // show held item icon above remote player's head if available
        // show held item icon above remote player's head if available (prefer imageKey)
        try{
          const held = rp.item || (rp.itemName ? { name: rp.itemName } : null);
          if(held){ const key = (held.imageKey ? String(held.imageKey).toLowerCase() : (held.name ? String(held.name).toLowerCase() : null)); const img = key ? IMAGES[key] : null; if(img && img.complete && img.naturalWidth){ const iw = 20, ih = 20; ctx.drawImage(img, rx - iw/2, ry - 34, iw, ih); } }
        }catch(e){}
        ctx.restore();
      }
    }catch(e){}
    for(const a of attacks) a.draw && a.draw(ctx);
  for(const a of attacks) a.draw && a.draw(ctx);
    // scoreboard (top-right) - dynamic glassy board listing local + remote players
    try{
      // gather players: local first, then remote players from server state
      const playersList = [];
      // local player object (include a synthetic id)
      playersList.push({ id: 'local', name: player1.name || 'P1', color: player1.color || '#2196f3', kills: player1.kills || 0, health: player1.health, alive: player1.alive });
      // include any remote players we know about from the server state
      for(const id of Object.keys(remotePlayers)){
        const rp = remotePlayers[id];
        if(!rp) continue;
        playersList.push({ id, name: rp.name || id.substring(0,4), color: rp.color || '#999', kills: rp.kills || 0, health: (typeof rp.health === 'number' ? rp.health : 10), alive: rp.alive !== false, item: rp.item || (rp.itemName ? { name: rp.itemName } : null) });
      }
      // fallback: if game hasn't started and remotePlayers is empty, show lobby-provided players so scoreboard shows names
      try{
        const lobbyFallback = (typeof window !== 'undefined') ? (window.__ELEMEMZ_LOBBY_PLAYERS || []) : [];
        if(!gameStarted && Object.keys(remotePlayers).length === 0){
          for(let i=0;i<lobbyFallback.length;i++){
            const lp = lobbyFallback[i]; if(!lp) continue;
            const fid = `lobby-fallback-${i}`;
            playersList.push({ id: fid, name: lp.name || `P${i+1}`, color: lp.color || '#999', kills: 0, health: 10, alive: true, item: lp.item || (lp.itemName ? { name: lp.itemName } : null) });
          }
        }
      }catch(e){}

      // sort by kills descending, then name
      playersList.sort((a,b) => (b.kills || 0) - (a.kills || 0) || ((a.name||'').localeCompare(b.name||'')));

      // visual layout
      const rowH = 28; const titleH = 36; const padding = 14; const maxRows = Math.max(1, playersList.length);
      const sbW = 340; const sbH = Math.min(420, padding*2 + titleH + maxRows * rowH + 8);
      const sbMargin = 18;
      const sbX = WIDTH - sbMargin - sbW, sbY = sbMargin;
      const radius = 12;

      function roundRectPath(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

      // base glass panel with shadow
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 16; ctx.fillStyle = 'rgba(255,255,255,0.20)'; roundRectPath(sbX, sbY, sbW, sbH, radius); ctx.fill(); ctx.restore();

      // sheen overlay
      const grad = ctx.createLinearGradient(sbX, sbY, sbX, sbY + sbH);
      grad.addColorStop(0, 'rgba(255,255,255,0.28)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.save(); roundRectPath(sbX, sbY, sbW, sbH, radius); ctx.fillStyle = grad; ctx.fill(); ctx.restore();

      // border
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; roundRectPath(sbX + 0.5, sbY + 0.5, sbW - 1, sbH - 1, radius); ctx.stroke(); ctx.restore();

      // title + timer
      ctx.fillStyle = '#022'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'left'; ctx.fillText('Scoreboard', sbX + 16, sbY + 22 + 6);
  const nowT = epochNow || Date.now(); const remaining = Math.max(0, Math.floor((gameEndAt - nowT) / 1000)); const mins = Math.floor(remaining/60); const secs = remaining % 60;
      ctx.font = 'bold 16px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${mins}:${secs.toString().padStart(2,'0')}`, sbX + sbW - 12, sbY + 22 + 6);

      // player rows
      ctx.font = '14px Arial'; ctx.textAlign = 'left';
      for(let i=0;i<playersList.length;i++){
        const row = playersList[i]; const ry = sbY + padding + titleH + i * rowH;
        // background subtle stripe for readability
        if(i % 2 === 0){ ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = '#000'; ctx.fillRect(sbX + 8, ry - 16, sbW - 16, rowH); ctx.restore(); }

        // color box
        ctx.fillStyle = row.color || '#000'; ctx.fillRect(sbX + 16, ry - 12, 18, 18);


        // name
        ctx.fillStyle = '#022'; ctx.textAlign = 'left'; ctx.fillText(`${row.name}`, sbX + 42, ry + 2);

        // small held item icon to the right of the name if this player has an item
        try{
          const heldName = (row && row.item && row.item.name) ? row.item.name : (remotePlayers[row.id] && remotePlayers[row.id].item ? (remotePlayers[row.id].item.name || remotePlayers[row.id].itemName) : null);
          if(heldName){ const k = String(heldName).toLowerCase(); const ii = IMAGES[k]; if(ii && ii.complete && ii.naturalWidth){ const ix = sbX + 42 + ctx.measureText(row.name).width + 8; ctx.drawImage(ii, ix, ry - 10, 18, 18); } }
        }catch(e){}

        // kills (right aligned)
        ctx.textAlign = 'right'; ctx.fillStyle = '#022'; ctx.fillText(`${row.kills || 0}`, sbX + sbW - 24, ry + 2);

        // health bar beneath the row text (small)
        const hpX = sbX + 42; const hpW = sbW - 84; const hpY = ry + 8;
        ctx.fillStyle = '#333'; ctx.fillRect(hpX, hpY, hpW, 6);
        const hpFrac = Math.max(0, Math.min(1, (typeof row.health === 'number' ? row.health : 10) / 10));
        ctx.fillStyle = hpFrac > 0.5 ? '#4caf50' : (hpFrac > 0.2 ? '#ff9800' : '#f44336');
        ctx.fillRect(hpX, hpY, Math.round(hpW * hpFrac), 6);
      }

    }catch(e){ /* safe fail - don't break draw */ }

    // if game over, draw full-screen winner overlay and prevent interaction
    if(gameOver){
      try{
        // dark translucent backdrop
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0,0,WIDTH,HEIGHT);
        // winner card
        const cardW = 640, cardH = 240;
        const cardX = WIDTH/2 - cardW/2, cardY = HEIGHT/2 - cardH/2;
        // card background
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fillRect(cardX, cardY, cardW, cardH);
        // border
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.strokeRect(cardX, cardY, cardW, cardH);
        // text
        ctx.fillStyle = '#111'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center';
        ctx.fillText(gameWinnerText, WIDTH/2, cardY + 110);
        ctx.textAlign = 'left';
        ctx.restore();
      }catch(e){}
    }

  // HUD
  ctx.fillStyle='#333'; ctx.font='14px Arial'; ctx.fillText('Controls: WASD to move, F to use/attack', WIDTH/2 - 160, HEIGHT - 14);
    ctx.fillStyle='#000'; ctx.font='12px Arial'; ctx.fillText('Game running', 10, HEIGHT - 10);
  }

  // start
  requestAnimationFrame(step);
})();