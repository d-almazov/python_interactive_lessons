/* ============ CORE: світи, рівні, запуск Python (без DOM) ============ */
"use strict";

function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const ri=(r,a,b)=>a+Math.floor(r()*(b-a+1));
const pick=(r,arr)=>arr[Math.floor(r()*arr.length)];
function shuffle(r,a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const OK=(msg)=>({ok:true,msg:msg||"Усе правильно!"});
const FAIL=(msg)=>({ok:false,msg});
const pyLit=v=> typeof v==="boolean" ? (v?"True":"False") : typeof v==="string" ? JSON.stringify(v) : Array.isArray(v) ? "["+v.map(pyLit).join(", ")+"]" : String(v);
const varsPrelude=vars=>Object.entries(vars).map(([k,v])=>k+" = "+pyLit(v)).join("\n")+"\n";
const fmtVal=v=> typeof v==="string" ? '"'+v+'"' : String(v);

class WErr{ constructor(type,msg){ this.type=type; this.msg=msg; } }
class World{
  constructor(sc){ this.sc=sc; this.events=[]; this.steps=0; this.maxSteps=600; }
  emit(e){ this.events.push(e); }
  err(type,msg){ throw new WErr(type,msg); }
  call(name,args){
    if(++this.steps>this.maxSteps) throw new WErr("_Halt","Робот отримав понад "+this.maxSteps+" команд і зупинився. Схоже, цикл ніколи не закінчується.");
    const f=this["api_"+name];
    if(!f) throw new WErr("RobotError","Невідома команда: "+name);
    return f.apply(this,args);
  }
  finish(){}
}

const COMMON_PRELUDE = `
class RobotError(Exception):
    pass
class SensorError(Exception):
    pass
class OverheatError(Exception):
    pass
class JamError(Exception):
    pass
class ScanError(Exception):
    pass
class _Halt(BaseException):
    pass
_E = {"RobotError": RobotError, "SensorError": SensorError, "OverheatError": OverheatError, "JamError": JamError, "ScanError": ScanError, "_Halt": _Halt}
def _c(name, *a):
    r = _js(name, *a)
    if type(r) is list and len(r) == 3 and r[0] == "__err__":
        raise _E[r[1]](r[2])
    return r
`;

/* ---------- Теплиця / перехрестя: прості команди ---------- */
class CmdWorld extends World{
  constructor(sc){ super(sc); this.cmds=[]; }
  api_act(name){ this.cmds.push(name); this.emit({t:name}); return null; }
}
const cmdPrelude=(names)=>names.map(n=>`def ${n}():\n    _c("act", "${n}")\n`).join("");

/* ---------- Палетизатор ---------- */
const PAL_W=8, PAL_H=5;
class PalletWorld extends World{
  constructor(sc){ super(sc); this.boxes={}; this.order=[]; }
  api_place(x,y,color){
    if(!Number.isInteger(x)||!Number.isInteger(y)) this.err("RobotError","Координати мають бути цілими числами, а отримано ("+x+", "+y+").");
    if(x<0||x>=PAL_W||y<0||y>=PAL_H) this.err("RobotError","Позиція ("+x+", "+y+") поза палетою. x від 0 до "+(PAL_W-1)+", y від 0 до "+(PAL_H-1)+".");
    if(color!=="orange"&&color!=="blue") this.err("RobotError",'Колір має бути "orange" або "blue", а отримано '+fmtVal(color)+".");
    const k=x+","+y;
    if(this.boxes[k]){ this.emit({t:"bump",x,y}); this.err("RobotError","Місце ("+x+", "+y+") уже зайняте."); }
    if(y>0&&!this.boxes[x+","+(y-1)]){ this.emit({t:"bump",x,y}); this.err("RobotError","Ящик у ("+x+", "+y+") висів би в повітрі: під ним порожньо. Спершу заповни нижній ряд."); }
    this.boxes[k]=color; this.order.push({x,y,color});
    this.emit({t:"place",x,y,color});
    return null;
  }
}
function checkPallet(w,sc,useColor){
  const exp=sc.target, got=w.boxes;
  for(const t of exp){
    const g=got[t.x+","+t.y];
    if(!g) return FAIL("Бракує ящика на позиції ("+t.x+", "+t.y+").");
    if(useColor&&g!==t.color) return FAIL("Ящик на ("+t.x+", "+t.y+') має бути "'+t.color+'", а поставлено "'+g+'".');
  }
  const extra=Object.keys(got).filter(k=>!exp.some(t=>t.x+","+t.y===k));
  if(extra.length) return FAIL("Зайвий ящик на позиції ("+extra[0]+"). Його немає в завданні.");
  return OK("Палету складено: "+exp.length+" ящиків.");
}

/* ---------- Конвеєр ---------- */
class BeltWorld extends World{
  constructor(sc){ super(sc); this.parts=sc.parts.map(p=>Object.assign({},p,{dest:null})); this.idx=0; this.cur=null; this.stopped=false; this.nextAfterStop=false; }
  visible(p){ const o={id:p.id}; for(const k of this.sc.attrs) o[k]=p[k]; return o; }
  api_next(){
    if(this.stopped){ this.nextAfterStop=true; return null; }
    if(this.cur&&!this.cur.dest){ this.cur.dest="end"; this.emit({t:"pass",id:this.cur.id}); }
    if(this.idx>=this.parts.length){ this.cur=null; return null; }
    this.cur=this.parts[this.idx++];
    this.emit({t:"arrive",id:this.cur.id});
    return this.visible(this.cur);
  }
  need(){
    if(this.stopped) this.err("RobotError","Лінію вже зупинено, команди не виконуються.");
    if(!this.cur) this.err("RobotError","На станції зараз немає деталі. Команди сортування треба викликати всередині циклу for.");
    if(this.cur.dest) this.err("RobotError","Деталь №"+(this.cur.id+1)+" вже відправлено. Для однієї деталі — одна команда.");
  }
  api_act(dest){ this.need(); this.cur.dest=dest; this.emit({t:dest,id:this.cur.id}); return null; }
  api_stop(){
    if(this.stopped) return null;
    this.stopped=true;
    if(this.cur&&!this.cur.dest) this.cur.dest="stop";
    this.emit({t:"stop",id:this.cur?this.cur.id:-1});
    return null;
  }
  api_scan(id){
    this.need();
    if(id!==this.cur.id) this.err("RobotError","Сканер бачить лише деталь, що стоїть на станції.");
    if(this.cur.dirty){ this.emit({t:"scanerr",id}); this.err("ScanError","Маркування деталі №"+(id+1)+" забруднене, код не прочитано."); }
    this.emit({t:"scan",id,code:this.cur.code});
    return this.cur.code;
  }
  finish(err){ if(!err&&this.cur&&!this.cur.dest&&!this.stopped){ this.cur.dest="end"; this.emit({t:"pass",id:this.cur.id}); } }
}
const BELT_PRELUDE=`
class Part:
    def __init__(self, d):
        for k in d:
            setattr(self, k, d[k])
    def __repr__(self):
        return "Part(" + str(getattr(self, "color", "?")) + ")"
class _Conveyor:
    def __iter__(self):
        return self
    def __next__(self):
        d = _c("next")
        if d is None:
            raise StopIteration
        return Part(d)
conveyor = _Conveyor()
`;
function checkBelt(w,lv,expFn){
  if(w.nextAfterStop) return FAIL("Після emergency_stop() цикл перейшов до наступної деталі. Одразу після зупинки потрібен break.");
  for(const p of w.parts){
    const exp=expFn(p,w), got=p.dest||"none";
    if(exp!==got){
      return FAIL("Деталь №"+(p.id+1)+" ("+lv.describe(p)+") мала "+lv.destName[exp]+", а "+lv.destNameGot[got]+".");
    }
    if(exp==="stop") break;
  }
  return OK();
}
function expUntilHot(rest){ return (p,w)=>{ const hotIdx=w.parts.findIndex(q=>q.hot); if(hotIdx>=0&&p.id>hotIdx) return "none"; if(p.hot) return "stop"; return rest(p); }; }

/* ---------- Сітка (коридор і лабіринт) ---------- */
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const ek=(x1,y1,x2,y2)=> (x1<x2||(x1===x2&&y1<y2)) ? x1+","+y1+"|"+x2+","+y2 : x2+","+y2+"|"+x1+","+y1;
class GridWorld extends World{
  constructor(sc){ super(sc); this.x=sc.path[0][0]; this.y=sc.path[0][1]; this.dir=sc.dir; this.maxSteps=500; this.open=new Set(); for(let i=1;i<sc.path.length;i++){ const a=sc.path[i-1],b=sc.path[i]; this.open.add(ek(a[0],a[1],b[0],b[1])); } this.goal=sc.path[sc.path.length-1]; }
  canGo(d){ const nx=this.x+DIRS[d][0], ny=this.y+DIRS[d][1]; return this.open.has(ek(this.x,this.y,nx,ny)); }
  api_forward(){ if(!this.canGo(this.dir)){ this.emit({t:"crash"}); this.err("RobotError","Робот врізався в стіну."); } this.x+=DIRS[this.dir][0]; this.y+=DIRS[this.dir][1]; this.emit({t:"move",x:this.x,y:this.y}); return null; }
  api_turn(d){ this.dir=(this.dir+d+4)%4; this.emit({t:"turn",dir:this.dir,d}); return null; }
  api_wall(rel){ const d=(this.dir+rel+4)%4; const w=!this.canGo(d); this.emit({t:"sense",dir:d,wall:w}); return w; }
  api_at_goal(){ return this.x===this.goal[0]&&this.y===this.goal[1]; }
}
const GRID_PRELUDE=`
class _Robot:
    def forward(self):
        _c("forward")
    def turn_left(self):
        _c("turn", -1)
    def turn_right(self):
        _c("turn", 1)
    def wall_ahead(self):
        return _c("wall", 0)
    def wall_left(self):
        return _c("wall", -1)
    def wall_right(self):
        return _c("wall", 1)
    def at_goal(self):
        return _c("at_goal")
robot = _Robot()
`;
function genMazePath(r,W,H,minLen,maxLen){
  for(let attempt=0;attempt<300;attempt++){
    const target=ri(r,minLen,maxLen);
    const start=[0,ri(r,0,H-1)];
    const path=[start], seen=new Set([start.join()]);
    let budget=6000;
    const dfs=()=>{
      if(path.length>=target) return true;
      if(--budget<0) return false;
      const [x,y]=path[path.length-1];
      for(const d of shuffle(r,[0,1,2,3])){
        const nx=x+DIRS[d][0], ny=y+DIRS[d][1], k=nx+","+ny;
        if(nx<0||ny<0||nx>=W||ny>=H||seen.has(k)) continue;
        path.push([nx,ny]); seen.add(k);
        if(dfs()) return true;
        path.pop(); seen.delete(k);
      }
      return false;
    };
    if(dfs()){
      let turns=0; for(let i=2;i<path.length;i++){ const a=path[i-2],b=path[i-1],c=path[i]; if((b[0]-a[0])!==(c[0]-b[0])||(b[1]-a[1])!==(c[1]-b[1])) turns++; }
      if(turns>=4) return path;
    }
  }
  return [[0,0],[1,0],[2,0],[2,1],[3,1],[3,2],[4,2],[4,3],[5,3]];
}
const dirOf=(a,b)=>DIRS.findIndex(d=>d[0]===b[0]-a[0]&&d[1]===b[1]-a[1]);

/* ---------- Марсохід ---------- */
const ROVER_LEN=18;
class RoverWorld extends World{
  constructor(sc){ super(sc); this.pos=0; this.bat=sc.battery; this.samples=new Set(sc.samples); this.collected=[]; this.home=false; }
  alive(){ if(this.home) this.err("RobotError","Марсохід уже на базі й більше не рухається."); }
  api_battery(){ return this.bat; }
  api_forward(){
    this.alive();
    if(this.bat<5){ this.emit({t:"dead"}); this.err("RobotError","Батарея розряджена, марсохід застряг."); }
    if(this.pos+1===this.sc.storm){ this.emit({t:"crash"}); this.err("RobotError","Марсохід заїхав у пилову бурю й пошкодив сонячні панелі."); }
    if(this.pos+1>=ROVER_LEN) this.err("RobotError","Далі траси немає.");
    this.pos++; this.bat-=5; this.emit({t:"move",pos:this.pos,bat:this.bat}); return null;
  }
  api_sample(){ this.alive(); const s=this.samples.has(this.pos); this.emit({t:"sense",hit:s}); return s; }
  api_collect(){ this.alive(); if(!this.samples.has(this.pos)) this.err("RobotError","На клітинці "+this.pos+" немає зразка."); this.samples.delete(this.pos); this.collected.push(this.pos); this.emit({t:"collect",pos:this.pos}); return null; }
  api_storm(){ this.alive(); const s=this.pos+1===this.sc.storm; this.emit({t:"look",hit:s}); return s; }
  api_home(){ this.alive(); if(this.bat<20){ this.emit({t:"dead"}); this.err("RobotError","Заряду "+this.bat+"% не вистачить на повернення (потрібно щонайменше 20%)."); } this.home=true; this.emit({t:"home",from:this.pos}); return null; }
}
const ROVER_PRELUDE=`
class _Rover:
    @property
    def battery(self):
        return _c("battery")
    def forward(self):
        _c("forward")
    def sample_here(self):
        return _c("sample")
    def collect(self):
        _c("collect")
    def storm_ahead(self):
        return _c("storm")
    def go_home(self):
        _c("home")
rover = _Rover()
`;

/* ---------- Станція датчиків і мотор ---------- */
class StationWorld extends World{
  constructor(sc){ super(sc); this.ri=0; this.reads=0; this.shown=[]; this.ji=0; this.running=false; this.hot=false; this.jam=false; }
  api_read(){
    const o=this.sc.stream[this.ri++]||{ok:true,v:22.4};
    this.reads++;
    if(!o.ok){ this.emit({t:"read",ok:false}); this.err("SensorError","Датчик не відповів (збій зв'язку)."); }
    this.emit({t:"read",ok:true,v:o.v}); return o.v;
  }
  api_show(v){ if(v===null||v===undefined) v="None"; this.shown.push(v); this.emit({t:"show",v}); return null; }
  api_start(){
    if(this.running) this.err("RobotError","Мотор уже працює: після попереднього завдання не викликано motor.stop().");
    if(this.hot) this.err("RobotError","Мотор перегрітий. Спершу motor.cool().");
    if(this.jam) this.err("RobotError","Мотор заклинило. Спершу motor.clear().");
    this.running=true; this.emit({t:"start"}); return null;
  }
  api_run(job){
    if(!this.running) this.err("RobotError","Мотор не запущено. Спершу motor.start().");
    const k=this.ji, exp=this.sc.jobs[k];
    if(k>=this.sc.jobs.length) this.err("RobotError","Усі завдання вже виконано.");
    if(job!==exp) this.err("RobotError","Зараз черга завдання «"+exp+"», а отримано «"+job+"».");
    this.ji++;
    const o=this.sc.outcomes[k];
    this.emit({t:"run",job,o,k});
    if(o==="hot"){ this.hot=true; this.err("OverheatError","Мотор перегрівся на завданні «"+job+"»."); }
    if(o==="jam"){ this.jam=true; this.err("JamError","Деталь «"+job+"» застрягла у верстаті."); }
    return null;
  }
  api_cool(){ if(!this.hot) this.err("RobotError","Мотор не перегрітий, cool() тут не потрібен."); this.hot=false; this.emit({t:"cool"}); return null; }
  api_clear(){ if(!this.jam) this.err("RobotError","Мотор не заклинило, clear() тут не потрібен."); this.jam=false; this.emit({t:"clear"}); return null; }
  api_stop(){ this.running=false; this.emit({t:"stop"}); return null; }
}
const SENSOR_PRELUDE=`
class _Sensor:
    def read(self):
        return _c("read")
sensor = _Sensor()
class _Display:
    def show(self, value):
        _c("show", value)
display = _Display()
`;
const MOTOR_PRELUDE=`
class _Motor:
    def start(self):
        _c("start")
    def run(self, job):
        _c("run", job)
    def stop(self):
        _c("stop")
    def cool(self):
        _c("cool")
    def clear(self):
        _c("clear")
motor = _Motor()
`;
const sval=v=> typeof v==="number" ? String(Math.round(v*100)/100) : String(v);
function checkDisplay(w,expected,expReads,labelFn){
  for(let i=0;i<Math.max(expected.length,w.shown.length);i++){
    const e=expected[i], g=w.shown[i];
    if(g===undefined) return FAIL("На табло показано значень: "+w.shown.length+" із "+expected.length+". Наступним мало бути "+fmtVal(e)+".");
    if(e===undefined) return FAIL("На табло з'явилося зайве значення "+fmtVal(g)+".");
    if(sval(e)!==sval(g)) return FAIL(labelFn(i)+": очікувалося "+fmtVal(e)+", а показано "+fmtVal(g)+".");
  }
  if(w.reads!==expReads) return FAIL("Кількість опитувань датчика: "+w.reads+", а має бути рівно "+expReads+".");
  return OK();
}
function genStream(r,n,errRate){
  const s=[];
  for(let i=0;i<n;i++){ s.push(r()<errRate?{ok:false}:{ok:true,v:Math.round((19+r()*8)*10)/10}); }
  s.forEach(o=>{ if(o.ok&&Math.round(o.v*10)%10===0) o.v=Math.round((o.v+0.3)*10)/10; });
  return s;
}

/* ================= РІВНІ ================= */
const LEVELS=[
/* ---------- Розділ 1. Умови ---------- */
{
  id:"st-01", ch:1, scene:"green", title:"Полив теплиці", topic:"if / else",
  brief:"Автоматична теплиця щоранку вимірює вологість ґрунту. Якщо земля пересохла, треба ввімкнути насос, а якщо вологи досить, насос має стояти вимкненим.",
  task:["Датчик уже виміряв вологість ґрунту й записав її у змінну <code>humidity</code> (з англійської «вологість»). Це число у відсотках, наприклад 35 або 62. Створювати цю змінну не треба, просто користуйся нею.", "Якщо <code>humidity</code> менша за 40, земля пересохла. Тоді виклич <code>pump_on()</code>, і насос почне поливати.", "Інакше, тобто коли вологість 40 або більше, виклич <code>pump_off()</code>, щоб насос не працював.", "Насос має отримати рівно одну команду: або ввімкнутися, або вимкнутися. Тому тут потрібна пара <code>if</code> та <code>else</code>."],
  api:[["humidity", "вологість ґрунту у відсотках", "англ. <i>humidity</i> — «вологість»"], ["pump_on()", "вмикає насос", "англ. <i>pump on</i> — «увімкнути насос»"], ["pump_off()", "вимикає насос", "англ. <i>pump off</i> — «вимкнути насос»"]],
  starter:`# humidity — вологість ґрунту у відсотках (її вже виміряв датчик)
print("Вологість:", humidity)

# Якщо вологість менша за 40 — увімкни насос,
# інакше — вимкни його.
if humidity < 40:
    pump_on()
`,
  solution:`print("Вологість:", humidity)
if humidity < 40:
    pump_on()
else:
    pump_off()
`,
  hints:["Друга гілка пишеться словом <code>else:</code> на тому самому рівні відступу, що й <code>if</code>.","Під <code>else:</code> додай рядок із відступом 4 пробіли: <code>pump_off()</code>.","Перевір межу: при вологості рівно 40 насос має бути вимкнений, бо 40 не менше за 40."],
  devices:[["pump","Насос"]], readouts:["humidity"],
  count:5,
  gen(r,i){ const h=[28,40,39,ri(r,41,90),ri(r,5,38)][i]; return {vars:{humidity:h}}; },
  label:sc=>"вологість "+sc.vars.humidity+"%",
  world:sc=>new CmdWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+cmdPrelude(["pump_on","pump_off"]),
  check(w,sc){
    const p=w.cmds.filter(c=>c.indexOf("pump")===0);
    if(!p.length) return FAIL("Насос не отримав жодної команди. При вологості "+sc.vars.humidity+"% має спрацювати одна з гілок.");
    if(p.length>1) return FAIL("Насос отримав "+p.length+" команди поспіль. Має бути рівно одна: або pump_on(), або pump_off().");
    const exp=sc.vars.humidity<40?"pump_on":"pump_off";
    if(p[0]!==exp) return FAIL("Вологість "+sc.vars.humidity+"%: очікувалося "+exp+"(), а виконано "+p[0]+"().");
    return OK();
  }
},
{
  id:"st-02", ch:1, scene:"green", title:"Клімат-контроль", topic:"elif · and / or",
  brief:"Тепер теплиця керує ще й кліматом і світлом. Контролер отримує температуру, освітленість і час доби та має вирішити, які пристрої ввімкнути.",
  task:["Програма отримує три значення. <code>temp</code> — температура повітря в градусах. <code>light</code> — освітленість у люксах. <code>is_night</code> показує, чи зараз ніч: <code>True</code> означає «так, ніч», <code>False</code> означає «ні, день».", "Спершу клімат. Якщо <code>temp</code> більша за 30, у теплиці жарко, тож виклич <code>fan_on()</code>, щоб увімкнути вентилятор.", "Інакше, якщо <code>temp</code> менша за 15, холодно, і треба ввімкнути обігрівач: <code>heater_on()</code>.", "Якщо ні те, ні інше, клімат у нормі, виклич <code>climate_ok()</code>. Рівно 30 і рівно 15 градусів теж вважаються нормою.", "Потім, окремою перевіркою, світло. Якщо зараз ніч <b>або</b> освітленість менша за 200, рослинам темно, і треба ввімкнути лампу: <code>lamp_on()</code>. Якщо світла досить, нічого не роби."],
  api:[["temp", "температура повітря, °C", "англ. <i>temperature</i> — «температура»"], ["light", "освітленість, лк", "англ. <i>light</i> — «світло»"], ["is_night", "True, якщо зараз ніч; False, якщо день", "англ. <i>is night</i> — «чи зараз ніч»"], ["fan_on()", "вмикає вентилятор", "англ. <i>fan on</i> — «увімкнути вентилятор»"], ["heater_on()", "вмикає обігрівач", "англ. <i>heater on</i> — «увімкнути обігрівач»"], ["climate_ok()", "повідомляє, що клімат у нормі", "англ. <i>climate OK</i> — «клімат у порядку»"], ["lamp_on()", "вмикає фітолампу", "англ. <i>lamp on</i> — «увімкнути лампу»"]],
  starter:`print("Температура:", temp, "Освітленість:", light, "Ніч:", is_night)

# 1) Клімат: понад 30° — вентилятор, нижче 15° — обігрівач,
#    інакше — climate_ok()


# 2) Світло: якщо ніч АБО освітленість менша за 200 — лампа

`,
  solution:`if temp > 30:
    fan_on()
elif temp < 15:
    heater_on()
else:
    climate_ok()
if is_night or light < 200:
    lamp_on()
`,
  hints:["Клімат — це одна конструкція з трьома гілками: <code>if</code> … <code>elif</code> … <code>else</code>.","Для лампи потрібен окремий <code>if</code>: вона не залежить від того, яка кліматична гілка спрацювала.","Умова для лампи: <code>if is_night or light &lt; 200:</code>"],
  devices:[["fan","Вентилятор"],["heater","Обігрівач"],["ok","Клімат у нормі"],["lamp","Фітолампа"]], readouts:["temp","light","is_night"],
  count:6,
  gen(r,i){
    const fixed=[[34,650,false],[30,199,false],[15,820,true],[14,200,false]];
    if(i<4) return {vars:{temp:fixed[i][0],light:fixed[i][1],is_night:fixed[i][2]}};
    const t= i===4 ? ri(r,16,29) : (r()<.5?ri(r,31,40):ri(r,2,14));
    return {vars:{temp:t,light:ri(r,5,90)*10,is_night:r()<.5}};
  },
  label:sc=>sc.vars.temp+"°, "+sc.vars.light+" лк, "+(sc.vars.is_night?"ніч":"день"),
  world:sc=>new CmdWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+cmdPrelude(["fan_on","heater_on","climate_ok","lamp_on"]),
  check(w,sc){
    const v=sc.vars, cl=w.cmds.filter(c=>c!=="lamp_on"), lamps=w.cmds.filter(c=>c==="lamp_on").length;
    const exp=v.temp>30?"fan_on":v.temp<15?"heater_on":"climate_ok";
    if(cl.length===0) return FAIL("При "+v.temp+"° не виконано жодної кліматичної команди. Очікувалося "+exp+"().");
    if(cl.length>1) return FAIL("Виконано кілька кліматичних команд: "+cl.join(", ")+". Має спрацювати лише одна гілка: використай elif і else.");
    if(cl[0]!==exp) return FAIL("При "+v.temp+"° очікувалося "+exp+"(), а виконано "+cl[0]+"().");
    const needLamp=v.is_night||v.light<200;
    if(needLamp&&lamps===0) return FAIL("Лампа мала ввімкнутися ("+(v.is_night?"зараз ніч":"освітленість "+v.light+" лк")+"), але lamp_on() не викликано.");
    if(!needLamp&&lamps>0) return FAIL("Зараз день і світла досить ("+v.light+" лк), лампа не потрібна.");
    if(lamps>1) return FAIL("lamp_on() викликано кілька разів.");
    return OK();
  }
},
{
  id:"st-03", ch:1, scene:"cross", title:"Кур'єр на перехресті", topic:"if / elif / else · not",
  brief:"Робот-кур'єр везе посилку й зупинився перед пішохідним переходом. Він бачить світлофор, пішоходів і знає свій заряд. Напиши правило, за яким він вирішує, що робити.",
  task:["Робот знає три речі. <code>battery</code> — його заряд у відсотках. <code>light</code> — колір світлофора, один із рядків <code>\"red\"</code> (червоний), <code>\"yellow\"</code> (жовтий) або <code>\"green\"</code> (зелений). <code>pedestrian</code> показує, чи є на переході людина: <code>True</code> або <code>False</code>.", "Спершу перевір заряд. Якщо <code>battery</code> менший за 15, робот має їхати на зарядку: виклич <code>charge()</code>. Світлофор і пішохід у цьому випадку вже неважливі.", "Інакше, якщо світло зелене (<code>light == \"green\"</code>) <b>і</b> пішохода немає (<code>not pedestrian</code>), можна їхати: виклич <code>go()</code>.", "У всіх інших випадках робот чекає: виклич <code>wait()</code>.", "Робот виконує рівно одну дію, тому все це має бути одна конструкція <code>if</code> / <code>elif</code> / <code>else</code>."],
  api:[["battery", "заряд робота, %", "англ. <i>battery</i> — «батарея»"], ["light", "\"red\", \"yellow\" або \"green\"", "англ. <i>light</i> — «світло»; red, yellow, green — червоний, жовтий, зелений"], ["pedestrian", "True, якщо на переході людина; інакше False", "англ. <i>pedestrian</i> — «пішохід»"], ["go()", "перетнути дорогу", "англ. <i>go</i> — «їхати»"], ["wait()", "чекати на місці", "англ. <i>wait</i> — «чекати»"], ["charge()", "поїхати на зарядку", "англ. <i>charge</i> — «заряджати»"]],
  starter:`print("Світло:", light, "| пішохід:", pedestrian, "| заряд:", battery)

# Спершу перевір заряд, потім світлофор і пішохода.
if light == "green":
    go()
else:
    wait()
`,
  solution:`if battery < 15:
    charge()
elif light == "green" and not pedestrian:
    go()
else:
    wait()
`,
  hints:["Python перевіряє гілки згори вниз і виконує першу істинну, тому заряд перевіряй першим.","Дві умови поєднують через <code>and</code>, а «немає пішохода» записують як <code>not pedestrian</code>.","Середня гілка: <code>elif light == \"green\" and not pedestrian:</code>"],
  count:7,
  gen(r,i){
    const f=[["green",false,64],["green",true,80],["red",false,55],["green",false,9],["yellow",false,70],["green",false,15]];
    if(i<6) return {vars:{light:f[i][0],pedestrian:f[i][1],battery:f[i][2]}};
    return {vars:{light:pick(r,["red","yellow","green"]),pedestrian:r()<.4,battery:ri(r,5,95)}};
  },
  label:sc=>({red:"червоне",yellow:"жовте",green:"зелене"}[sc.vars.light])+(sc.vars.pedestrian?", пішохід":"")+", "+sc.vars.battery+"%",
  world:sc=>new CmdWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+cmdPrelude(["go","wait","charge"]),
  check(w,sc){
    const v=sc.vars, exp=v.battery<15?"charge":(v.light==="green"&&!v.pedestrian)?"go":"wait";
    if(!w.cmds.length) return FAIL("Робот не отримав жодної команди. Очікувалося "+exp+"().");
    if(w.cmds.length>1) return FAIL("Робот отримав "+w.cmds.length+" команди ("+w.cmds.join(", ")+"). Має бути рівно одна.");
    if(w.cmds[0]!==exp){
      const why=exp==="charge"?"заряд лише "+v.battery+"%, спершу зарядка":exp==="go"?"зелене світло і перехід вільний":v.pedestrian&&v.light==="green"?"на переході людина":"світло не зелене";
      return FAIL("Очікувалося "+exp+"(): "+why+". А виконано "+w.cmds[0]+"().");
    }
    return OK();
  }
},
/* ---------- Розділ 2. Цикл for ---------- */
{
  id:"st-04", ch:2, scene:"pallet", title:"Палетизатор: ряди", topic:"for · range()",
  brief:"Портальний маніпулятор складає ящики на палету. Кількість ящиків щоразу інша, тому писати place() вручну не вийде: потрібен цикл.",
  task:["Змінна <code>count</code> (з англійської «кількість») каже, скільки ящиків має бути в нижньому ряду. Щоразу це інше число.", "Маніпулятор ставить ящик командою <code>arm.place(x, y)</code>. Тут <code>x</code> — номер позиції зліва направо, <code>y</code> — номер ряду знизу вгору. Обидва рахуються з нуля, тож нижній ряд — це <code>y = 0</code>.", "Нижній ряд: постав ящики на всі позиції <code>x</code> = 0, 1, 2 … до <code>count - 1</code>. Цей цикл уже є в заготовці.", "Другий ряд (<code>y = 1</code>): постав ящики на кожну другу позицію, <code>x</code> = 0, 2, 4 … і не далі за <code>count - 1</code>. Для цього знадобиться <code>range</code> із кроком 2.", "Ящик не може висіти в повітрі: під кожним ящиком другого ряду вже має стояти ящик. Тому спершу весь нижній ряд, а потім другий."],
  api:[["count", "кількість ящиків у нижньому ряду", "англ. <i>count</i> — «кількість»"], ["arm.place(x, y)", "ставить ящик на позицію x (зліва направо) у ряду y (знизу вгору)", "англ. <i>arm</i> — «рука, маніпулятор»; <i>place</i> — «поставити»"], ["range(n)", "числа 0, 1, … n-1", "англ. <i>range</i> — «діапазон»"], ["range(a, b, крок)", "числа від a до b-1 із заданим кроком", "range(0, 10, 2) дає 0, 2, 4, 6, 8"]],
  starter:`print("Ящиків у нижньому ряду:", count)

# Ряд 0: позиції 0, 1, 2, ... count-1
for x in range(count):
    arm.place(x, 0)

# Ряд 1: кожна друга позиція: 0, 2, 4, ...
# Підказка: range(старт, стоп, крок)
`,
  solution:`for x in range(count):
    arm.place(x, 0)
for x in range(0, count, 2):
    arm.place(x, 1)
`,
  hints:["<code>range(0, 10, 2)</code> дає 0, 2, 4, 6, 8. Третій аргумент — крок.","Другий цикл такий самий, як перший, але з іншим range і з y = 1.","<code>for x in range(0, count, 2):</code> і всередині <code>arm.place(x, 1)</code>"],
  count:4,
  gen(r,i){ const c=[6,5,8,3][i]; const t=[]; for(let x=0;x<c;x++) t.push({x,y:0}); for(let x=0;x<c;x+=2) t.push({x,y:1}); return {vars:{count:c},target:t}; },
  label:sc=>"count = "+sc.vars.count,
  world:sc=>new PalletWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+`class _Arm:\n    def place(self, x, y=0, color="orange"):\n        _c("place", x, y, color)\narm = _Arm()\n`,
  check:(w,sc)=>checkPallet(w,sc,false)
},
{
  id:"st-05", ch:2, scene:"pallet", title:"Шахова палета", topic:"вкладені for · %",
  brief:"Замовник хоче, щоб помаранчеві й сині ящики чергувалися як клітинки на шаховій дошці. Розмір палети щоразу інший.",
  task:["Палета має <code>cols</code> позицій у ширину і <code>rows</code> рядів у висоту (з англійської <i>columns</i> — «стовпці», <i>rows</i> — «ряди»). Розмір щоразу інший.", "Заповни ящиками всі клітинки: кожен ряд <code>y</code> від 0 до <code>rows - 1</code>, а в ньому кожну позицію <code>x</code> від 0 до <code>cols - 1</code>. Для цього потрібен цикл усередині циклу.", "Колір обирай так. Якщо <code>(x + y) % 2 == 0</code>, тобто сума x і y парна, постав помаранчевий ящик: <code>arm.place(x, y, \"orange\")</code>. Інакше постав синій: <code>arm.place(x, y, \"blue\")</code>.", "Заповнюй знизу вгору, ряд за рядом, інакше ящики висітимуть у повітрі. Тому зовнішній цикл перебирає ряди <code>y</code>, а внутрішній — позиції <code>x</code> у ряду."],
  api:[["cols, rows", "ширина й висота палети", "англ. <i>columns</i> — «стовпці»; <i>rows</i> — «ряди»"], ["arm.place(x, y, \"orange\")", "ставить ящик заданого кольору: \"orange\" або \"blue\"", "англ. <i>place</i> — «поставити»; orange — помаранчевий, blue — синій"], ["a % 2", "остача від ділення на 2: 0 для парних чисел, 1 для непарних", "знак % у Python означає остачу від ділення"]],
  starter:`print("Розмір палети:", cols, "x", rows)

for y in range(rows):
    # пройди всі x у ряду y і постав ящик потрібного кольору
    pass
`,
  solution:`for y in range(rows):
    for x in range(cols):
        if (x + y) % 2 == 0:
            arm.place(x, y, "orange")
        else:
            arm.place(x, y, "blue")
`,
  hints:["Усередині циклу по <code>y</code> потрібен ще один цикл: <code>for x in range(cols):</code>.","Колір вибирай умовою всередині внутрішнього циклу.","Зовнішній цикл — ряди (y), внутрішній — позиції в ряду (x). Так нижній ряд заповниться повністю, перш ніж маніпулятор візьметься за наступний."],
  count:4,
  gen(r,i){ const [c,rw]=[[5,3],[4,2],[7,4],[8,5]][i]; const t=[]; for(let y=0;y<rw;y++) for(let x=0;x<c;x++) t.push({x,y,color:(x+y)%2===0?"orange":"blue"}); return {vars:{cols:c,rows:rw},target:t}; },
  label:sc=>sc.vars.cols+" × "+sc.vars.rows,
  world:sc=>new PalletWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+`class _Arm:\n    def place(self, x, y=0, color="orange"):\n        _c("place", x, y, color)\narm = _Arm()\n`,
  check:(w,sc)=>checkPallet(w,sc,true)
},
{
  id:"st-06", ch:2, scene:"belt", title:"Сортування за кольором", topic:"for … in · if / elif",
  brief:"Стрічкою їдуть деталі різних кольорів. Біля станції стоїть сортувальник: він може зіштовхнути деталь ліворуч, праворуч або пропустити далі.",
  task:["<code>conveyor</code> (з англійської «конвеєр») — це список деталей на стрічці. Цикл <code>for part in conveyor:</code> бере їх по одній, і всередині циклу поточна деталь називається <code>part</code> («деталь»).", "Колір деталі лежить у <code>part.color</code> (<i>color</i> — «колір»). Це рядок <code>\"red\"</code>, <code>\"blue\"</code>, <code>\"green\"</code> або <code>\"yellow\"</code>.", "Якщо деталь червона (<code>part.color == \"red\"</code>), зіштовхни її в лівий контейнер: <code>push_left()</code>.", "Інакше, якщо вона синя (<code>\"blue\"</code>), зіштовхни її в правий контейнер: <code>push_right()</code>.", "Усі інші деталі пропусти далі командою <code>let_pass()</code>, вони доїдуть до кінця стрічки. Кожна деталь отримує рівно одну команду."],
  api:[["for part in conveyor:", "по черзі бере кожну деталь зі стрічки", "англ. <i>part</i> — «деталь»; <i>conveyor</i> — «конвеєр»"], ["part.color", "\"red\", \"blue\", \"green\" або \"yellow\"", "англ. <i>color</i> — «колір»; червоний, синій, зелений, жовтий"], ["part.weight", "вага деталі в грамах (для сортування не потрібна)", "англ. <i>weight</i> — «вага»"], ["push_left()", "штовхає деталь у лівий контейнер", "англ. <i>push left</i> — «штовхнути ліворуч»"], ["push_right()", "штовхає деталь у правий контейнер", "англ. <i>push right</i> — «штовхнути праворуч»"], ["let_pass()", "пропускає деталь далі по стрічці", "англ. <i>let pass</i> — «пропустити»"]],
  starter:`for part in conveyor:
    print("Деталь:", part.color, part.weight, "г")
    # червоні — push_left(), сині — push_right(),
    # усі інші — let_pass()
`,
  solution:`for part in conveyor:
    if part.color == "red":
        push_left()
    elif part.color == "blue":
        push_right()
    else:
        let_pass()
`,
  hints:["Тіло циклу виконується окремо для кожної деталі. Колір поточної деталі — <code>part.color</code>.","Порівнюй рядки так: <code>if part.color == \"red\":</code>","Для решти кольорів — гілка <code>else:</code> з <code>let_pass()</code>."],
  bins:{left:"ЧЕРВОНІ",right:"СИНІ",end:"ІНШІ"},
  destName:{left:"піти ліворуч",right:"піти праворуч",end:"поїхати далі",pack:"",stop:"",none:""},
  destNameGot:{left:"пішла ліворуч",right:"пішла праворуч",end:"поїхала далі",none:"не оброблена"},
  describe:p=>({red:"червона",blue:"синя",green:"зелена",yellow:"жовта"}[p.color]),
  count:4,
  gen(r){ const n=ri(r,8,10), parts=[]; for(let i=0;i<n;i++) parts.push({id:i,color:pick(r,["red","red","blue","blue","green","yellow"]),weight:ri(r,8,40)*5}); return {parts,attrs:["color","weight"]}; },
  label:sc=>sc.parts.length+" деталей",
  world:sc=>new BeltWorld(sc),
  prelude:()=>BELT_PRELUDE+`def push_left():\n    _c("act", "left")\ndef push_right():\n    _c("act", "right")\ndef let_pass():\n    _c("act", "end")\n`,
  check(w){ return checkBelt(w,this,p=>p.color==="red"?"left":p.color==="blue"?"right":"end"); }
},
{
  id:"st-07", ch:2, scene:"belt", title:"Брак і аварія", topic:"continue · break",
  brief:"На пакувальній лінії трапляються деталі з браком, а іноді й перегріті. Брак не пакуємо: він сам доїде до контейнера в кінці стрічки. Перегріта деталь — привід негайно зупинити всю лінію.",
  task:["Перебирай деталі так само, як на попередній станції: <code>for part in conveyor:</code>.", "У кожної деталі є дві позначки: <code>part.hot</code> («гаряча») і <code>part.defect</code> («брак»). Кожна з них дорівнює <code>True</code> або <code>False</code>.", "Спершу перевір, чи деталь перегріта. Якщо <code>part.hot</code> дорівнює <code>True</code>, виклич <code>emergency_stop()</code>, щоб аварійно зупинити лінію, і одразу вийди з циклу командою <code>break</code>. Решту деталей уже не обробляємо.", "Потім перевір брак. Якщо <code>part.defect</code> дорівнює <code>True</code>, напиши <code>continue</code>. Цикл одразу перейде до наступної деталі, а ця залишиться незапакованою.", "Якщо деталь не гаряча і без браку, запакуй її: <code>pack()</code>."],
  api:[["part.hot", "True, якщо деталь перегріта", "англ. <i>hot</i> — «гарячий»"], ["part.defect", "True, якщо деталь з браком", "англ. <i>defect</i> — «дефект, брак»"], ["pack()", "пакує деталь", "англ. <i>pack</i> — «пакувати»"], ["emergency_stop()", "аварійно зупиняє всю лінію", "англ. <i>emergency stop</i> — «аварійна зупинка»"], ["continue", "пропускає решту рядків циклу й переходить до наступної деталі", "англ. <i>continue</i> — «продовжити»"], ["break", "повністю виходить із циклу", "англ. <i>break</i> — «перервати»"]],
  starter:`for part in conveyor:
    # 1) перегріта (part.hot) — emergency_stop() і break
    # 2) з браком (part.defect) — continue
    # 3) усі інші — pack()
    pack()
`,
  solution:`for part in conveyor:
    if part.hot:
        emergency_stop()
        break
    if part.defect:
        continue
    pack()
`,
  hints:["<code>continue</code> одразу переходить до наступної деталі: рядки нижче в тілі циклу для цієї деталі не виконуються.","Перегріту деталь перевіряй першою. Після <code>emergency_stop()</code> рядком нижче з тим самим відступом напиши <code>break</code>.","<code>if part.defect:</code> → <code>continue</code>, а після цієї перевірки просто <code>pack()</code>."],
  bins:{left:null,right:"ПАКУВАННЯ",end:"БРАК"},
  destName:{left:"",right:"",pack:"бути запакована",end:"поїхати в брак",stop:"спричинити зупинку лінії",none:"залишитися на стрічці після зупинки"},
  destNameGot:{pack:"її запаковано",end:"вона поїхала в брак",stop:"на ній зупинили лінію",none:"її не оброблено"},
  describe:p=>p.hot?"перегріта":p.defect?"з браком":"справна",
  count:5,
  gen(r,i){
    const n=ri(r,8,11), parts=[];
    for(let k=0;k<n;k++) parts.push({id:k,color:pick(r,["green","blue","yellow"]),defect:r()<.25,hot:false});
    if(!parts.some(p=>p.defect)) parts[ri(r,1,n-2)].defect=true;
    const hotAt=[n-2,-1,3,-1,r()<.5?ri(r,2,n-1):-1][i];
    if(hotAt>=0){ parts[hotAt].hot=true; parts[hotAt].defect=false; }
    return {parts,attrs:["color","defect","hot"]};
  },
  label:sc=>sc.parts.length+" деталей"+(sc.parts.some(p=>p.hot)?", є перегріта":""),
  world:sc=>new BeltWorld(sc),
  prelude:()=>BELT_PRELUDE+`def pack():\n    _c("act", "pack")\ndef emergency_stop():\n    _c("stop")\n`,
  check(w){ return checkBelt(w,this,expUntilHot(p=>p.defect?"end":"pack")); }
},
/* ---------- Розділ 3. Цикл while ---------- */
{
  id:"st-08", ch:3, scene:"grid", title:"Коридор", topic:"while",
  brief:"Робот стоїть на початку коридору, а в кінці лежить батарейка. Довжина коридору щоразу інша, і робот не знає її наперед. Але він уміє перевіряти, чи дійшов до цілі.",
  task:["Робот стоїть на початку коридору, а десь попереду лежить батарейка. Скільки до неї кроків, наперед невідомо: щоразу відстань інша.", "<code>robot.forward()</code> (<i>forward</i> — «уперед») робить один крок уперед.", "<code>robot.at_goal()</code> (<i>at goal</i> — «біля цілі») перевіряє, чи стоїть робот на клітинці з батарейкою. Вона повертає <code>True</code>, якщо так, і <code>False</code>, якщо ще ні.", "Поки робот не біля цілі, роби крок уперед. У Python це записують так: <code>while not robot.at_goal():</code>, а нижче з відступом <code>robot.forward()</code>. Слово <code>not</code> означає «не».", "Щойно робот дійде до батарейки, умова стане хибною, і цикл зупиниться сам. Зайвий крок — і робот вріжеться в стіну."],
  api:[["robot.forward()", "робить один крок уперед", "англ. <i>forward</i> — «уперед»"], ["robot.at_goal()", "True, якщо робот на клітинці з батарейкою; інакше False", "англ. <i>at goal</i> — «біля цілі»"]],
  starter:`# Відстань до батарейки щоразу інша!
# Їдь уперед, ПОКИ робот не на цілі.
robot.forward()
robot.forward()
`,
  solution:`while not robot.at_goal():
    robot.forward()
`,
  hints:["Кількість кроків невідома, тому for з range тут не підходить. А while повторює, доки умова істинна.","Умова «не на цілі» записується як <code>not robot.at_goal()</code>.","Дві команди: <code>while not robot.at_goal():</code> і з відступом <code>robot.forward()</code>."],
  count:4,
  gen(r,i){ const n=i===0?7:ri(r,3,10); const path=[]; for(let x=0;x<n;x++) path.push([x,0]); return {path,dir:0,W:10,H:1}; },
  label:sc=>"довжина "+sc.path.length,
  world:sc=>new GridWorld(sc),
  prelude:()=>GRID_PRELUDE,
  check(w){ if(w.x!==w.goal[0]||w.y!==w.goal[1]) return FAIL("Робот зупинився, не дійшовши до батарейки. Лишилося клітинок: "+(w.goal[0]-w.x)+"."); return OK(); }
},
{
  id:"st-09", ch:3, scene:"grid", title:"Лабіринт", topic:"while · if / elif / else",
  brief:"Тепер коридор звивається. Розгалужень немає, але робот мусить сам помічати повороти: у нього є датчики стін попереду, ліворуч і праворуч.",
  task:["Ціль та сама: дійти до батарейки. Тому головний цикл знову <code>while not robot.at_goal():</code>.", "У робота три датчики стін. <code>robot.wall_ahead()</code> («стіна попереду») повертає <code>True</code>, якщо прямо перед роботом стіна. <code>robot.wall_left()</code> і <code>robot.wall_right()</code> так само перевіряють стіну ліворуч і праворуч.", "На кожному повторі циклу робот робить одну дію. Якщо попереду вільно (<code>not robot.wall_ahead()</code>), він робить крок уперед: <code>robot.forward()</code>.", "Інакше, якщо вільно ліворуч (<code>not robot.wall_left()</code>), він повертає ліворуч: <code>robot.turn_left()</code>.", "Інакше він повертає праворуч: <code>robot.turn_right()</code>.", "Поворот не зсуває робота з клітинки, а лише розвертає його. На наступному повторі циклу робот знову перевірить, що попереду."],
  api:[["robot.forward()", "робить один крок уперед", "англ. <i>forward</i> — «уперед»"], ["robot.turn_left()", "розвертає робота ліворуч на місці", "англ. <i>turn left</i> — «повернути ліворуч»"], ["robot.turn_right()", "розвертає робота праворуч на місці", "англ. <i>turn right</i> — «повернути праворуч»"], ["robot.wall_ahead()", "True, якщо попереду стіна", "англ. <i>wall ahead</i> — «стіна попереду»"], ["robot.wall_left()", "True, якщо ліворуч стіна", "англ. <i>wall left</i> — «стіна ліворуч»"], ["robot.wall_right()", "True, якщо праворуч стіна", "англ. <i>wall right</i> — «стіна праворуч»"], ["robot.at_goal()", "True, якщо робот біля батарейки", "англ. <i>at goal</i> — «біля цілі»"]],
  starter:`while not robot.at_goal():
    if not robot.wall_ahead():
        robot.forward()
    # а якщо попереду стіна? Перевір ліворуч і праворуч
`,
  solution:`while not robot.at_goal():
    if not robot.wall_ahead():
        robot.forward()
    elif not robot.wall_left():
        robot.turn_left()
    else:
        robot.turn_right()
`,
  hints:["Без поворотів робот вічно стоятиме перед стіною: умова while ніколи не стане хибною.","Додай гілку <code>elif not robot.wall_left():</code> з поворотом ліворуч.","Останній варіант — <code>else:</code> з <code>robot.turn_right()</code>. Поворот не рухає робота, тож на наступному повторі циклу він знову перевірить, що попереду."],
  count:4,
  gen(r){ const path=genMazePath(r,9,6,13,22); return {path,dir:dirOf(path[0],path[1]),W:9,H:6}; },
  label:sc=>"маршрут "+sc.path.length+" клітинок",
  world:sc=>new GridWorld(sc),
  prelude:()=>GRID_PRELUDE,
  check(w){ if(w.x!==w.goal[0]||w.y!==w.goal[1]) return FAIL("Робот не дійшов до батарейки."); return OK(); }
},
{
  id:"st-10", ch:3, scene:"rover", title:"Марсохід", topic:"while · break",
  brief:"Марсохід виїжджає з бази й збирає зразки ґрунту. Кожен крок забирає 5 % заряду. На повернення треба щонайменше 20 %. Іноді попереду пилова буря, і в неї заїжджати не можна.",
  task:["Заряд марсохода зберігається в <code>rover.battery</code> (<i>rover</i> — «марсохід», <i>battery</i> — «батарея»), у відсотках. Кожен крок забирає 5 %, а щоб повернутися на базу, потрібно щонайменше 20 %.", "Тому їдь уперед, поки заряд більший за 20: <code>while rover.battery &gt; 20:</code>.", "Перед кожним кроком перевір, чи немає попереду бурі. <code>rover.storm_ahead()</code> («буря попереду») повертає <code>True</code>, якщо на наступній клітинці буря. У такому разі перерви рух командою <code>break</code>, бо в бурю заїжджати не можна.", "Якщо бурі немає, зроби крок: <code>rover.forward()</code>.", "Після кроку перевір, чи є на цій клітинці зразок ґрунту. <code>rover.sample_here()</code> («зразок тут») повертає <code>True</code>, якщо зразок є. Тоді збери його командою <code>rover.collect()</code> («зібрати»).", "Коли цикл закінчиться, бо сів заряд або попереду буря, поверни марсохід на базу: <code>rover.go_home()</code> («їхати додому»). Цей рядок пиши після циклу, без відступу."],
  api:[["rover.battery", "заряд, % (кожен крок забирає 5)", "англ. <i>battery</i> — «батарея»"], ["rover.forward()", "робить один крок уперед", "англ. <i>forward</i> — «уперед»"], ["rover.storm_ahead()", "True, якщо на наступній клітинці буря", "англ. <i>storm ahead</i> — «буря попереду»"], ["rover.sample_here()", "True, якщо на цій клітинці є зразок", "англ. <i>sample here</i> — «зразок тут»"], ["rover.collect()", "збирає зразок", "англ. <i>collect</i> — «зібрати»"], ["rover.go_home()", "повертає марсохід на базу", "англ. <i>go home</i> — «їхати додому»"]],
  starter:`print("Заряд на старті:", rover.battery)

# Їдь уперед, поки заряд більший за 20%.
# Перед кроком: буря попереду — break.
# Після кроку: є зразок — збери його.
# Наприкінці — rover.go_home()
rover.forward()
rover.go_home()
`,
  solution:`while rover.battery > 20:
    if rover.storm_ahead():
        break
    rover.forward()
    if rover.sample_here():
        rover.collect()
rover.go_home()
`,
  hints:["Головний цикл: <code>while rover.battery &gt; 20:</code>. Умова перевіряється перед кожним новим кроком.","<code>break</code> миттєво виходить із while. Код після циклу (go_home) виконається в будь-якому разі.","Порядок у тілі циклу: перевірка бурі → <code>forward()</code> → перевірка зразка → <code>collect()</code>."],
  count:5,
  gen(r,i){
    const bats=[70,100,55,85,ri(r,12,20)*5], storms=[0,9,0,4,r()<.5?ri(r,4,12):0];
    const s=new Set(); const n=ri(r,5,8); while(s.size<n) s.add(ri(r,1,16));
    if(i===0){ [2,3,6,9].forEach(x=>s.add(x)); }
    if(storms[i]) s.delete(storms[i]);
    return {battery:bats[i],storm:storms[i]||-1,samples:[...s].sort((a,b)=>a-b)};
  },
  label:sc=>"заряд "+sc.battery+"%"+(sc.storm>0?", буря":""),
  world:sc=>new RoverWorld(sc),
  prelude:()=>ROVER_PRELUDE,
  check(w,sc){
    if(!w.home) return FAIL("Марсохід не повернувся на базу: наприкінці потрібен rover.go_home().");
    const missed=sc.samples.filter(x=>x<=w.pos&&!w.collected.includes(x));
    if(missed.length) return FAIL("Пропущено зразок на клітинці "+missed[0]+". Перевіряй sample_here() після кожного кроку.");
    if(w.bat>20&&w.pos+1!==sc.storm) return FAIL("Марсохід повернувся зарано: заряду лишалося "+w.bat+"%, він міг їхати далі.");
    return OK("Зібрано зразків: "+w.collected.length+", заряд на поверненні "+w.bat+"%.");
  }
},
/* ---------- Розділ 4. Винятки ---------- */
{
  id:"st-11", ch:4, scene:"sensor", title:"Ненадійний датчик", topic:"try / except",
  brief:"Датчик температури на старій лінії іноді не відповідає й кидає виняток <code>SensorError</code>. Без обробки програма падає на першому ж збої, а треба, щоб вона вимірювала далі.",
  task:["<code>sensor.read()</code> (<i>sensor</i> — «датчик», <i>read</i> — «прочитати») питає в датчика температуру й повертає число. Але іноді датчик не відповідає, і замість числа виникає помилка <code>SensorError</code> («помилка датчика»). Якщо її не обробити, вся програма зупиниться.", "Треба зробити 8 вимірювань, тобто 8 разів викликати <code>sensor.read()</code>. Цикл <code>for i in range(8):</code> уже є в заготовці.", "Якщо вимірювання вдалося, покажи температуру на табло: <code>display.show(t)</code> (<i>display</i> — «табло», <i>show</i> — «показати»).", "Якщо виник <code>SensorError</code>, покажи на табло <code>\"ERR\"</code> (скорочення від <i>error</i>, «помилка»): <code>display.show(\"ERR\")</code>. Після цього програма має перейти до наступного вимірювання, а не зупинитися.", "Для цього загорни читання й показ у <code>try:</code>, а під ним напиши <code>except SensorError:</code>."],
  api:[["sensor.read()", "читає температуру; іноді замість числа виникає SensorError", "англ. <i>sensor read</i> — «прочитати датчик»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"], ["SensorError", "помилка, коли датчик не відповів", "англ. <i>sensor error</i> — «помилка датчика»"]],
  starter:`for i in range(8):
    t = sensor.read()      # іноді датчик кидає SensorError!
    display.show(t)
`,
  solution:`for i in range(8):
    try:
        t = sensor.read()
        display.show(t)
    except SensorError:
        display.show("ERR")
`,
  hints:["Натисни «Запустити» із заготовкою й подивись, що станеться при першому збої.","Небезпечні рядки загорни в <code>try:</code>, а під ним напиши <code>except SensorError:</code>.","Всередині <code>except</code> — <code>display.show(\"ERR\")</code>. Цикл for після цього сам перейде до наступного вимірювання."],
  count:4,
  gen(r,i){ let s; do{ s=genStream(r,8,.35); } while(s.filter(o=>!o.ok).length<2||(i===0&&s[0].ok===false)); return {stream:s.concat(genStream(r,10,0)),mode:"sensor",n:8}; },
  label:sc=>sc.stream.slice(0,8).filter(o=>!o.ok).length+" збої з 8",
  world:sc=>new StationWorld(sc),
  prelude:()=>SENSOR_PRELUDE,
  check(w,sc){ const exp=sc.stream.slice(0,8).map(o=>o.ok?o.v:"ERR"); return checkDisplay(w,exp,8,i=>"Вимірювання №"+(i+1)); }
},
{
  id:"st-12", ch:4, scene:"sensor", title:"Три спроби", topic:"while · try / except · break",
  brief:"Замість ERR краще повторити запит: друга або третя спроба зазвичай вдається. Але якщо датчик мовчить тричі поспіль, точку позначаємо як невдалу.",
  task:["Тепер замість <code>\"ERR\"</code> ми хочемо спробувати ще раз: друга або третя спроба зазвичай вдається.", "Є 5 точок вимірювання, і цикл <code>for point in range(5):</code> уже є в заготовці (<i>point</i> — «точка»). Для кожної точки роби до 3 спроб викликати <code>sensor.read()</code>.", "Спроби рахуй у змінній <code>attempts</code> («спроби»). На початку кожної точки вона дорівнює 0. Повторюй читання, поки <code>attempts &lt; 3</code>.", "Якщо читання вдалося, покажи значення <code>display.show(t)</code> і вийди з <code>while</code> командою <code>break</code>. Цю точку більше не читаємо.", "Якщо виник <code>SensorError</code>, збільш лічильник на 1: <code>attempts += 1</code>. Тоді цикл спробує ще раз.", "Після <code>while</code> перевір: якщо <code>attempts</code> дорівнює 3, жодна спроба не вдалася. Тоді покажи на табло <code>\"FAIL\"</code> («невдача»): <code>display.show(\"FAIL\")</code>."],
  api:[["sensor.read()", "читає температуру; іноді замість числа виникає SensorError", "англ. <i>sensor read</i> — «прочитати датчик»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"], ["attempts += 1", "збільшує лічильник спроб на 1", "англ. <i>attempts</i> — «спроби»"]],
  starter:`for point in range(5):
    attempts = 0
    # Пробуй прочитати датчик, поки attempts < 3.
    # Успіх — показати значення й вийти з while (break).
    # SensorError — збільшити attempts.
    # Якщо всі 3 спроби невдалі — display.show("FAIL")
`,
  solution:`for point in range(5):
    attempts = 0
    while attempts < 3:
        try:
            t = sensor.read()
            display.show(t)
            break
        except SensorError:
            attempts += 1
    if attempts == 3:
        display.show("FAIL")
`,
  hints:["Усередині for потрібен цикл <code>while attempts &lt; 3:</code>, а в ньому <code>try</code>/<code>except</code>.","У <code>try</code> після <code>display.show(t)</code> напиши <code>break</code>: він вийде з while, а for перейде до наступної точки.","Після while перевір <code>if attempts == 3:</code>. Ця умова істинна, коли жодна з трьох спроб не вдалася."],
  count:4,
  gen(r){
    let plan; do{ plan=[0,0,1,2,3].map(()=>pick(r,[0,0,1,1,2,3])); } while(!plan.includes(3)||!plan.some(f=>f===1||f===2));
    const s=[]; plan.forEach(f=>{ for(let k=0;k<f&&k<3;k++) s.push({ok:false}); if(f<3) s.push(genStream(r,1,0)[0]); });
    return {stream:s.concat(genStream(r,12,0)),plan,mode:"sensor",n:5};
  },
  label:sc=>"збоїв: "+sc.plan.reduce((a,b)=>a+b,0),
  world:sc=>new StationWorld(sc),
  prelude:()=>SENSOR_PRELUDE,
  check(w,sc){
    const exp=[]; let k=0, reads=0;
    for(let p=0;p<5;p++){ let a=0, done=false; while(a<3){ const o=sc.stream[k++]; reads++; if(o.ok){ exp.push(o.v); done=true; break; } a++; } if(!done) exp.push("FAIL"); }
    return checkDisplay(w,exp,reads,i=>"Точка №"+(i+1));
  }
},
{
  id:"st-13", ch:4, scene:"motor", title:"Верстат із мотором", topic:"кілька except · finally",
  brief:"Верстат обробляє деталі зі списку <code>jobs</code>. Мотор іноді перегрівається (<code>OverheatError</code>), а деталь може застрягти (<code>JamError</code>). Для кожної проблеми є своя команда. А зупинити мотор після завдання треба завжди, хоч що трапилося.",
  task:["<code>jobs</code> («завдання») — список деталей, які має обробити верстат. Перебери їх циклом <code>for job in jobs:</code>.", "Для кожного завдання запусти мотор командою <code>motor.start()</code> («запустити»), а потім оброби деталь: <code>motor.run(job)</code> («виконати»).", "Під час <code>motor.run(job)</code> можуть статися дві різні помилки. При <code>OverheatError</code> («перегрів») охолоди мотор: <code>motor.cool()</code>. При <code>JamError</code> («заклинювання») звільни деталь: <code>motor.clear()</code>.", "Після кожного завдання мотор треба зупинити: <code>motor.stop()</code>. Це потрібно завжди, і коли все пройшло добре, і коли сталася помилка. Для цього є блок <code>finally:</code> («наостанок»), який виконується за будь-яких умов.", "Разом виходить так: <code>try:</code> зі <code>start()</code> і <code>run(job)</code>, потім два <code>except</code>, потім <code>finally:</code> зі <code>stop()</code>."],
  api:[["jobs", "список завдань для верстата", "англ. <i>jobs</i> — «завдання, роботи»"], ["motor.start()", "запускає мотор", "англ. <i>start</i> — «запустити»"], ["motor.run(job)", "обробляє деталь; може виникнути OverheatError або JamError", "англ. <i>run</i> — «виконати»"], ["motor.cool()", "охолоджує мотор", "англ. <i>cool</i> — «охолодити»"], ["motor.clear()", "звільняє деталь, що застрягла", "англ. <i>clear</i> — «очистити, звільнити»"], ["motor.stop()", "зупиняє мотор", "англ. <i>stop</i> — «зупинити»"]],
  starter:`print("Завдання:", jobs)

for job in jobs:
    motor.start()
    motor.run(job)     # може кинути OverheatError або JamError
    motor.stop()
`,
  solution:`for job in jobs:
    try:
        motor.start()
        motor.run(job)
    except OverheatError:
        motor.cool()
    except JamError:
        motor.clear()
    finally:
        motor.stop()
`,
  hints:["Після одного <code>try</code> можна написати кілька <code>except</code>, кожен для свого типу винятку.","Блок <code>finally:</code> виконується завжди: і після успіху, і після обробленого винятку.","Якщо <code>motor.stop()</code> лишити тільки в <code>try</code>, після помилки мотор не зупиниться, і наступний <code>start()</code> видасть помилку."],
  count:4,
  gen(r,i){
    const names=shuffle(r,["кронштейн","вал","шестерня","корпус","кришка","фланець","втулка","муфта"]);
    const n=ri(r,5,6), jobs=names.slice(0,n);
    let out; do{ out=jobs.map(()=>pick(r,["ok","ok","ok","hot","jam"])); } while(i<3&&!(out.includes("hot")&&out.includes("jam")));
    return {jobs,outcomes:out,mode:"motor"};
  },
  label:sc=>sc.jobs.length+" завдань",
  world:sc=>new StationWorld(sc),
  prelude:sc=>"jobs = "+pyLit(sc.jobs)+"\n"+MOTOR_PRELUDE,
  check(w,sc){
    if(w.ji<sc.jobs.length) return FAIL("Виконано лише "+w.ji+" завдань із "+sc.jobs.length+".");
    if(w.running) return FAIL("Після останнього завдання мотор лишився ввімкненим. Зупинку краще перенести у finally.");
    if(w.hot) return FAIL("Мотор лишився перегрітим: після OverheatError потрібен motor.cool().");
    if(w.jam) return FAIL("Мотор лишився заклиненим: після JamError потрібен motor.clear().");
    return OK("Оброблено "+sc.jobs.length+" деталей, мотор вимкнено.");
  }
},
/* ---------- Розділ 5. Фінал ---------- */
{
  id:"st-14", ch:5, scene:"belt", title:"Міні-завод", topic:"усе разом",
  brief:"На фінальній лінії кожна деталь має QR-код із класом якості. Сканер читає код, а якщо маркування брудне, кидає <code>ScanError</code>. Перегріта деталь, як і раніше, зупиняє лінію.",
  task:["Перебирай деталі на стрічці: <code>for part in conveyor:</code>. Для кожної деталі по черзі зроби три кроки.", "Перший крок. Якщо деталь перегріта (<code>part.hot</code> дорівнює <code>True</code>), виклич <code>emergency_stop()</code> і вийди з циклу командою <code>break</code>.", "Другий крок. Відскануй QR-код: <code>code = scanner.scan(part)</code> (<i>scanner</i> — «сканер», <i>scan</i> — «сканувати»). Сканер повертає клас якості, рядок <code>\"A\"</code>, <code>\"B\"</code> або <code>\"C\"</code>.", "Якщо маркування брудне, замість коду виникає помилка <code>ScanError</code> («помилка сканування»). Тоді відправ деталь у брак командою <code>reject()</code> («відхилити») і переходь до наступної деталі через <code>continue</code>.", "Третій крок. Розсортуй деталь за кодом. <code>\"A\"</code> іде в лівий контейнер (<code>push_left()</code>), <code>\"B\"</code> — у правий (<code>push_right()</code>), а <code>\"C\"</code> — у брак (<code>reject()</code>)."],
  api:[["part.hot", "True, якщо деталь перегріта", "англ. <i>hot</i> — «гарячий»"], ["scanner.scan(part)", "повертає \"A\", \"B\" або \"C\"; іноді виникає ScanError", "англ. <i>scan</i> — «сканувати»"], ["push_left()", "штовхає деталь у лівий контейнер (клас A)", "англ. <i>push left</i> — «штовхнути ліворуч»"], ["push_right()", "штовхає деталь у правий контейнер (клас B)", "англ. <i>push right</i> — «штовхнути праворуч»"], ["reject()", "відправляє деталь у брак", "англ. <i>reject</i> — «відхилити»"], ["emergency_stop()", "аварійно зупиняє лінію", "англ. <i>emergency stop</i> — «аварійна зупинка»"]],
  starter:`for part in conveyor:
    # 1) перегріта — зупинка і break
    # 2) сканування з обробкою ScanError
    # 3) сортування за кодом A / B / C
    code = scanner.scan(part)
    print("Код:", code)
`,
  solution:`for part in conveyor:
    if part.hot:
        emergency_stop()
        break
    try:
        code = scanner.scan(part)
    except ScanError:
        reject()
        continue
    if code == "A":
        push_left()
    elif code == "B":
        push_right()
    else:
        reject()
`,
  hints:["Структура тіла циклу: перевірка hot → try/except зі скануванням → if/elif/else за кодом.","У <code>except ScanError:</code> після <code>reject()</code> потрібен <code>continue</code>, бо змінна <code>code</code> для цієї деталі не створилася.","Порівнюй рядки: <code>if code == \"A\":</code>"],
  bins:{left:"КЛАС A",right:"КЛАС B",end:"БРАК"},
  destName:{left:"піти в контейнер A",right:"піти в контейнер B",end:"піти в брак",stop:"спричинити зупинку лінії",none:"залишитися на стрічці після зупинки"},
  destNameGot:{left:"пішла в A",right:"пішла в B",end:"пішла в брак",stop:"на ній зупинили лінію",none:"її не оброблено"},
  describe:p=>p.hot?"перегріта":p.dirty?"брудне маркування":"код "+p.code,
  count:5,
  gen(r,i){
    const n=ri(r,9,11), parts=[];
    for(let k=0;k<n;k++) parts.push({id:k,color:"grey",code:pick(r,["A","A","B","B","C"]),dirty:r()<.2,hot:false});
    if(!parts.some(p=>p.dirty)) parts[ri(r,0,n-3)].dirty=true;
    const hotAt=[n-2,-1,4,-1,r()<.5?ri(r,3,n-1):-1][i];
    if(hotAt>=0){ parts[hotAt].hot=true; parts[hotAt].dirty=false; }
    return {parts,attrs:["hot"],final:true};
  },
  label:sc=>sc.parts.length+" деталей"+(sc.parts.some(p=>p.hot)?", є перегріта":""),
  world:sc=>new BeltWorld(sc),
  prelude:()=>BELT_PRELUDE+`class _Scanner:\n    def scan(self, part):\n        return _c("scan", part.id)\nscanner = _Scanner()\ndef push_left():\n    _c("act", "left")\ndef push_right():\n    _c("act", "right")\ndef reject():\n    _c("act", "end")\ndef emergency_stop():\n    _c("stop")\n`,
  check(w){ return checkBelt(w,this,expUntilHot(p=>p.dirty?"end":p.code==="A"?"left":p.code==="B"?"right":"end")); }
}
];
LEVELS.forEach((l,i)=>{ l.n=i+1; l.par=l.solution.split("\n").filter(s=>s.trim()&&!s.trim().startsWith("#")&&!s.trim().startsWith("print")).length; });
function makeScenarios(lv,fresh){
  const out=[];
  for(let i=0;i<lv.count;i++){
    const seed= i===0||!fresh ? lv.n*7919+i*104729 : Math.floor(Math.random()*1e9);
    out.push(lv.gen(rng(seed),i));
  }
  return out;
}

/* ================= Запуск Python (Skulpt) ================= */
let _added=[];
function skRead(f){ if(Sk.builtinFiles===undefined||Sk.builtinFiles.files[f]===undefined) throw "File not found: '"+f+"'"; return Sk.builtinFiles.files[f]; }
const ERR_UA={
  SyntaxError:["Синтаксична помилка","Перевір двокрапку в кінці рядків з if, elif, else, for, while, try, except, відступи (4 пробіли всередині блоку) і чи всі дужки та лапки закриті."],
  IndentationError:["Помилка відступів","У всіх рядків одного блоку має бути однаковий відступ, зазвичай 4 пробіли."],
  NameError:["Невідоме ім'я","Можливо, у назві помилка або змінну створено нижче цього рядка."],
  TypeError:["Помилка типу","Дані не того типу: наприклад, число додають до рядка або функції передали не ту кількість аргументів."],
  AttributeError:["Немає такого атрибута","Перевір назву методу чи властивості в довідці команд."],
  ValueError:["Неправильне значення",""],
  ZeroDivisionError:["Ділення на нуль",""],
  IndexError:["Індекс поза межами списку",""],
  KeyError:["Немає такого ключа",""],
  TimeLimitError:["Програма працює надто довго","Схоже на нескінченний цикл: перевір, чи умова while колись стає хибною."],
  _Halt:["Забагато команд",""],
  RobotError:["Аварія обладнання",""],
  SensorError:["Неперехоплений SensorError","Програма впала через збій датчика. Огорни виклик sensor.read() у try / except SensorError."],
  OverheatError:["Неперехоплений OverheatError","Мотор перегрівся, а програма цього не обробила. Потрібен except OverheatError."],
  JamError:["Неперехоплений JamError","Деталь застрягла, а програма цього не обробила. Потрібен except JamError."],
  ScanError:["Неперехоплений ScanError","Сканер не прочитав код, а програма цього не обробила. Потрібен try / except ScanError."]
};
function formatErr(e){
  if(e instanceof WErr) e={tp$name:e.type,args:null,_m:e.msg};
  if(!e||!e.tp$name){ return {type:"Error",title:"Внутрішня помилка",msg:String(e),line:null,text:"Внутрішня помилка: "+e,short:"Помилка"}; }
  const type=e.tp$name; let msg=e._m||"";
  try{ if(!msg&&e.args){ const a=Sk.ffi.remapToJs(e.args); msg=Array.isArray(a)?(a.length?String(a[0]):""):String(a); } }catch(_){}
  let line=null;
  if(e.traceback) for(const tb of e.traceback){ if(tb.filename&&tb.filename.indexOf("<stdin>")===0){ line=tb.lineno; break; } }
  let [title,expl]=ERR_UA[type]||[type,""];
  if(type==="NameError"){ const m=/name '([^']+)'/.exec(msg); if(m) title="Невідоме ім'я «"+m[1]+"»"; }
  if(type==="SyntaxError"&&/indent/i.test(msg)) [title,expl]=ERR_UA.IndentationError;
  if(type==="AttributeError"){ const m=/has no attribute '([^']+)'/.exec(msg); if(m) title="Немає атрибута «"+m[1]+"»"; }
  const uaMsg = ["RobotError","SensorError","OverheatError","JamError","ScanError","_Halt"].includes(type) ? msg : "";
  const where=line?" (рядок "+line+")":"";
  const text=title+where+(uaMsg?": "+uaMsg:"")+(expl?" "+expl:"")+(uaMsg||type==="TimeLimitError"?"":(msg?" ["+type+": "+msg+"]":" ["+type+"]"));
  return {type,title,msg,line,text,short:title+(uaMsg?": "+uaMsg:"")};
}
async function runCode(lv,sc,code){
  const world=lv.world(sc);
  let out="";
  Sk.configure({output:s=>{ out+=s; if(out.length>30000) out=out.slice(-30000); }, read:skRead, __future__:Sk.python3, execLimit:5000, yieldLimit:200});
  Sk.execLimit=5000;
  for(const k of _added) delete Sk.builtins[k];
  _added=[];
  Sk.builtins._js=new Sk.builtin.func(function(name,...args){
    name=Sk.ffi.remapToJs(name);
    const js=args.map(a=>Sk.ffi.remapToJs(a));
    let v;
    try{ v=world.call(name,js); }
    catch(e){ if(e instanceof WErr) return Sk.ffi.remapToPy(["__err__",e.type,e.msg]); throw e; }
    return (v===null||v===undefined)?Sk.builtin.none.none$:Sk.ffi.remapToPy(v);
  });
  let err=null;
  try{
    const mod=await Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("_lab",false,COMMON_PRELUDE+lv.prelude(sc),true));
    for(const k in mod.$d){ if(k.indexOf("__")!==0){ Sk.builtins[k]=mod.$d[k]; _added.push(k); } }
  }catch(e){ return {events:[],out,err:{text:"Помилка підготовки рівня: "+e},res:FAIL("Помилка підготовки рівня")}; }
  if(!code.trim()) err={type:"Empty",title:"Порожня програма",msg:"",line:null,text:"Програма порожня. Напиши код у редакторі.",short:"Порожня програма"};
  else{
    try{ Sk.execStart=Date.now(); await Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("<stdin>",false,code,true)); }
    catch(e){ err=formatErr(e); }
  }
  world.finish(err);
  const res= err ? FAIL(err.text) : lv.check(world,sc,out);
  if(err) world.emit({t:"crash",msg:err.short});
  return {events:world.events,out,err,res,world};
}
const PLAIN_LEVEL={world:sc=>new World(sc),prelude:()=>"",check:()=>OK()};
if(typeof module!=="undefined") module.exports={LEVELS,makeScenarios,runCode,PLAIN_LEVEL};
