/* Pure spider model (no DOM): 8 legs x 3 bones, tetrapod wave gait, eyes that track a point. */
(function (root) {
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), ease=t=>t*t*(3-2*t), wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const HIP =[[12,6],[4,6],[-4,6],[-12,6]];
const REST=[[80,98],[38,115],[-22,115],[-76,96]];
const LENS=[44,56,50], TOTAL=150;
const grp=n=>((n%4)+(n>=4?1:0))%2;

function solveChain(J,hip,tx,ty,cx,cy,s,iters=8){
  const lens=LENS.map(v=>v*s), total=TOTAL*s;
  const dx=tx-hip.x, dy=ty-hip.y, d=Math.hypot(dx,dy)||1e-6;
  const clamped=d>total-0.01, m=clamped?(total-0.01)/d:1, gx=hip.x+dx*m, gy=hip.y+dy*m;
  for(let it=0;it<iters;it++){
    J[3].x=gx;J[3].y=gy;
    for(let i=2;i>=0;i--){const a=J[i+1],b=J[i],ux=b.x-a.x,uy=b.y-a.y,q=Math.hypot(ux,uy)||1e-6;b.x=a.x+ux/q*lens[i];b.y=a.y+uy/q*lens[i];}
    J[0].x=hip.x;J[0].y=hip.y;
    for(let i=0;i<3;i++){const a=J[i],b=J[i+1],ux=b.x-a.x,uy=b.y-a.y,q=Math.hypot(ux,uy)||1e-6;b.x=a.x+ux/q*lens[i];b.y=a.y+uy/q*lens[i];}
  }
  return clamped;
}

class Spider{
  constructor(x,y,s=1,rng=Math.random){
    Object.assign(this,{x,y,s,rng,stopDist:10,vx:0,vy:0,speed:0,ang:-Math.PI/2,gz:-Math.PI/2,gzv:0,time:0,ph:0,thr:28,maxSpeed:520,stepTime:0.06,
      landed:[],lifted:[],reachLeg:-1,reachDone:false,_rk:''});
    this.legs=[];
    for(const side of [-1,1]) for(let i=0;i<4;i++){
      const l={
        side, hip:[HIP[i][0],HIP[i][1]*side], rest:[REST[i][0],REST[i][1]*side],
        stepping:false, emerg:false, t:0, sx:0, sy:0, tx:0, ty:0, clamped:false,
        stepDur: 1.0,
        liftScale: 1.0,
        swingStarted: false,
        preDelay: 0, preT: 0,
        baseFX: 0, baseFY: 0,
        tremorSeed: rng()*1000
      };
      const h=this.toWorld(l.hip), f=this.toWorld(l.rest); l.fx=f.x; l.fy=f.y; l.baseFX=f.x; l.baseFY=f.y;
      l.j=[0,1,2,3].map(k=>{const t=k/3,b=Math.sin(Math.PI*t)*28*s,ox=Math.sign(h.x-x)||1;return{x:h.x+(f.x-h.x)*t+ox*b*0.5,y:h.y+(f.y-h.y)*t+side*b};});
      this.legs.push(l);
    }
    this.update(0,x,y);
  }
  toWorld([lx,ly],k=1){const c=Math.cos(this.ang),s=Math.sin(this.ang);return{x:this.x+(lx*c-ly*s)*this.s*k,y:this.y+(lx*s+ly*c)*this.s*k};}
  neighbors(n){const i=n%4,r=[(n+4)%8]; if(i>0)r.push(n-1); if(i<3)r.push(n+1); return r;}
  eye(side){return this.toWorld([14,5*side]);}

  // Translate the entire spider (body + every leg + every joint) by (dX, dY) in viewport pixels.
  // Used when the page scrolls so the spider stays anchored to the document, not the viewport.
  shift(dX, dY){
    this.x += dX; this.y += dY;
    for(const l of this.legs){
      l.fx += dX; l.fy += dY;
      l.baseFX += dX; l.baseFY += dY;
      l.sx += dX; l.sy += dY;
      l.tx += dX; l.ty += dY;
      for(const j of l.j){ j.x += dX; j.y += dY; }
    }
  }

  update(dt,tx,ty,gx=tx,gy=ty,reach=null){
    this.time+=dt; this.landed.length=0; this.lifted.length=0;
    const s=this.s, L=this.legs;

    // --- body: accel-limited; approach speed tapers near the target. ---
    this.ph+=dt*Math.PI/this.stepTime;
    const dx=tx-this.x, dy=ty-this.y, d=Math.hypot(dx,dy);
    const stopDist=this.stopDist*s, slowR=150*s;
    const slowF = d < slowR ? clamp((d - stopDist) / (slowR - stopDist), 0, 1) : 1;
    const top=this.maxSpeed*(d>320*s?1.3:1)*(1+0.15*Math.sin(this.ph));
    const want = d > stopDist ? Math.min(top * slowF, d*3) : 0;
    let ax=(d?dx/d*want:0)-this.vx, ay=(d?dy/d*want:0)-this.vy;
    const am=Math.hypot(ax,ay), lim=1800*s*dt; if(am>lim){ax*=lim/am;ay*=lim/am;}
    this.vx+=ax; this.vy+=ay; this.x+=this.vx*dt; this.y+=this.vy*dt;
    const sp=Math.hypot(this.vx,this.vy); this.speed=sp;

    this.stepTime=0.065-0.03*Math.min(1,sp/(480*s));

    const gd=Math.hypot(gx-this.x,gy-this.y);
    if(sp>12*s) this.ang+=clamp(wrap(Math.atan2(this.vy,this.vx)-this.ang),-18*dt,18*dt);
    else if(gd>30*s) this.ang+=clamp(wrap(Math.atan2(gy-this.y,gx-this.x)-this.ang),-5*dt,5*dt);
    this.ang=wrap(this.ang);
    if(gd>1) this.gzv+=(wrap(Math.atan2(gy-this.y,gx-this.x)-this.gz)*220-this.gzv*18)*dt;
    this.gz=wrap(this.gz+this.gzv*dt);

    const br=1+0.02*Math.sin(this.time*2.2);
    const idle = sp < 20*s;

    for(let n=0;n<L.length;n++){
      const l=L[n];
      l.hipW=this.toWorld(l.hip);
      const r=this.toWorld(l.rest,br);
      l.ideal={x:r.x+this.vx*this.stepTime*1.25,y:r.y+this.vy*this.stepTime*1.25};

      if(!l.stepping && idle){
        const tr=Math.sin(this.time*7 + l.tremorSeed) * Math.cos(this.time*3.3 + l.tremorSeed*0.7);
        l.fx=l.baseFX + tr * 0.5 * s;
        l.fy=l.baseFY + Math.cos(this.time*5.5 + l.tremorSeed*1.1) * 0.5 * s;
      }

      if(l.stepping){
        l.preT += dt;
        if(l.preT < l.preDelay){
          l.fx=l.sx; l.fy=l.sy;
        } else {
          if(!l.swingStarted){ this.lifted.push({n}); l.swingStarted=true; }
          l.t += dt / (this.stepTime * l.stepDur);
          if(l.t>=1){
            l.t=1; l.stepping=false; l.emerg=false; l.swingStarted=false;
            l.preT=0; l.preDelay=0;
            l.fx=l.tx; l.fy=l.ty;
            l.baseFX=l.tx; l.baseFY=l.ty;
            this.landed.push({x:l.fx,y:l.fy,n});
          } else {
            const e=ease(l.t);
            const hx=l.hipW.x-this.x, hy=l.hipW.y-this.y, hl=Math.hypot(hx,hy)||1;
            const lift = Math.sin(Math.PI*l.t) * 8 * s * l.liftScale;
            const antic = l.t < 0.15 ? -Math.sin(l.t/0.15*Math.PI) * 3 * s : 0;
            l.fx = l.sx + (l.tx-l.sx)*e + hx/hl*(lift + antic);
            l.fy = l.sy + (l.ty-l.sy)*e + hy/hl*(lift + antic);
          }
        }
      }
    }

    if(reach){
      const key=reach.x+','+reach.y;
      if(key!==this._rk){this._rk=key;this.reachLeg=-1;}
      if(this.reachLeg<0){let bd=TOTAL*s*0.95;L.forEach((l,n)=>{const q=Math.hypot(reach.x-l.hipW.x,reach.y-l.hipW.y);if(q<bd){bd=q;this.reachLeg=n;}});}
      if(this.reachLeg>=0)L[this.reachLeg].ideal={x:reach.x,y:reach.y};
    }else{this.reachLeg=-1;this._rk='';}

    const maxReach=TOTAL*s*0.97, need=[], thrK=1-0.4*Math.min(1,sp/(480*s)); // step earlier when fast
    L.forEach((l,n)=>{
      if(l.stepping)return;
      const thr=(n===this.reachLeg?4:this.thr*thrK)*s;
      const err=Math.hypot(l.fx-l.ideal.x,l.fy-l.ideal.y);
      const emerg=Math.hypot(l.fx-l.hipW.x,l.fy-l.hipW.y)>maxReach;
      if(err>thr||emerg)need.push({n,emerg,err:emerg?1e9+err:err});
    });
    need.sort((a,b)=>b.err-a.err);
    const gc=[0,0]; L.forEach((q,j)=>{if(q.stepping)gc[grp(j)]++;});   // legs swinging per gait group (no per-candidate array scans)

    for(const c of need){
      const l=L[c.n], g=grp(c.n);
      if(!c.emerg&&(gc[1-g]>0||gc[0]+gc[1]>=4)) continue;
      const preDelay=(c.n===this.reachLeg)?0:Math.min(0.035,0.0125*gc[g]);
      gc[g]++;

      let x2=l.ideal.x, y2=l.ideal.y;
      const hd=Math.hypot(x2-l.hipW.x,y2-l.hipW.y), m=TOTAL*s*0.92;
      if(hd>m){x2=l.hipW.x+(x2-l.hipW.x)*m/hd;y2=l.hipW.y+(y2-l.hipW.y)*m/hd;}

      l.stepDur   = 0.9 + this.rng()*0.2;
      l.liftScale = 0.85 + this.rng()*0.3;
      Object.assign(l,{
        stepping:true, emerg:c.emerg, t:0,
        sx:l.fx, sy:l.fy, tx:x2, ty:y2,
        preDelay, preT:0, swingStarted:false
      });
    }

    for(const l of L) l.clamped=solveChain(l.j,l.hipW,l.fx,l.fy,this.x,this.y,s,l.stepping?8:5);
    const rl=this.reachLeg>=0?L[this.reachLeg]:null;
    this.reachDone=!!(reach&&rl&&!rl.stepping&&Math.hypot(rl.fx-reach.x,rl.fy-reach.y)<6*s);
  }
}
const api={Spider,solveChain,LENS,TOTAL,wrap,grp};
root.SpiderCore=api; if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
