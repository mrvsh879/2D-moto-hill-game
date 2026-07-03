const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const metersEl = document.getElementById('meters');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const msg = document.getElementById('message');
const restartBtn = document.getElementById('restart');

const DPR = Math.min(2, window.devicePixelRatio || 1);
let W=0,H=0;
function resize(){ W=innerWidth; H=innerHeight; canvas.width=W*DPR; canvas.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize',resize); resize();

const keys = Object.create(null);
addEventListener('keydown', e=>{ keys[e.code]=true; if(e.code==='KeyR') reset(); });
addEventListener('keyup', e=> keys[e.code]=false);
document.querySelectorAll('[data-key]').forEach(b=>{
  const code=b.dataset.key;
  const on=e=>{e.preventDefault(); keys[code]=true;};
  const off=e=>{e.preventDefault(); keys[code]=false;};
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',off);
});
restartBtn.onclick=()=>reset();

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function dot(ax,ay,bx,by){return ax*bx+ay*by;}

// Handmade long track: smooth hills, valleys, jumps, and safer landings.
const pts=[];
function add(x,y){pts.push({x,y});}
add(0,380); add(180,360); add(360,405); add(520,455); add(700,470); add(900,430); add(1120,370); add(1380,350); add(1600,365); add(1880,430); add(2160,475); add(2400,450); add(2550,340); add(2730,480); add(3000,455); add(3300,420); add(3600,385); add(3750,510); add(3920,360); add(4240,330); add(4550,315); add(4800,360); add(5080,420); add(5350,400); add(5650,325); add(5920,360); add(6200,430); add(6500,395); add(6800,350); add(7040,440); add(7320,470); add(7600,390); add(7950,330); add(8300,355); add(8580,455); add(8900,435); add(9200,360); add(9550,300); add(9850,340); add(10200,420);
function smoothstep(t){return t*t*(3-2*t)}
function segAt(x){
  if(x<=pts[0].x) return [pts[0],pts[1],0];
  for(let i=0;i<pts.length-1;i++) if(x<=pts[i+1].x){ const a=pts[i],b=pts[i+1]; return [a,b,(x-a.x)/(b.x-a.x)]; }
  const a=pts[pts.length-2], b=pts[pts.length-1]; return [a,b,1];
}
function groundY(x){ const [a,b,t]=segAt(x); return lerp(a.y,b.y,smoothstep(clamp(t,0,1))); }
function groundSlope(x){ return (groundY(x+6)-groundY(x-6))/12; }
function groundNormal(x){ const s=groundSlope(x); const l=Math.hypot(-s,1); return {x:-s/l,y:1/l}; }
function tangent(x){ const s=groundSlope(x); const l=Math.hypot(1,s); return {x:1/l,y:s/l}; }

let bike, camX=0, startTime=0, best=Number(localStorage.motoRidgeBest||0), crashed=false;
bestEl.textContent = best?`best ${Math.floor(best)} м`:'';
function reset(){
  const x=110, y=groundY(110)-54;
  bike={x,y,vx:0,vy:0,a:0,av:0, wheelSpin:0, dust:[], sparks:[], driverHit:0};
  camX=0; startTime=performance.now(); crashed=false; msg.classList.add('hidden');
}
reset();

function physics(dt){
  const throttle = keys.ArrowRight?1:0;
  const brake = keys.ArrowLeft?1:0;
  const lean = (keys.KeyD?1:0) - (keys.KeyA?1:0);
  const wheelBase=72, r=18;
  const ca=Math.cos(bike.a), sa=Math.sin(bike.a);
  const fx=bike.x+ca*wheelBase/2, fy=bike.y+sa*wheelBase/2;
  const rx=bike.x-ca*wheelBase/2, ry=bike.y-sa*wheelBase/2;
  let contacts=[];
  for(const w of [{x:fx,y:fy,front:true},{x:rx,y:ry,front:false}]){
    const gy=groundY(w.x), pen=w.y+r-gy;
    if(pen>0){
      const n=groundNormal(w.x), t=tangent(w.x);
      const wx=w.x-bike.x, wy=w.y-bike.y;
      const pvx=bike.vx - bike.av*wy, pvy=bike.vy + bike.av*wx;
      const vn=dot(pvx,pvy,n.x,n.y), vt=dot(pvx,pvy,t.x,t.y);
      // soft suspension + damping, stable rather than explosive
      const spring = pen*44 + Math.max(0,vn)*-11;
      let drive = 0;
      if(!w.front) drive += throttle*640;
      drive -= brake*360*Math.sign(vt||1);
      const grip = clamp(-vt*9 + drive, -620, 620);
      const ix=n.x*spring + t.x*grip;
      const iy=n.y*spring + t.y*grip;
      bike.vx += ix*dt; bike.vy += iy*dt;
      bike.av += (wx*iy - wy*ix)*dt/1800;
      bike.x += n.x*pen*.42; bike.y += n.y*pen*.42;
      contacts.push(w);
      if(throttle && !w.front && Math.abs(vt)>20 && Math.random()<.65) bike.dust.push({x:w.x,y:gy,life:1,vx:-40-Math.random()*55,vy:-20-Math.random()*20});
    }
  }
  bike.vy += 910*dt;
  bike.vx *= Math.pow(.996,dt*60);
  bike.av *= Math.pow(.986,dt*60);
  bike.av += lean*3.25*dt;
  if(contacts.length){
    const target=Math.atan(groundSlope(bike.x));
    // mild auto alignment keeps controls pleasant but still skill based
    let diff=((target-bike.a+Math.PI)%(Math.PI*2))-Math.PI;
    bike.av += diff*.9*dt;
  }
  bike.x += bike.vx*dt; bike.y += bike.vy*dt; bike.a += bike.av*dt;
  bike.a = ((bike.a+Math.PI)%(Math.PI*2))-Math.PI;
  bike.wheelSpin += (bike.vx*dt*.08 + throttle*dt*8);
  // crash only when rider/head/body hits terrain hard or upside down for a moment
  const headX=bike.x - Math.sin(bike.a)*52, headY=bike.y - Math.cos(bike.a)*52;
  const bodyX=bike.x - Math.sin(bike.a)*28, bodyY=bike.y - Math.cos(bike.a)*28;
  const hit = headY>groundY(headX)-4 || bodyY>groundY(bodyX)-2 || Math.cos(bike.a)<-.55;
  bike.driverHit = hit ? bike.driverHit + dt : Math.max(0,bike.driverHit-dt*2);
  if(!crashed && bike.driverHit>.22){ crashed=true; msg.classList.remove('hidden'); bike.vx*=.2; bike.vy*=.2; bike.av*=.2; }
  bike.dust.forEach(p=>{p.life-=dt*1.6;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=70*dt}); bike.dust=bike.dust.filter(p=>p.life>0);
  if(bike.y>1200) reset();
  const dist=Math.max(0,bike.x/10); if(dist>best){best=dist; localStorage.motoRidgeBest=best; bestEl.textContent=`best ${Math.floor(best)} м`;}
}

function drawWheel(x,y,r,spin){
  ctx.save(); ctx.translate(x,y); ctx.rotate(spin); ctx.lineWidth=3; ctx.strokeStyle='#101820'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke(); ctx.lineWidth=1.5; for(let i=0;i<8;i++){ctx.rotate(Math.PI/4); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r-2,0); ctx.stroke();} ctx.restore();
}
function drawBike(){
  const wheelBase=72,r=18, ca=Math.cos(bike.a), sa=Math.sin(bike.a);
  const fx=bike.x+ca*wheelBase/2, fy=bike.y+sa*wheelBase/2, rx=bike.x-ca*wheelBase/2, ry=bike.y-sa*wheelBase/2;
  ctx.lineCap='round';
  drawWheel(rx,ry,r,bike.wheelSpin); drawWheel(fx,fy,r,bike.wheelSpin*1.12);
  ctx.strokeStyle='#1d2630'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(bike.x,bike.y-18); ctx.lineTo(fx,fy); ctx.lineTo(bike.x+8*ca-20*sa,bike.y+8*sa+20*ca); ctx.lineTo(rx,ry); ctx.stroke();
  ctx.strokeStyle='#e32626'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(bike.x-20*ca,bike.y-20*sa); ctx.lineTo(bike.x+24*ca,bike.y+24*sa); ctx.stroke();
  ctx.strokeStyle='#222'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx+20*ca-22*sa,fy+20*sa+22*ca); ctx.moveTo(fx+20*ca-22*sa,fy+20*sa+22*ca); ctx.lineTo(fx+31*ca-34*sa,fy+31*sa+34*ca); ctx.stroke();
  const sx=bike.x-6*sa, sy=bike.y-24*ca;
  ctx.fillStyle='#f4bc32'; ctx.beginPath(); ctx.arc(sx,sy-17,8,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#2878c8'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(sx,sy-7); ctx.lineTo(bike.x+2*ca-34*sa,bike.y+2*sa-34*ca); ctx.stroke();
  ctx.strokeStyle='#333'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(bike.x-20*ca,bike.y-20*sa); ctx.moveTo(sx,sy); ctx.lineTo(fx+23*ca-22*sa,fy+23*sa+22*ca); ctx.stroke();
}
function draw(){
  ctx.clearRect(0,0,W,H);
  camX=lerp(camX,bike.x-W*.36,.06); const camY=lerp(H*.54-groundY(bike.x),H*.18,.08);
  ctx.save(); ctx.translate(-camX,camY);
  // sky details
  ctx.fillStyle='rgba(255,255,255,.75)'; for(let i=0;i<8;i++){let x=(i*900+200)%10500; ctx.beginPath(); ctx.ellipse(x,110+30*(i%3),70,22,0,0,Math.PI*2); ctx.fill();}
  // terrain fill
  ctx.beginPath(); ctx.moveTo(camX-200,900); for(let x=Math.floor((camX-250)/20)*20; x<camX+W+280; x+=20) ctx.lineTo(x,groundY(x)); ctx.lineTo(camX+W+300,900); ctx.closePath(); ctx.fillStyle='#d6f4ca'; ctx.fill();
  // green upper/lower rails like original but polished
  ctx.strokeStyle='#00a91f'; ctx.lineWidth=3; ctx.beginPath(); for(let x=Math.floor((camX-250)/18)*18; x<camX+W+280; x+=18){const y=groundY(x); if(x===Math.floor((camX-250)/18)*18)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke();
  ctx.strokeStyle='#00b529'; ctx.lineWidth=2; ctx.beginPath(); for(let x=Math.floor((camX-250)/50)*50; x<camX+W+280; x+=50){const y=groundY(x)+42; if(x===Math.floor((camX-250)/50)*50)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke();
  for(let x=0;x<10300;x+=240){ctx.strokeStyle='rgba(0,170,35,.8)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,groundY(x)); ctx.lineTo(x+95,groundY(x+95)+42); ctx.stroke();}
  // distance signs
  for(let x=500;x<10300;x+=1000){ctx.fillStyle='rgba(19,32,42,.55)'; ctx.font='18px Arial'; ctx.fillText(`${Math.floor(x/10)} м`,x,groundY(x)-35);}
  bike.dust.forEach(p=>{ctx.globalAlpha=p.life*.35; ctx.fillStyle='#8c744e'; ctx.beginPath(); ctx.arc(p.x,p.y,8*(1-p.life+0.3),0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;});
  drawBike();
  ctx.restore();
  const t=performance.now()-startTime; const sec=Math.floor(t/1000), ms=Math.floor((t%1000)/10); timeEl.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}.${String(ms).padStart(2,'0')}`;
  metersEl.textContent=`${Math.floor(Math.max(0,bike.x/10))} м`;
}
let last=performance.now();
function loop(now){ let dt=Math.min(.033,(now-last)/1000); last=now; if(!crashed){ for(let i=0;i<3;i++) physics(dt/3); } draw(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
