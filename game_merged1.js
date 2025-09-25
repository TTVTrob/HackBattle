// merged game: combines visuals/charging from game_pygame.js with group-based merging rules
(function(){
  // ---- Config ----
  const WIDTH = 1200, HEIGHT = 720;
  const PLAY_BORDER = 20; // pixels inset from each edge where players cannot cross
  const PLAY_AREA = { x: PLAY_BORDER, y: PLAY_BORDER, w: WIDTH - PLAY_BORDER*2, h: HEIGHT - PLAY_BORDER*2 };
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
    // merged images (keys are normalized alphabetically to match keyFor(a,b))
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
    'magma+spark': './Images/magma+spark.png'
  };
  const IMAGES = {};
  for(const k of Object.keys(IMAGE_FILES)){
    const img = new Image(); img.src = IMAGE_FILES[k]; IMAGES[k] = img;
  }

  // ---------- Game timer / end-state ----------
  const GAME_DURATION_MS = 2 * 60 * 1000; // 2 minutes
  let gameStartTime = Date.now();
  let gameEndTime = gameStartTime + GAME_DURATION_MS;
  let gameOver = false;
  let finalRankings = null; // filled when game ends
  function formatTimeRemaining(){ const rem = Math.max(0, gameEndTime - Date.now()); const s = Math.floor(rem/1000); const mm = Math.floor(s/60); const ss = s % 60; return `${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`; }

  // Multiplayer integration hooks (the front-end will provide implementations)
  if (typeof window !== 'undefined') {
    // This function will be called by the front-end when a room snapshot arrives
    window.__applyRoomState = window.__applyRoomState || function(snapshot){
      try{
            if(!snapshot || !snapshot.players) return;
            const serverPlayers = snapshot.players || {};
            // sync items if provided: snapshot.items is expected to be an object keyed by id -> {id,x,y,type,uses}
            if(snapshot.items){
              try{
                items.length = 0;
                for(const iid of Object.keys(snapshot.items)){
                  const it = snapshot.items[iid];
                  // normalize type name
                  const typName = (it.type && it.type.name) ? it.type.name : (it.type || 'wood');
                  let catalog = ITEM_TYPES.find(t => t.name && t.name.toString().toLowerCase() === (typName||'').toString().toLowerCase());
                  if(!catalog) catalog = ITEM_TYPES[0];
                  const newIt = new Item(Number(it.x)||0, Number(it.y)||0, catalog, it.id || iid, (it.uses !== undefined ? it.uses : null));
                  items.push(newIt);
                }
              }catch(e){ console.warn('failed to sync items from snapshot', e); }
            }
        const merged = [];
        const myId = (typeof window !== 'undefined' && window.__PLAYER_ID) ? window.__PLAYER_ID : null;

        // For each server player: try to update an existing local Player, reuse a local fallback, or create a new Player
        for(const id of Object.keys(serverPlayers)){
          const sp = serverPlayers[id];
          // try find existing by id
          let local = players.find(p => p && p.id === sp.id);
          if(local){
            // update fields conservatively
            if(typeof sp.x === 'number') local.x = sp.x;
            if(typeof sp.y === 'number') local.y = sp.y;
            if(typeof sp.health === 'number') local.health = sp.health;
            if(typeof sp.deaths === 'number') local.deaths = sp.deaths;
            if(typeof sp.kills === 'number') local.kills = sp.kills;
            if(typeof sp.alive === 'boolean') local.alive = sp.alive;
            local.name = sp.name || local.name;
            local.color = sp.color || local.color;
            // server-provided players are authoritative: clear local fallback marker
            if(local.isLocalFallback) local.isLocalFallback = false;
          } else {
            // try reuse an unassigned local fallback player
            const fallback = players.find(p => p && p.isLocalFallback && (!p.id || p.id === null));
            if(fallback){
              fallback.id = sp.id;
              fallback.name = sp.name || fallback.name;
              fallback.color = sp.color || fallback.color;
              if(typeof sp.x === 'number') fallback.x = sp.x;
              if(typeof sp.y === 'number') fallback.y = sp.y;
              if(typeof sp.health === 'number') fallback.health = sp.health;
              if(typeof sp.alive === 'boolean') fallback.alive = sp.alive;
              fallback.isLocalFallback = false;
              local = fallback;
            } else {
              // create a new Player instance to represent the server player
              local = new Player(sp.x || 100, sp.y || 100, sp.color || '#999', {up:'',down:'',left:'',right:'',use:''}, sp.name || sp.id || 'P');
              local.id = sp.id;
              local.health = (typeof sp.health === 'number') ? sp.health : local.health;
              local.deaths = (typeof sp.deaths === 'number') ? sp.deaths : (local.deaths || 0);
              local.kills = (typeof sp.kills === 'number') ? sp.kills : (local.kills || 0);
              local.alive = (typeof sp.alive === 'boolean') ? sp.alive : true;
            }
          }

          merged.push(local);
        }

        // If we merged server players, replace the players array with the merged ordering
        if(merged.length){
          players.length = 0;
          merged.forEach(p => players.push(p));
        }
        // If server sent no players but we already have local fallback(s), keep them as-is

      }catch(e){ console.warn('applyRoomState failed', e); }
    };

    // sendPlayerUpdate should be provided by front-end (calls server). If missing, define a no-op
    window.__sendPlayerUpdate = window.__sendPlayerUpdate || function(id,x,y,action){};
  }

  // obtain canvas
  let canvas = document.getElementById('gameCanvas') || document.getElementById('game');
  if(!canvas){ canvas = document.createElement('canvas'); canvas.id = 'gameCanvas'; canvas.width = WIDTH; canvas.height = HEIGHT; document.body.appendChild(canvas); }
  else { canvas.width = WIDTH; canvas.height = HEIGHT; }
  try{ canvas.tabIndex = canvas.tabIndex || 0; }catch(e){}
  canvas.addEventListener('click', ()=>{ try{ canvas.focus(); }catch(e){} });
  setTimeout(()=>{ try{ canvas.focus(); }catch(e){} }, 200);
  const ctx = canvas.getContext('2d');

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
  class Item{ constructor(x,y,type,id=null, usesLeft=null){ this.x=x; this.y=y; this.size=21; this.type=type; this.id = id || null; this.picked=false; this.usesLeft = (usesLeft !== null) ? usesLeft : (type && type.uses ? type.uses : 1); // ensure imageKey exists on type
    if(this.type && !this.type.imageKey && this.type.name) this.type.imageKey = this.type.name.toString().toLowerCase(); }
    rect(){ return {x:this.x-this.size/2,y:this.y-this.size/2,w:this.size,h:this.size}; }
    draw(ctx){ if(this.picked) return; const key = (this.type && this.type.imageKey) ? this.type.imageKey.toString().toLowerCase() : (this.type && this.type.name ? this.type.name.toString().toLowerCase() : null); const img = key ? IMAGES[key] : null; if(img && img.complete && img.naturalWidth){ const w = this.size * 1.6, h = this.size * 1.6; ctx.drawImage(img, this.x - w/2, this.y - h/2, w, h); return; }
      // fallback to colored shape if image missing
      ctx.fillStyle=this.type.color; if(this.type.shape==='square') ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size); else { ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.size/2, 0, Math.PI*2); ctx.fill(); } ctx.fillStyle='#000'; ctx.fillRect(this.x-1,this.y-1,2,2); }
  }
  class HeldWeapon{ constructor(type, usesLeft, isMerged = false){ this.type = type; this.usesLeft = usesLeft; // mark as a merged/constructed weapon so pickup logic can distinguish
      this.isMerged = !!isMerged;
    } }
  class Attack{ constructor(owner,x,y,ttl,damage,dirX=1,dirY=0){ this.owner=owner; this.x=x; this.y=y; this.ttl=ttl; this.damage=damage; this.r=12; const base = randRange(0.9,1.6); this.vx=dirX*base + randRange(-0.15,0.15); this.vy=dirY*base + randRange(-0.15,0.15); } rect(){ return {x:this.x-this.r,y:this.y-this.r,w:this.r*2,h:this.r*2}; } update(){ this.ttl -= 1; this.x += this.vx * 6; this.y += this.vy * 6; } draw(ctx){ ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r,0,Math.PI*2); ctx.fill(); } }
  class HitEffect{ constructor(x,y){ this.x=x; this.y=y; this.ttl=12; this.r=9; } update(){ this.ttl -= 1; this.r += 1; } draw(ctx){ const a = Math.max(0, this.ttl/12); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); } }
  class Player{ constructor(x,y,color,controls,name){ this.x=x; this.y=y; this.color=color; this.controls=controls; this.size=42; this.speed=4.8; this.health=10; this.alive=true; this.spawnX=x; this.spawnY=y; this.respawnAt=null; this.item=null; this.name=name||'P'; this.kills=0; this.hitAt=0; this.lastDirX=1; this.lastDirY=0; this.charging=false; this.chargeStart=0; this.facing='right'; } rect(){ return {x:this.x - this.size/2, y:this.y - this.size/2, w:this.size, h:this.size}; }
    update(keys, obstacles){ if(!this.alive) return; const oldX=this.x, oldY=this.y; if(keys[this.controls.up]) this.y -= this.speed; if(keys[this.controls.down]) this.y += this.speed; if(keys[this.controls.left]) this.x -= this.speed; if(keys[this.controls.right]) this.x += this.speed; const half = this.size/2; // clamp to play area
      // if the game is over, players become non-movable objects
      if(typeof gameOver !== 'undefined' && gameOver) return;
      this.x = clamp(this.x, PLAY_AREA.x + half, PLAY_AREA.x + PLAY_AREA.w - half);
      this.y = clamp(this.y, PLAY_AREA.y + half, PLAY_AREA.y + PLAY_AREA.h - half);
      const r = this.rect(); for(const obs of obstacles){ if(obs.collidesRect && obs.collidesRect(r)){ this.x = oldX; this.y = oldY; break; } } const dx = this.x - oldX, dy = this.y - oldY; const mag = Math.hypot(dx,dy); if(mag > 0.001){ this.lastDirX = dx/mag; this.lastDirY = dy/mag; if(Math.abs(dx) > Math.abs(dy)){ this.facing = dx > 0 ? 'right' : 'left'; } else { this.facing = dy > 0 ? 'down' : 'up'; } } }
    draw(ctx){ if(!this.alive) return; const now = performance.now(); const hitDur = 300; const since = now - this.hitAt; if(since < hitDur){ ctx.save(); const a = 0.6 * (1 - since / hitDur); ctx.globalAlpha = a; ctx.fillStyle = '#ff4444'; const r = this.rect(); ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); ctx.restore(); } ctx.fillStyle = this.color; const r2 = this.rect(); ctx.fillRect(r2.x, r2.y, r2.w, r2.h);
    // held item: show image if present, otherwise colored rectangle
    if(this.item){
      const key = (this.item.type && this.item.type.imageKey) ? this.item.type.imageKey.toString().toLowerCase() : (this.item.type && this.item.type.name ? this.item.type.name.toString().toLowerCase() : null);
      const img = key ? IMAGES[key] : null;
      if(img && img.complete && img.naturalWidth){ const w = 28, h = 28; ctx.drawImage(img, this.x - w/2, this.y - this.size/2 - 34, w, h); }
      else { ctx.fillStyle = this.item.type.color; ctx.fillRect(this.x - 12, this.y - this.size/2 - 21, 24, 15); }
      ctx.fillStyle = '#000'; ctx.font = '16px Arial'; ctx.fillText(`${this.item.type.name}(${this.item.usesLeft})`, this.x - 42, this.y - this.size/2 - 36);
    } if(this.charging){ const now = performance.now(); const elapsed = Math.min(1500, now - this.chargeStart); const frac = elapsed / 1500; const bx = this.x - 33, by = this.y - this.size/2 - 54, bw = 66, bh = 9; ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = '#ffd54f'; ctx.fillRect(bx, by, Math.round(bw * frac), bh); ctx.strokeStyle = '#000'; ctx.strokeRect(bx, by, bw, bh); } const barW = 60, barH = 9; const px = this.x - barW/2, py = this.y + this.size/2 + 9; ctx.strokeStyle = '#000'; ctx.strokeRect(px,py,barW,barH); const rem = Math.max(0, this.health/10); let col = '#4caf50'; if(rem<=0.5) col = rem>0.2 ? '#ff9800' : '#f44336'; ctx.fillStyle = col; ctx.fillRect(px,py,Math.floor(barW*rem),barH); ctx.fillStyle = '#000'; ctx.font = '18px Arial'; ctx.fillText(this.name, px, py + barH + 18); }
  takeDamage(amount, attacker){ if(!this.alive) return; this.health = Math.max(0, this.health - amount); this.hitAt = performance.now(); if(this.health <= 0){ this.alive = false; this.respawnAt = performance.now() + 3000; // increment death counter
    this.deaths = (this.deaths || 0) + 1;
    // notify others via popup
    try{ addPopup(`${this.name} died`); }catch(e){}
    if(attacker && attacker.kills !== undefined) attacker.kills += 1; } }
  }

  class CircleObstacle{ constructor(x,y,r,color='#b4b4b4'){ this.x=x; this.y=y; this.r=r; this.color=color; } draw(ctx){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.r), 0, Math.PI*2); ctx.closePath(); if(pondImage && pondImage.complete && pondImage.naturalWidth){ try{ ctx.save(); ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.r), 0, Math.PI*2); ctx.clip(); ctx.drawImage(pondImage, this.x - this.r, this.y - this.r, this.r*2, this.r*2); ctx.restore(); }catch(e){ ctx.fill(); } } else { ctx.fill(); } } collidesRect(rect){ return circleRectCollide(this, rect); } }
  class PolyObstacle{ constructor(points,color='#8c8c8c'){ this.points = points.slice(); this.color = color; let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity; for(const p of points){ minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]); maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]); } this.bbox={x:Math.floor(minx),y:Math.floor(miny),w:Math.max(1,Math.ceil(maxx-minx)),h:Math.max(1,Math.ceil(maxy-miny))}; this.off=document.createElement('canvas'); this.off.width=this.bbox.w; this.off.height=this.bbox.h; this.offCtx=this.off.getContext('2d'); this._prepared=false; this.contour=null;
    if (polyImage && polyImage.complete && polyImage.naturalWidth) {
      this.prepareFromImage();
    } else if (polyImage) {
      if (typeof polyImage.addEventListener === 'function') {
        try { polyImage.addEventListener('load', () => this.prepareFromImage(), { once: true }); }
        catch (e) { polyImage.addEventListener('load', () => this.prepareFromImage()); }
      } else { polyImage.onload = () => this.prepareFromImage(); }
    }
  }
  }

  // ---- State ----
  const items = []; for(let i=0;i<SPAWN_POSITIONS.length && i<ITEM_TYPES.length;i++){ const p = SPAWN_POSITIONS[i]; items.push(new Item(p[0], p[1], ITEM_TYPES[i])); }
  const obstacles = []; obstacles.push(new CircleObstacle(600, 180, 75, '#b4b4b4')); obstacles.push(new CircleObstacle(300, 360, 60, '#a0a0c8')); obstacles.push(new PolyObstacle([[750,75],[870,120],[840,210],[720,165]], '#96c890')); obstacles.push(new PolyObstacle([[180,450],[240,495],[210,570],[150,540]], '#cfa0a0'));
  // players are driven by server snapshots; each client controls only their own player
  const players = [];

  // helper to find the local player instance by assigned id (set by front-end when joining)
  function getLocalPlayer(){ try{ const myId = (typeof window !== 'undefined' && window.__PLAYER_ID) ? window.__PLAYER_ID : null; if(!myId) return players.find(p => p && p.isLocalFallback) || null; return players.find(p => p && p.id === myId) || null; }catch(e){ return null; } }

  // If server snapshots are not arriving, ensure at least one local player exists so the page is playable
  function ensureLocalPlayerExists(){ try{
    const hasPlayers = players.length > 0;
    const myId = (typeof window !== 'undefined' && window.__PLAYER_ID) ? window.__PLAYER_ID : null;
    // If we have no players at all, spawn a local fallback player with default controls
    if(!hasPlayers){ const pos = randomSpawnPosition(); const defaultControls = { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', use:'KeyF' }; const lp = new Player(pos[0], pos[1], '#2196f3', defaultControls, (myId? 'You' : 'Local')); lp.id = myId || ('local-' + Math.random().toString(36).slice(2,8)); lp.isLocalFallback = true; players.push(lp); return; }
    // If players exist but none match our assigned id, create/attach a local player for this client
    if(myId && !players.some(p => p && p.id === myId)){
      const pos = randomSpawnPosition(); const defaultControls = { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', use:'KeyF' };
      const lp = new Player(pos[0], pos[1], '#2196f3', defaultControls, 'You'); lp.id = myId; lp.isLocalFallback = true; players.push(lp); return;
    }
  }catch(e){ console.warn('ensureLocalPlayerExists failed', e); } }

  // ensure local player exists immediately so the UI is responsive even without server
  ensureLocalPlayerExists();

  let attacks = []; let hitEffects = []; let keys = {}; let lastKey=null, lastKeyAt=0;

  // popup messages (top-left stack)
  const popups = []; // { text, ttl, createdAt }
  function addPopup(text, ttl=2000){ popups.push({ text, ttl, createdAt: Date.now() }); }
  function drawPopups(ctx){ const now = Date.now(); ctx.save(); ctx.font = '18px Arial'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; let y = 10; for(let i=popups.length-1;i>=0;i--){ const p = popups[i]; const age = now - p.createdAt; if(age > p.ttl){ popups.splice(i,1); continue; } const alpha = 1 - (age / p.ttl); ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(10, y, ctx.measureText(p.text).width + 20, 28); ctx.fillStyle = '#fff'; ctx.fillText(p.text, 20, y + 6); y += 36; } ctx.restore(); }

  // scoreboard rendering
  function drawScoreboard(ctx){ // top-right corner
    const pad = 12; const boxW = 220; const boxH = Math.max(80, 24 * (players.length)); const x = WIDTH - boxW - 16, y = 12;
    // translucent blurred background (approximation by translucent fill)
    ctx.save(); ctx.fillStyle = 'rgba(20,20,20,0.45)'; roundRect(ctx, x, y, boxW, boxH, 8, true, false);
    // slight inner blur effect -- approximated via lighter translucent rect
    ctx.fillStyle = 'rgba(255,255,255,0.02)'; roundRect(ctx, x+2, y+2, boxW-4, boxH-4, 6, true, false);
    // header
    ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; ctx.fillText('SCOREBOARD', x + pad, y + 20);
    // entries
    ctx.font = '14px Arial'; let yy = y + 44; for(const p of players){ const name = p.name || (p.id || 'P'); const hp = Math.max(0, Math.round((p.health||0) * 10) / 10); const deaths = p.deaths || 0; ctx.fillStyle = '#fff'; ctx.fillText(`${name}`, x + pad, yy); ctx.fillStyle = '#ff6b6b'; ctx.fillText(`HP: ${hp}`, x + boxW - 86, yy); ctx.fillStyle = '#f0ad4e'; ctx.fillText(`Deaths: ${deaths}`, x + boxW - 160, yy); yy += 20; }
    ctx.restore();
  }

  // compute final rankings: sort players by deaths ascending, tiebreaker by kills descending
  function computeFinalRankings(){
    const arr = players.slice();
    arr.sort((a,b)=>{ const da = a.deaths || 0, db = b.deaths || 0; if(da !== db) return da - db; const ka = a.kills || 0, kb = b.kills || 0; return kb - ka; });
    return arr;
  }

  function drawEndScreen(ctx, rankings){
    // semi-opaque overlay
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0,0,WIDTH,HEIGHT);
    // title
    ctx.fillStyle = '#fff'; ctx.font = '48px Arial'; ctx.textAlign = 'center'; ctx.fillText('Game Over', WIDTH/2, 110);
    // winner
    if(rankings && rankings.length){ const w = rankings[0]; ctx.font = '36px Arial'; ctx.fillStyle = '#ffd700'; ctx.fillText(`Winner: ${w.name || (w.id||'Player')}`, WIDTH/2, 180); ctx.font = '20px Arial'; ctx.fillStyle = '#fff'; ctx.fillText(`Deaths: ${w.deaths || 0} | Kills: ${w.kills || 0}`, WIDTH/2, 210); }
    // runners-up list
    ctx.font = '20px Arial'; ctx.textAlign = 'left'; const startX = WIDTH/2 - 220; let y = 260; ctx.fillStyle = '#fff'; ctx.fillText('Placings:', startX, y); y += 28;
    for(let i=0;i<rankings.length;i++){ const p = rankings[i]; const place = i+1; ctx.fillStyle = i===0 ? '#ffd700' : (i===1 ? '#c0c0c0' : '#cd7f32'); ctx.fillText(`${place}. ${p.name || (p.id||'Player')} — Deaths: ${p.deaths || 0} — Kills: ${p.kills || 0}`, startX, y); y += 26; }
    // instruction
    ctx.textAlign = 'center'; ctx.font = '16px Arial'; ctx.fillStyle = '#fff'; ctx.fillText('Press F5 or reload to play again', WIDTH/2, HEIGHT - 60);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke){ if (typeof r === 'undefined') r = 5; ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

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
  // notify server about pickup when item has authoritative id
  try{ if(typeof window !== 'undefined' && typeof window.__sendPickup === 'function' && it.id){ window.__sendPickup(player.id || null, it.id); } }catch(e){}

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
  window.addEventListener('keydown',(e)=>{ if(!e||!e.code) return; const gameplay = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyF','KeyL']; if(gameplay.indexOf(e.code)!==-1) e.preventDefault(); keys[e.code]=true; lastKey=e.code; lastKeyAt=performance.now(); const lp = getLocalPlayer(); if(lp && e.code === lp.controls.use && !lp.charging){ lp.charging = true; lp.chargeStart = performance.now(); } });
  window.addEventListener('keyup',(e)=>{ if(!e||!e.code) return; keys[e.code]=false; const lp = getLocalPlayer(); if(lp && e.code === lp.controls.use && lp.charging){ lp.charging = false; releaseUse(lp); } });

  function releaseUse(player){ if(!player.alive) return; const now = performance.now(); const charge = Math.min(1500, Math.max(0, now - player.chargeStart || 0)); // quick tap threshold (ms)
    const quickTap = charge < 220;
    if(player.item){ // if quick tap and overlapping a ground item, try merge instead of firing
      if(quickTap){ const merged = tryMergeWithNearby(player); if(merged) return; }
      // otherwise fire with scaled damage
  const power = 0.5 + (charge / 1500) * 1.5; const dirX = (player.lastDirX !== undefined) ? player.lastDirX : 1; const dirY = (player.lastDirY !== undefined) ? player.lastDirY : 0; const spawnX = player.x + dirX * (player.size + 12); const spawnY = player.y + dirY * (player.size + 12); const dmg = Math.max(1, Math.round(player.item.type.damage * power)); const atk = new Attack(player, spawnX, spawnY, 18, dmg, dirX, dirY); atk.vx *= (0.9 + power); atk.vy *= (0.9 + power); attacks.push(atk); player.item.usesLeft -= 1; if(player.item.usesLeft <= 0) player.item = null; return; }

    // no held item: quick tap or long press both attempt pickup
    // If player is already holding a merged weapon, they cannot pick up new items until it is fully used
    if(!(player.item instanceof HeldWeapon && player.item.isMerged)){
      for(const it of items){ if(!it.picked && rectsOverlap(it.rect(), player.rect())){ it.picked = true; // convert ground Item -> HeldWeapon wrapper
            player.item = new HeldWeapon(it.type, it.usesLeft || it.type.uses || 1); spawnRandomItem(); break; } }
    }
  }

  // game loop (simplified drawing update harness)
  let last = performance.now(); function step(){ const now=performance.now(); const dt = now - last; last = now; update(now, dt); draw(now); requestAnimationFrame(step); }
  const _lastSend = {};
  function update(now, dt){ players.forEach(p=>p.update(keys, obstacles)); for(const atk of attacks){ atk.update(); for(const p of players){ if(p===atk.owner) continue; if(!p.alive) continue; if(rectsOverlap(atk.rect(), p.rect())){ p.takeDamage(atk.damage, atk.owner); /* hit visual suppressed */ atk.ttl = 0; break; } } } for(let i=attacks.length-1;i>=0;i--) if(attacks[i].ttl<=0) attacks.splice(i,1); /* hitEffects removed */
    // drop held items when a player dies (previously used player1 comparison)
    for(const p of players){
      if(!p.alive && p.respawnAt === null){
        p.respawnAt = now + 5000;
        if(p.item){
          const typ = p.item.type;
          const uses_left = p.item.usesLeft || 0;
          // use lastDirX to determine drop offset instead of comparing to player1
          const dropped = new Item(p.x + (p.lastDirX >= 0 ? 20 : -20), p.y, typ);
          dropped.usesLeft = uses_left;
          items.push(dropped);
          p.item = null;
        }
      }
    }
    for(const p of players){ if(!p.alive && p.respawnAt !== null && now >= p.respawnAt){ p.alive = true; p.health = 10; const [rx,ry] = randomSpawnPosition(); p.x = rx; p.y = ry; p.respawnAt = null; if(typeof p.deaths === 'undefined') p.deaths = 0; try{ if(typeof addPopup === 'function') addPopup(`${p.name || 'Player'} respawned`, 1800); }catch(e){} } }
    // check for game end
    if(!gameOver && Date.now() >= gameEndTime){
      gameOver = true;
      finalRankings = computeFinalRankings();
      // show final popup
      try{ addPopup('Game over — showing results', 3000); }catch(e){}
    }
    // auto-respawn items
    if(items.filter(it=>!it.picked).length < Math.min(ITEM_TYPES.length, SPAWN_POSITIONS.length)){ if(Math.random() < 0.002){ for(let i=0;i<SPAWN_POSITIONS.length;i++){ const t = ITEM_TYPES[i % ITEM_TYPES.length]; const pos = SPAWN_POSITIONS[i]; const exists = items.some(it => !it.picked && Math.hypot(it.x-pos[0], it.y-pos[1]) < 6); if(!exists){ items.push(new Item(pos[0]+(Math.random()-0.5)*18, pos[1]+(Math.random()-0.5)*18, t)); break; } } } }

    // send local player position periodically to server if available
    try{
      const myId = (typeof window !== 'undefined' && window.__PLAYER_ID) ? window.__PLAYER_ID : null;
      if(myId && typeof window.__sendPlayerUpdate === 'function'){
        const nowTs = Date.now();
        // find the player instance matching myId
        for(const p of players){ if(p.id === myId){ const last = _lastSend[myId] || 0; if(nowTs - last > 100){ _lastSend[myId] = nowTs; try{ window.__sendPlayerUpdate(myId, p.x, p.y, null); }catch(e){} } break; } }
      }
    }catch(e){ }
  }

  function draw(now){ if(bgImage && bgImage.complete && bgImage.naturalWidth){ try{ ctx.drawImage(bgImage,0,0,WIDTH,HEIGHT); }catch(e){ ctx.fillStyle=BG; ctx.fillRect(0,0,WIDTH,HEIGHT); } } else { ctx.fillStyle = BG; ctx.fillRect(0,0,WIDTH,HEIGHT); }
    for(const obs of obstacles) obs.draw && obs.draw(ctx);
    for(const it of items) it.draw && it.draw(ctx);
    for(const p of players) p.draw && p.draw(ctx);
  for(const a of attacks) a.draw && a.draw(ctx);
    // HUD
    ctx.fillStyle='#333'; ctx.font='14px Arial'; ctx.fillText('P1: WASD + F | P2: Arrows + L', WIDTH/2 - 110, HEIGHT - 14);
    ctx.fillStyle='#000'; ctx.font='12px Arial'; ctx.fillText('Game running', 10, HEIGHT - 10);
    // draw timer (top-center)
    ctx.save(); ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#111';
    if(!gameOver){ ctx.fillText(formatTimeRemaining(), WIDTH/2, 36); } else { ctx.fillText('00:00', WIDTH/2, 36); }
    ctx.restore();
    // draw play area border
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4; ctx.strokeRect(PLAY_AREA.x - 2, PLAY_AREA.y - 2, PLAY_AREA.w + 4, PLAY_AREA.h + 4); ctx.restore();

    // draw scoreboard (top-right) with translucent blurred background
    drawScoreboard(ctx);

    // draw popups (top-left)
    drawPopups(ctx);
    // if game over, overlay final slide
    if(gameOver && finalRankings){ drawEndScreen(ctx, finalRankings); }
  }

  // start
  requestAnimationFrame(step);
})();
