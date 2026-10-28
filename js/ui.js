/* ============ UI ============ */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const CHAPTERS={1:"Умови",2:"Цикл for",3:"Цикл while",4:"Винятки",5:"Функції",6:"Файли",7:"Фінал"};
const FINAL=7;

/* ---------- збереження ---------- */
const STORE_KEY="robocex-v2";
let SAVE={done:{},code:{},hints:{},sol:{}};
try{
  let s=JSON.parse(localStorage.getItem(STORE_KEY)||"null");
  if(!s){ // у v1 «Міні-завод» мав id st-14; тепер це st-24, а st-14 — нова станція
    const old=JSON.parse(localStorage.getItem("robocex-v1")||"null");
    if(old&&typeof old==="object"){ for(const k of ["done","code","hints","sol"]) if(old[k]&&"st-14" in old[k]){ old[k]["st-24"]=old[k]["st-14"]; delete old[k]["st-14"]; } s=old; }
  }
  if(s&&typeof s==="object") SAVE=Object.assign(SAVE,s);
}catch(_){}
function persist(){ try{ localStorage.setItem(STORE_KEY,JSON.stringify(SAVE)); }catch(_){} }

/* ---------- підсвітка Python ---------- */
const KW=new Set("if elif else for while in not and or try except finally break continue pass True False None def return import from as raise class with lambda is".split(" "));
const BI=new Set("print range len int float str list abs min max round sum enumerate type open".split(" "));
const API=new Set("robot rover conveyor arm sensor display motor scanner part jobs results events days item steps".split(" "));
function highlight(src){
  const re=/(#[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*)|([^\w#"'Ѐ-ӿ]+|.)/g;
  let out="",m;
  while((m=re.exec(src))){
    if(m[1]) out+='<span class="t-com">'+esc(m[1])+"</span>";
    else if(m[2]) out+='<span class="t-str">'+esc(m[2])+"</span>";
    else if(m[3]) out+='<span class="t-num">'+m[3]+"</span>";
    else if(m[4]){ const w=m[4]; const cls=KW.has(w)?"t-kw":BI.has(w)?"t-bi":API.has(w)?"t-api":/Error$/.test(w)?"t-err":""; out+=cls?'<span class="'+cls+'">'+w+"</span>":w; }
    else out+=esc(m[0]);
  }
  return out+"\n";
}

/* ---------- редактор ---------- */
function makeEditor(host,code,opts={}){
  host.classList.add("ed");
  host.innerHTML='<div class="ed-gutter" aria-hidden="true"></div><div class="ed-scroll"><div class="ed-inner"><div class="ed-errline" hidden></div><pre class="ed-hl" aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="'+esc(opts.label||"Код Python")+'"></textarea></div></div>';
  if(opts.id) host.querySelector("textarea").id=opts.id;
  const ta=host.querySelector("textarea"), hl=host.querySelector(".ed-hl"), gut=host.querySelector(".ed-gutter"), errl=host.querySelector(".ed-errline");
  const render=()=>{ hl.innerHTML=highlight(ta.value); const n=ta.value.split("\n").length; let g=""; for(let i=1;i<=n;i++) g+="<span>"+i+"</span>"; gut.innerHTML=g; };
  ta.value=code; render();
  const ins=(text)=>{ if(!document.execCommand||!document.execCommand("insertText",false,text)){ ta.setRangeText(text,ta.selectionStart,ta.selectionEnd,"end"); } };
  ta.addEventListener("input",()=>{ render(); ed.clearError(); opts.onChange&&opts.onChange(ta.value); });
  ta.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){ e.preventDefault(); opts.onRun&&opts.onRun(); return; }
    const v=ta.value, s=ta.selectionStart, en=ta.selectionEnd;
    if(e.key==="Tab"){
      e.preventDefault();
      const ls=v.lastIndexOf("\n",s-1)+1;
      if(s===en&&!e.shiftKey){ ins("    "); return; }
      const le=v.indexOf("\n",en-1)===-1?v.length:v.indexOf("\n",en-(en>s&&v[en-1]==="\n"?1:0));
      const block=v.slice(ls,le);
      const nb=e.shiftKey?block.replace(/^ {1,4}/gm,""):block.replace(/^/gm,"    ");
      ta.setSelectionRange(ls,le); ins(nb); ta.setSelectionRange(ls,ls+nb.length); return;
    }
    if(e.key==="Enter"&&!e.shiftKey){
      e.preventDefault();
      const ls=v.lastIndexOf("\n",s-1)+1, line=v.slice(ls,s);
      let ind=(line.match(/^ */)||[""])[0];
      if(/:\s*(#.*)?$/.test(line)) ind+="    ";
      else if(/^\s*(break|continue|pass|return)\b/.test(line)) ind=ind.slice(0,Math.max(0,ind.length-4));
      ins("\n"+ind); return;
    }
    if(e.key==="Backspace"&&s===en&&s>0){
      const ls=v.lastIndexOf("\n",s-1)+1, before=v.slice(ls,s);
      if(before.length>0&&/^ +$/.test(before)){ e.preventDefault(); const k=before.length%4||4; ta.setSelectionRange(s-k,s); ins(""); }
    }
  });
  const ed={
    get value(){ return ta.value; },
    set value(v){ ta.value=v; render(); ed.clearError(); },
    focus(){ ta.focus(); },
    showError(line){ if(!line) return; const lh=parseFloat(getComputedStyle(ta).lineHeight)||22; const pt=parseFloat(getComputedStyle(ta).paddingTop)||12; errl.style.top=(pt+(line-1)*lh)+"px"; errl.style.height=lh+"px"; errl.hidden=false; const sp=gut.children[line-1]; if(sp) sp.classList.add("err"); },
    clearError(){ errl.hidden=true; [...gut.children].forEach(s=>s.classList.remove("err")); }
  };
  return ed;
}

/* ---------- ТЕОРІЯ ---------- */
const TH=[
{ id:"teoria-umovy", nav:"Умови", title:"Умовні оператори", lead:"Уявіть робота-пилососа. Якщо попереду стіна, він повертає. Якщо батарея сідає, їде на базу. У Python такі «якщо» записують через <code>if</code>, а коли варіантів кілька, додають <code>elif</code> та <code>else</code>.",
  body:[
  ["h","Перша умова: if"],
  ["p","Після <code>if</code> пишемо умову, а в кінці рядка двокрапку. Рядки нижче з відступом (4 пробіли) утворюють <b>блок</b>. Він виконується лише тоді, коли умова істинна (<code>True</code>)."],
  ["code",`battery = 12
if battery < 20:
    print("Низький заряд, їду на зарядку")
print("Перевірку завершено")`],
  ["p","Останній рядок не має відступу, тому він не належить до блоку <code>if</code> і виконується завжди. Зміни <code>battery</code> на 50 і запусти ще раз."],
  ["h","Оператори порівняння"],
  ["table",[["Запис","Значення","Приклад → результат"],["==","дорівнює",'light == "green"'],["!=","не дорівнює","color != \"red\""],["<  >","менше, більше","temp > 30"],["<=  >=","не більше, не менше","battery <= 15"]]],
  ["note","Один знак <code>=</code> записує значення в змінну, а два <code>==</code> порівнюють. <code>if x = 5:</code> — помилка."],
  ["h","Дві гілки: else"],
  ["p","<code>else</code> не має умови: його блок виконується, коли умова <code>if</code> хибна. Із двох гілок завжди спрацьовує рівно одна."],
  ["code",`humidity = 55
if humidity < 40:
    print("Вмикаю полив")
else:
    print("Ґрунт вологий, полив не потрібен")`],
  ["h","Багато гілок: elif"],
  ["p","<code>elif</code> означає «інакше, якщо». Python перевіряє умови згори вниз і виконує <b>першу</b> істинну гілку. Решту пропускає, навіть якщо вони теж істинні."],
  ["code",`distance = 35   # см до перешкоди
if distance < 10:
    print("СТОП")
elif distance < 50:
    print("Повільно")
else:
    print("Повний хід")`],
  ["p","При <code>distance = 5</code> обидві умови істинні, але виведеться тільки «СТОП». Тому найсуворіші умови ставлять вище."],
  ["h","Логічні оператори: and, or, not"],
  ["table",[["Оператор","Коли True"],["a and b","обидві умови істинні"],["a or b","хоча б одна істинна"],["not a","a хибна"]]],
  ["code",`light = "green"
pedestrian = False
if light == "green" and not pedestrian:
    print("Можна їхати")
else:
    print("Чекаю")`],
  ["h","Типові помилки"],
  ["list",["Забута двокрапка після умови: <code>if x &gt; 3</code>.","Різні відступи в одному блоці: усі рядки блоку мають починатися з однакової кількості пробілів.","<code>=</code> замість <code>==</code> в умові.","Рядки без лапок: <code>light == green</code> шукатиме змінну <code>green</code>."]]
  ]
},
{ id:"teoria-for", nav:"Цикл for", title:"Цикл for", lead:"Конвеєр подає деталі одну за одною, і з кожною робот робить те саме. Писати однаковий код для кожної деталі окремо не треба. Цикл <code>for</code> повторить дію для кожної деталі або стільки разів, скільки ви скажете.",
  body:[
  ["h","Перебір списку"],
  ["p","Змінна після <code>for</code> по черзі отримує кожен елемент. Блок із відступом виконується один раз для кожного елемента."],
  ["code",`parts = ["болт", "гайка", "шайба"]
for part in parts:
    print("Обробляю:", part)
print("Усі деталі оброблено")`],
  ["h","Повторення n разів: range()"],
  ["table",[["Виклик","Числа"],["range(5)","0, 1, 2, 3, 4"],["range(2, 6)","2, 3, 4, 5"],["range(0, 10, 3)","0, 3, 6, 9"],["range(5, 0, -1)","5, 4, 3, 2, 1"]]],
  ["p","Верхня межа в результат не входить: <code>range(5)</code> закінчується на 4."],
  ["code",`count = 4
for i in range(count):
    print("Ставлю ящик на позицію", i)`],
  ["h","Накопичення результату"],
  ["p","Часто в циклі щось підраховують. Змінну-лічильник створюють <b>до</b> циклу, а змінюють усередині."],
  ["code",`weights = [120, 85, 240, 60]
total = 0
for w in weights:
    total = total + w
print("Загальна вага:", total, "г")`],
  ["h","Вкладені цикли"],
  ["p","Вкладений цикл — це цикл усередині іншого циклу. На кожному кроці зовнішнього циклу внутрішній проходить повністю. Так обходять таблиці, сітки й палети: зовнішній цикл — ряди, внутрішній — позиції в ряду."],
  ["code",`for y in range(3):
    row = ""
    for x in range(5):
        if (x + y) % 2 == 0:
            row = row + "# "
        else:
            row = row + ". "
    print(row)`],
  ["h","break і continue"],
  ["p","<code>continue</code> пропускає решту тіла циклу й одразу переходить до наступного елемента. <code>break</code> повністю виходить із циклу."],
  ["code",`temps = [22, 24, -1, 23, 99, 21]
for t in temps:
    if t < 0:
        print("Помилковий замір, пропускаю")
        continue
    if t > 80:
        print("Перегрів! Зупиняю лінію")
        break
    print("Температура в нормі:", t)`],
  ["p","Число 21 так і не виведеться: <code>break</code> зупинив цикл на 99."]
  ]
},
{ id:"teoria-while", nav:"Цикл while", title:"Цикл while", lead:"Марсохід їде вперед, доки не доїде до каменя, і скільки на це піде кроків, наперед невідомо. Для таких випадків є цикл <code>while</code>. Він повторює дію, поки умова виконується, і зупиняється, щойно вона перестає виконуватися.",
  body:[
  ["h","Повторювати, поки умова істинна"],
  ["p","Перед кожним повтором Python перевіряє умову. Якщо вона істинна — виконує блок і повертається до перевірки. Якщо хибна — виходить із циклу."],
  ["code",`battery = 100
steps = 0
while battery > 20:
    battery = battery - 15
    steps += 1
print("Кроків:", steps, "Залишок заряду:", battery)`],
  ["p","<code>steps += 1</code> — скорочений запис <code>steps = steps + 1</code>. Якщо умова хибна від самого початку, тіло циклу не виконається жодного разу."],
  ["h","Нескінченний цикл"],
  ["p","Якщо всередині циклу нічого не змінює умову, вона ніколи не стане хибною, і програма зависне. На цій сторінці таку програму зупинить обмеження часу або кількості команд робота."],
  ["code",`n = 0
while n < 5:
    print("n =", n)
    n += 1    # прибери цей рядок і подивись, що станеться`],
  ["h","while True і break"],
  ["p","Коли умову виходу зручніше перевіряти посередині тіла циклу, пишуть <code>while True:</code> і виходять через <code>break</code>."],
  ["code",`attempt = 0
while True:
    attempt += 1
    print("Спроба", attempt)
    if attempt == 3:
        print("Вдалося!")
        break`],
  ["h","for чи while?"],
  ["table",[["Ситуація","Цикл"],["Є список або відома кількість повторень","for"],["Повторювати, доки щось не станеться","while"],["Кількість кроків залежить від датчиків","while"]]],
  ["note","Будь-який for можна переписати через while з лічильником, але for коротший і не дає забути збільшити лічильник."]
  ]
},
{ id:"teoria-try", nav:"try / except", title:"Обробка винятків", lead:"Буває, що датчик не відповідає, мотор перегрівається або з датчика приходить якесь сміття. Python у такому разі зупиняє програму з помилкою, яку називають <b>винятком</b>. Якщо загорнути ризикований код у <code>try</code> / <code>except</code>, програма впорається зі збоєм і працюватиме далі.",
  body:[
  ["h","Що відбувається без обробки"],
  ["p","<code>int()</code> перетворює рядок на число, але на тексті «помилка» кидає <code>ValueError</code>. Запусти й подивись, на якому рядку все зупиниться."],
  ["code",`values = ["21", "22", "помилка", "24"]
for v in values:
    t = int(v)
    print("Температура:", t)`],
  ["h","try і except"],
  ["p","Небезпечний код кладемо в блок <code>try</code>. Якщо там виникне виняток вказаного типу, Python перейде в блок <code>except</code>, виконає його й продовжить роботу після всієї конструкції."],
  ["code",`values = ["21", "22", "помилка", "24"]
for v in values:
    try:
        t = int(v)
        print("Температура:", t)
    except ValueError:
        print("Не вдалося розібрати:", v)`],
  ["h","Кілька except, else і finally"],
  ["list",["Кілька блоків <code>except</code> обробляють різні типи винятків по-різному.","<code>except Тип as e</code> зберігає виняток у змінну <code>e</code>, щоб вивести повідомлення.","<code>else</code> виконується, якщо в <code>try</code> винятку не було.","<code>finally</code> виконується <b>завжди</b>: і після успіху, і після обробленого винятку. Туди кладуть завершальні дії, наприклад вимкнення мотора."]],
  ["code",`readings = [10, 0, "x", 5]
for r in readings:
    try:
        result = 100 / r
    except ZeroDivisionError:
        print("Ділення на нуль")
    except TypeError as e:
        print("Неправильний тип:", e)
    else:
        print("Результат:", result)
    finally:
        print("--- замір оброблено")`],
  ["h","Власні винятки: raise"],
  ["p","Програма може сама кинути виняток командою <code>raise</code>. Перехоплюють його так само, через <code>try</code> / <code>except</code>."],
  ["code",`speed = 150
try:
    if speed > 100:
        raise ValueError("Швидкість понад 100")
    print("Рухаюсь")
except ValueError as e:
    print("Аварійна зупинка:", e)`],
  ["h","Поширені винятки"],
  ["table",[["Виняток","Коли виникає"],["ValueError","значення неправильне: int(\"abc\")"],["TypeError","операція з невідповідним типом: 5 + \"5\""],["ZeroDivisionError","ділення на нуль"],["IndexError","індекс поза межами списку"],["NameError","змінну не створено"],["SensorError, OverheatError, JamError, ScanError","винятки обладнання в завданнях практикуму"]]],
  ["note","Не пиши порожній <code>except:</code> без типу. Він перехоплює все підряд і ховає справжні помилки в коді."]
  ]
},
{ id:"teoria-funktsii", nav:"Функції", title:"Функції", lead:"Коли той самий шматок коду потрібен кілька разів, його не копіюють, а дають йому назву. Такий іменований шматок програми називають функцією. Чужими функціями ви вже користувалися: <code>print()</code>, <code>range()</code>, <code>robot.forward()</code>. У цьому розділі ви писатимете власні.",
  body:[
  ["h","Визначення і виклик"],
  ["p","Функцію визначають словом <code>def</code>, після якого стоять назва, дужки й двокрапка. Рядки з відступом під ним утворюють <b>тіло</b> функції. Python запам'ятовує тіло, але виконує його лише тоді, коли функцію викликають: пишуть її назву з дужками, наприклад <code>greet()</code>."],
  ["code",`def greet():
    print("Привіт!")
    print("Станція готова до роботи.")

greet()
greet()`],
  ["p","Сам рядок <code>def</code> нічого не друкує. Обидва повідомлення з'являються двічі, бо функцію викликано двічі."],
  ["h","Параметри"],
  ["p","Щоб функція працювала з різними даними, у дужках після її назви перелічують <b>параметри</b>. Під час виклику на їхнє місце стають конкретні значення, <b>аргументи</b>, у тому самому порядку."],
  ["code",`def place_row(y, count):
    for x in range(count):
        print("ящик на позиції", x, "у ряду", y)

place_row(0, 3)
place_row(1, 2)`],
  ["p","У першому виклику <code>y</code> дорівнює 0, а <code>count</code> — 3. У другому <code>y</code> дорівнює 1, а <code>count</code> — 2."],
  ["h","return повертає результат"],
  ["p","Команда <code>return</code> завершує функцію й передає значення туди, звідки функцію викликали. Це значення можна записати в змінну, порівняти або передати іншій функції."],
  ["code",`def status(t):
    if t > 26:
        return "HIGH"
    if t < 18:
        return "LOW"
    return "OK"

s = status(30)
print("30 градусів:", s)
print("20 градусів:", status(20))`],
  ["p","Щойно Python виконав <code>return</code>, функція закінчується, і рядки під ним уже не виконуються. Тому останній <code>return</code> спрацює лише тоді, коли обидві умови вище хибні."],
  ["h","print і return"],
  ["p","<code>print</code> показує текст людині в консолі, а <code>return</code> віддає значення програмі. Функція без <code>return</code> повертає <code>None</code>, тобто «нічого»."],
  ["code",`def double_print(x):
    print(x * 2)

def double_return(x):
    return x * 2

a = double_print(5)
b = double_return(5)
print("a =", a)
print("b =", b)`],
  ["p","Обидві функції порахували 10, але в змінну <code>a</code> потрапило <code>None</code>. Чи лежить у змінній <code>None</code>, перевіряють так: <code>if a is None:</code>."],
  ["h","Локальні змінні"],
  ["p","Змінна, створена всередині функції, існує лише під час її виклику. Ззовні її не видно, і вона не чіпає змінну з такою самою назвою в решті програми."],
  ["code",`total = 100

def count_boxes():
    total = 5
    print("усередині функції:", total)

count_boxes()
print("поза функцією:", total)`],
  ["h","Типові помилки"],
  ["list",["Виклик без дужок: <code>greet</code> лише називає функцію, а виконує її <code>greet()</code>.","Виклик стоїть вище за <code>def</code>. Python ще не знає такої функції, і виникає <code>NameError</code>.","<code>print</code> замість <code>return</code>: результат видно в консолі, а програма отримує <code>None</code>.","У виклику інша кількість аргументів, ніж параметрів у <code>def</code>, і виникає <code>TypeError</code>."]]
  ]
},
{ id:"teoria-faily", nav:"Файли", title:"Робота з файлами", lead:"Змінні зникають, щойно програма закінчується. Щоб дані дожили до наступного запуску або дісталися іншій людині чи програмі, їх записують у файл. Файли в цьому розділі віртуальні й живуть просто на сторінці, але команди для них ті самі, що й у звичайному Python.",
  body:[
  ["h","Відкрити, прочитати, закрити"],
  ["p","<code>open(\"назва\")</code> відкриває файл для читання й повертає об'єкт файлу. Цикл <code>for line in f:</code> перебирає його рядки по одному. Коли файл більше не потрібен, його закривають: <code>f.close()</code>. Над редактором показано, що лежить у файлі до запуску."],
  ["code",`f = open("temps.txt")
for line in f:
    print("рядок:", line)
f.close()`,{files:{"temps.txt":"21.5\n22.0\n23.4\n"}}],
  ["p","Між рядками в консолі з'являються порожні. Кожен рядок файлу закінчується невидимим символом перенесення <code>\\n</code>, а <code>print</code> додає від себе ще один."],
  ["h","Розбір рядка: strip, split, int"],
  ["table",[["Вираз","Результат"],["\"  21.5\\n\".strip()","\"21.5\": пробіли й \\n з країв прибрано"],["\"12;болт\".split(\";\")","[\"12\", \"болт\"]"],["int(\"12\")","12"],["float(\"21.5\")","21.5"]]],
  ["code",`total = 0
f = open("invoice.txt")
for line in f:
    parts = line.strip().split(";")
    print(parts)
    if parts[1] == "болт":
        total += int(parts[0])
f.close()
print("Болтів:", total)`,{files:{"invoice.txt":"12;болт\n5;гайка\n8;болт\n"}}],
  ["h","Запис: режими w і a"],
  ["p","Щоб писати у файл, другим аргументом <code>open</code> передають режим."],
  ["table",[["Режим","Що робить"],["\"r\"","читання; цей режим діє, якщо другого аргументу немає"],["\"w\"","запис з чистого аркуша: старий вміст зникає одразу після відкриття"],["\"a\"","дописування в кінець; старий вміст лишається"]]],
  ["p","Метод <code>write</code> записує лише текст і сам рядок не переносить. Тому число спершу перетворюють через <code>str()</code>, а в кінці рядка дописують <code>\\n</code>."],
  ["code",`f = open("log.txt", "a")
f.write("09:15 ALARM\\n")
f.write("Усього подій: " + str(2) + "\\n")
f.close()`,{files:{"log.txt":"08:00 START\n"}}],
  ["p","Під виводом видно, що лежить у файлі після запуску. Заміни <code>\"a\"</code> на <code>\"w\"</code> і порівняй."],
  ["h","with закриває файл сам"],
  ["p","Записаний текст спершу збирається в буфері, а у файл гарантовано потрапляє під час закриття. Хто забув <code>close()</code>, той ризикує втратити дані. Конструкція <code>with</code> закриває файл сама, щойно закінчується її блок, навіть якщо всередині сталася помилка."],
  ["code",`with open("report.txt", "w") as f:
    f.write("Звіт\\n")
    f.write("усе гаразд\\n")
print("Файл закрито:", f.closed)`,{files:{}}],
  ["h","Коли файлу немає"],
  ["p","Якщо файлу, який треба прочитати, немає, <code>open</code> кидає <code>FileNotFoundError</code>. Перехоплюють його так само, як інші винятки."],
  ["code",`for name in ["day1.txt", "day2.txt"]:
    try:
        with open(name) as f:
            print(name, "прочитано, рядків:", len(f.readlines()))
    except FileNotFoundError:
        print(name, "не знайдено")`,{files:{"day1.txt":"5\n7\n"}}],
  ["note","У справжньому Python файли лежать на диску поруч із програмою. Тут вони віртуальні: після кожного запуску приклад починається з тих самих файлів."]
  ]
}
];

/* ---------- навігація ---------- */
const nav=$("#nav");
function buildNav(){
  let h='<div class="nav-group"><div class="nav-h">Старт</div><a href="#start" data-v="start">Як це працює</a></div>';
  h+='<div class="nav-group"><div class="nav-h">Теорія</div>'+TH.map(t=>'<a href="#'+t.id+'" data-v="'+t.id+'">'+t.nav+"</a>").join("")+"</div>";
  let ch=0;
  LEVELS.forEach(l=>{
    if(l.ch!==ch){ if(ch) h+="</div>"; ch=l.ch; h+='<div class="nav-group"><div class="nav-h">'+(ch<FINAL?"Розділ "+ch+" · ":"")+CHAPTERS[ch]+"</div>"; }
    const s=SAVE.done[l.id]||0;
    h+='<a href="#'+l.id+'" data-v="'+l.id+'" class="nav-lv"><span class="nav-num">'+String(l.n).padStart(2,"0")+'</span><span class="nav-t">'+l.title+'</span><span class="nav-stars'+(s?" on":"")+'" aria-label="'+(s?s+" зірки":"не пройдено")+'">'+(s?"★".repeat(s):"")+"</span></a>";
  });
  h+="</div>";
  nav.innerHTML=h;
  updateProgress();
}
function updateProgress(){
  const done=LEVELS.filter(l=>SAVE.done[l.id]).length, stars=LEVELS.reduce((a,l)=>a+(SAVE.done[l.id]||0),0);
  $("#progress-text").textContent=done+" / "+LEVELS.length+" станцій · ★ "+stars+" / "+LEVELS.length*3;
  $("#progress-bar").style.width=(done/LEVELS.length*100)+"%";
}

/* ---------- маршрутизація ---------- */
const main=$("#main");
let current=null;
function route(){
  const id=(location.hash||"#start").slice(1);
  stopAnim();
  [...nav.querySelectorAll("a")].forEach(a=>a.classList.toggle("active",a.dataset.v===id));
  const lv=LEVELS.find(l=>l.id===id), th=TH.find(t=>t.id===id);
  if(lv) renderLevel(lv); else if(th) renderTheory(th); else renderHome();
  current=id;
  const act=nav.querySelector("a.active"); if(act&&act.scrollIntoView) act.scrollIntoView({block:"nearest",inline:"center"});
  window.scrollTo(0,0);
}
window.addEventListener("hashchange",route);

/* ---------- домівка ---------- */
function renderHome(){
  let map="";
  for(let ch=1;ch<=FINAL;ch++){
    const ls=LEVELS.filter(l=>l.ch===ch);
    map+='<div class="ch-card"><div class="ch-head"><span class="ch-n">'+(ch<FINAL?"РОЗДІЛ "+ch:"ФІНАЛ")+'</span><h3>'+CHAPTERS[ch]+'</h3></div><ul class="ch-list">'+ls.map(l=>{ const s=SAVE.done[l.id]||0; return '<li><a href="#'+l.id+'"><span class="nav-num">'+String(l.n).padStart(2,"0")+"</span>"+l.title+'<span class="ch-topic">'+l.topic+'</span><span class="nav-stars'+(s?" on":"")+'">'+(s?"★".repeat(s):"")+"</span></a></li>"; }).join("")+"</ul></div>";
  }
  main.innerHTML=`
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">Python · умови · цикли · винятки · функції · файли</p>
      <h1>Python-<wbr>практикум</h1>
      <p class="hero-lead">${LEVELS.length} інтерактивних прикладів з автоматизації та робототехніки. У кожному ви пишете програму на Python для теплиці, конвеєра, робота чи марсохода, запускаєте її просто в браузері й бачите результат в анімації.</p>
      <div class="hero-cta"><a class="btn btn-run" href="#st-01">Почати зі станції 01</a><a class="btn" href="#teoria-umovy">Спершу теорія</a></div>
    </div>
    <div class="hero-steps">
      <div class="step"><b>1</b><div><h4>Прочитай завдання</h4><p>На кожній станції є опис, список команд обладнання та заготовка коду.</p></div></div>
      <div class="step"><b>2</b><div><h4>Напиши код і запусти</h4><p>Запускай клавішами Ctrl + Enter або кнопкою «Запустити», і робот виконає програму в анімації.</p></div></div>
      <div class="step"><b>3</b><div><h4>Пройди всі сценарії</h4><p>Програму перевіряють на кількох різних ситуаціях, частина з них випадкова, тому розв'язок, підігнаний під один випадок, не пройде.</p></div></div>
      <div class="step"><b>★</b><div><h4>Зірки</h4><p>Перша — за проходження, друга — без підказок, третя — за код, не довший за еталонний.</p></div></div>
    </div>
  </section>
  <section class="map">${map}</section>
  <section class="foot-note">
    <p>Прогрес і ваш код зберігаються лише в цьому браузері. <span id="reset-wrap"><button class="btn btn-sm" id="reset-btn" type="button">Скинути прогрес</button></span></p>
  </section>`;
  $("#reset-btn").onclick=()=>{
    $("#reset-wrap").innerHTML='Точно стерти зірки й код усіх станцій? <button class="btn btn-sm btn-danger" id="reset-yes" type="button">Так, стерти</button> <button class="btn btn-sm" id="reset-no" type="button">Ні</button>';
    $("#reset-yes").onclick=()=>{ SAVE={done:{},code:{},hints:{},sol:{}}; persist(); buildNav(); renderHome(); };
    $("#reset-no").onclick=renderHome;
  };
}

/* ---------- теорія ---------- */
function renderTheory(th){
  const i=TH.indexOf(th);
  let h='<article class="theory"><p class="eyebrow">Теорія · '+(i+1)+" з "+TH.length+"</p><h1>"+th.title+'</h1><p class="lead">'+th.lead+"</p>";
  let k=0;
  for(const [type,val,opt] of th.body){
    if(type==="h") h+="<h2>"+val+"</h2>";
    else if(type==="p") h+="<p>"+val+"</p>";
    else if(type==="note") h+='<p class="note">'+val+"</p>";
    else if(type==="list") h+="<ul>"+val.map(x=>"<li>"+x+"</li>").join("")+"</ul>";
    else if(type==="table") h+='<div class="tbl-wrap"><table><thead><tr>'+val[0].map(x=>"<th>"+esc(x)+"</th>").join("")+"</tr></thead><tbody>"+val.slice(1).map(r=>"<tr>"+r.map((x,j)=>"<td>"+(j===0?"<code>"+esc(x)+"</code>":esc(x))+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
    else if(type==="code"){ const fl=opt&&opt.files?Object.keys(opt.files):[]; h+='<div class="runnable" data-k="'+k+'">'+(fl.length?'<div class="run-files">'+fl.map(n=>'<div class="run-file"><div class="run-file-h">'+esc(n)+'</div><pre>'+esc(opt.files[n])+"</pre></div>").join("")+"</div>":"")+'<div class="run-ed"></div><div class="run-bar"><button class="btn btn-run btn-sm" type="button">▶ Виконати</button><button class="btn btn-sm run-reset" type="button">Повернути приклад</button><span class="run-hint">Код можна змінювати</span></div><pre class="run-out" hidden></pre></div>'; k++; }
  }
  const nextTh=TH[i+1], firstLv=LEVELS.find(l=>l.ch===i+1);
  h+='<div class="theory-next">'+(firstLv?'<a class="btn btn-run" href="#'+firstLv.id+'">До практики: станція '+String(firstLv.n).padStart(2,"0")+" →</a>":"")+(nextTh?'<a class="btn" href="#'+nextTh.id+'">Далі: '+nextTh.title+"</a>":"")+"</div></article>";
  main.innerHTML=h;
  const codes=th.body.filter(b=>b[0]==="code").map(b=>b[1]), opts=th.body.filter(b=>b[0]==="code").map(b=>b[2]||null);
  main.querySelectorAll(".runnable").forEach(box=>{
    const src=codes[+box.dataset.k], opt=opts[+box.dataset.k];
    const out=box.querySelector(".run-out");
    const run=async()=>{
      out.hidden=false; out.className="run-out"; out.textContent="Виконується…";
      if(!window.Sk){ out.textContent="Python-рушій не завантажився. Перевір підключення до інтернету й онови сторінку."; return; }
      const fsc=opt&&opt.files?{files:Object.assign({},opt.files)}:null;
      const r=fsc?await runCode(FILE_PLAIN_LEVEL,fsc,ed.value):await runCode(PLAIN_LEVEL,{},ed.value);
      out.textContent=(r.out||"")+(r.err?(r.out?"\n":"")+"⚠ "+r.err.text:"");
      if(!r.out&&!r.err) out.textContent="(програма нічого не вивела)";
      if(fsc&&r.world&&r.world.files){
        const ch=Object.keys(r.world.files).filter(n=>r.world.files[n]!==opt.files[n]);
        if(ch.length) out.textContent=out.textContent.replace(/\n+$/,"");
        ch.forEach(n=>{ out.textContent+="\n\n── файл "+n+" після запуску ──\n"+(r.world.files[n]||"(порожній)").replace(/\n$/,""); });
        const op=r.world.handles.filter(h=>!h.closed&&h.mode!=="r");
        op.forEach(h=>{ out.textContent+="\n\n⚠ Файл "+h.name+" не закрито: записане лишилося в буфері."; });
      }
      if(r.err){ out.classList.add("has-err"); ed.showError(r.err.line); }
    };
    const ed=makeEditor(box.querySelector(".run-ed"),src,{onRun:run,id:"ex-"+th.id+"-"+box.dataset.k,label:"Приклад коду"});
    box.querySelector(".btn-run").onclick=run;
    box.querySelector(".run-reset").onclick=()=>{ ed.value=src; out.hidden=true; };
  });
}

/* ---------- рівень ---------- */
let LV=null;
function renderLevel(lv){
  const n=String(lv.n).padStart(2,"0");
  const saved=SAVE.code[lv.id];
  const usedH=SAVE.hints[lv.id]||0;
  main.innerHTML=`
  <section class="level">
    <header class="plate">
      <div class="plate-id"><span class="stripe" aria-hidden="true"></span>СТАНЦІЯ ${n}<span class="plate-ch">${lv.ch<FINAL?"Розділ "+lv.ch+" · ":""}${CHAPTERS[lv.ch]}</span></div>
      <h1>${lv.title}</h1>
      <p class="plate-topic">${lv.topic}</p>
    </header>
    <div class="lv-grid">
      <div class="lv-brief">
        <p class="brief">${lv.brief}</p>
        <div class="task"><h2>Завдання</h2><ol>${lv.task.map(t=>"<li>"+t+"</li>").join("")}</ol></div>
        <details class="api" open><summary>Команди обладнання</summary><p class="api-note">Назви команд узяті з англійської. Під кожним описом є переклад, так їх легше запам'ятати.</p><div class="tbl-wrap"><table>${lv.api.map(([a,b,tr])=>"<tr><td><code>"+esc(a)+"</code></td><td>"+b+(tr?'<span class="api-tr">'+tr+"</span>":"")+"</td></tr>").join("")}</table></div></details>
      </div>
      <div class="lv-scene">
        <div class="scene-wrap"><canvas id="scene" aria-label="Анімація станції"></canvas></div>
        <div class="play-bar">
          <div class="speed" role="group" aria-label="Швидкість анімації">${[1,2,4].map(s=>'<button type="button" data-s="'+s+'" class="'+(s===1?"on":"")+'">'+s+"×</button>").join("")}</div>
          <button type="button" class="btn btn-sm" id="replay">↻ Повтор</button>
          <button type="button" class="btn btn-sm" id="skip">⏭ До кінця</button>
          <span class="scen-status" id="scen-status"></span>
        </div>
        <div class="scen"><div class="scen-h">Сценарії перевірки</div><div class="chips" id="chips"></div></div>
        <div class="verdict" id="verdict" hidden></div>
        <div class="console"><div class="console-h">Вивід print()</div><pre id="out">Тут з'явиться те, що виводить програма.</pre></div>
      </div>
      <div class="lv-code">
        <div id="editor"></div>
        <div class="tool-bar">
          <button type="button" class="btn btn-run" id="run">▶ Запустити</button>
          <button type="button" class="btn" id="hint">Підказка</button>
          <button type="button" class="btn" id="reset">Скинути код</button>
          <span class="kbd">Ctrl + Enter</span>
        </div>
        <div class="hints" id="hints"></div>
      </div>
    </div>
  </section>`;
  LV={lv,scs:makeScenarios(lv,false),results:null,sel:0,running:false};
  const ed=makeEditor($("#editor"),saved!==undefined?saved:lv.starter,{onRun:()=>runLevel(),onChange:v=>{ SAVE.code[lv.id]=v; persist(); },id:"code-"+lv.id});
  LV.ed=ed;
  renderHints();
  $("#run").onclick=()=>runLevel();
  $("#reset").onclick=()=>{ ed.value=lv.starter; delete SAVE.code[lv.id]; persist(); };
  $("#hint").onclick=()=>{ const h=SAVE.hints[lv.id]||0; if(h<lv.hints.length){ SAVE.hints[lv.id]=h+1; persist(); renderHints(); } };
  main.querySelectorAll(".speed button").forEach(b=>b.onclick=()=>{ ANIM.speed=+b.dataset.s; main.querySelectorAll(".speed button").forEach(x=>x.classList.toggle("on",x===b)); });
  $("#replay").onclick=()=>{ if(LV.results) showScenario(LV.sel); };
  $("#skip").onclick=()=>skipAnim();
  renderChips();
  startAnim($("#scene"));
  loadScene(lv,LV.scs[0],null,null);
}
function renderHints(){
  const lv=LV.lv, h=SAVE.hints[lv.id]||0, box=$("#hints");
  let s=lv.hints.slice(0,h).map((t,i)=>'<div class="hint"><b>Підказка '+(i+1)+"</b><p>"+t+"</p></div>").join("");
  if(h>=lv.hints.length){
    s+=SAVE.sol[lv.id]?'<div class="hint sol"><b>Еталонний розв\'язок</b><pre>'+highlight(lv.solution)+"</pre></div>":'<button type="button" class="btn btn-sm" id="show-sol">Показати еталонний розв\'язок</button><span class="sol-note">Тоді за станцію можна отримати лише одну зірку.</span>';
  }
  box.innerHTML=s;
  const b=$("#hint"); b.textContent=h<lv.hints.length?"Підказка ("+(h+1)+" з "+lv.hints.length+")":"Підказки відкрито"; b.disabled=h>=lv.hints.length;
  const sb=$("#show-sol"); if(sb) sb.onclick=()=>{ SAVE.sol[lv.id]=true; persist(); renderHints(); };
}
function renderChips(){
  const box=$("#chips");
  box.innerHTML=LV.scs.map((sc,i)=>{
    const r=LV.results&&LV.results[i];
    const st=!r?"":r.skipped?"skip":r.res.ok?"ok":"bad";
    return '<button type="button" class="chip '+st+(i===LV.sel?" sel":"")+'" data-i="'+i+'"><span class="chip-n">'+(i+1)+(i>0?"":"")+'</span><span class="chip-l">'+esc(LV.lv.label(sc))+'</span><span class="chip-s">'+(st==="ok"?"✓":st==="bad"?"✗":st==="skip"?"—":"")+"</span></button>";
  }).join("");
  box.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ const i=+b.dataset.i; if(LV.results&&LV.results[i]&&!LV.results[i].skipped) showScenario(i); else { LV.sel=i; renderChips(); loadScene(LV.lv,LV.scs[i],null,null); } });
}
async function runLevel(){
  if(LV.running) return;
  if(!window.Sk){ showVerdict(false,"Python-рушій не завантажився. Перевір підключення до інтернету й онови сторінку."); return; }
  const lv=LV.lv, code=LV.ed.value;
  LV.running=true; const rb=$("#run"); rb.disabled=true; rb.textContent="Виконується…";
  LV.ed.clearError();
  const fresh=makeScenarios(lv,true);
  LV.scs=fresh; LV.results=[];
  let stopRest=false;
  for(let i=0;i<fresh.length;i++){
    if(stopRest){ LV.results.push({skipped:true}); continue; }
    let r;
    try{ r=await runCode(lv,fresh[i],code); }catch(e){ r={events:[],out:"",err:{text:"Внутрішня помилка: "+e},res:FAIL("Внутрішня помилка: "+e)}; }
    LV.results.push(r);
    if(r.err&&(r.err.type==="TimeLimitError"||r.err.type==="_Halt"||r.err.type==="SyntaxError")) stopRest=true;
  }
  LV.running=false; rb.disabled=false; rb.textContent="▶ Запустити";
  const firstBad=LV.results.findIndex(r=>!r.skipped&&!r.res.ok);
  const allOk=firstBad<0;
  showScenario(allOk?0:firstBad);
  const passed=LV.results.filter(r=>!r.skipped&&r.res.ok).length;
  if(allOk){
    const lines=code.split("\n").filter(s=>s.trim()&&!s.trim().startsWith("#")&&!s.trim().startsWith("print")).length;
    let stars=1; const notes=[];
    if(!(SAVE.hints[lv.id])&&!SAVE.sol[lv.id]){ stars++; notes.push("без підказок"); }
    if(lines<=lv.par&&!SAVE.sol[lv.id]){ stars++; notes.push("компактний код ("+lines+" ряд.)"); }
    else if(!SAVE.sol[lv.id]) notes.push("третю зірку дають за код до "+lv.par+" рядків без print і коментарів (у вас "+lines+")");
    const prev=SAVE.done[lv.id]||0; SAVE.done[lv.id]=Math.max(prev,stars); persist(); buildNav();
    [...nav.querySelectorAll("a")].forEach(a=>a.classList.toggle("active",a.dataset.v===lv.id));
    const next=LEVELS[lv.n];
    showVerdict(true,"Пройдено сценаріїв: "+fresh.length+" з "+fresh.length+". "+"★".repeat(stars)+"☆".repeat(3-stars)+(notes.length?" · "+notes.join(" · "):""),next);
  } else {
    const r=LV.results[firstBad];
    showVerdict(false,"Пройдено "+passed+" з "+fresh.length+". Сценарій "+(firstBad+1)+": "+r.res.msg);
    if(r.err&&r.err.line) LV.ed.showError(r.err.line);
  }
}
function showScenario(i){
  LV.sel=i; renderChips();
  const r=LV.results[i];
  $("#out").textContent=r.out||(r.err?"":"(програма нічого не вивела)");
  if(r.err) $("#out").textContent+=(r.out?"\n":"")+"⚠ "+r.err.text;
  loadScene(LV.lv,LV.scs[i],r.events,r.res.ok);
  const ss=$("#scen-status"); ss.className="scen-status "+(r.res.ok?"ok":"bad"); ss.textContent="Сценарій "+(i+1)+(r.res.ok?": пройдено":": не пройдено");
}
function showVerdict(ok,msg,next){
  const v=$("#verdict"); v.hidden=false; v.className="verdict "+(ok?"ok":"bad");
  v.innerHTML='<b>'+(ok?"Станцію запущено":"Ще не працює")+"</b><p>"+esc(msg)+"</p>"+(ok&&next?'<a class="btn btn-run btn-sm" href="#'+next.id+'">Станція '+String(next.n).padStart(2,"0")+": "+next.title+" →</a>":ok?'<a class="btn btn-sm" href="#start">Усі станції пройдено! До списку станцій</a>':"");
}

/* ---------- анімація ---------- */
const ANIM={canvas:null,ctx:null,scene:null,st:null,events:[],i:-1,evT:0,dur:1,speed:1,playing:false,overlay:null,result:null,raf:0,last:0,T:0};
function loadScene(lv,sc,events,ok){
  ANIM.scene=SCENES[lv.scene]; ANIM.st=ANIM.scene.init(sc,lv); ANIM.st.anim=null;
  ANIM.events=events||[]; ANIM.i=-1; ANIM.evT=0; ANIM.overlay=null; ANIM.result=ok; ANIM.playing=!!(events&&events.length);
  if(events&&!events.length) ANIM.overlay=ok?{type:"ok"}:null;
}
function advance(){
  ANIM.i++;
  if(ANIM.i>=ANIM.events.length){ ANIM.playing=false; ANIM.st.anim=null; if(ANIM.result) ANIM.overlay={type:"ok"}; return false; }
  const ev=ANIM.events[ANIM.i];
  ANIM.evT=0; ANIM.dur=ev.t==="crash"?1.4:ANIM.scene.dur(ev,ANIM.st);
  if(ev.t==="crash") ANIM.overlay={type:"crash",msg:ev.msg}; else ANIM.scene.step(ANIM.st,ev);
  ANIM.st.anim={ev,p:0};
  return true;
}
function skipAnim(){ if(!ANIM.playing) return; while(advance()){} }
function resizeCanvas(){
  const cv=ANIM.canvas; if(!cv) return;
  const w=cv.parentElement.clientWidth, dpr=Math.min(window.devicePixelRatio||1,2);
  cv.style.width=w+"px"; cv.style.height=(w*0.625)+"px";
  cv.width=Math.round(w*dpr); cv.height=Math.round(w*0.625*dpr);
  ANIM.scale=w/640*dpr;
}
let ro=null, palT=0;
function startAnim(cv){
  ANIM.canvas=cv; ANIM.ctx=cv.getContext("2d"); resizeCanvas();
  if(ro) ro.disconnect(); ro=new ResizeObserver(resizeCanvas); ro.observe(cv.parentElement);
  readPal(); ANIM.last=performance.now();
  const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frame=now=>{
    let dt=Math.min(.05,(now-ANIM.last)/1000); ANIM.last=now; ANIM.T+=reduce?dt*.3:dt;
    if((palT+=dt)>.5){ palT=0; readPal(); }
    if(ANIM.playing&&ANIM.scene){
      ANIM.evT+=dt*ANIM.speed;
      if(ANIM.i<0) advance();
      else if(ANIM.evT>=ANIM.dur) advance();
      if(ANIM.st.anim) ANIM.st.anim.p=Math.min(1,ANIM.evT/ANIM.dur);
    }
    drawFrame(dt*(ANIM.playing?ANIM.speed:1));
    ANIM.raf=requestAnimationFrame(frame);
  };
  cancelAnimationFrame(ANIM.raf); ANIM.raf=requestAnimationFrame(frame);
}
function stopAnim(){ cancelAnimationFrame(ANIM.raf); ANIM.raf=0; if(ro){ ro.disconnect(); ro=null; } ANIM.canvas=null; }
function drawFrame(dt){
  const c=ANIM.ctx; if(!c||!ANIM.scene) return;
  c.setTransform(ANIM.scale,0,0,ANIM.scale,0,0);
  c.clearRect(0,0,640,400);
  try{ ANIM.scene.draw(c,ANIM.st,ANIM.T,dt); }catch(e){ console.error(e); }
  const o=ANIM.overlay;
  if(o&&o.type==="crash"){
    const p=ANIM.st.anim&&ANIM.st.anim.ev.t==="crash"?ANIM.st.anim.p:1;
    c.fillStyle=alpha(PAL.bad,.16*Math.min(1,p*3)); c.fillRect(0,0,640,400);
    c.font="600 14px "+FB; const lines=wrapText(c,o.msg,560);
    const h=24+lines.length*20, by=ANIM.scene.crashTop?16:400-h-16; rr(c,24,by,592,h,8); c.fillStyle=PAL.bad; c.fill();
    lines.forEach((l,i)=>T(c,l,40,by+22+i*20,{s:14,w:600,c:"#fff"}));
  }
}
function wrapText(c,s,maxW){ const words=String(s).split(" "); const lines=[]; let cur=""; for(const w of words){ const t=cur?cur+" "+w:w; if(c.measureText(t).width>maxW&&cur){ lines.push(cur); cur=w; } else cur=t; } if(cur) lines.push(cur); return lines.slice(0,4); }

/* ---------- старт ---------- */
buildNav();
if(!window.Sk){ $("#engine").textContent="Python не завантажено"; $("#engine").classList.add("bad"); }
route();
