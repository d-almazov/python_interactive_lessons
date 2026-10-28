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
const fmtPy=v=> v===null||v===undefined ? "None" : typeof v==="boolean" ? (v?"True":"False") : fmtVal(v);

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
class FileNotFoundError(IOError):
    pass
OSError = IOError
_E = {"RobotError": RobotError, "SensorError": SensorError, "OverheatError": OverheatError, "JamError": JamError, "ScanError": ScanError, "_Halt": _Halt, "FileNotFoundError": FileNotFoundError, "ValueError": ValueError, "TypeError": TypeError, "IOError": IOError}
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
  api_route(r){
    const fn=this.sc.fn||"decide";
    if(r===null||r===undefined) this.err("RobotError","Функція "+fn+"() повернула None. Мабуть, замість return стоїть print або return забуто в одній із гілок.");
    const dest={left:"left",right:"right",pass:"end"}[r];
    if(!dest) this.err("RobotError","Функція "+fn+"() повернула "+fmtPy(r)+", а сортувальник розуміє лише \"left\", \"right\" або \"pass\".");
    return this.api_act(dest);
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

/* ---------- Лабораторія ВТК ---------- */
class QCWorld extends World{
  constructor(sc){ super(sc); this.got=[]; }
  api_qc(w,l,got){ const i=this.got.length, exp=this.sc.rule(w,l); this.got.push(got); this.emit({t:"qc",i,w,l,got:got===undefined?null:got,exp}); return null; }
}

/* ---------- Віртуальні файли ---------- */
const splitLines=s=>{ const out=[]; let cur=""; for(const ch of s){ cur+=ch; if(ch==="\n"){ out.push(cur); cur=""; } } if(cur) out.push(cur); return out; };
class FileWorld extends StationWorld{
  constructor(sc){ super(sc); this.files=Object.assign({},sc.files||{}); this.handles=[]; }
  h(id){ const h=this.handles[id]; if(!h) this.err("IOError","Невідомий файл."); return h; }
  api_fs_open(name,mode){
    if(typeof name!=="string") this.err("TypeError","Назва файлу має бути рядком, наприклад \"data.txt\", а отримано "+fmtPy(name)+".");
    if(mode===null||mode===undefined) mode="r";
    if(!["r","w","a"].includes(mode)) this.err("ValueError","Невідомий режим "+fmtPy(mode)+". Тут є режими \"r\" (читати), \"w\" (записати наново) і \"a\" (дописати в кінець).");
    if(mode==="r"&&!(name in this.files)){ this.emit({t:"fnf",name}); this.err("FileNotFoundError","Файлу «"+name+"» немає."); }
    if(mode==="w") this.files[name]="";
    if(mode==="a"&&!(name in this.files)) this.files[name]="";
    const h={id:this.handles.length,name,mode,buf:"",closed:false,viaWith:false};
    this.handles.push(h);
    this.emit({t:"fopen",name,mode});
    return [h.id, mode==="r"?splitLines(this.files[name]):[]];
  }
  api_fs_line(id,i){ const h=this.h(id); this.emit({t:"fline",name:h.name,i}); return null; }
  api_fs_write(id,s){ const h=this.h(id); h.buf+=s; this.emit({t:"fwrite",name:h.name,text:s}); return null; }
  api_fs_close(id,viaWith){ const h=this.h(id); if(h.closed) return null; h.closed=true; h.viaWith=!!viaWith; if(h.mode!=="r") this.files[h.name]+=h.buf; this.emit({t:"fclose",name:h.name}); return null; }
  open(name){ return this.handles.filter(h=>h.name===name&&!h.closed); }
}
const DISPLAY_PRELUDE=`
class _Display:
    def show(self, value):
        _c("show", value)
display = _Display()
`;
const FILE_PRELUDE=`
class _File:
    def __init__(self, name, mode):
        r = _c("fs_open", name, mode)
        self._h = r[0]
        self._lines = r[1]
        self._pos = 0
        self.name = name
        self.mode = mode
        self.closed = False
    def _need(self, reading):
        if self.closed:
            raise ValueError("Файл «" + self.name + "» уже закрито, працювати з ним не можна.")
        if reading and self.mode != "r":
            raise IOError("Файл «" + self.name + "» відкрито для запису, читати з нього не можна.")
        if not reading and self.mode == "r":
            raise IOError("Файл «" + self.name + "» відкрито для читання. Щоб писати, відкрий його в режимі \\"w\\" або \\"a\\".")
    def readline(self):
        self._need(True)
        if self._pos >= len(self._lines):
            return ""
        s = self._lines[self._pos]
        _c("fs_line", self._h, self._pos)
        self._pos += 1
        return s
    def read(self):
        parts = []
        s = self.readline()
        while s != "":
            parts.append(s)
            s = self.readline()
        return "".join(parts)
    def readlines(self):
        parts = []
        s = self.readline()
        while s != "":
            parts.append(s)
            s = self.readline()
        return parts
    def __iter__(self):
        self._need(True)
        return self
    def __next__(self):
        s = self.readline()
        if s == "":
            raise StopIteration
        return s
    def write(self, text):
        self._need(False)
        if type(text) is not str:
            raise TypeError("write() приймає лише рядок, а отримано " + type(text).__name__ + ". Перетвори значення на рядок через str().")
        _c("fs_write", self._h, text)
        return len(text)
    def close(self):
        if not self.closed:
            self.closed = True
            _c("fs_close", self._h, False)
    def __enter__(self):
        return self
    def __exit__(self, a, b, c):
        if not self.closed:
            self.closed = True
            _c("fs_close", self._h, True)
        return False
    def __repr__(self):
        return "<файл " + self.name + ", режим " + self.mode + ">"
def open(name, mode="r", encoding=None):
    return _File(name, mode)
`;
const textOf=lines=>lines.map(s=>s+"\n").join("");
const showLine=s=>"«"+String(s).replace(/\n/g,"\\n")+"»";
// порівнює вміст файлу з очікуваними рядками; останнє \n не обов'язкове
function checkFileText(w,name,expLines){
  if(!(name in w.files)) return FAIL("Файл "+name+" так і не створено. Відкрий його так: open(\""+name+"\", \"w\").");
  if(w.open(name).length){ const h=w.open(name)[0]; return FAIL("Файл "+name+" лишився відкритим, тож записане так і лежить у буфері й до файлу не потрапило."+(h.mode==="r"?"":" Закрий файл через "+"f.close() або відкривай його через with.")); }
  let got=w.files[name]; if(got.endsWith("\n")) got=got.slice(0,-1);
  const g=got===""?[]:got.split("\n");
  for(let i=0;i<Math.max(g.length,expLines.length);i++){
    if(g[i]===undefined) return FAIL("У файлі "+name+" рядків: "+g.length+", а має бути "+expLines.length+". Рядок "+(i+1)+" мав бути "+showLine(expLines[i])+".");
    if(expLines[i]===undefined) return FAIL("У файлі "+name+" зайвий рядок "+(i+1)+": "+showLine(g[i])+".");
    if(g[i]!==expLines[i]){
      const hint=g[i].startsWith(expLines[i])&&g[i].length>expLines[i].length?" Схоже, бракує \\n у кінці рядка, і наступний рядок прилип до цього.":"";
      return FAIL("Рядок "+(i+1)+" у файлі "+name+": очікувалося "+showLine(expLines[i])+", а записано "+showLine(g[i])+"."+hint);
    }
  }
  return null;
}
function checkClosed(w){ const h=w.handles.find(h=>!h.closed); return h?FAIL("Файл "+h.name+" лишився відкритим. Після роботи закрий його: f.close()."):null; }

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
/* ---------- Розділ 5. Функції ---------- */
{
  id:"st-14", ch:5, scene:"grid", title:"Сходи", topic:"def · виклик функції",
  brief:"Робот має спуститися сходами до батарейки. Кожну сходинку він долає тими самими чотирма командами, а кількість сходинок щоразу інша. Команди зручно зібрати в одну функцію, а потім викликати її стільки разів, скільки треба.",
  task:["Змінна <code>steps</code> («сходинки») каже, скільки сходинок до батарейки. Щоразу це інше число від 3 до 5.", "Одну сходинку робот проходить чотирма командами саме в такому порядку: <code>robot.forward()</code>, <code>robot.turn_right()</code>, <code>robot.forward()</code>, <code>robot.turn_left()</code>. Після них він стоїть на наступній сходинці й знову дивиться праворуч, як на старті.", "Визнач функцію <code>step_down()</code> («крок униз»), яка виконує ці чотири команди. Рядок <code>def step_down():</code> уже є в заготовці. Під ним заміни <code>pass</code> на чотири команди з відступом 4 пробіли: це тіло функції.", "Поки функцію не викликали, вона нічого не робить. Тому нижче, вже без відступу, напиши цикл <code>for i in range(steps):</code>, а в ньому виклич функцію: <code>step_down()</code>."],
  api:[["steps", "кількість сходинок до батарейки", "англ. <i>steps</i> — «сходинки, кроки»"], ["def step_down():", "визначає функцію step_down без параметрів", "англ. <i>define</i> — «визначити»; <i>step down</i> — «крок униз»"], ["step_down()", "викликає функцію: виконує все її тіло", "дужки після назви обов'язкові"], ["robot.forward()", "робить один крок уперед", "англ. <i>forward</i> — «уперед»"], ["robot.turn_left()", "розвертає робота ліворуч на місці", "англ. <i>turn left</i> — «повернути ліворуч»"], ["robot.turn_right()", "розвертає робота праворуч на місці", "англ. <i>turn right</i> — «повернути праворуч»"]],
  starter:`print("Сходинок:", steps)

def step_down():
    # чотири команди для однієї сходинки
    pass

# виклич step_down() стільки разів, скільки сходинок
`,
  solution:`def step_down():
    robot.forward()
    robot.turn_right()
    robot.forward()
    robot.turn_left()

for i in range(steps):
    step_down()
`,
  hints:["Тіло функції — це рядки з відступом під <code>def step_down():</code>. Заміни <code>pass</code> на чотири команди робота.","Щоб викликати функцію, пишуть її назву з дужками: <code>step_down()</code>. Без дужок Python нічого не виконає.","Цикл стоїть після функції й без відступу: <code>for i in range(steps):</code>, а в ньому один рядок <code>step_down()</code>."],
  needFn:["step_down"],
  count:4,
  gen(r,i){ const n=[3,5,4,ri(r,3,5)][i]; const path=[[0,0]]; for(let k=0;k<n;k++){ path.push([k+1,k]); path.push([k+1,k+1]); } return {path,dir:0,W:n+1,H:n+1,vars:{steps:n}}; },
  label:sc=>"сходинок: "+sc.vars.steps,
  world:sc=>new GridWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+GRID_PRELUDE,
  check(w){ if(w.x!==w.goal[0]||w.y!==w.goal[1]) return FAIL(w.steps===0?"Робот не зрушив з місця. Функцію визначено, але жодного разу не викликано: потрібен цикл із викликом step_down().":"Робот не дійшов до батарейки. Перевір, чи step_down() викликано стільки разів, скільки сходинок."); return OK(); }
},
{
  id:"st-15", ch:5, scene:"pallet", title:"Ряди на замовлення", topic:"параметри функції",
  brief:"Замовлення на палету щоразу інше: скільки рядів, скільки в кожному ящиків і якого вони кольору. Станція сама читає замовлення й для кожного ряду викликає твою функцію <code>row</code>. Через параметри вона передає функції номер ряду, кількість ящиків і колір.",
  task:["Напиши функцію з трьома параметрами: <code>def row(y, count, color):</code>. Параметр <code>y</code> — номер ряду знизу (0, 1, 2 …), <code>count</code> — скільки ящиків поставити, <code>color</code> — їхній колір, <code>\"orange\"</code> або <code>\"blue\"</code>.", "Функція ставить у ряд <code>y</code> рівно <code>count</code> ящиків кольору <code>color</code> на позиції <code>x</code> = 0, 1, 2 … до <code>count - 1</code>. Один ящик ставить команда <code>arm.place(x, y, color)</code>.", "Викликати <code>row</code> самому не треба: станція зробить це для кожного ряду замовлення. Наприклад, вона може викликати <code>row(0, 6, \"orange\")</code>, а потім <code>row(1, 4, \"blue\")</code>. У першому виклику <code>y</code> дорівнює 0, <code>count</code> дорівнює 6, а <code>color</code> — <code>\"orange\"</code>.", "У тілі функції не пиши конкретних чисел і кольорів на кшталт 6 чи <code>\"orange\"</code>. Замовлення щоразу інше, тому працюй лише з параметрами <code>y</code>, <code>count</code> і <code>color</code>."],
  api:[["def row(y, count, color):", "функція з трьома параметрами; її викликає станція", "англ. <i>row</i> — «ряд»; <i>count</i> — «кількість»; <i>color</i> — «колір»"], ["arm.place(x, y, color)", "ставить ящик кольору color на позицію x у ряду y", "англ. <i>place</i> — «поставити»"], ["range(count)", "числа 0, 1, … count-1", "англ. <i>range</i> — «діапазон»"]],
  starter:`def row(y, count, color):
    # постав count ящиків кольору color у ряд y
    pass
`,
  solution:`def row(y, count, color):
    for x in range(count):
        arm.place(x, y, color)
`,
  hints:["Усередині функції потрібен цикл <code>for x in range(count):</code>.","У циклі один рядок: <code>arm.place(x, y, color)</code>. Значення <code>y</code> і <code>color</code> вже прийшли через параметри.","Якщо станція пише, що функцію не знайдено, перевір назву: саме <code>row</code>, і саме три параметри в дужках."],
  needFn:["row"],
  count:4,
  gen(r,i){
    const nr=[3,2,4,ri(r,2,4)][i], orders=[]; let c=ri(r,5,8);
    for(let y=0;y<nr;y++){ orders.push([y,c,y===0&&i===0?"orange":pick(r,["orange","blue"])]); c=Math.max(1,c-ri(r,1,3)); }
    const target=[]; orders.forEach(([y,n,col])=>{ for(let x=0;x<n;x++) target.push({x,y,color:col}); });
    return {orders,target};
  },
  label:sc=>sc.orders.map(o=>o[1]+(o[2]==="blue"?" син":" пом")).join(" · "),
  world:sc=>new PalletWorld(sc),
  prelude:sc=>"_orders = "+pyLit(sc.orders)+"\n"+`class _Arm:\n    def place(self, x, y=0, color="orange"):\n        _c("place", x, y, color)\narm = _Arm()\n`,
  driver:()=>"for _o in _orders:\n    row(_o[0], _o[1], _o[2])\n",
  check:(w,sc)=>checkPallet(w,sc,true)
},
{
  id:"st-16", ch:5, scene:"belt", title:"Мозок сортувальника", topic:"return",
  brief:"Сортувальник на конвеєрі вміє штовхати деталі, але сам не знає, куди саме. Для кожної деталі він викликає твою функцію <code>decide(part)</code> і робить те, що вона поверне.",
  task:["Напиши функцію <code>decide(part)</code> («вирішити»). Станція викликає її для кожної деталі й передає деталь у параметрі <code>part</code>. Як і раніше, у деталі є <code>part.color</code> і <code>part.weight</code> (вага в грамах).", "Сама функція нічого не штовхає, вона лише повертає відповідь командою <code>return</code>. Відповідь — один із трьох рядків: <code>\"left\"</code> (ліворуч), <code>\"right\"</code> (праворуч) або <code>\"pass\"</code> (пропустити далі).", "Деталь, важча за 150 г (<code>part.weight &gt; 150</code>), іде праворуч, хоч якого вона кольору: поверни <code>\"right\"</code>.", "Інакше, якщо деталь червона, поверни <code>\"left\"</code>.", "Для всіх інших деталей поверни <code>\"pass\"</code>.", "<code>print</code> тут не допоможе: він лише показує текст у консолі, а станція отримує те, що стоїть після <code>return</code>. Якщо функція нічого не повернула, станція отримає <code>None</code> і зупинить лінію."],
  api:[["def decide(part):", "функція, яку станція викликає для кожної деталі", "англ. <i>decide</i> — «вирішити»"], ["return \"left\"", "завершує функцію й повертає станції рядок \"left\"", "англ. <i>return</i> — «повернути»"], ["part.color", "\"red\", \"blue\", \"green\" або \"yellow\"", "англ. <i>color</i> — «колір»"], ["part.weight", "вага деталі в грамах", "англ. <i>weight</i> — «вага»"], ["\"left\" / \"right\" / \"pass\"", "ліворуч, праворуч, пропустити далі", "англ. <i>left</i>, <i>right</i>, <i>pass</i>"]],
  starter:`def decide(part):
    print("Деталь:", part.color, part.weight, "г")
    # поверни "left", "right" або "pass"
`,
  solution:`def decide(part):
    if part.weight > 150:
        return "right"
    elif part.color == "red":
        return "left"
    else:
        return "pass"
`,
  hints:["Запусти заготовку: функція тільки друкує, нічого не повертає, і станція отримує <code>None</code>.","Кожна гілка <code>if</code> / <code>elif</code> / <code>else</code> закінчується своїм <code>return</code>: <code>return \"right\"</code>, <code>return \"left\"</code>, <code>return \"pass\"</code>.","Вагу перевіряй першою: важка червона деталь має йти праворуч, а не ліворуч."],
  needFn:["decide"],
  bins:{left:"ЧЕРВОНІ",right:"ВАЖКІ",end:"ІНШІ"},
  destName:{left:"піти ліворуч",right:"піти праворуч",end:"поїхати далі",pack:"",stop:"",none:"бути відсортована"},
  destNameGot:{left:"пішла ліворуч",right:"пішла праворуч",end:"поїхала далі",none:"не оброблена"},
  describe:p=>({red:"червона",blue:"синя",green:"зелена",yellow:"жовта"}[p.color])+", "+p.weight+" г",
  count:4,
  gen(r){
    const n=ri(r,8,10), parts=[];
    for(let i=0;i<n;i++) parts.push({id:i,color:pick(r,["red","red","blue","green","yellow"]),weight:ri(r,8,30)*5});
    const ix=shuffle(r,[...Array(n).keys()]);
    Object.assign(parts[ix[0]],{color:"red",weight:ri(r,32,40)*5});
    Object.assign(parts[ix[1]],{color:pick(r,["blue","green"]),weight:ri(r,31,40)*5});
    Object.assign(parts[ix[2]],{color:"red",weight:ri(r,8,30)*5});
    return {parts,attrs:["color","weight"]};
  },
  label:sc=>sc.parts.length+" деталей",
  world:sc=>new BeltWorld(sc),
  prelude:()=>BELT_PRELUDE,
  driver:()=>"for _p in conveyor:\n    _c(\"route\", decide(_p))\n",
  check(w){ return checkBelt(w,this,p=>p.weight>150?"right":p.color==="red"?"left":"end"); }
},
{
  id:"st-17", ch:5, scene:"qc", title:"Лабораторія ВТК", topic:"кілька параметрів · return True / False",
  brief:"У лабораторії відділу технічного контролю (ВТК) кожну деталь зважують і міряють. Рішення «придатна чи ні» тепер ухвалюватиме твоя функція. Стенд проганяє її на партії деталей і звіряє кожну відповідь з еталоном.",
  task:["Напиши функцію <code>is_ok(weight, length)</code> («чи в нормі»). Вона отримує два числа: вагу деталі в грамах і довжину в міліметрах.", "Деталь придатна, якщо вага від 95 до 105 г <b>і</b> довжина від 49 до 51 мм. Тоді функція повертає <code>True</code>.", "Межі теж входять у норму: деталь вагою рівно 95 г і довжиною рівно 51 мм придатна.", "Якщо хоч одне значення виходить за межі, функція повертає <code>False</code>.", "Викликати функцію не треба. Стенд сам викличе <code>is_ok</code> для кожної деталі й передасть їй два числа в тому самому порядку: спершу вагу, потім довжину."],
  api:[["def is_ok(weight, length):", "повертає True для придатної деталі, False для браку", "англ. <i>is OK</i> — «чи в нормі»; <i>weight</i> — «вага»; <i>length</i> — «довжина»"], ["return True", "повертає «так»", "англ. <i>true</i> — «істина»"], ["return False", "повертає «ні»", "англ. <i>false</i> — «хиба»"], ["95 <= weight <= 105", "True, якщо weight від 95 до 105 включно", "у Python порівняння можна писати ланцюжком"]],
  starter:`def is_ok(weight, length):
    print("Перевіряю:", weight, "г,", length, "мм")
    # поверни True, якщо обидва значення в нормі, інакше False
`,
  solution:`def is_ok(weight, length):
    if 95 <= weight <= 105 and 49 <= length <= 51:
        return True
    return False
`,
  hints:["Умова складається з двох частин, і обидві мають бути істинними, тому їх поєднують через <code>and</code>.","«Від 95 до 105 включно» записують як <code>weight &gt;= 95 and weight &lt;= 105</code> або коротше: <code>95 &lt;= weight &lt;= 105</code>.","Після <code>return True</code> функція завершується. Тому рядок <code>return False</code> можна писати просто після <code>if</code>, без <code>else</code>."],
  needFn:["is_ok"],
  count:4,
  gen(r,i){
    const fixed=[[95,51],[105,49],[94,50],[100,52],[106,50],[100,48],[100,50],[96,49]];
    let b;
    if(i===0) b=shuffle(r,fixed).concat([[ri(r,96,104),ri(r,49,51)],[ri(r,85,115),ri(r,45,55)]]);
    else{ b=[]; for(let k=0;k<10;k++) b.push(r()<.5?[ri(r,95,105),ri(r,49,51)]:[ri(r,88,112),ri(r,46,54)]); }
    return {batch:b,rule:(w,l)=>w>=95&&w<=105&&l>=49&&l<=51};
  },
  label:sc=>sc.batch.length+" деталей, придатних "+sc.batch.filter(([w,l])=>sc.rule(w,l)).length,
  world:sc=>new QCWorld(sc),
  prelude:sc=>"_batch = "+pyLit(sc.batch)+"\n",
  driver:()=>"for _d in _batch:\n    _c(\"qc\", _d[0], _d[1], is_ok(_d[0], _d[1]))\n",
  check(w,sc){
    for(let i=0;i<sc.batch.length;i++){
      const [wt,l]=sc.batch[i], exp=sc.rule(wt,l), got=w.got[i];
      if(got!==exp){
        const why=got===null||got===undefined?" Функція нічого не повернула: перевір, чи в кожному випадку є return.":typeof got!=="boolean"?" Функція має повертати саме True або False, без лапок.":"";
        return FAIL("Деталь №"+(i+1)+" ("+wt+" г, "+l+" мм): очікувалося "+fmtPy(exp)+", а функція повернула "+fmtPy(got)+"."+why);
      }
    }
    return OK("Усі "+sc.batch.length+" рішень збіглися з еталоном.");
  }
},
{
  id:"st-18", ch:5, scene:"sensor", title:"Надійне читання", topic:"return у циклі · None",
  brief:"На станції 12 запит до датчика повторювали до трьох разів просто в основному циклі. Тепер ці спроби треба сховати у функцію: основний цикл стане коротшим, а функцію можна буде викликати будь-де.",
  task:["Напиши функцію <code>safe_read()</code> («надійне читання») без параметрів. Вона робить до 3 спроб прочитати датчик через <code>sensor.read()</code>.", "Щойно спроба вдалася, функція одразу повертає прочитане значення: <code>return t</code>. Команда <code>return</code> завершує всю функцію, тож решта спроб уже не відбудеться, і <code>break</code> тут не потрібен.", "Якщо спроба закінчилася помилкою <code>SensorError</code>, функція пробує ще раз. Коли всі 3 спроби невдалі, вона повертає <code>None</code> («нічого»): <code>return None</code>.", "Під функцією, без відступу, напиши основну програму. Є 5 точок вимірювання: <code>for point in range(5):</code>. Для кожної точки виклич функцію й запам'ятай результат: <code>t = safe_read()</code>.", "Якщо результат порожній (<code>if t is None:</code>), покажи на табло <code>\"FAIL\"</code>. Інакше покажи саме значення: <code>display.show(t)</code>."],
  api:[["def safe_read():", "робить до 3 спроб і повертає значення або None", "англ. <i>safe read</i> — «надійне читання»"], ["sensor.read()", "читає температуру; іноді замість числа виникає SensorError", "англ. <i>sensor read</i> — «прочитати датчик»"], ["return None", "повертає «нічого»: жодна спроба не вдалася", "англ. <i>none</i> — «нічого»"], ["t is None", "True, якщо в t лежить None", "англ. <i>is</i> — «є»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"]],
  starter:`def safe_read():
    # до 3 спроб: успіх — return значення,
    # SensorError — пробуємо ще раз.
    # Усі 3 невдалі — return None
    pass

for point in range(5):
    t = safe_read()
    # None — "FAIL", інакше — значення
`,
  solution:`def safe_read():
    for attempt in range(3):
        try:
            return sensor.read()
        except SensorError:
            pass
    return None

for point in range(5):
    t = safe_read()
    if t is None:
        display.show("FAIL")
    else:
        display.show(t)
`,
  hints:["Усередині функції потрібен цикл на 3 спроби: <code>for attempt in range(3):</code>, а в ньому <code>try</code> / <code>except SensorError</code>.","У <code>try</code> напиши <code>t = sensor.read()</code> і одразу <code>return t</code>. У <code>except</code> нічого робити не треба, тож там стоїть <code>pass</code>, і цикл піде на наступну спробу.","Рядок <code>return None</code> стоїть після циклу, з відступом лише функції. Python дійде до нього, тільки якщо жодна спроба не вдалася."],
  needFn:["safe_read"],
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
/* ---------- Розділ 6. Файли ---------- */
{
  id:"st-19", ch:6, scene:"files", title:"Журнал зміни", topic:"open · for line in f · close",
  brief:"Пульт лінії записує події зміни у файл <code>shift.log</code>, по одній на рядок. Начальник зміни хоче знати, скільки разів за зміну спрацювала тривога.",
  task:["Відкрий файл для читання: <code>f = open(\"shift.log\")</code>. Тепер змінна <code>f</code> означає відкритий файл.", "Перебери рядки файлу циклом <code>for line in f:</code>. На кожному повторі в змінній <code>line</code> лежить наступний рядок, наприклад <code>\"08:40 ALARM\\n\"</code>. Знак <code>\\n</code> у кінці означає перенесення рядка.", "Порахуй рядки, у яких є слово <code>ALARM</code> («тривога»). Чи є слово в рядку, перевіряє умова <code>if \"ALARM\" in line:</code>. Лічильник <code>count</code> створи ще до циклу й дай йому значення 0.", "Після циклу закрий файл: <code>f.close()</code>.", "Покажи результат на табло: <code>display.show(count)</code>."],
  api:[["open(\"shift.log\")", "відкриває файл для читання й повертає об'єкт файлу", "англ. <i>open</i> — «відкрити»"], ["for line in f:", "по черзі бере кожен рядок файлу", "англ. <i>line</i> — «рядок»"], ["\"ALARM\" in line", "True, якщо в рядку line є текст ALARM", "англ. <i>alarm</i> — «тривога»"], ["f.close()", "закриває файл", "англ. <i>close</i> — «закрити»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"]],
  starter:`f = open("shift.log")
for line in f:
    print(line)
f.close()

# порахуй рядки з ALARM і покажи число на табло
`,
  solution:`f = open("shift.log")
count = 0
for line in f:
    if "ALARM" in line:
        count += 1
f.close()
display.show(count)
`,
  hints:["Запусти заготовку й подивись у консоль: між рядками з'являються порожні, бо кожен рядок файлу вже закінчується на <code>\\n</code>, а <code>print</code> додає ще один.","Лічильник: <code>count = 0</code> перед циклом, а в циклі <code>if \"ALARM\" in line:</code> і з відступом <code>count += 1</code>.","<code>display.show(count)</code> пиши після циклу, без відступу. Інакше табло показуватиме значення на кожному рядку."],
  count:4,
  gen(r,i){
    const ev=["OK","OK","OK","START","STOP","ALARM","ALARM"];
    const n=ri(r,9,12), lines=[]; let h=8, m=0;
    for(let k=0;k<n;k++){ m+=ri(r,5,40); h+=Math.floor(m/60); m%=60; lines.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+" "+(k===0?"START":pick(r,ev))); }
    if(i===2) for(let k=1;k<n;k++) if(lines[k].endsWith("ALARM")) lines[k]=lines[k].slice(0,6)+"OK";
    return {files:{"shift.log":textOf(lines)},inputs:["shift.log"],outputs:[],n:1,alarms:lines.filter(s=>s.includes("ALARM")).length};
  },
  label:sc=>"тривог: "+sc.alarms,
  world:sc=>new FileWorld(sc),
  prelude:()=>DISPLAY_PRELUDE+FILE_PRELUDE,
  check(w,sc){
    const c=checkClosed(w); if(c) return c;
    if(!w.handles.length) return FAIL("Файл shift.log так і не відкрито.");
    if(!w.shown.length) return FAIL("На табло нічого не показано. Після циклу потрібен display.show(count).");
    if(w.shown.length>1) return FAIL("Табло показало "+w.shown.length+" значень, а має одне. Мабуть, display.show стоїть усередині циклу.");
    if(w.shown[0]!==sc.alarms) return FAIL("На табло "+fmtVal(w.shown[0])+", а тривог у файлі "+sc.alarms+".");
    return OK("Тривог за зміну: "+sc.alarms+".");
  }
},
{
  id:"st-20", ch:6, scene:"files", title:"Накладна", topic:"strip() · split() · int()",
  brief:"Склад надіслав накладну <code>invoice.txt</code>. У кожному її рядку записано кількість і назву деталей через крапку з комою. Треба порахувати, скільки всього прийшло деталей одного виду.",
  task:["Рядок накладної має вигляд <code>12;болт</code>: спершу кількість, потім назва. Назву деталей, які треба порахувати, вже записано в змінну <code>item</code> («позиція»), наприклад <code>\"болт\"</code>.", "Відкрий <code>invoice.txt</code> і перебери рядки так само, як на попередній станції. Суму <code>total</code> створи до циклу й дай їй значення 0.", "Кожен рядок спершу очисть: <code>line = line.strip()</code>. Метод <code>strip()</code> («обрізати») прибирає пробіли й <code>\\n</code> з обох країв рядка. Без цього назва буде <code>\"болт\\n\"</code>, і порівняння з <code>\"болт\"</code> не спрацює.", "Потім розділи рядок за крапкою з комою: <code>parts = line.split(\";\")</code>. Метод <code>split</code> («розділити») повертає список. Для рядка <code>\"12;болт\"</code> це <code>[\"12\", \"болт\"]</code>, тож кількість лежить у <code>parts[0]</code>, а назва — у <code>parts[1]</code>.", "Якщо назва дорівнює <code>item</code>, додай кількість до суми. Кількість поки що текст <code>\"12\"</code>, тому спершу перетвори її на число: <code>total += int(parts[0])</code>.", "Після циклу закрий файл і покажи суму на табло: <code>display.show(total)</code>."],
  api:[["item", "назва деталей, які треба порахувати", "англ. <i>item</i> — «позиція, предмет»"], ["line.strip()", "той самий рядок без пробілів і \\n на краях", "англ. <i>strip</i> — «обрізати»"], ["line.split(\";\")", "ділить рядок за ; і повертає список частин", "англ. <i>split</i> — «розділити»"], ["parts[0]", "перший елемент списку, parts[1] — другий", "нумерація з нуля"], ["int(\"12\")", "перетворює текст на ціле число 12", "англ. <i>integer</i> — «ціле число»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"]],
  starter:`print("Рахуємо:", item)

f = open("invoice.txt")
for line in f:
    parts = line.split(";")
    print(parts)
f.close()
`,
  solution:`f = open("invoice.txt")
total = 0
for line in f:
    line = line.strip()
    parts = line.split(";")
    if parts[1] == item:
        total += int(parts[0])
f.close()
display.show(total)
`,
  hints:["Запусти заготовку: у консолі видно, що друга частина кожного рядка закінчується на <code>\\n</code>. Саме його прибирає <code>strip()</code>.","Порядок у циклі такий: <code>strip</code>, потім <code>split</code>, потім перевірка <code>if parts[1] == item:</code>.","Не забудь <code>int()</code>: <code>\"12\" + \"5\"</code> дає рядок <code>\"125\"</code>, а <code>12 + 5</code> дає число 17."],
  count:4,
  gen(r,i){
    const names=["болт","гайка","шайба","гвинт"], item=[names[0],names[1],names[2],pick(r,names)][i];
    const n=ri(r,8,11), lines=[];
    for(let k=0;k<n;k++) lines.push(ri(r,2,40)+";"+pick(r,names));
    const ix=shuffle(r,[...Array(n).keys()]); lines[ix[0]]=ri(r,2,40)+";"+item; lines[ix[1]]=ri(r,2,40)+";"+item;
    const total=lines.filter(s=>s.split(";")[1]===item).reduce((a,s)=>a+ +s.split(";")[0],0);
    return {files:{"invoice.txt":textOf(lines)},inputs:["invoice.txt"],outputs:[],n:1,vars:{item},total};
  },
  label:sc=>sc.vars.item+": "+sc.total,
  world:sc=>new FileWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+DISPLAY_PRELUDE+FILE_PRELUDE,
  check(w,sc){
    const c=checkClosed(w); if(c) return c;
    if(!w.shown.length) return FAIL("На табло нічого не показано. Після циклу потрібен display.show(total).");
    if(w.shown.length>1) return FAIL("Табло показало "+w.shown.length+" значень, а має одне. Мабуть, display.show стоїть усередині циклу.");
    const g=w.shown[0];
    if(g===0) return FAIL("На табло 0, а має бути "+sc.total+". Схоже, порівняння з item жодного разу не спрацювало. Перевір, чи прибираєш ти \\n через strip().");
    if(typeof g==="string") return FAIL("На табло рядок "+fmtVal(g)+", а має бути число "+sc.total+". Кількість треба перетворити через int().");
    if(g!==sc.total) return FAIL("На табло "+g+", а деталей «"+sc.vars.item+"» у накладній "+sc.total+".");
    return OK("Деталей «"+sc.vars.item+"»: "+sc.total+".");
  }
},
{
  id:"st-21", ch:6, scene:"files", title:"Звіт верстата", topic:"open(…, \"w\") · write()",
  brief:"Верстат закінчив зміну. Тепер звіт треба зберегти у файл <code>report.txt</code>, щоб його прочитав технолог. Від учорашньої зміни там лишився старий звіт, і його слід замінити новим.",
  task:["У списку <code>jobs</code> лежать назви деталей, а в списку <code>results</code> на тих самих місцях записано результати: <code>\"ok\"</code> або <code>\"fail\"</code>. Тобто результат для <code>jobs[0]</code> — це <code>results[0]</code>, для <code>jobs[1]</code> — <code>results[1]</code> і так далі.", "Відкрий файл для запису: <code>f = open(\"report.txt\", \"w\")</code>. Режим <code>\"w\"</code> (<i>write</i> — «писати») починає файл з чистого аркуша: старий вміст зникає одразу після відкриття.", "Перший рядок звіту — заголовок. Запиши його так: <code>f.write(\"Звіт верстата\\n\")</code>. Метод <code>write</code> сам рядок не переносить, тому <code>\\n</code> у кінці кожного рядка треба дописувати самому.", "Далі для кожного завдання запиши рядок у форматі <code>назва: результат</code>, наприклад <code>вал: ok</code>. Перебирай номери так: <code>for i in range(len(jobs)):</code>. Тоді назва — це <code>jobs[i]</code>, а результат — <code>results[i]</code>. Рядок для запису збирають додаванням: <code>jobs[i] + \": \" + results[i] + \"\\n\"</code>.", "Останній рядок звіту — <code>Усього завдань: 5</code>, де замість 5 стоїть довжина списку, <code>len(jobs)</code>. <code>write</code> приймає лише текст, тому число перетвори на рядок: <code>str(len(jobs))</code>.", "Наприкінці закрий файл: <code>f.close()</code>. Поки файл відкритий, записаний текст чекає в буфері, і перевірка побачить файл порожнім."],
  api:[["jobs, results", "назви деталей і результати на тих самих місцях", "англ. <i>jobs</i> — «завдання»; <i>results</i> — «результати»"], ["open(\"report.txt\", \"w\")", "відкриває файл для запису; старий вміст зникає", "англ. <i>write</i> — «писати»"], ["f.write(текст)", "записує текст у файл; \\n не додає", "англ. <i>write</i> — «писати»"], ["len(jobs)", "кількість елементів у списку", "англ. <i>length</i> — «довжина»"], ["str(5)", "перетворює число на рядок \"5\"", "англ. <i>string</i> — «рядок»"], ["f.close()", "закриває файл і зберігає записане", "англ. <i>close</i> — «закрити»"]],
  starter:`print(jobs)
print(results)

f = open("report.txt", "w")
f.write("Звіт верстата\\n")
# рядки «назва: результат» для кожного завдання
# останній рядок: «Усього завдань: N»
`,
  solution:`f = open("report.txt", "w")
f.write("Звіт верстата\\n")
for i in range(len(jobs)):
    f.write(jobs[i] + ": " + results[i] + "\\n")
f.write("Усього завдань: " + str(len(jobs)) + "\\n")
f.close()
`,
  hints:["Запусти заготовку. Файл лишився відкритим, тому заголовок не потрапив у звіт. Допиши в кінці <code>f.close()</code> і запусти ще раз.","У циклі один рядок: <code>f.write(jobs[i] + \": \" + results[i] + \"\\n\")</code>. Зверни увагу на пробіл після двокрапки.","Останній рядок: <code>f.write(\"Усього завдань: \" + str(len(jobs)) + \"\\n\")</code>. Без <code>str()</code> Python не зможе додати число до тексту."],
  count:4,
  gen(r,i){
    const names=shuffle(r,["вал","шестерня","кронштейн","фланець","втулка","кришка","муфта","корпус"]);
    const n=[4,6,5,ri(r,3,6)][i], jobs=names.slice(0,n), results=jobs.map(()=>pick(r,["ok","ok","ok","fail"]));
    if(i===0) results[1]="fail";
    return {files:{"report.txt":"Звіт за вчора\nвал: ok\nУсього завдань: 1\n"},inputs:[],outputs:["report.txt"],n:0,vars:{jobs,results}};
  },
  label:sc=>sc.vars.jobs.length+" завдань",
  world:sc=>new FileWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+FILE_PRELUDE,
  check(w,sc){
    const {jobs,results}=sc.vars;
    if(w.files["report.txt"]&&w.files["report.txt"].startsWith("Звіт за вчора")&&!w.handles.some(h=>h.name==="report.txt"&&h.mode==="w")) return FAIL("У файлі лишився вчорашній звіт. Відкрий report.txt у режимі \"w\", щоб почати з чистого аркуша.");
    const bad=checkFileText(w,"report.txt",["Звіт верстата"].concat(jobs.map((j,k)=>j+": "+results[k]),["Усього завдань: "+jobs.length]));
    if(bad) return bad;
    return checkClosed(w)||OK("Звіт на "+(jobs.length+2)+" рядків збережено.");
  }
},
{
  id:"st-22", ch:6, scene:"files", title:"Журнал без втрат", topic:"режим \"a\" · with",
  brief:"У файлі <code>log.txt</code> зберігається журнал подій лінії за кілька днів. Нові події треба дописати в кінець журналу так, щоб усі старі записи лишилися на місці.",
  task:["Нові події лежать у списку <code>events</code>, наприклад <code>[\"12:05 START\", \"12:40 ALARM\"]</code>. Кожну подію треба дописати окремим рядком у кінець файлу <code>log.txt</code>.", "Режим <code>\"w\"</code> тут не годиться, бо він стер би всі старі записи. Потрібен режим <code>\"a\"</code> (<i>append</i> — «дописати»): він залишає вміст файлу й додає новий текст у кінець.", "Відкрий файл через <code>with</code>: <code>with open(\"log.txt\", \"a\") as f:</code>. Усе, що пишеш у файл, розміщуй у блоці з відступом під цим рядком. Коли блок закінчиться, Python сам закриє файл, тож <code>f.close()</code> писати не треба.", "Усередині блоку перебери події (<code>for e in events:</code>) і запиши кожну окремим рядком: <code>f.write(e + \"\\n\")</code>."],
  api:[["events", "список нових подій", "англ. <i>events</i> — «події»"], ["open(\"log.txt\", \"a\")", "відкриває файл для дописування в кінець", "англ. <i>append</i> — «дописати»"], ["with open(…) as f:", "відкриває файл і сам закриває його після блоку", "англ. <i>with</i> — «з»; <i>as</i> — «як»"], ["f.write(текст)", "записує текст у файл; \\n не додає", "англ. <i>write</i> — «писати»"]],
  starter:`print("Нові події:", events)

f = open("log.txt", "w")
for e in events:
    f.write(e + "\\n")
f.close()
`,
  solution:`with open("log.txt", "a") as f:
    for e in events:
        f.write(e + "\\n")
`,
  hints:["Запусти заготовку й подивись на файл у сцені: режим <code>\"w\"</code> стер журнал за попередні дні.","Перший рядок: <code>with open(\"log.txt\", \"a\") as f:</code>. Цикл <code>for</code> пиши всередині цього блоку, з відступом.","Рядок <code>f.close()</code> більше не потрібен: <code>with</code> закриває файл сам, щойно закінчиться його блок."],
  count:4,
  gen(r,i){
    const ev=["START","OK","OK","ALARM","STOP"];
    const mk=(h,n)=>{ const out=[]; let m=0; for(let k=0;k<n;k++){ m+=ri(r,7,25); out.push(String(h+Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")+" "+pick(r,ev)); } return out; };
    const old=["--- 27.10 ---"].concat(mk(8,3),["--- 28.10 ---"],mk(9,ri(r,2,3)));
    const events=mk(12,[3,4,2,ri(r,2,5)][i]);
    return {files:{"log.txt":textOf(old)},inputs:[],outputs:["log.txt"],n:0,vars:{events},old};
  },
  label:sc=>"нових подій: "+sc.vars.events.length,
  world:sc=>new FileWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+FILE_PRELUDE,
  check(w,sc){
    if(w.handles.some(h=>h.name==="log.txt"&&h.mode==="w")) return FAIL("Файл відкрито в режимі \"w\", і старі записи журналу зникли. Для дописування в кінець потрібен режим \"a\".");
    const bad=checkFileText(w,"log.txt",sc.old.concat(sc.vars.events)); if(bad) return bad;
    const c=checkClosed(w); if(c) return c;
    if(w.handles.some(h=>!h.viaWith)) return FAIL("Записи на місці, але файл закрито вручну через close(). На цій станції відкрий його через with open(\"log.txt\", \"a\") as f:.");
    return OK("Дописано подій: "+sc.vars.events.length+", старі записи цілі.");
  }
},
{
  id:"st-23", ch:6, scene:"files", title:"Зламані накладні", topic:"FileNotFoundError · ValueError",
  brief:"Склад щодня надсилає накладну з кількостями деталей: <code>day1.txt</code>, <code>day2.txt</code> і так далі. Деяких файлів бракує, а в деяких рядках замість числа трапляється сміття. Програма має порахувати все, що вдасться, і не впасти.",
  task:["Назви файлів лежать у списку <code>days</code>. Перебери їх циклом <code>for name in days:</code>. Для кожного файлу на табло має з'явитися рівно одне значення.", "У кожному рядку накладної записано одне число — кількість деталей. Склади всі числа файлу й покажи суму: <code>display.show(total)</code>. Суму <code>total</code> обнуляй окремо для кожного файлу.", "Якщо файлу немає, <code>open(name)</code> кидає <code>FileNotFoundError</code> («файл не знайдено»). Перехопи цей виняток і покажи на табло <code>\"NO FILE\"</code>. Програма має перейти до наступного файлу.", "Якщо в рядку не число, наприклад <code>x7</code>, то <code>int(line)</code> кидає <code>ValueError</code>. Такий рядок просто пропусти: перехопи <code>ValueError</code> і напиши <code>continue</code>. Решту чисел цього файлу все одно треба скласти.", "Кожен файл відкривай через <code>with open(name) as f:</code>. Тоді він закриється сам, навіть якщо всередині станеться помилка."],
  api:[["days", "список назв файлів-накладних", "англ. <i>days</i> — «дні»"], ["with open(name) as f:", "відкриває файл і сам закриває його після блоку", "англ. <i>with</i> — «з»"], ["int(line)", "число з рядка; для \"x7\" кидає ValueError", "англ. <i>value error</i> — «помилка значення»"], ["FileNotFoundError", "виняток, коли файлу немає", "англ. <i>file not found</i> — «файл не знайдено»"], ["display.show(значення)", "показує значення на табло", "англ. <i>display show</i> — «показати на табло»"]],
  starter:`print("Накладні:", days)

for name in days:
    with open(name) as f:
        total = 0
        for line in f:
            total += int(line)
    display.show(total)
`,
  solution:`for name in days:
    try:
        with open(name) as f:
            total = 0
            for line in f:
                try:
                    total += int(line)
                except ValueError:
                    continue
        display.show(total)
    except FileNotFoundError:
        display.show("NO FILE")
`,
  hints:["Тут два різні винятки в різних місцях. <code>FileNotFoundError</code> виникає на рядку з <code>open</code>, а <code>ValueError</code> — на рядку з <code>int</code>. Тому потрібні два окремі <code>try</code>.","Внутрішній <code>try</code> огортає лише <code>total += int(line)</code>, а його <code>except ValueError:</code> містить <code>continue</code>.","Зовнішній <code>try</code> огортає весь <code>with</code> разом із <code>display.show(total)</code>. Його <code>except FileNotFoundError:</code> показує <code>\"NO FILE\"</code>."],
  count:4,
  gen(r,i){
    const n=[4,5,4,ri(r,3,5)][i], days=[], files={}, exp=[], miss=new Set();
    miss.add(ri(r,1,n-1)); if(r()<.4) miss.add(ri(r,0,n-1));
    for(let d=0;d<n;d++){
      const name="day"+(d+1)+".txt"; days.push(name);
      if(miss.has(d)){ exp.push("NO FILE"); continue; }
      const k=ri(r,3,5), lines=[]; let t=0;
      for(let j=0;j<k;j++){ if(r()<.2||(d===0&&j===1&&i<3)) lines.push(pick(r,["x7","--","1O","N/A"])); else { const v=ri(r,1,30); t+=v; lines.push(String(v)); } }
      files[name]=textOf(lines); exp.push(t);
    }
    return {files,inputs:days,outputs:[],n,vars:{days},exp};
  },
  label:sc=>sc.vars.days.length+" файлів, бракує "+sc.exp.filter(e=>e==="NO FILE").length,
  world:sc=>new FileWorld(sc),
  prelude:sc=>varsPrelude(sc.vars)+DISPLAY_PRELUDE+FILE_PRELUDE,
  check(w,sc){
    for(let k=0;k<Math.max(sc.exp.length,w.shown.length);k++){
      const e=sc.exp[k], g=w.shown[k];
      if(g===undefined) return FAIL("На табло показано значень: "+w.shown.length+" із "+sc.exp.length+". Для "+sc.vars.days[k]+" мало бути "+fmtVal(e)+".");
      if(e===undefined) return FAIL("На табло з'явилося зайве значення "+fmtVal(g)+". Для кожного файлу — рівно одне.");
      if(g!==e) return FAIL(sc.vars.days[k]+": очікувалося "+fmtVal(e)+", а показано "+fmtVal(g)+"."+(e!=="NO FILE"&&typeof g==="number"&&g<e?" Схоже, після рядка зі сміттям решту чисел файлу не пораховано.":""));
    }
    const c=checkClosed(w); if(c) return c;
    if(w.handles.some(h=>!h.viaWith)) return FAIL("Значення правильні, але файли закрито вручну. Відкривай кожен файл через with open(name) as f:.");
    return OK("Опрацьовано накладних: "+sc.exp.filter(e=>e!=="NO FILE").length+" з "+sc.exp.length+".");
  }
},
/* ---------- Розділ 7. Фінал ---------- */
{
  id:"st-24", ch:7, scene:"belt", title:"Міні-завод", topic:"усе разом",
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
},
{
  id:"st-25", ch:7, scene:"files", title:"Нічний звіт", topic:"функції · файли · винятки",
  brief:"Уночі датчик температури записує заміри у файл <code>night.txt</code>, по одному на рядок. Коли зв'язок зривається, замість числа в рядку стоїть <code>ERR</code>. Зранку технолог хоче отримати готовий звіт <code>report.txt</code>, де біля кожного заміру написано, чи він у нормі.",
  task:["Напиши функцію <code>status(t)</code>. Вона отримує температуру й повертає рядок: <code>\"LOW\"</code> («низька»), якщо <code>t</code> менша за 18, <code>\"HIGH\"</code> («висока»), якщо <code>t</code> більша за 26, і <code>\"OK\"</code> в усіх інших випадках.", "Відкрий <code>night.txt</code> для читання, а <code>report.txt</code> для запису. Обидва файли відкривай через <code>with</code>; другий <code>with</code> можна вкласти в перший.", "Для кожного рядка з <code>night.txt</code> спробуй отримати дробове число: <code>t = float(line)</code>.", "Якщо вийшло, запиши у звіт рядок у форматі <code>22.5 OK</code>: число, пробіл і те, що повернула <code>status(t)</code>. Збери його так: <code>str(t) + \" \" + status(t) + \"\\n\"</code>.", "Якщо <code>float(line)</code> кинула <code>ValueError</code>, запиши у звіт рядок <code>ERR</code> і переходь до наступного заміру.", "Останнім рядком звіту запиши, скільки замірів у нормі, наприклад <code>OK: 7</code>. Рахуй для цього, скільки разів <code>status(t)</code> повернула <code>\"OK\"</code>."],
  api:[["def status(t):", "повертає \"LOW\", \"HIGH\" або \"OK\"", "англ. <i>status</i> — «стан»"], ["float(line)", "дробове число з рядка; для \"ERR\" кидає ValueError", "англ. <i>float</i> — «число з плаваючою комою»"], ["with open(…) as f:", "відкриває файл і сам закриває його після блоку", "англ. <i>with</i> — «з»"], ["open(\"report.txt\", \"w\")", "відкриває файл для запису", "англ. <i>write</i> — «писати»"], ["f.write(текст)", "записує текст у файл; \\n не додає", "англ. <i>write</i> — «писати»"], ["str(t)", "перетворює число на рядок", "англ. <i>string</i> — «рядок»"]],
  starter:`def status(t):
    # "LOW" — нижче 18, "HIGH" — вище 26, інакше "OK"
    pass

with open("night.txt") as src:
    with open("report.txt", "w") as out:
        for line in src:
            print(line.strip())
`,
  solution:`def status(t):
    if t < 18:
        return "LOW"
    elif t > 26:
        return "HIGH"
    return "OK"

count = 0
with open("night.txt") as src:
    with open("report.txt", "w") as out:
        for line in src:
            try:
                t = float(line)
            except ValueError:
                out.write("ERR\\n")
                continue
            s = status(t)
            if s == "OK":
                count += 1
            out.write(str(t) + " " + s + "\\n")
        out.write("OK: " + str(count) + "\\n")
`,
  hints:["Почни з функції: три гілки, у кожній свій <code>return</code>. Межі 18 і 26 входять у норму.","У циклі: <code>try</code> з <code>float(line)</code>, у <code>except ValueError:</code> запиши <code>\"ERR\\n\"</code> і напиши <code>continue</code>. Нижче, вже після <code>try</code>, виклич <code>status(t)</code> і запиши рядок.","Лічильник <code>count = 0</code> створи до відкриття файлів. Рядок <code>OK: …</code> пиши після циклу, але ще всередині блоку <code>with</code> для <code>report.txt</code>: після блоку файл уже закрито."],
  needFn:["status"],
  count:4,
  gen(r,i){
    const n=ri(r,8,11), vals=[];
    const one=()=>{ let v=Math.round((14+r()*16)*10)/10; if(Math.round(v*10)%10===0) v=Math.round((v+.3)*10)/10; return v; };
    for(let k=0;k<n;k++) vals.push(r()<.15?"ERR":one());
    const ix=shuffle(r,[...Array(n).keys()]);
    if(i<3){ vals[ix[0]]="ERR"; vals[ix[1]]=17.9; vals[ix[2]]=26.1; vals[ix[3]]=21.4; }
    const st=t=>t<18?"LOW":t>26?"HIGH":"OK";
    const rep=vals.map(v=>v==="ERR"?"ERR":String(v)+" "+st(v));
    rep.push("OK: "+vals.filter(v=>v!=="ERR"&&st(v)==="OK").length);
    return {files:{"night.txt":textOf(vals.map(String))},inputs:["night.txt"],outputs:["report.txt"],n:0,rep};
  },
  label:sc=>(sc.rep.length-1)+" замірів, "+sc.rep[sc.rep.length-1],
  world:sc=>new FileWorld(sc),
  prelude:()=>FILE_PRELUDE,
  check(w,sc){
    const bad=checkFileText(w,"report.txt",sc.rep); if(bad) return bad;
    const c=checkClosed(w); if(c) return c;
    return OK("Звіт готовий: "+sc.rep[sc.rep.length-1]+".");
  }
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
let _added=[], _saved={};
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
  ScanError:["Неперехоплений ScanError","Сканер не прочитав код, а програма цього не обробила. Потрібен try / except ScanError."],
  FileNotFoundError:["Файл не знайдено","Перевір назву файлу. Якщо файлу справді може не бути, обробляй це через try / except FileNotFoundError."],
  IOError:["Помилка роботи з файлом",""]
};
const uaPlural=(n,a,b,c)=>{ const d=n%10, h=n%100; return d===1&&h!==11?a:d>=2&&d<=4&&(h<10||h>=20)?b:c; };
const UA_MSG=["RobotError","SensorError","OverheatError","JamError","ScanError","_Halt","FileNotFoundError","IOError"];
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
  if(type==="TypeError"){ const m=/^(\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were)/.exec(msg); if(m){ title="Не та кількість аргументів"; expl="Функцію "+m[1]+"() викликано з "+m[3]+(+m[3]===1?" аргументом":" аргументами")+", а в її def "+m[2]+" "+uaPlural(+m[2],"параметр","параметри","параметрів")+". Звір рядок def з умовою завдання."; }
    const m2=/^(\w+)\(\) missing (\d+) required/.exec(msg); if(m2){ title="Не та кількість аргументів"; expl="Функції "+m2[1]+"() не вистачило аргументів: у def параметрів більше, ніж передано у виклику. Звір рядок def з умовою завдання."; } }
  if(type==="TypeError"&&/concatenate|unsupported operand type\(s\) for \+|must be str/.test(msg)){ title="Текст і число не додаються"; expl="Python не додає число до рядка. Перетвори число на текст через str(), а текст на число — через int() або float()."; }
  if(/^(Файл|write\(\)|Назва файлу|Невідомий режим)/.test(msg)&&(type==="TypeError"||type==="ValueError")&&!expl){ expl=msg; msg=""; }
  const uaMsg = UA_MSG.includes(type) ? msg : "";
  const where=line?" (рядок "+line+")":"";
  msg=msg.replace(/\s+/g," ");
  const text=title+where+(uaMsg?": "+uaMsg:"")+(expl?(uaMsg?" ":". ")+expl:"")+(uaMsg||type==="TimeLimitError"?"":(msg?" ["+type+": "+msg+"]":" ["+type+"]"));
  return {type,title,msg,line,text,short:title+(uaMsg?": "+uaMsg:"")};
}
async function runCode(lv,sc,code){
  const world=lv.world(sc);
  let out="";
  Sk.configure({output:s=>{ out+=s; if(out.length>30000) out=out.slice(-30000); }, read:skRead, __future__:Sk.python3, execLimit:5000, yieldLimit:200});
  Sk.execLimit=5000;
  for(const k of _added){ if(k in _saved){ Sk.builtins[k]=_saved[k]; } else delete Sk.builtins[k]; }
  _added=[]; _saved={};
  const addBuiltin=(k,v)=>{ if(!_added.includes(k)){ if(k in Sk.builtins) _saved[k]=Sk.builtins[k]; _added.push(k); } Sk.builtins[k]=v; };
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
    for(const k in mod.$d){ if(k.indexOf("__")!==0) addBuiltin(k,mod.$d[k]); }
  }catch(e){ return {events:[],out,err:{text:"Помилка підготовки рівня: "+e},res:FAIL("Помилка підготовки рівня")}; }
  if(!code.trim()) err={type:"Empty",title:"Порожня програма",msg:"",line:null,text:"Програма порожня. Напиши код у редакторі.",short:"Порожня програма"};
  else{
    try{
      Sk.execStart=Date.now();
      const user=await Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("<stdin>",false,code,true));
      for(const fn of (lv.needFn||[])){
        const f=user.$d[fn];
        if(!(f instanceof Sk.builtin.func)){
          const t=f===undefined?"Функцію "+fn+"() не знайдено. Її треба визначити рядком def "+fn+"(…): і тілом з відступом під ним.":"Ім'я "+fn+" є, але це не функція. Визнач її через def "+fn+"(…):.";
          throw {_noFn:true,title:"Немає функції «"+fn+"»",text:t};
        }
      }
      if(lv.driver){
        for(const k in user.$d){ if(k.indexOf("__")!==0) addBuiltin(k,user.$d[k]); }
        await Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("<station>",false,lv.driver(sc),true));
      }
    }
    catch(e){ err=e&&e._noFn?{type:"NoFunc",title:e.title,msg:"",line:null,text:e.text,short:e.title}:formatErr(e); }
  }
  world.finish(err);
  const res= err ? FAIL(err.text) : lv.check(world,sc,out);
  if(err) world.emit({t:"crash",msg:err.short});
  return {events:world.events,out,err,res,world};
}
const PLAIN_LEVEL={world:sc=>new World(sc),prelude:()=>"",check:()=>OK()};
const FILE_PLAIN_LEVEL={world:sc=>new FileWorld(sc),prelude:()=>FILE_PRELUDE,check:()=>OK()};
if(typeof module!=="undefined") module.exports={LEVELS,makeScenarios,runCode,PLAIN_LEVEL,FILE_PLAIN_LEVEL};
