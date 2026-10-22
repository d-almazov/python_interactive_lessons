/* ============ СЦЕНИ: малювання на canvas 640×400 ============ */
const PAL={};
function readPal(){
  const cs=getComputedStyle(document.documentElement);
  ["sc-sky","sc-floor","sc-metal","sc-metal2","sc-belt","sc-glass","sc-leaf","sc-pot","sc-road","sc-mars","sc-marssky","sc-hill","p-red","p-blue","p-green","p-yellow","ink","muted","accent","ok","bad","warn","panel","line","bg","code-bg"].forEach(n=>{ PAL[n.replace(/-/g,"_")]=cs.getPropertyValue("--"+n).trim()||"#888"; });
}
const FB='"IBM Plex Sans", system-ui, sans-serif', FM='"JetBrains Mono", ui-monospace, monospace', FD='"Russo One", "Arial Black", sans-serif';
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rr(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function T(c,s,x,y,o={}){ c.font=(o.w||600)+" "+(o.s||13)+"px "+(o.f||FB); c.fillStyle=o.c||PAL.ink; c.textAlign=o.a||"left"; c.textBaseline=o.b||"middle"; c.fillText(s,x,y); }
function circ(c,x,y,r,fill,stroke,lw){ c.beginPath(); c.arc(x,y,r,0,Math.PI*2); if(fill){ c.fillStyle=fill; c.fill(); } if(stroke){ c.strokeStyle=stroke; c.lineWidth=lw||2; c.stroke(); } }
function alpha(col,a){ // приймає #rrggbb
  if(col[0]!=="#"||col.length<7) return col;
  const n=parseInt(col.slice(1,7),16); return "rgba("+(n>>16&255)+","+(n>>8&255)+","+(n&255)+","+a+")";
}
function panel(c,x,y,w,h){ rr(c,x,y,w,h,10); c.fillStyle=PAL.panel; c.fill(); c.strokeStyle=PAL.line; c.lineWidth=1.5; c.stroke(); }
function pulse(c,x,y,p,col){ if(p===undefined) return; const r=14+p*26; circ(c,x,y,r,null,alpha(col,1-p),3); }
function ap(st,types){ const a=st.anim; if(!a) return null; if(types&&!types.includes(a.ev.t)) return null; return a; }

const SCENES={};

/* ---------------- Теплиця ---------------- */
SCENES.green={
  init(sc,lv){ return {sc,lv,dev:{}}; },
  dur(){ return .8; },
  step(st,ev){ const m={pump_on:["pump",true],pump_off:["pump",false],fan_on:["fan",true],heater_on:["heater",true],lamp_on:["lamp",true],climate_ok:["ok",true]}[ev.t]; if(m) st.dev[m[0]]=m[1]; },
  draw(c,st,T0){
    const P=PAL, v=st.sc.vars, a=st.anim;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    c.fillStyle=P.sc_floor; c.fillRect(0,330,640,70);
    const gx=30,gy=120,gw=370,gh=210, peak=gy-62;
    // лампа світить
    if(st.dev.lamp){ c.fillStyle=alpha(P.p_yellow,.22); c.beginPath(); c.moveTo(gx+gw/2-14,gy+4); c.lineTo(gx+40,gy+gh-30); c.lineTo(gx+gw-40,gy+gh-30); c.lineTo(gx+gw/2+14,gy+4); c.closePath(); c.fill(); }
    // скло
    c.fillStyle=P.sc_glass; c.beginPath(); c.moveTo(gx,gy+gh); c.lineTo(gx,gy); c.lineTo(gx+gw/2,peak); c.lineTo(gx+gw,gy); c.lineTo(gx+gw,gy+gh); c.closePath(); c.fill();
    c.strokeStyle=P.sc_metal; c.lineWidth=4; c.stroke();
    c.lineWidth=2;
    for(let i=1;i<4;i++){ const x=gx+gw*i/4; const top=gy-(gy-peak)*(1-Math.abs(x-(gx+gw/2))/(gw/2)); c.beginPath(); c.moveTo(x,gy+gh); c.lineTo(x,top); c.stroke(); }
    c.beginPath(); c.moveTo(gx,gy); c.lineTo(gx+gw,gy); c.stroke();
    // грядка
    rr(c,gx+16,gy+gh-36,gw-32,30,4); c.fillStyle=P.sc_pot; c.fill();
    // рослини
    const dry=v.humidity!==undefined&&v.humidity<40&&st.dev.pump!==true;
    const cold=v.temp!==undefined&&v.temp<15&&!st.dev.heater;
    for(let k=0;k<4;k++){
      const x=gx+70+k*78, y=gy+gh-36, h=dry?52:72, sway=Math.sin(T0*1.6+k)*(st.dev.fan?.18:.04);
      c.strokeStyle=P.sc_leaf; c.lineWidth=4; c.beginPath(); c.moveTo(x,y); c.quadraticCurveTo(x+sway*40,y-h/2,x+sway*60+(dry?10:0),y-h); c.stroke();
      const droop=dry?1.1:cold?.8:.35;
      for(let j=0;j<3;j++){
        const ly=y-h*(.35+j*.25), lx=x+sway*30*(j+1)/3;
        for(const s of [-1,1]){ c.save(); c.translate(lx,ly); c.rotate(s*(Math.PI/2-droop)+sway); c.fillStyle=P.sc_leaf; c.beginPath(); c.ellipse(s*13,0,14,6,0,0,Math.PI*2); c.fill(); c.restore(); }
      }
    }
    // труба поливу
    c.strokeStyle=P.sc_metal2; c.lineWidth=5; c.beginPath(); c.moveTo(gx+10,gy+28); c.lineTo(gx+gw-60,gy+28); c.stroke();
    for(let k=0;k<4;k++){ const x=gx+70+k*78; c.fillStyle=P.sc_metal2; c.fillRect(x-4,gy+28,8,8);
      if(st.dev.pump){ for(let d=0;d<3;d++){ const t=(T0*1.4+d/3+k*.13)%1; circ(c,x+(d-1)*5,gy+40+t*(gh-90),3,alpha(P.p_blue,1-t*.6)); } } }
    // насос
    const px=gx-4, py=gy+gh+2;
    rr(c,px+18,py-34,46,30,6); c.fillStyle=st.dev.pump?P.p_blue:P.sc_metal; c.fill();
    T(c,"НАСОС",px+41,py-19,{s:9,w:700,c:"#fff",a:"center"});
    c.strokeStyle=P.sc_metal2; c.lineWidth=5; c.beginPath(); c.moveTo(px+22,py-34); c.lineTo(px+22,gy+28); c.lineTo(gx+12,gy+28); c.stroke();
    if(a&&(a.ev.t==="pump_on"||a.ev.t==="pump_off")) pulse(c,px+41,py-19,a.p,a.ev.t==="pump_on"?P.ok:P.bad);
    // вентилятор
    if(st.lv.devices.some(d=>d[0]==="fan")){
      const fx=gx+gw-48, fy=gy+60; circ(c,fx,fy,24,P.panel,P.sc_metal2,3);
      const ang=st.dev.fan?T0*12:0.4;
      for(let b=0;b<3;b++){ c.save(); c.translate(fx,fy); c.rotate(ang+b*2.094); c.fillStyle=st.dev.fan?P.p_blue:P.sc_metal; c.beginPath(); c.ellipse(11,0,11,5,0,0,Math.PI*2); c.fill(); c.restore(); }
      circ(c,fx,fy,4,P.sc_metal2);
      if(a&&a.ev.t==="fan_on") pulse(c,fx,fy,a.p,P.ok);
      // обігрівач
      const hx=gx+gw-110, hy=gy+gh-58;
      rr(c,hx,hy,80,14,4); c.fillStyle=st.dev.heater?P.bad:P.sc_metal; c.fill();
      if(st.dev.heater){ c.strokeStyle=alpha(P.bad,.5); c.lineWidth=2; for(let w=0;w<4;w++){ c.beginPath(); const bx=hx+10+w*20; for(let s=0;s<=16;s++){ const yy=hy-4-s*2.4; const xx=bx+Math.sin(s*.8+T0*6+w)*3; s?c.lineTo(xx,yy):c.moveTo(xx,yy); } c.stroke(); } }
      if(a&&a.ev.t==="heater_on") pulse(c,hx+40,hy+7,a.p,P.ok);
    }
    // лампа
    if(st.lv.devices.some(d=>d[0]==="lamp")){
      const lx=gx+gw/2, ly=gy+2;
      c.strokeStyle=P.sc_metal2; c.lineWidth=2; c.beginPath(); c.moveTo(lx,peak+4); c.lineTo(lx,ly-6); c.stroke();
      c.beginPath(); c.moveTo(lx-16,ly+6); c.lineTo(lx-6,ly-8); c.lineTo(lx+6,ly-8); c.lineTo(lx+16,ly+6); c.closePath(); c.fillStyle=st.dev.lamp?P.p_yellow:P.sc_metal; c.fill();
      if(a&&a.ev.t==="lamp_on") pulse(c,lx,ly,a.p,P.ok);
    }
    // ніч
    if(v.is_night){ c.fillStyle="rgba(10,20,45,.18)"; c.fillRect(0,0,640,330); circ(c,60,48,14,P.p_yellow); circ(c,67,43,12,P.sc_sky); }
    // пульт
    const X=420,Y=24,Wd=200,H=330; panel(c,X,Y,Wd,H);
    T(c,"ПУЛЬТ ТЕПЛИЦІ",X+16,Y+24,{f:FD,s:13,w:400});
    let yy=Y+56;
    const fmt={humidity:["Вологість",v.humidity+" %"],temp:["Температура",v.temp+" °C"],light:["Освітленість",v.light+" лк"],is_night:["Час доби",v.is_night?"ніч":"день"]};
    for(const r of st.lv.readouts){ T(c,fmt[r][0],X+16,yy,{s:12,w:500,c:P.muted}); T(c,fmt[r][1],X+Wd-16,yy,{s:15,w:600,f:FM,a:"right"}); yy+=28; }
    c.strokeStyle=P.line; c.lineWidth=1; c.beginPath(); c.moveTo(X+16,yy-6); c.lineTo(X+Wd-16,yy-6); c.stroke(); yy+=14;
    for(const [k,name] of st.lv.devices){
      const s=st.dev[k]; const col=s===true?P.ok:s===false?P.bad:P.line;
      circ(c,X+24,yy,7,col); T(c,name,X+40,yy,{s:13,w:500});
      T(c,s===true?(k==="ok"?"ТАК":"УВІМК"):s===false?"ВИМК":"—",X+Wd-16,yy,{s:11,w:700,f:FM,a:"right",c:s===undefined?P.muted:col});
      yy+=30;
    }
  }
};

/* ---------------- Перехрестя ---------------- */
SCENES.cross={
  init(sc){ return {sc,pos:[200,236],wait:false,done:null}; },
  dur(ev){ return ev.t==="wait"?1.2:1.6; },
  step(st,ev){ st.from=st.pos.slice(); if(ev.t==="go") st.pos=[470,236]; if(ev.t==="charge") st.pos=[118,322]; if(ev.t==="wait") st.wait=true; st.done=ev.t; },
  draw(c,st,T0){
    const P=PAL, v=st.sc.vars, a=st.anim;
    c.fillStyle=P.sc_floor; c.fillRect(0,0,640,400);
    c.fillStyle=P.sc_road; c.fillRect(270,0,130,400);
    c.fillStyle=alpha(P.bg,.9); for(let y=10;y<400;y+=44){ if(y>180&&y<280) continue; c.fillRect(333,y,4,22); }
    for(let x=276;x<396;x+=17){ c.fillStyle=alpha("#ffffff",.85); c.fillRect(x,198,10,76); }
    // бордюри
    c.fillStyle=P.sc_metal; c.fillRect(264,0,6,400); c.fillRect(400,0,6,400);
    // світлофор
    const lx=226,ly=70; c.fillStyle=P.sc_metal2; c.fillRect(lx+12,ly+80,5,110);
    rr(c,lx,ly,30,84,7); c.fillStyle=P.sc_belt; c.fill();
    [["red",P.p_red],["yellow",P.p_yellow],["green",P.p_green]].forEach(([n,col],i)=>circ(c,lx+15,ly+15+i*27,10,v.light===n?col:alpha(col,.18)));
    // пішохід
    if(v.pedestrian){
      const px=290+((Math.sin(T0*.7)+1)/2)*90, py=216, step=Math.sin(T0*6)*6;
      c.strokeStyle=P.ink; c.lineWidth=4; c.lineCap="round";
      circ(c,px,py-28,7,P.ink);
      c.beginPath(); c.moveTo(px,py-20); c.lineTo(px,py+4); c.moveTo(px,py+4); c.lineTo(px-step,py+22); c.moveTo(px,py+4); c.lineTo(px+step,py+22); c.moveTo(px,py-14); c.lineTo(px-step,py-2); c.moveTo(px,py-14); c.lineTo(px+step,py-2); c.stroke();
      c.lineCap="butt";
    }
    // зарядка
    rr(c,92,290,30,62,5); c.fillStyle=P.sc_metal2; c.fill();
    c.fillStyle=P.p_yellow; c.beginPath(); c.moveTo(110,300); c.lineTo(100,322); c.lineTo(108,322); c.lineTo(103,342); c.lineTo(116,316); c.lineTo(108,316); c.closePath(); c.fill();
    T(c,"ЗАРЯДКА",107,366,{s:10,w:700,c:P.muted,a:"center"});
    // робот
    let [x,y]=st.pos;
    if(a&&(a.ev.t==="go"||a.ev.t==="charge")){ const e=ease(a.p); x=lerp(st.from[0],st.pos[0],e); y=lerp(st.from[1],st.pos[1],e); }
    const wob=a&&(a.ev.t==="go"||a.ev.t==="charge")?Math.sin(T0*30)*1.2:0;
    rr(c,x-26,y-24+wob,52,36,8); c.fillStyle=P.accent; c.fill();
    rr(c,x-16,y-18+wob,32,12,4); c.fillStyle=P.sc_belt; c.fill();
    circ(c,x-7,y-12+wob,3,"#7fe3ff"); circ(c,x+7,y-12+wob,3,"#7fe3ff");
    circ(c,x-16,y+14,7,P.sc_belt); circ(c,x+16,y+14,7,P.sc_belt);
    T(c,"ПОСИЛКА",x,y+3+wob,{s:8,w:700,c:"#fff",a:"center"});
    // батарея
    const bw=40,bx=x-bw/2,by=y-46; rr(c,bx,by,bw,12,3); c.strokeStyle=P.ink; c.lineWidth=1.5; c.stroke();
    const lvl=st.done==="charge"&&!a?100:v.battery;
    c.fillStyle=lvl<15?P.bad:P.ok; c.fillRect(bx+2,by+2,(bw-4)*lvl/100,8);
    T(c,lvl+"%",x+bw/2+6,by+6,{s:11,w:700,f:FM});
    if(st.wait){ rr(c,x+20,y-74,46,24,10); c.fillStyle=P.panel; c.fill(); c.strokeStyle=P.line; c.stroke(); T(c,"чекаю",x+43,y-62,{s:11,w:600,a:"center"}); }
    if(st.done==="charge"&&a) { c.fillStyle=alpha(P.p_yellow,.5*(1-a.p)); circ(c,x,y,40*a.p+10,alpha(P.p_yellow,.3*(1-a.p))); }
    // табличка
    T(c,"ПЕРЕХІД",335,186,{s:10,w:700,c:"#fff",a:"center"});
  }
};

/* ---------------- Палетизатор ---------------- */
const PC=44, POX=(640-PAL_W*PC)/2, PFLOOR=342;
const pcx=x=>POX+x*PC+PC/2, pcy=y=>PFLOOR-y*PC-PC/2;
SCENES.pallet={
  init(sc){ return {sc,boxes:[],carX:pcx(0),bump:null}; },
  dur(ev){ return ev.t==="bump"?.6:.7; },
  step(st,ev){ if(ev.t==="place"){ st.fromX=st.carX; st.carX=pcx(ev.x); const b={x:ev.x,y:ev.y,color:ev.color}; st.boxes.push(b); st.moving=b; } if(ev.t==="bump"){ st.fromX=st.carX; st.carX=pcx(ev.x); st.bump=ev; } },
  draw(c,st,T0){
    const P=PAL, a=st.anim;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    c.fillStyle=P.sc_floor; c.fillRect(0,PFLOOR+16,640,60);
    // палета
    c.fillStyle=P.sc_pot; c.fillRect(POX-8,PFLOOR,PAL_W*PC+16,8); for(let i=0;i<=4;i++) c.fillRect(POX-8+i*(PAL_W*PC)/4,PFLOOR+8,16,10);
    // сітка позицій і цілі
    c.setLineDash([4,4]);
    for(const t of st.sc.target){ const x=pcx(t.x)-PC/2+3,y=pcy(t.y)-PC/2+3; rr(c,x,y,PC-6,PC-6,5); c.strokeStyle=t.color==="blue"?alpha(P.p_blue,.75):alpha(P.accent,.75); c.lineWidth=1.5; c.stroke(); }
    c.setLineDash([]);
    for(let x=0;x<PAL_W;x++) T(c,String(x),pcx(x),PFLOOR+30,{s:11,f:FM,c:P.muted,a:"center"});
    for(let y=0;y<PAL_H;y++) T(c,"y="+y,POX-14,pcy(y),{s:10,f:FM,c:P.muted,a:"right"});
    // портал
    c.fillStyle=P.sc_metal2; c.fillRect(POX-30,28,PAL_W*PC+60,10); c.fillRect(POX-30,28,8,PFLOOR-12); c.fillRect(POX+PAL_W*PC+22,28,8,PFLOOR-12);
    let cx=st.carX, boxY=null, hanging=null;
    const drawBox=(b,x,y)=>{ rr(c,x-PC/2+3,y-PC/2+3,PC-6,PC-6,4); c.fillStyle=b.color==="blue"?P.p_blue:P.accent; c.fill(); c.fillStyle="rgba(255,255,255,.28)"; c.fillRect(x-3,y-PC/2+3,6,PC-6); c.strokeStyle="rgba(0,0,0,.18)"; c.lineWidth=1; c.stroke(); };
    for(const b of st.boxes){ if(a&&a.ev.t==="place"&&b===st.moving) continue; drawBox(b,pcx(b.x),pcy(b.y)); }
    if(a&&(a.ev.t==="place"||a.ev.t==="bump")){
      const p=a.p, e1=ease(clamp(p/.45,0,1)), e2=ease(clamp((p-.45)/.55,0,1));
      cx=lerp(st.fromX,st.carX,e1);
      if(a.ev.t==="place"){ boxY=lerp(70,pcy(a.ev.y),e2); hanging=st.moving; }
      else { boxY=lerp(70,pcy(a.ev.y)-6,e2)+Math.sin(p*40)*3*e2; hanging={color:"orange"}; }
    }
    // каретка і трос
    rr(c,cx-22,22,44,22,4); c.fillStyle=P.accent; c.fill(); circ(c,cx,33,4,P.sc_belt);
    const hookY=boxY!==null?boxY-PC/2:58;
    c.strokeStyle=P.sc_metal2; c.lineWidth=2; c.beginPath(); c.moveTo(cx,44); c.lineTo(cx,hookY); c.stroke();
    c.fillStyle=P.sc_metal2; c.fillRect(cx-14,hookY-4,28,5);
    if(hanging) drawBox(hanging,cx,boxY);
    if(a&&a.ev.t==="bump"&&a.p>.5){ T(c,"✕",cx,boxY,{s:30,w:700,c:P.bad,a:"center"}); }
    T(c,"ящиків: "+st.boxes.length+" / "+st.sc.target.length,620,60,{s:12,f:FM,c:P.muted,a:"right"});
  }
};

/* ---------------- Конвеєр ---------------- */
const ST_X=330, BELT_Y=200, GAP=72;
const PCOL={red:"p_red",blue:"p_blue",green:"p_green",yellow:"p_yellow",grey:"sc_metal"};
SCENES.belt={
  init(sc,lv){ return {sc,lv,parts:sc.parts.map(p=>Object.assign({},p,{state:"queue"})),next:0,cur:-1,bins:{left:[],right:[],end:[]},stopped:false,codes:{},beltOff:0}; },
  dur(ev){ return {arrive:.55,left:.55,right:.55,pack:.55,end:.7,pass:.7,stop:1,scan:.5,scanerr:.6}[ev.t]||.4; },
  step(st,ev){
    const p=st.parts[ev.id];
    if(ev.t==="arrive"){ st.cur=ev.id; p.state="station"; st.next=ev.id+1; }
    const bin={left:"left",right:"right",pack:"right",end:"end",pass:"end"}[ev.t];
    if(bin){ p.state="bin"; p.bin=bin; st.bins[bin].push(p); }
    if(ev.t==="stop") st.stopped=true;
    if(ev.t==="scan") st.codes[ev.id]=ev.code;
    if(ev.t==="scanerr") st.codes[ev.id]="!";
  },
  drawPart(c,st,p,x,y,T0,sz){
    const P=PAL; sz=sz||32;
    if(p.hot){ circ(c,x,y,sz*.75+Math.sin(T0*8)*2,alpha(P.p_red,.25)); }
    rr(c,x-sz/2,y-sz/2,sz,sz,sz*.22); c.fillStyle=P[PCOL[p.color]||"sc_metal"]; c.fill();
    c.strokeStyle="rgba(0,0,0,.25)"; c.lineWidth=1; c.stroke();
    if(sz>20){ circ(c,x,y,sz*.16,"rgba(0,0,0,.22)"); }
    if(p.defect){ c.strokeStyle=P.sc_belt; c.lineWidth=2.2; c.beginPath(); c.moveTo(x-sz*.35,y-sz*.3); c.lineTo(x-sz*.05,y-sz*.05); c.lineTo(x-sz*.2,y+sz*.1); c.lineTo(x+sz*.3,y+sz*.35); c.stroke(); }
    if(p.hot&&sz>20){ c.strokeStyle=P.p_red; c.lineWidth=2; for(let w=-1;w<=1;w++){ c.beginPath(); for(let s=0;s<=8;s++){ const yy=y-sz/2-4-s*2; const xx=x+w*8+Math.sin(s+T0*8)*2; s?c.lineTo(xx,yy):c.moveTo(xx,yy);} c.stroke(); } }
    if(st.sc.final&&sz>20){ const code=st.codes[p.id]; rr(c,x-9,y-9,18,18,3); c.fillStyle="#fff"; c.fill(); T(c,code===undefined?"?":code,x,y+1,{s:12,w:700,f:FM,c:code==="!"?P.bad:"#111",a:"center"}); }
  },
  draw(c,st,T0,dt){
    const P=PAL, a=st.anim, bins=st.lv.bins;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    c.fillStyle=P.sc_floor; c.fillRect(0,250,640,150);
    // контейнери
    const binBox=(key,x,y,w,h,label)=>{
      if(!label) return;
      rr(c,x,y,w,h,6); c.fillStyle=alpha(P.sc_metal,.25); c.fill(); c.strokeStyle=P.sc_metal2; c.lineWidth=2.5; c.stroke();
      T(c,label,x+w/2,key==="right"?y+h+14:y-10,{s:10,w:700,c:P.muted,a:"center"});
      const items=st.bins[key].filter(p=>!(a&&a.ev.id===p.id&&["left","right","pack","end","pass"].includes(a.ev.t)));
      items.forEach((p,i)=>{ const col=i%5,row=Math.floor(i/5); this.drawPart(c,st,p,x+11+col*((w-14)/5),y+h-11-row*16,T0,13); });
      T(c,String(st.bins[key].length),x+w-6,y+10,{s:11,w:700,f:FM,c:P.ink,a:"right"});
    };
    binBox("left",ST_X-46,40,92,56,bins.left);
    binBox("right",ST_X-46,300,92,56,bins.right);
    binBox("end",588,176,46,86,bins.end);
    // стрічка
    const moving=a&&["arrive","pass","end"].includes(a.ev.t)&&!st.stopped;
    if(moving) st.beltOff=(st.beltOff+dt*120)%24;
    rr(c,6,BELT_Y-24,578,48,24); c.fillStyle=P.sc_belt; c.fill();
    c.save(); rr(c,6,BELT_Y-24,578,48,24); c.clip();
    c.strokeStyle=alpha(P.sc_metal,.35); c.lineWidth=2;
    for(let x=-24+st.beltOff;x<600;x+=24){ c.beginPath(); c.moveTo(x,BELT_Y-24); c.lineTo(x,BELT_Y+24); c.stroke(); }
    c.restore();
    for(let x=30;x<580;x+=60) circ(c,x,BELT_Y+30,5,P.sc_metal2);
    // станція
    c.strokeStyle=P.accent; c.lineWidth=2; c.setLineDash([5,4]); c.strokeRect(ST_X-24,BELT_Y-26,48,52); c.setLineDash([]);
    // сканер/камера
    c.fillStyle=P.sc_metal2; c.fillRect(ST_X+40,118,6,58); rr(c,ST_X+8,108,46,22,5); c.fill();
    circ(c,ST_X+16,119,6,a&&(a.ev.t==="scan"||a.ev.t==="arrive")?P.ok:a&&a.ev.t==="scanerr"?P.bad:P.sc_belt);
    if(a&&(a.ev.t==="scan"||a.ev.t==="scanerr")){ c.fillStyle=alpha(a.ev.t==="scan"?P.ok:P.bad,.25*(1-a.p)+.1); c.beginPath(); c.moveTo(ST_X+16,124); c.lineTo(ST_X-18,BELT_Y-14); c.lineTo(ST_X+18,BELT_Y-14); c.closePath(); c.fill(); }
    // деталі в черзі
    const arr=a&&a.ev.t==="arrive"&&!st.stopped?ease(a.p):1;
    st.parts.forEach(p=>{
      if(p.state==="queue"){ const k=p.id-st.next; const base=ST_X-GAP*(k+1); const x=a&&a.ev.t==="arrive"?base-GAP+GAP*arr:base; if(x>-30) this.drawPart(c,st,p,x,BELT_Y,T0); }
    });
    // на станції / в русі
    st.parts.forEach(p=>{
      let x=null,y=BELT_Y;
      if(p.state==="station"){ x=ST_X; if(a&&a.ev.t==="arrive"&&a.ev.id===p.id) x=ST_X-GAP+GAP*arr; }
      if(p.state==="bin"&&a&&a.ev.id===p.id){
        const e=ease(a.p);
        if(a.ev.t==="left"){ x=ST_X; y=lerp(BELT_Y,78,e); }
        else if(a.ev.t==="right"||a.ev.t==="pack"){ x=ST_X; y=lerp(BELT_Y,330,e); }
        else if(a.ev.t==="end"||a.ev.t==="pass"){ x=lerp(ST_X,611,e); y=a.p<.75?BELT_Y:lerp(BELT_Y,236,(a.p-.75)/.25); }
      }
      if(p.state==="stopped") x=ST_X;
      if(x!==null) this.drawPart(c,st,p,x,y,T0);
    });
    // штовхач
    if(a&&["left","right","pack"].includes(a.ev.t)){ const up=a.ev.t==="left"; const ext=Math.sin(Math.min(a.p,.5)*Math.PI)*22; c.fillStyle=P.sc_metal2; if(up) c.fillRect(ST_X-16,BELT_Y+26-ext,32,8); else c.fillRect(ST_X-16,BELT_Y-34+ext,32,8); }
    // зупинка
    if(st.stopped){
      c.save(); rr(c,6,BELT_Y-24,578,48,24); c.clip();
      c.fillStyle=alpha(P.p_yellow,.55); for(let x=-60;x<640;x+=28){ c.beginPath(); c.moveTo(x,BELT_Y+24); c.lineTo(x+14,BELT_Y+24); c.lineTo(x+48,BELT_Y-24); c.lineTo(x+34,BELT_Y-24); c.closePath(); c.fill(); }
      c.restore();
      const fl=a&&a.ev.t==="stop"?(Math.sin(a.p*25)>0?1:.4):1;
      rr(c,150,BELT_Y-62,250,28,6); c.fillStyle=alpha(P.bad,fl); c.fill();
      T(c,"АВАРІЙНА ЗУПИНКА",275,BELT_Y-48,{f:FD,s:13,w:400,c:"#fff",a:"center"});
    }
    T(c,"ВХІД",14,BELT_Y-38,{s:10,w:700,c:P.muted});
  }
};

/* ---------------- Сітка ---------------- */
SCENES.grid={
  init(sc){ const cell=Math.floor(Math.min(560/sc.W,300/sc.H,56)); const ox=(640-cell*sc.W)/2, oy=sc.H===1?150:(400-cell*sc.H)/2+8;
    const open=new Set(); for(let i=1;i<sc.path.length;i++){ const p=sc.path[i-1],q=sc.path[i]; open.add(ek(p[0],p[1],q[0],q[1])); }
    return {sc,cell,ox,oy,open,x:sc.path[0][0],y:sc.path[0][1],ang:sc.dir*Math.PI/2,trail:[sc.path[0].join()],steps:0}; },
  dur(ev){ return {move:.32,turn:.28,sense:.16,crash:.6}[ev.t]||.3; },
  step(st,ev){
    if(ev.t==="move"){ st.from=[st.x,st.y]; st.x=ev.x; st.y=ev.y; st.trail.push(ev.x+","+ev.y); st.steps++; }
    if(ev.t==="turn"){ st.fromAng=st.ang; st.ang+=ev.d*Math.PI/2; }
    if(ev.t==="crash") st.crashed=true;
  },
  draw(c,st,T0){
    const P=PAL, a=st.anim, {cell,ox,oy,sc}=st, W=sc.W,H=sc.H;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    rr(c,ox-8,oy-8,cell*W+16,cell*H+16,8); c.fillStyle=P.sc_metal2; c.fill();
    const onPath=new Set(sc.path.map(p=>p.join()));
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const k=x+","+y;
      c.fillStyle=onPath.has(k)?P.sc_floor:alpha(P.sc_metal,.55);
      c.fillRect(ox+x*cell+1,oy+y*cell+1,cell-2,cell-2);
      if(st.trail.includes(k)) circ(c,ox+x*cell+cell/2,oy+y*cell+cell/2,3,alpha(P.accent,.5));
    }
    // стіни
    c.strokeStyle=P.ink; c.lineWidth=4; c.lineCap="round";
    for(const [x,y] of sc.path){
      DIRS.forEach((d,i)=>{ const nx=x+d[0],ny=y+d[1]; if(st.open.has(ek(x,y,nx,ny))) return;
        const cx=ox+x*cell+cell/2, cy=oy+y*cell+cell/2, h=cell/2;
        c.beginPath();
        if(i===0){ c.moveTo(cx+h,cy-h); c.lineTo(cx+h,cy+h); }
        if(i===1){ c.moveTo(cx-h,cy+h); c.lineTo(cx+h,cy+h); }
        if(i===2){ c.moveTo(cx-h,cy-h); c.lineTo(cx-h,cy+h); }
        if(i===3){ c.moveTo(cx-h,cy-h); c.lineTo(cx+h,cy-h); }
        c.stroke(); });
    }
    c.lineCap="butt";
    // ціль
    const g=sc.path[sc.path.length-1], gx=ox+g[0]*cell+cell/2, gy=oy+g[1]*cell+cell/2;
    rr(c,gx-9,gy-14,18,28,3); c.fillStyle=P.ok; c.fill(); c.fillStyle=P.ok; c.fillRect(gx-4,gy-18,8,4);
    c.fillStyle="#fff"; c.fillRect(gx-5,gy-2,10,3); c.fillRect(gx-1.5,gy-6,3,10);
    // робот
    let rx=st.x,ry=st.y,ang=st.ang;
    if(a&&a.ev.t==="move"){ const e=ease(a.p); rx=lerp(st.from[0],st.x,e); ry=lerp(st.from[1],st.y,e); }
    if(a&&a.ev.t==="turn"){ ang=lerp(st.fromAng,st.ang,ease(a.p)); }
    let px=ox+rx*cell+cell/2, py=oy+ry*cell+cell/2;
    if(a&&a.ev.t==="crash"){ px+=Math.sin(a.p*50)*4*(1-a.p)+Math.cos(ang)*6*Math.sin(a.p*Math.PI); py+=Math.sin(ang)*6*Math.sin(a.p*Math.PI); }
    if(a&&a.ev.t==="sense"){ const d=DIRS[a.ev.dir]; const len=a.ev.wall?cell*.5:cell*.95; c.strokeStyle=alpha(a.ev.wall?P.bad:P.ok,.9); c.lineWidth=3; c.setLineDash([4,3]); c.beginPath(); c.moveTo(px,py); c.lineTo(px+d[0]*len*Math.min(1,a.p*2.5),py+d[1]*len*Math.min(1,a.p*2.5)); c.stroke(); c.setLineDash([]); }
    const R=cell*.34;
    c.save(); c.translate(px,py); c.rotate(ang);
    rr(c,-R,-R,R*2,R*2,R*.45); c.fillStyle=st.crashed?P.bad:P.accent; c.fill();
    c.fillStyle=P.sc_belt; c.fillRect(-R-3,-R+2,6,R*2-4);
    c.beginPath(); c.moveTo(R*.9,0); c.lineTo(R*.25,-R*.5); c.lineTo(R*.25,R*.5); c.closePath(); c.fillStyle="#fff"; c.fill();
    c.restore();
    T(c,"кроків: "+st.steps,ox+cell*W,oy-22,{s:12,f:FM,c:P.muted,a:"right"});
  }
};

/* ---------------- Марсохід ---------------- */
const RX0=44, RCW=32, RGY=300;
const rcx=i=>RX0+i*RCW;
SCENES.rover={
  init(sc){ return {sc,pos:0,bat:sc.battery,samples:new Set(sc.samples),got:0,home:false,dust:Array.from({length:40},(_,i)=>({a:i*2.4,r:(i*37)%30,s:.5+(i%7)/7}))}; },
  dur(ev){ if(ev.t==="home") return .4+ev.from*.07; return {move:.34,sense:.14,look:.14,collect:.45,crash:.8,dead:.6}[ev.t]||.3; },
  step(st,ev){
    if(ev.t==="move"){ st.from=st.pos; st.pos=ev.pos; st.bat=ev.bat; }
    if(ev.t==="collect"){ st.samples.delete(ev.pos); st.got++; st.coll=ev.pos; }
    if(ev.t==="home"){ st.from=st.pos; st.pos=0; st.home=true; }
    if(ev.t==="crash"||ev.t==="dead") st.crashed=true;
  },
  draw(c,st,T0){
    const P=PAL, a=st.anim, sc=st.sc;
    c.fillStyle=P.sc_marssky; c.fillRect(0,0,640,400);
    circ(c,560,70,22,alpha(P.p_yellow,.7));
    c.fillStyle=P.sc_hill; c.beginPath(); c.moveTo(0,RGY-20); for(let x=0;x<=640;x+=40) c.lineTo(x,RGY-40-Math.sin(x*.013)*18-Math.sin(x*.041)*9); c.lineTo(640,RGY); c.lineTo(0,RGY); c.closePath(); c.fill();
    c.fillStyle=P.sc_mars; c.fillRect(0,RGY,640,100);
    for(let i=0;i<ROVER_LEN;i++){ c.fillStyle=alpha(P.ink,.18); c.fillRect(rcx(i)-1,RGY+22,2,8); if(i%2===0) T(c,String(i),rcx(i),RGY+42,{s:10,f:FM,c:alpha(P.ink,.55),a:"center"}); }
    // база
    c.fillStyle=P.sc_metal; c.beginPath(); c.arc(rcx(0),RGY,30,Math.PI,0); c.fill(); c.fillStyle=P.sc_metal2; c.fillRect(rcx(0)-8,RGY-14,16,14);
    T(c,"БАЗА",rcx(0),RGY+60,{s:10,w:700,c:alpha(P.ink,.7),a:"center"});
    // зразки
    for(const s of st.samples){ const x=rcx(s), y=RGY+6; c.fillStyle=P.p_blue; c.beginPath(); c.moveTo(x,y-14); c.lineTo(x+7,y-2); c.lineTo(x,y+4); c.lineTo(x-7,y-2); c.closePath(); c.fill(); c.fillStyle="rgba(255,255,255,.5)"; c.beginPath(); c.moveTo(x,y-14); c.lineTo(x+3,y-4); c.lineTo(x,y); c.closePath(); c.fill(); }
    if(a&&a.ev.t==="collect"){ const x=rcx(st.coll), sz=1-a.p; c.fillStyle=P.p_blue; c.beginPath(); c.moveTo(x,RGY-8-14*sz-a.p*30); c.lineTo(x+7*sz,RGY-4-a.p*30); c.lineTo(x-7*sz,RGY-4-a.p*30); c.closePath(); c.fill(); }
    // буря
    if(sc.storm>0){ const sx=rcx(sc.storm);
      c.fillStyle=alpha(P.sc_hill,.55); c.beginPath(); c.ellipse(sx+10,RGY-50,34,70,0,0,Math.PI*2); c.fill();
      for(const d of st.dust){ const ang=d.a+T0*d.s*3; const x=sx+10+Math.cos(ang)*(14+d.r), y=RGY-50+Math.sin(ang*1.3)*60; circ(c,x,y,2.2,alpha(P.ink,.35)); }
      T(c,"БУРЯ",sx+10,RGY-132,{s:10,w:700,c:P.bad,a:"center"});
    }
    // ровер
    let x=rcx(st.pos);
    if(a&&(a.ev.t==="move"||a.ev.t==="home")) x=lerp(rcx(st.from),rcx(st.pos),ease(a.p));
    const y=RGY-14, bob=a&&(a.ev.t==="move"||a.ev.t==="home")?Math.sin(T0*40):0;
    const flip=st.home&&a&&a.ev.t==="home"?-1:1;
    if(a&&a.ev.t==="crash") x+=Math.sin(a.p*60)*4;
    c.save(); c.translate(x,y+bob*.8); c.scale(flip,1);
    c.fillStyle=P.sc_metal2; c.fillRect(-2,-34,3,18); circ(c,0,-36,3.5,P.accent);
    c.fillStyle=P.p_blue; c.fillRect(-20,-22,26,5);
    rr(c,-18,-16,36,16,4); c.fillStyle=st.crashed?P.bad:P.panel; c.fill(); c.strokeStyle=P.ink; c.lineWidth=1.5; c.stroke();
    circ(c,12,-8,3,P.ink);
    [-13,0,13].forEach(w=>circ(c,w,4,6,P.sc_belt,P.sc_metal,1.5));
    c.restore();
    if(a&&(a.ev.t==="sense"||a.ev.t==="look")){ const tx=a.ev.t==="look"?rcx(st.pos+1):x; c.strokeStyle=alpha(a.ev.hit?(a.ev.t==="look"?P.bad:P.ok):P.ink,.7*(1-a.p)); c.lineWidth=2; circ(c,tx,RGY+2,8+a.p*14,null,c.strokeStyle,2); }
    // HUD
    panel(c,16,16,250,62);
    T(c,"ЗАРЯД",30,34,{s:10,w:700,c:P.muted}); T(c,"ЗРАЗКИ",180,34,{s:10,w:700,c:P.muted});
    rr(c,30,46,90,16,4); c.strokeStyle=P.ink; c.lineWidth=1.5; c.stroke();
    c.fillStyle=st.bat<=20?P.bad:st.bat<40?P.warn:P.ok; c.fillRect(32,48,86*st.bat/100,12);
    c.strokeStyle=alpha(P.bad,.9); c.beginPath(); c.moveTo(32+86*.2,44); c.lineTo(32+86*.2,64); c.stroke();
    T(c,st.bat+"%",128,54,{s:12,w:700,f:FM});
    T(c,String(st.got),180,56,{s:18,w:700,f:FM});
    if(st.home&&!a) T(c,"на базі",204,56,{s:11,w:600,c:P.ok});
  }
};

/* ---------------- Станція датчика ---------------- */
SCENES.sensor={
  crashTop:true,
  init(sc){ return {sc,display:"—",tape:[],reads:0,led:null}; },
  dur(ev){ return ev.t==="read"?(ev.ok?.35:.55):.4; },
  step(st,ev){ if(ev.t==="read"){ st.reads++; st.led=ev.ok; } if(ev.t==="show"){ st.display=typeof ev.v==="number"?String(ev.v):String(ev.v); st.tape.push(ev.v); } },
  draw(c,st,T0){
    const P=PAL,a=st.anim;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    // труба
    c.fillStyle=P.sc_metal; c.fillRect(0,250,640,38); c.fillStyle=alpha("#ffffff",.15); c.fillRect(0,254,640,6);
    for(let x=40;x<640;x+=120){ c.fillStyle=P.sc_metal2; c.fillRect(x,246,10,46); }
    // датчик
    const sx=110;
    c.fillStyle=P.sc_metal2; c.fillRect(sx-5,170,10,84);
    rr(c,sx-26,130,52,44,8); c.fillStyle=P.panel; c.fill(); c.strokeStyle=P.sc_metal2; c.lineWidth=2.5; c.stroke();
    T(c,"T°",sx,152,{s:15,w:700,f:FM,a:"center"});
    const ledCol= st.led===null?P.line : st.led?P.ok:P.bad;
    circ(c,sx+18,140,5,ledCol);
    if(a&&a.ev.t==="read"){
      if(a.ev.ok){ circ(c,sx,152,30+a.p*20,null,alpha(P.ok,1-a.p),2); }
      else { c.strokeStyle=P.p_yellow; c.lineWidth=2.5; for(let k=0;k<6;k++){ const ang=k*1.05+a.p*2; const r1=30, r2=30+16*a.p+Math.sin(T0*40+k)*4; c.beginPath(); c.moveTo(sx+Math.cos(ang)*r1,152+Math.sin(ang)*r1); c.lineTo(sx+Math.cos(ang)*r2,152+Math.sin(ang)*r2); c.stroke(); } T(c,"збій!",sx,106,{s:13,w:700,c:P.bad,a:"center"}); }
    }
    // кабель
    c.strokeStyle=P.sc_belt; c.lineWidth=4; c.beginPath(); c.moveTo(sx+26,150); c.bezierCurveTo(200,150,190,90,250,90); c.stroke();
    if(a&&a.ev.t==="read"){ const t=a.p; const bx=lerp(sx+26,250,t), by=lerp(150,90,t*t); circ(c,bx,by,5,a.ev.ok?P.ok:P.bad); }
    // табло
    const dx=250,dy=40,dw=360,dh=130;
    rr(c,dx,dy,dw,dh,12); c.fillStyle=P.sc_belt; c.fill();
    rr(c,dx+12,dy+12,dw-24,dh-24,6); c.fillStyle="#0b1a12"; c.fill();
    const val=st.display, bad=val==="ERR"||val==="FAIL";
    const flash=a&&a.ev.t==="show"?1-a.p:0;
    T(c,val,dx+dw/2,dy+dh/2+4,{s:54,w:700,f:FM,c:bad?"#ff6b5e":"#6dffa8",a:"center"});
    if(flash) { rr(c,dx+12,dy+12,dw-24,dh-24,6); c.fillStyle="rgba(255,255,255,"+(flash*.15)+")"; c.fill(); }
    T(c,"ТАБЛО",dx+20,dy+dh+16,{s:10,w:700,c:P.muted});
    T(c,"опитувань датчика: "+st.reads,dx+dw,dy+dh+16,{s:11,f:FM,c:P.muted,a:"right"});
    // стрічка значень
    const n=st.sc.n, y0=318;
    T(c,"ПОКАЗАНО",24,y0,{s:10,w:700,c:P.muted});
    for(let i=0;i<n;i++){
      const x=24+i*(592/n), w=592/n-8, v=st.tape[i];
      rr(c,x,y0+14,w,44,6); c.fillStyle=v===undefined?alpha(P.sc_metal,.18):P.panel; c.fill(); c.strokeStyle=P.line; c.lineWidth=1; c.stroke();
      T(c,"№"+(i+1),x+6,y0+24,{s:9,w:600,c:P.muted});
      if(v!==undefined) T(c,String(v),x+w/2,y0+42,{s:15,w:700,f:FM,c:(v==="ERR"||v==="FAIL")?P.bad:P.ink,a:"center"});
    }
    if(st.tape.length>n) T(c,"+ зайві: "+(st.tape.length-n),616,y0,{s:11,w:700,c:P.bad,a:"right"});
  }
};

/* ---------------- Мотор ---------------- */
SCENES.motor={
  init(sc){ return {sc,status:sc.jobs.map(()=>null),cur:-1,running:false,hot:false,jam:false,ang:0,temp:30}; },
  dur(ev){ return {start:.4,run:.9,cool:.8,clear:.8,stop:.4}[ev.t]||.4; },
  step(st,ev){
    if(ev.t==="start") st.running=true;
    if(ev.t==="stop") st.running=false;
    if(ev.t==="run"){ st.cur=ev.k; st.status[ev.k]=ev.o==="ok"?"ok":ev.o; if(ev.o==="hot") st.hot=true; if(ev.o==="jam") st.jam=true; }
    if(ev.t==="cool"){ st.hot=false; if(st.cur>=0) st.status[st.cur]="hot-fixed"; }
    if(ev.t==="clear"){ st.jam=false; if(st.cur>=0) st.status[st.cur]="jam-fixed"; }
  },
  draw(c,st,T0,dt){
    const P=PAL,a=st.anim,sc=st.sc;
    c.fillStyle=P.sc_sky; c.fillRect(0,0,640,400);
    c.fillStyle=P.sc_floor; c.fillRect(0,330,640,70);
    // черга завдань
    const n=sc.jobs.length, cw=Math.min(98,(608-(n-1)*6)/n);
    sc.jobs.forEach((j,i)=>{
      const x=16+i*(cw+6), s=st.status[i];
      rr(c,x,16,cw,40,6);
      c.fillStyle=s==="ok"?alpha(P.ok,.18):s==="hot"?alpha(P.bad,.22):s==="jam"?alpha(P.warn,.25):s?alpha(P.ok,.12):P.panel; c.fill();
      c.strokeStyle=i===st.cur?P.accent:P.line; c.lineWidth=i===st.cur?2.5:1; c.stroke();
      T(c,j,x+cw/2,31,{s:11,w:600,a:"center"});
      T(c,s==="ok"?"готово":s==="hot"?"перегрів":s==="jam"?"заклинило":s==="hot-fixed"?"охолоджено":s==="jam-fixed"?"усунуто":"чекає",x+cw/2,46,{s:9,w:600,c:P.muted,a:"center"});
    });
    // шестерня
    const running=st.running&&!st.jam, fast=a&&a.ev.t==="run";
    if(running) st.ang+=dt*(fast?7:2.5);
    const target=st.hot?95:running?55:30; st.temp+= (target-st.temp)*Math.min(1,dt*2);
    if(a&&a.ev.t==="cool") st.temp+=(30-st.temp)*Math.min(1,dt*4);
    let gx=320,gy=200; if(st.jam&&a&&a.ev.t==="run") gx+=Math.sin(T0*70)*3;
    const R=70, teeth=12;
    c.save(); c.translate(gx,gy); c.rotate(st.ang);
    c.beginPath(); for(let i=0;i<teeth*2;i++){ const r=i%2?R:R+14, a0=i*Math.PI/teeth, a1=(i+1)*Math.PI/teeth; c.lineTo(Math.cos(a0)*r,Math.sin(a0)*r); c.lineTo(Math.cos(a1)*r,Math.sin(a1)*r); }
    c.closePath(); c.fillStyle=st.hot?P.bad:st.jam?P.warn:running?P.accent:P.sc_metal; c.fill();
    circ(c,0,0,26,P.sc_sky); circ(c,0,0,10,P.sc_metal2);
    for(let k=0;k<4;k++){ c.rotate(Math.PI/2); c.fillStyle=alpha(P.sc_belt,.25); c.fillRect(30,-4,30,8); }
    c.restore();
    // дим
    if(st.hot){ for(let k=0;k<7;k++){ const t=(T0*.6+k/7)%1; circ(c,gx-30+k*10+Math.sin(T0+k)*8,gy-90-t*80,8+t*14,alpha(P.sc_metal2,.35*(1-t))); } }
    if(a&&a.ev.t==="cool"){ for(let k=0;k<10;k++){ const t=(a.p*2+k/10)%1; circ(c,gx+130-t*90,gy-30+k*7,3,alpha(P.p_blue,1-t)); } T(c,"охолодження",gx+120,gy-50,{s:12,w:700,c:P.p_blue,a:"center"}); }
    if(a&&a.ev.t==="clear"){ c.save(); c.translate(gx+90,gy+60); c.rotate(-.6+Math.sin(a.p*12)*.4); c.fillStyle=P.sc_metal2; c.fillRect(-4,-30,8,44); circ(c,0,-34,10,P.sc_metal2); circ(c,0,-38,5,P.sc_sky); c.restore(); T(c,"усунення",gx+110,gy+20,{s:12,w:700,c:P.warn,a:"center"}); }
    // індикатори
    const lamps=[["RUN",st.running,P.ok],["HOT",st.hot,P.bad],["JAM",st.jam,P.warn]];
    panel(c,24,110,100,140);
    lamps.forEach(([l,on,col],i)=>{ circ(c,48,140+i*40,11,on?col:alpha(col,.15)); T(c,l,68,141+i*40,{s:13,w:700,f:FM,c:on?P.ink:P.muted}); });
    // термометр
    panel(c,520,110,96,170);
    T(c,"ТЕМП.",568,128,{s:10,w:700,c:P.muted,a:"center"});
    rr(c,560,142,16,110,8); c.strokeStyle=P.ink; c.lineWidth=1.5; c.stroke();
    const h=clamp((st.temp-20)/90,0,1)*104; c.fillStyle=st.temp>80?P.bad:st.temp>50?P.warn:P.ok; rr(c,563,249-h,10,h,5); c.fill();
    T(c,Math.round(st.temp)+"°",568,266,{s:12,w:700,f:FM,a:"center"});
    if(a&&a.ev.t==="run"){ T(c,"обробка: "+a.ev.job,gx,gy+110,{s:13,w:600,a:"center"}); }
  }
};
