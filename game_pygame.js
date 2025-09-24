// pickup_attack_game.js
// Pure JavaScript implementation (no HTML required).
// Drop this file into a page (or import it as a module) and it will create its own canvas element
// and run the game. Two players: WASD+F and Arrows+L.

(() => {
  console.log('game_pygame.js loaded');
  try {
  // ---- Constants ----
  const WIDTH = 800, HEIGHT = 480;
  const BG_COLOR = '#f5f5f5';

  // prefer an existing canvas in the page (#gameCanvas or #game); fall back to creating one
  let canvas = document.getElementById('gameCanvas') || document.getElementById('game');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    canvas.style.display = 'block';
    canvas.style.margin = '12px auto';
    canvas.style.border = '1px solid rgba(0,0,0,0.06)';
    canvas.style.background = BG_COLOR;
    document.body.appendChild(canvas);
  } else {
    // ensure canvas matches expected size
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
  }
  const ctx = canvas.getContext('2d');

  // ---- Utilities ----
  const nowMs = () => performance.now();
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rectsOverlap(a,b){ return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h); }
  function pointInPoly(point, poly){
    const x = point[0], y = point[1]; let inside = false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi+1e-9) + xi);
      if(intersect) inside = !inside; j = i;
    }
    return inside;
  }
  function ccw(a,b,c){ return (c[1]-a[1])*(b[0]-a[0]) > (b[1]-a[1])*(c[0]-a[0]); }
  function segmentsIntersect(p1,p2,p3,p4){
    return (ccw(p1,p3,p4) != ccw(p2,p3,p4)) && (ccw(p1,p2,p3) != ccw(p1,p2,p4));
  }
  function rectSegmentIntersect(rect,a,b){
    const segs = [
      [[rect.x,rect.y],[rect.x+rect.w,rect.y]],
      [[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h]],
      [[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]],
      [[rect.x,rect.y+rect.h],[rect.x,rect.y]]
    ];
    for(const s of segs) if(segmentsIntersect(a,b,s[0],s[1])) return true;
    return false;
  }
  function circleRectCollide(circle, rect){
    const closestX = clamp(circle.x, rect.x, rect.x+rect.w);
    const closestY = clamp(circle.y, rect.y, rect.y+rect.h);
    const dx = closestX - circle.x; const dy = closestY - circle.y;
    return dx*dx + dy*dy < circle.r*circle.r;
  }

  // ---- Items and spawn positions ----
  const ITEM_TYPES = [
    {name:'Stick',color:'#8d6e63',shape:'square',damage:1,uses:5},
    {name:'Dagger',color:'#9e9e9e',shape:'circle',damage:2,uses:5},
    {name:'Sword',color:'#90caf9',shape:'square',damage:3,uses:4},
    {name:'Axe',color:'#ef9a9a',shape:'circle',damage:4,uses:3},
    {name:'Spear',color:'#c5e1a5',shape:'square',damage:2,uses:6},
    {name:'Club',color:'#a1887f',shape:'square',damage:2,uses:5},
    {name:'Mace',color:'#ffcc80',shape:'circle',damage:3,uses:4},
    {name:'Wand',color:'#b39ddb',shape:'circle',damage:1,uses:8},
    {name:'Hammer',color:'#ffab91',shape:'square',damage:4,uses:2},
    {name:'Sickle',color:'#cfd8dc',shape:'circle',damage:2,uses:5},
    {name:'Greatsword',color:'#b0bec5',shape:'square',damage:5,uses:2},
  ];
  const SPAWN_POSITIONS = [[120,80],[220,140],[320,200],[420,260],[520,320],[620,120],[720,200],[180,360],[480,80],[560,420],[360,360]];

  // ---- Classes ----
  class Player{
    constructor(x,y,color,controls){ this.x=x; this.y=y; this.size=28; this.color=color; this.controls=controls; this.speed=3; this.item=null; this.health=10; this.alive=true; this.spawnX=x; this.spawnY=y; this.respawnAt=null; }
    rect(){ return {x: this.x - this.size/2, y: this.y - this.size/2, w: this.size, h: this.size}; }
    update(keys, obstacles){ if(!this.alive) return; const oldX=this.x, oldY=this.y; if(keys[this.controls.up]) this.y -= this.speed; if(keys[this.controls.down]) this.y += this.speed; if(keys[this.controls.left]) this.x -= this.speed; if(keys[this.controls.right]) this.x += this.speed; const half=this.size/2; this.x = clamp(this.x, half, WIDTH-half); this.y = clamp(this.y, half, HEIGHT-half); const r = this.rect(); for(const obs of obstacles){ if(obs.collidesRect(r)){ this.x = oldX; this.y = oldY; break; } } }
    draw(ctx){ if(!this.alive) return; ctx.fillStyle = this.color; const r = this.rect(); ctx.fillRect(r.x, r.y, r.w, r.h); if(this.item){ const itemColor = (this.item.type && this.item.type.color) || '#000'; ctx.fillStyle = itemColor; ctx.fillRect(this.x - 8, this.y - this.size/2 - 14, 16, 10); ctx.fillStyle = '#000'; ctx.font = '12px Arial'; const text = `${this.item.type.name} (${this.item.usesLeft})`; ctx.fillText(text, this.x - 28, this.y - this.size/2 - 36); } const barW=40, barH=6; const px=this.x-barW/2, py=this.y+this.size/2+6; ctx.strokeStyle='#000'; ctx.strokeRect(px,py,barW,barH); const remaining = Math.max(0, this.health/10); let col; if(remaining>0.5) col='#4caf50'; else if(remaining>0.2) col='#ff9800'; else col='#f44336'; ctx.fillStyle = col; ctx.fillRect(px,py,Math.floor(barW*remaining),barH); ctx.fillStyle='#000'; ctx.font='12px Arial'; ctx.fillText('HP: ' + this.health, px, py - 12); }
    takeDamage(amount){ if(!this.alive) return; this.health = Math.max(0, this.health - amount); if(this.health <= 0){ this.alive = false; } }
  }

  class Item{
    constructor(x,y,itemType){ this.x=x; this.y=y; this.size=14; this.picked=false; this.type=itemType; this.usesLeft = itemType.uses; }
    rect(){ return {x: this.x - this.size/2, y: this.y - this.size/2, w: this.size, h: this.size}; }
    draw(ctx){ if(this.picked) return; ctx.fillStyle = this.type.color; if(this.type.shape === 'square') ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size); else { ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.size/2, 0, Math.PI*2); ctx.fill(); } ctx.fillStyle = '#000'; ctx.fillRect(this.x - 2, this.y - 2, 4, 4); }
  }

  class HeldWeapon{ constructor(itemType, usesLeft){ this.type = itemType; this.usesLeft = usesLeft; } }

  class Attack{ constructor(owner,x,y,ttl,damage){ this.owner=owner; this.x=x; this.y=y; this.ttl=ttl; this.damage=damage; this.r=8; } rect(){ return {x:this.x-this.r, y:this.y-this.r, w:this.r*2, h:this.r*2}; } update(){ this.ttl -= 1; } draw(ctx){ ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI*2); ctx.fill(); } }

  class CircleObstacle{ constructor(x,y,r,color='#b4b4b4'){ this.x=x; this.y=y; this.r=r; this.color=color; } draw(ctx){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.r), 0, Math.PI*2); ctx.fill(); } collidesRect(rect){ return circleRectCollide(this, rect); } }
  class PolyObstacle{ constructor(points,color='#8c8c8c'){ this.points = points; this.color = color; } draw(ctx){ ctx.fillStyle=this.color; ctx.beginPath(); ctx.moveTo(this.points[0][0], this.points[0][1]); for(let i=1;i<this.points.length;i++) ctx.lineTo(this.points[i][0], this.points[i][1]); ctx.closePath(); ctx.fill(); } collidesRect(rect){ const corners = [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]]; for(const c of corners) if(pointInPoly(c, this.points)) return true; for(let i=0;i<this.points.length;i++){ const a=this.points[i], b=this.points[(i+1)%this.points.length]; if(rectSegmentIntersect(rect,a,b)) return true; } return false; } }

  // ---- Game state ----
  const items = [];
  for(let i=0;i<SPAWN_POSITIONS.length && i<ITEM_TYPES.length; i++){ const p = SPAWN_POSITIONS[i]; items.push(new Item(p[0], p[1], ITEM_TYPES[i])); }

  const obstacles = [];
  obstacles.push(new CircleObstacle(400, 120, 50, '#b4b4b4'));
  obstacles.push(new CircleObstacle(200, 240, 40, '#a0a0c8'));
  obstacles.push(new PolyObstacle([[500,50],[580,80],[560,140],[480,110]], '#96c890'));
  obstacles.push(new PolyObstacle([[120,300],[160,330],[140,380],[100,360]], '#cfa0a0'));

  const player1 = new Player(100,100,'#2196f3', {up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', use:'KeyF'});
  const player2 = new Player(700,380,'#e91e63', {up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', use:'KeyL'});

  let attacks = [];
  let keys = {};

  // ---- Input ----
  window.addEventListener('keydown', (e)=>{ keys[e.code] = true; if(e.code === player1.controls.use) handleUse(player1); if(e.code === player2.controls.use) handleUse(player2); });
  window.addEventListener('keyup', (e)=>{ keys[e.code] = false; });

  function handleUse(player){ if(!player.alive) return; if(player.item && player.item instanceof Item){ let combined = false; for(const it of items){ if(!it.picked && rectsOverlap(it.rect(), player.rect())){ const first = player.item.type; const second = it.type; const combinedType = { name: `${first.name}_${second.name}`, color: first.color, shape: first.shape, damage: first.damage + second.damage, uses: first.uses }; it.picked = true; const usesLeft = player.item.usesLeft; player.item = new HeldWeapon(combinedType, usesLeft); combined = true; break; } } if(!combined){ const dir = (player === player1) ? 1 : -1; attacks.push(new Attack(player, player.x + dir*player.size, player.y, 8, player.item.type.damage)); player.item.usesLeft -= 1; if(player.item.usesLeft <= 0) player.item = null; } } else if(player.item && player.item instanceof HeldWeapon){ const dir = (player === player1) ? 1 : -1; attacks.push(new Attack(player, player.x + dir*player.size, player.y, 8, player.item.type.damage)); player.item.usesLeft -= 1; if(player.item.usesLeft <= 0) player.item = null; } else { for(const it of items){ if(!it.picked && rectsOverlap(it.rect(), player.rect())){ it.picked = true; player.item = it; break; } } } }

  // ---- Main loop ----
  let last = nowMs();
  function step(){ const cur = nowMs(); const dt = cur - last; last = cur; update(cur); draw(); requestAnimationFrame(step); }

  function update(now){ player1.update(keys, obstacles); player2.update(keys, obstacles); for(const a of attacks){ a.update(); const target = (a.owner === player1) ? player2 : player1; if(target.alive){ if(rectsOverlap(a.rect(), target.rect())){ const dmg = a.damage || 1; target.takeDamage(dmg); a.ttl = 0; } } } attacks = attacks.filter(a => a.ttl > 0); for(const p of [player1, player2]){ if(!p.alive && p.respawnAt === null){ p.respawnAt = now + 5000; if(p.item){ const typ = p.item.type; const uses_left = p.item.usesLeft || 0; const dropped = new Item(p.x + (p===player1?20:-20), p.y, typ); dropped.usesLeft = uses_left; items.push(dropped); p.item = null; } } } for(const p of [player1, player2]){ if(!p.alive && p.respawnAt !== null && now >= p.respawnAt){ p.alive = true; p.health = 10; p.x = p.spawnX; p.y = p.spawnY; p.respawnAt = null; } } }

  function draw(){
    // clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0,0,WIDTH,HEIGHT);

    // draw obstacles, items, players, attacks
    for(const obs of obstacles) obs.draw(ctx);
    for(const it of items) it.draw(ctx);
    player1.draw(ctx);
    player2.draw(ctx);
    for(const a of attacks) a.draw(ctx);

    // draw death messages on the left (stacked)
    ctx.fillStyle = '#000';
    ctx.font = '14px Arial';
    let msgX = 10;
    let msgY = 20;
    if(!player1.alive){ ctx.fillText('Player 1 is dead (spectator)', msgX, msgY); msgY += 20; }
    if(!player2.alive){ ctx.fillText('Player 2 is dead (spectator)', msgX, msgY); msgY += 20; }

    // draw scoreboard on the right (fixed position)
    const sb_x = WIDTH - 200, sb_y = 10, sb_w = 190, sb_h = 64;
    ctx.fillStyle = '#dedede'; ctx.fillRect(sb_x, sb_y, sb_w, sb_h);
    ctx.strokeStyle = '#000'; ctx.strokeRect(sb_x, sb_y, sb_w, sb_h);

    let p1_text = `Player 1: HP ${player1.alive ? player1.health : 0}`;
    if(!player1.alive && player1.respawnAt !== null){ const remaining_ms = Math.max(0, player1.respawnAt - nowMs()); p1_text += ` (respawn ${Math.floor(remaining_ms/1000)+1}s)`; }
    let p2_text = `Player 2: HP ${player2.alive ? player2.health : 0}`;
    if(!player2.alive && player2.respawnAt !== null){ const remaining_ms = Math.max(0, player2.respawnAt - nowMs()); p2_text += ` (respawn ${Math.floor(remaining_ms/1000)+1}s)`; }

    ctx.fillStyle = '#000'; ctx.font = '12px Arial';
    ctx.fillText(p1_text, sb_x + 8, sb_y + 22);
    ctx.fillText(p2_text, sb_x + 8, sb_y + 44);
  }

  // start the loop
  last = nowMs(); requestAnimationFrame(step);
  } catch (err) {
    console.error('Uncaught error in game_pygame.js IIFE:', err);
  }
})();
