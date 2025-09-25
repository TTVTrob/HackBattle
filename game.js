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
  // merged images (alphabetical keys, deduplicated)
  'glass+vines': './Images/glass+vines.png',
  'ice+mud': './Images/ice+mud.png',
  'iron+vines': './Images/iron+vines.png',
  'magma+mud': './Images/mud+magma.png',
  'magma+stone': './Images/stone+magma.png',
  'mud+vine': './Images/vine+mud.png',
  'mud+vines': './Images/vines+mud.png',
  'stone+vine': './Images/vine+stone.png',
  'stone+vines': './Images/vines+stone.png',
  'spark+vines': './Images/spark+vines.png',
  'glass+wood': './Images/wood+glass.png',
  'ice+wood': './Images/wood+ice.png',
  'magma+wood': './Images/wood+magma.png',
  'mud+wood': './Images/wood+mud.png',
  'spark+wood': './Images/wood+spark.png',
  'vine+wood': './Images/wood+vine.png',
  'vines+wood': './Images/wood+vines.png'
  };
  const IMAGES = {};
  // preload images and register both the literal key and the alphabetical (sorted) key
  for(const rawKey of Object.keys(IMAGE_FILES)){
    const src = IMAGE_FILES[rawKey];
    const img = new Image();
    img.src = src;
    // when any image finishes loading, request a redraw so held items update
    img.onload = () => { try{ requestAnimationFrame(()=>{}); }catch(e){} };
    const k = rawKey.toString().toLowerCase();
    IMAGES[k] = img;
    if(k.indexOf('+') !== -1){
      const parts = k.split('+').map(s=>s.trim());
      const sorted = parts.slice().sort().join('+');
      IMAGES[sorted] = img;
    }
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
  class Attack{ constructor(owner,x,y,ttl,damage,dirX=1,dirY=0){ this.owner=owner; this.x=x; this.y=y; this.ttl=ttl; this.damage=damage; this.r=12; const base = randRange(0.9,1.6); this.vx=dirX*base + randRange(-0.15,0.15); this.vy=dirY*base + randRange(-0.15,0.15); } rect(){ return {x:this.x-this.r,y:this.y-this.r,w:this.r*2,h:this.r*2}; } update(){ this.ttl -= 1; this.x += this.vx * 6; this.y += this.vy * 6; } draw(ctx){ ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r,0,Math.PI*2); ctx.fill(); } }
  class HitEffect{ constructor(x,y){ this.x=x; this.y=y; this.ttl=12; this.r=9; } update(){ this.ttl -= 1; this.r += 1; } draw(ctx){ const a = Math.max(0, this.ttl/12); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), this.r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); } }
  class Player{ constructor(x,y,color,controls,name){ this.x=x; this.y=y; this.color=color; this.controls=controls; this.size=42; this.speed=4.8; this.health=10; this.alive=true; this.spawnX=x; this.spawnY=y; this.respawnAt=null; this.item=null; this.name=name||'P'; this.kills=0; this.hitAt=0; this.lastDirX=1; this.lastDirY=0; this.charging=false; this.chargeStart=0; this.facing='right'; } rect(){ return {x:this.x - this.size/2, y:this.y - this.size/2, w:this.size, h:this.size}; }
    update(keys, obstacles){ if(!this.alive) return; const oldX=this.x, oldY=this.y; if(keys[this.controls.up]) this.y -= this.speed; if(keys[this.controls.down]) this.y += this.speed; if(keys[this.controls.left]) this.x -= this.speed; if(keys[this.controls.right]) this.x += this.speed; const half = this.size/2; this.x = clamp(this.x, half, WIDTH-half); this.y = clamp(this.y, half, HEIGHT-half); const r = this.rect(); for(const obs of obstacles){ if(obs.collidesRect && obs.collidesRect(r)){ this.x = oldX; this.y = oldY; break; } } const dx = this.x - oldX, dy = this.y - oldY; const mag = Math.hypot(dx,dy); if(mag > 0.001){ this.lastDirX = dx/mag; this.lastDirY = dy/mag; if(Math.abs(dx) > Math.abs(dy)){ this.facing = dx > 0 ? 'right' : 'left'; } else { this.facing = dy > 0 ? 'down' : 'up'; } } }
    draw(ctx){ if(!this.alive) return; const now = performance.now(); const hitDur = 300; const since = now - this.hitAt; if(since < hitDur){ ctx.save(); const a = 0.6 * (1 - since / hitDur); ctx.globalAlpha = a; ctx.fillStyle = '#ff4444'; const r = this.rect(); ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); ctx.restore(); } ctx.fillStyle = this.color; const r2 = this.rect(); ctx.fillRect(r2.x, r2.y, r2.w, r2.h);
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
  const [p1x,p1y] = [150,150]; const player1 = new Player(p1x,p1y,'#2196f3',{up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',use:'KeyF'},'P1'); player1.lastDirX=1; player1.lastDirY=0;
  const [p2x,p2y] = [1050,570]; const player2 = new Player(p2x,p2y,'#e91e63',{up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',use:'KeyL'},'P2'); player2.lastDirX=-1; player2.lastDirY=0;
  const players = [player1, player2];
  let attacks = []; let hitEffects = []; let keys = {}; let lastKey=null, lastKeyAt=0;

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
    // try normalized mergedKey, swapped order, and the combinedType.name (lowercased)
    const tryKeys = [mergedKey, `${secondName}+${firstName}`, (combinedName || '').toString().toLowerCase()];
    for(const tk of tryKeys){
      if(!tk) continue;
      const nk = tk.toString().toLowerCase();
      // also try alphabetical normalized form
      const alph = nk.indexOf('+') !== -1 ? nk.split('+').map(s=>s.trim()).sort().join('+') : nk;
      if(IMAGES[nk]){ combinedType.imageKey = nk; break; }
      if(IMAGES[alph]){ combinedType.imageKey = alph; break; }
    }
    if(combinedType.imageKey){
      const img = IMAGES[combinedType.imageKey];
      console.log('Merged imageKey set ->', combinedType.imageKey, 'loaded:', !!(img && img.complete && img.naturalWidth));
    } else {
      console.log('Merged imageKey NOT found for', firstName, secondName, 'combinedName=', combinedName);
    }

  // set held weapon to combined type; mark as merged; do NOT spawn a new world item
  player.item = new HeldWeapon(combinedType, combinedUses, true);
        return true;
      }
    }
    return false;
  }

  // Input: charge on keydown, release does either merge/pickup (quick tap) or fire (long press)
  window.addEventListener('keydown',(e)=>{ if(!e||!e.code) return; const gameplay = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyF','KeyL']; if(gameplay.indexOf(e.code)!==-1) e.preventDefault(); keys[e.code]=true; lastKey=e.code; lastKeyAt=performance.now(); if(e.code === player1.controls.use && !player1.charging){ player1.charging = true; player1.chargeStart = performance.now(); } if(e.code === player2.controls.use && !player2.charging){ player2.charging = true; player2.chargeStart = performance.now(); } });
  window.addEventListener('keyup',(e)=>{ if(!e||!e.code) return; keys[e.code]=false; if(e.code === player1.controls.use && player1.charging){ player1.charging = false; releaseUse(player1); } if(e.code === player2.controls.use && player2.charging){ player2.charging = false; releaseUse(player2); } });

  function releaseUse(player){ if(!player.alive) return; const now = performance.now(); const charge = Math.min(1500, Math.max(0, now - player.chargeStart || 0)); // quick tap threshold (ms)
    const quickTap = charge < 220;
    if(player.item){ // if quick tap and overlapping a ground item, try merge instead of firing
      if(quickTap){ const merged = tryMergeWithNearby(player); if(merged) return; }
      // otherwise fire with scaled damage
      const power = 0.5 + (charge / 1500) * 1.5; const dirX = (player.lastDirX !== undefined) ? player.lastDirX : (player === player1 ? 1 : -1); const dirY = (player.lastDirY !== undefined) ? player.lastDirY : 0; const spawnX = player.x + dirX * (player.size + 12); const spawnY = player.y + dirY * (player.size + 12); const dmg = Math.max(1, Math.round(player.item.type.damage * power)); const atk = new Attack(player, spawnX, spawnY, 18, dmg, dirX, dirY); atk.vx *= (0.9 + power); atk.vy *= (0.9 + power); attacks.push(atk); player.item.usesLeft -= 1; if(player.item.usesLeft <= 0) player.item = null; return; }

    // no held item: quick tap or long press both attempt pickup
    // If player is already holding a merged weapon, they cannot pick up new items until it is fully used
    if(!(player.item instanceof HeldWeapon && player.item.isMerged)){
      for(const it of items){ if(!it.picked && rectsOverlap(it.rect(), player.rect())){ it.picked = true; // convert ground Item -> HeldWeapon wrapper
            player.item = new HeldWeapon(it.type, it.usesLeft || it.type.uses || 1); spawnRandomItem(); break; } }
    }
  }

  // game loop (simplified drawing update harness)
  let last = performance.now(); function step(){ const now=performance.now(); const dt = now - last; last = now; update(now, dt); draw(now); requestAnimationFrame(step); }
  function update(now, dt){ players.forEach(p=>p.update(keys, obstacles)); for(const atk of attacks){ atk.update(); for(const p of players){ if(p===atk.owner) continue; if(!p.alive) continue; if(rectsOverlap(atk.rect(), p.rect())){ p.takeDamage(atk.damage, atk.owner); /* hit visual suppressed */ atk.ttl = 0; break; } } } for(let i=attacks.length-1;i>=0;i--) if(attacks[i].ttl<=0) attacks.splice(i,1); /* hitEffects removed */ for(const p of players){ if(!p.alive && p.respawnAt === null){ p.respawnAt = now + 5000; if(p.item){ const typ = p.item.type; const uses_left = p.item.usesLeft || 0; const dropped = new Item(p.x + (p===player1 ? 20 : -20), p.y, typ); dropped.usesLeft = uses_left; items.push(dropped); p.item = null; } } } for(const p of players){ if(!p.alive && p.respawnAt !== null && now >= p.respawnAt){ p.alive = true; p.health = 10; const [rx,ry] = randomSpawnPosition(); p.x = rx; p.y = ry; p.respawnAt = null; } }
    // auto-respawn items
    if(items.filter(it=>!it.picked).length < Math.min(ITEM_TYPES.length, SPAWN_POSITIONS.length)){ if(Math.random() < 0.002){ for(let i=0;i<SPAWN_POSITIONS.length;i++){ const t = ITEM_TYPES[i % ITEM_TYPES.length]; const pos = SPAWN_POSITIONS[i]; const exists = items.some(it => !it.picked && Math.hypot(it.x-pos[0], it.y-pos[1]) < 6); if(!exists){ items.push(new Item(pos[0]+(Math.random()-0.5)*18, pos[1]+(Math.random()-0.5)*18, t)); break; } } } }
  }

  function draw(now){ if(bgImage && bgImage.complete && bgImage.naturalWidth){ try{ ctx.drawImage(bgImage,0,0,WIDTH,HEIGHT); }catch(e){ ctx.fillStyle=BG; ctx.fillRect(0,0,WIDTH,HEIGHT); } } else { ctx.fillStyle = BG; ctx.fillRect(0,0,WIDTH,HEIGHT); }
    for(const obs of obstacles) obs.draw && obs.draw(ctx);
    for(const it of items) it.draw && it.draw(ctx);
    for(const p of players) p.draw && p.draw(ctx);
  for(const a of attacks) a.draw && a.draw(ctx);
    // HUD
    ctx.fillStyle='#333'; ctx.font='14px Arial'; ctx.fillText('P1: WASD + F | P2: Arrows + L', WIDTH/2 - 110, HEIGHT - 14);
    ctx.fillStyle='#000'; ctx.font='12px Arial'; ctx.fillText('Game running', 10, HEIGHT - 10);
  }

  // start
  requestAnimationFrame(step);
})();
