
const KEY="rlrpg-v1";
const now = () => new Date();
const todayKey = () => now().toISOString().slice(0,10);
const stateDefault = {
  name:"", xp:0, level:1, coins:0, discipline:0, recovery:100, streak:0,
  lastDay:null, completed:[], failed:[], skipped:[], cooldown:{}, offered:[],
  active:null, health:null, healthAt:0, location:null, weather:null,
  custom:["","",""], rerolls:3, shop:{}, history:[], shields:3
};
let S = {...stateDefault, ...(JSON.parse(localStorage.getItem(KEY)||"{}"))};
let currentChoices=[];

function save(){localStorage.setItem(KEY, JSON.stringify(S));}
function phase(){
  const h=now().getHours()+now().getMinutes()/60;
  if(h>=6 && h<7) return "morning";
  if(h>=7 && h<21) return "day";
  if(h>=21 && h<22) return "evening";
  return "sleep";
}
function phaseLabel(){
  const p=phase();
  return p==="morning"?"🌅 Morning Phase 06:00–07:00":
         p==="day"?"⚔️ Main Quest Phase 07:00–21:00":
         p==="evening"?"🌙 Evening Phase 21:00–22:00":"😴 Sleep / next day";
}
function dayReset(){
  const d=todayKey();
  if(S.lastDay!==d){
    S.completed=[]; S.failed=[]; S.skipped=[]; S.offered=[]; S.active=null;
    S.rerolls=3; S.lastDay=d; save();
  }
}
function xpForLevel(l){ return Math.floor(100*Math.pow(l,1.35)); }
function updateLevel(){
  while(S.xp>=xpForLevel(S.level)) S.level++;
}
function eligible(t){
  const p=phase();
  if(p==="sleep") return false;
  if(t.time!==("06:00-07:00") && p==="morning") return false;
  if(t.time==="06:00-07:00" && p!=="morning") return false;
  if(t.time==="21:00-22:00" && p!=="evening") return false;
  if(t.time==="07:00-21:00" && p!=="day") return false;
  if(S.cooldown[t.id] && Date.now()<S.cooldown[t.id]) return false;
  if(S.completed.includes(t.id) && t.category!=="health") return false;
  return true;
}
function weightedChoices(){
  const pool=window.TASKS.filter(eligible);
  const health = S.health==="sick";
  const adjusted=pool.map(t=>{
    let w=100;
    if(S.history.slice(-15).some(x=>x.id===t.id)) w-=45;
    if(health && ["strength","cardio","math","programming"].includes(t.category)) w-=70;
    if(S.recovery<35 && ["strength","cardio","math","programming"].includes(t.category)) w-=50;
    if(S.recovery<50 && ["focus","health","organization"].includes(t.category)) w+=35;
    if(S.discipline<30 && ["discipline","organization","household"].includes(t.category)) w+=30;
    if(t.category==="random") w+=10;
    return {t,w:Math.max(1,w)};
  });
  const out=[];
  while(out.length<5 && adjusted.length){
    let total=adjusted.reduce((a,x)=>a+x.w,0);
    let r=Math.random()*total, chosen=0;
    for(let i=0;i<adjusted.length;i++){ r-=adjusted[i].w; if(r<=0){chosen=i;break;} }
    out.push(adjusted[chosen].t); adjusted.splice(chosen,1);
  }
  return out;
}
function renderChoices(){
  currentChoices=weightedChoices();
  const box=document.getElementById("choices");
  box.innerHTML=currentChoices.map((t,i)=>`
    <button class="choice" data-i="${i}">
      <span class="choice-top">${t.emoji} ${t.category.toUpperCase()} · ${t.difficulty}</span>
      <b>${escapeHtml(t.name)}</b>
      <span>+${t.xp} XP · +${t.coins} 🪙 ${t.verification==="photo"?"· 📸 снимка":""}</span>
    </button>`).join("") || `<div class="muted">Няма подходяща задача в този времеви режим.</div>`;
  box.querySelectorAll(".choice").forEach(b=>b.onclick=()=>selectTask(currentChoices[+b.dataset.i]));
}
function selectTask(t){
  S.active=t; save(); renderActive();
}
function renderActive(){
  const box=document.getElementById("questContent");
  if(!S.active){box.innerHTML=`<p>Избери една от 5-те мисии. Човечеството е стигнало до луната, а ние пак трябва да изберем между „20 клека“ и „подреди бюрото“. 🚀</p>`;return;}
  const t=S.active;
  box.innerHTML=`
    <div class="quest-title">${t.emoji} ${escapeHtml(t.name)}</div>
    <div class="tags">${t.difficulty} · +${t.xp} XP · +${t.coins} 🪙 · cooldown ${t.cooldownMin} мин</div>
    <div class="muted">${t.verification==="photo"?"📸 За тази задача ще се изисква снимка при завършване.":"Потвърждение: натискаш резултата след изпълнение."}</div>
    <button class="primary full" id="finishBtn">Завърши задача</button>`;
  document.getElementById("finishBtn").onclick=()=>openResult(t);
}
function openResult(t){
  document.getElementById("resultTitle").textContent=t.name;
  document.getElementById("resultBody").innerHTML=t.verification==="photo"
    ? `<p>📸 Тази мисия е с доказателство. Прототипът пази заявка за снимка; истинската камера интеграция може да се върже в Android/PWA версията.</p>`
    : `<p>Избери реалния резултат. „Не можах“ не е автоматично провал.</p>`;
  document.getElementById("resultDialog").showModal();
}
function completeTask(t){
  S.xp+=t.xp; S.coins+=t.coins; S.discipline+=t.discipline;
  S.recovery=Math.min(100,S.recovery+t.recovery);
  S.completed.push(t.id); S.cooldown[t.id]=Date.now()+t.cooldownMin*60000;
  S.history.push({id:t.id,date:new Date().toISOString(),result:"done"});
  updateLevel(); S.active=null; save(); render();
}
function failTask(t){
  S.discipline=Math.max(0,S.discipline-2); S.recovery=Math.max(0,S.recovery-1);
  S.failed.push(t.id); S.history.push({id:t.id,date:new Date().toISOString(),result:"failed"});
  S.active=null; save(); render();
}
function couldntTask(t,reason){
  S.skipped.push(t.id);
  if(reason==="materials") S.discipline=Math.max(0,S.discipline-1);
  if(reason==="time") S.discipline=Math.max(0,S.discipline-1);
  if(reason==="sick") S.recovery=Math.min(100,S.recovery+2);
  S.history.push({id:t.id,date:new Date().toISOString(),result:"couldnt",reason});
  S.active=null; save(); render();
}
document.getElementById("resultDialog").addEventListener("close",()=>{
  const v=document.getElementById("resultDialog").returnValue, t=S.active;
  if(!t)return;
  if(v==="done") completeTask(t);
  else if(v==="notdone") failTask(t);
  else if(v==="couldnt"){
    document.getElementById("reasonDialog").showModal();
  }
});
document.getElementById("reasonDialog").addEventListener("close",()=>{
  if(document.getElementById("reasonDialog").returnValue==="save"){
    couldntTask(S.active,document.getElementById("reason").value);
  }
});
document.getElementById("rerollBtn").onclick=()=>{
  if(S.rerolls<=0){alert("Нямаш повече reroll-и за днес.");return;}
  S.rerolls--; save(); renderChoices();
};
document.getElementById("contextBtn").onclick=updateContext;

function askHealth(){
  if(Date.now()-S.healthAt>3*60*60*1000) document.getElementById("healthDialog").showModal();
}
document.querySelectorAll("[data-health]").forEach(b=>b.onclick=()=>{
  S.health=b.dataset.health; S.healthAt=Date.now(); save(); render();
});
document.getElementById("settingsBtn").onclick=()=>{
  document.getElementById("userName").value=S.name;
  document.getElementById("custom1").value=S.custom[0]||"";
  document.getElementById("custom2").value=S.custom[1]||"";
  document.getElementById("custom3").value=S.custom[2]||"";
  document.getElementById("settingsDialog").showModal();
};
document.getElementById("settingsDialog").addEventListener("close",()=>{
  if(document.getElementById("settingsDialog").returnValue==="save"){
    S.name=document.getElementById("userName").value.trim();
    S.custom=[
      document.getElementById("custom1").value.trim(),
      document.getElementById("custom2").value.trim(),
      document.getElementById("custom3").value.trim()
    ];
    S.custom.forEach((x,i)=>{
      if(x) window.TASKS.push({id:`CUSTOM-${i+1}`,name:x,category:"custom",emoji:"⭐",difficulty:"C",xp:25,coins:12,discipline:2,recovery:0,stats:["Growth"],cooldownMin:30,verification:"simple",time:"07:00-21:00"});
    });
    save(); render();
  }
});
async function updateContext(){
  if(!navigator.geolocation){document.getElementById("location").textContent="браузърът няма GPS";return;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude}=pos.coords;
    S.location={latitude,longitude};
    document.getElementById("location").textContent=`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`);
      const d=await r.json();
      S.weather={temp:d.current.temperature_2m,code:d.current.weather_code};
      document.getElementById("weather").textContent=`${d.current.temperature_2m}°C`;
      save();
    }catch(e){document.getElementById("weather").textContent="времето не е достъпно";}
  },()=>{document.getElementById("location").textContent="няма разрешение за местоположение";},{enableHighAccuracy:true,maximumAge:1800000,timeout:10000});
}
function render(){
  dayReset();
  document.getElementById("phase").textContent=phaseLabel();
  document.getElementById("level").textContent=S.level;
  document.getElementById("xp").textContent=S.xp;
  document.getElementById("coins").textContent=S.coins;
  document.getElementById("discipline").textContent=S.discipline;
  document.getElementById("recovery").textContent=S.recovery;
  document.getElementById("streak").textContent=S.streak;
  const cur=xpForLevel(S.level-1), next=xpForLevel(S.level);
  document.getElementById("xpFill").style.width=Math.min(100,Math.max(0,(S.xp-cur)/(next-cur)*100))+"%";
  document.getElementById("clock").textContent=now().toLocaleTimeString("bg-BG",{hour:"2-digit",minute:"2-digit"});
  document.getElementById("health").textContent=S.health||"не е въведено";
  if(S.location) document.getElementById("location").textContent=`${S.location.latitude.toFixed(3)}, ${S.location.longitude.toFixed(3)}`;
  if(S.weather) document.getElementById("weather").textContent=`${S.weather.temp}°C`;
  renderActive(); renderChoices(); renderShop(); renderToday();
}
function renderToday(){
  document.getElementById("today").innerHTML=`<div class="stats-grid">
    <div>✅ Направени <b>${S.completed.length}</b></div>
    <div>❌ Ненаправени <b>${S.failed.length}</b></div>
    <div>⚠️ Не можах <b>${S.skipped.length}</b></div>
    <div>🔄 Rerolls <b>${S.rerolls}</b></div>
  </div>`;
}
const rewards=[
  ["🍦","Сладолед",100,"week",2],["🍫","Нещо сладко",120,"week",2],
  ["📱","30 мин скрол",150,"day",1],["🎮","30 мин gaming",180,"week",3],
  ["🍕","Любима храна",300,"week",1],["🎬","Филм",350,"week",2],
  ["🎮","1 час gaming",400,"week",2],["☕","Любима напитка",100,"day",1],
  ["📚","30 мин свободно четене",120,"day",2],["⚽","30 мин любима игра/спорт",180,"week",3],
  ["🎧","30 мин музика",100,"day",2],["🍿","Любима закуска",160,"week",2],
  ["🎮","90 мин gaming",500,"week",1],["🎬","Избери филм",450,"week",1],
  ["🏆","Специална лична награда",800,"month",1]
];
function renderShop(){
  document.getElementById("shop").innerHTML=rewards.map((r,i)=>`
    <div class="reward"><div><b>${r[0]} ${r[1]}</b><small>${r[2]} 🪙 · max ${r[4]}/${r[3]}</small></div>
    <button ${S.coins<r[2]?"disabled":""} data-buy="${i}">Купи</button></div>`).join("");
  document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>buy(+b.dataset.buy));
}
function buy(i){
  const r=rewards[i]; if(S.coins<r[2])return;
  S.coins-=r[2]; S.shop[i]=(S.shop[i]||0)+1; save(); renderShop(); render();
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
setInterval(()=>{
  document.getElementById("clock").textContent=now().toLocaleTimeString("bg-BG",{hour:"2-digit",minute:"2-digit"});
  document.getElementById("phase").textContent=phaseLabel();
},1000);
setInterval(()=>{ askHealth(); },60000);

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
dayReset(); render(); askHealth(); updateContext();
