const API_URL = 'http://localhost:3000/api';
let appliances = [];
let alerts = [];

const token = localStorage.getItem('ceb_token');
const user = JSON.parse(localStorage.getItem('ceb_user') || '{}');

if (document.getElementById('profileName') && user.name) {
  document.getElementById('profileName').textContent = user.name;
}

document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('ceb_token');
  localStorage.removeItem('ceb_user');
  window.location.href = 'login.html';
};

const pages=[...document.querySelectorAll('.page')];
const navBtns=[...document.querySelectorAll('.nav-btn')];
const titleMap={dashboard:'Dashboard',appliances:'Appliances',usage:'Usage Analytics',alerts:'Alerts',goals:'Saving Goals',tips:'Energy Tips',bill:'Bill Estimator',settings:'Settings'};

function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function go(page){pages.forEach(p=>p.classList.toggle('active',p.id===page));navBtns.forEach(b=>b.classList.toggle('active',b.dataset.page===page));document.getElementById('pageTitle').textContent=titleMap[page];window.scrollTo({top:0,behavior:'smooth'});document.getElementById('sidebar').classList.remove('open')}
navBtns.forEach(b=>b.onclick=()=>go(b.dataset.page));document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>go(b.dataset.jump));
document.getElementById('menuBtn').onclick=()=>document.getElementById('sidebar').classList.toggle('open');
document.getElementById('todayText').textContent=new Date().toLocaleDateString('en-LK',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
document.getElementById('themeBtn').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('ceb_dark',document.body.classList.contains('dark'));};if(localStorage.getItem('ceb_dark')==='true')document.body.classList.add('dark');

function renderChart(){const data=[15,10,8,7,9,12,20,28,35,42,39,45,52,55,49,44,57,70,95,82,68,60,48,35];document.getElementById('barChart').innerHTML=data.map((v,i)=>`<span class="bar" style="height:${v}%" data-value="${(v*.028).toFixed(1)} kWh"></span>`).join('')}
function renderConsumers(){const top=[...appliances].sort((a,b)=>b.watts*b.hours-a.watts*a.hours).slice(0,4);document.getElementById('topConsumers').innerHTML=top.map(a=>`<div class="consumer"><span class="avatar">${a.icon}</span><div><b>${a.name}</b><p>${a.room}</p></div><b>${(a.watts*a.hours/1000).toFixed(1)} kWh</b></div>`).join('')}
function renderAppliances(){const q=document.getElementById('applianceSearch').value.toLowerCase();const room=document.getElementById('roomFilter').value;const list=appliances.filter(a=>a.name.toLowerCase().includes(q)&&(room==='all'||a.room===room));document.getElementById('applianceGrid').innerHTML=list.map(a=>`<article class="appliance-card"><div class="appliance-top"><span class="app-icon">${a.icon}</span><label class="switch"><input type="checkbox" ${a.on?'checked':''} data-toggle="${a.id}"><span></span></label></div><h4>${a.name}</h4><p class="muted">${a.room}</p><div class="appliance-meta"><span>Rated power</span><b>${a.watts} W</b></div><div class="power-live">${a.on?a.watts:'0'} W</div><small class="muted">${a.on?'Currently running':'Currently off'}</small><div class="appliance-actions"><button data-schedule-id="${a.id}">Schedule</button><button data-delete-id="${a.id}">Remove</button></div></article>`).join('')||'<p>No appliances found.</p>';
document.querySelectorAll('[data-toggle]').forEach(x=>x.onchange=async()=>{const a=appliances.find(y=>y.id==x.dataset.toggle);a.on=x.checked;
  await fetch(`${API_URL}/appliances/${a.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify({on: a.on}) });
  renderAppliances();updateLive();toast(`${a.name} turned ${a.on?'on':'off'}`);
});
document.querySelectorAll('[data-delete-id]').forEach(x=>x.onclick=async()=>{
  await fetch(`${API_URL}/appliances/${x.dataset.deleteId}`, { method: 'DELETE', headers: {'Authorization': `Bearer ${token}`} });
  appliances=appliances.filter(a=>a.id!=x.dataset.deleteId);
  renderAppliances();renderConsumers();updateLive();toast('Appliance removed');
});
document.querySelectorAll('[data-schedule-id]').forEach(x=>x.onclick=()=>toast('Schedule saved for off-peak operation'))}

function updateLive(){const watts=appliances.filter(a=>a.on).reduce((s,a)=>s+a.watts,0);document.getElementById('livePowerText').textContent=(watts/1000).toFixed(2)+' kW'}
document.getElementById('applianceSearch').oninput=renderAppliances;document.getElementById('roomFilter').onchange=renderAppliances;
const dialog=document.getElementById('applianceDialog');document.getElementById('addApplianceBtn').onclick=()=>dialog.showModal();document.getElementById('saveApplianceBtn').onclick=async e=>{e.preventDefault();const name=document.getElementById('newName').value.trim();if(!name)return;
  const newApp = {name,room:document.getElementById('newRoom').value,watts:+document.getElementById('newWatts').value,on:false,hours:1,icon:'⚡'};
  const res = await fetch(`${API_URL}/appliances`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify(newApp) });
  const data = await res.json();
  newApp.id = data.id;
  appliances.push(newApp);
  renderAppliances();renderConsumers();dialog.close();document.getElementById('applianceForm').reset();toast('Appliance added');
};

function renderAlerts(){document.getElementById('alertList').innerHTML=alerts.map(a=>`<article class="alert-item ${a.unread?'unread':''}"><span class="alert-icon">${a.icon}</span><div><b>${a.title}</b><p>${a.text}</p><small>${a.time}</small></div><button data-read="${a.id}">${a.unread?'Mark read':'Read'}</button></article>`).join('');
document.querySelectorAll('[data-read]').forEach(b=>b.onclick=async()=>{const a=alerts.find(x=>x.id==b.dataset.read);
  await fetch(`${API_URL}/alerts/${a.id}/read`, { method: 'PUT', headers: {'Authorization': `Bearer ${token}`} });
  a.unread=false;renderAlerts();updateBadge();
});updateBadge()}

function updateBadge(){const n=alerts.filter(a=>a.unread).length;document.getElementById('alertBadge').textContent=n;document.getElementById('alertBadge').style.display=n?'block':'none'}
document.getElementById('markAllBtn').onclick=async()=>{
  await fetch(`${API_URL}/alerts/read-all`, { method: 'PUT', headers: {'Authorization': `Bearer ${token}`} });
  alerts.forEach(a=>a.unread=false);renderAlerts();toast('All alerts marked as read');
};

const tips=[['❄','Air conditioning','Set the AC to 24–26°C and clean filters regularly. Each degree lower can increase electricity use.','High impact'],['☀','Use natural daylight','Open curtains during daytime and switch off unnecessary lights.','Easy win'],['⏻','Stop standby power','Unplug chargers and use switched power strips for TVs, routers and entertainment devices.','Always useful'],['▣','Efficient refrigeration','Keep the refrigerator away from heat, avoid frequent door opening and check door seals.','Medium impact'],['◉','Smarter laundry','Wash full loads, use cold water when suitable and run during off-peak hours.','High impact'],['♨','Reduce water heating','Use shorter showers and switch off electric heaters immediately after use.','High impact'],['✣','Use fans first','Use ceiling fans before air conditioning when weather permits.','Easy win'],['🔌','Choose efficient appliances','Compare energy labels and total running cost before purchasing a device.','Long-term saving'],['📊','Track daily usage','Review your daily pattern and investigate sudden increases early.','Best habit']];document.getElementById('tipsGrid').innerHTML=tips.map(t=>`<article class="tip-card"><span class="tip-icon">${t[0]}</span><h4>${t[1]}</h4><p>${t[2]}</p><b>${t[3]}</b></article>`).join('');
function renderCategories(){const cats=[['Cooling',38],['Refrigeration',23],['Entertainment',14],['Lighting & fans',13],['Laundry & other',12]];document.getElementById('categoryBars').innerHTML=cats.map(c=>`<div class="category-row"><div><span>${c[0]}</span><b>${c[1]}%</b></div><div class="progress"><span style="width:${c[1]}%"></span></div></div>`).join('')}
function drawUsage(){const c=document.getElementById('usageCanvas'),x=c.getContext('2d'),d=[8.8,9.4,7.9,8.2,7.1,9.8,8.6];x.clearRect(0,0,c.width,c.height);const styles=getComputedStyle(document.body),line=styles.getPropertyValue('--line'),green=styles.getPropertyValue('--green2'),muted=styles.getPropertyValue('--muted');x.strokeStyle=line;x.fillStyle=muted;x.font='12px sans-serif';for(let i=0;i<5;i++){let y=40+i*60;x.beginPath();x.moveTo(50,y);x.lineTo(870,y);x.stroke();x.fillText((12-i*2)+'',18,y+4)};x.strokeStyle=green;x.lineWidth=4;x.beginPath();d.forEach((v,i)=>{const px=70+i*130,py=280-(v-6)*45;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();d.forEach((v,i)=>{const px=70+i*130,py=280-(v-6)*45;x.beginPath();x.arc(px,py,6,0,Math.PI*2);x.fillStyle=green;x.fill();x.fillStyle=muted;x.fillText(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],px-12,315)})}
document.getElementById('calculateBillBtn').onclick=()=>{const k=+billKwh.value,r=+billRate.value,f=+fixedCharge.value,total=k*r+f,reduced=k*.85*r+f;billResult.textContent='Rs. '+Math.round(total).toLocaleString();reducedBill.textContent='Rs. '+Math.round(reduced).toLocaleString();billSaving.textContent='Potential saving: Rs. '+Math.round(total-reduced).toLocaleString();toast('Bill estimate updated')};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>toast(b.dataset.action==='apply-rec'?'Recommendation applied':b.dataset.action==='make-plan'?'Off-peak plan created':'Schedule saved'));
document.getElementById('newGoalBtn').onclick=()=>document.getElementById('goalDialog').showModal();document.getElementById('saveGoalBtn').onclick=e=>{e.preventDefault();document.getElementById('goalDialog').close();toast('New saving goal created')};document.getElementById('saveSettingsBtn').onclick=()=>toast('Settings saved');document.getElementById('resetBtn').onclick=()=>{localStorage.clear();location.reload()};

async function init() {
  if (!token) return;
  
  try {
    const [appRes, alertRes] = await Promise.all([
      fetch(`${API_URL}/appliances`, { headers: {'Authorization': `Bearer ${token}`} }),
      fetch(`${API_URL}/alerts`, { headers: {'Authorization': `Bearer ${token}`} })
    ]);
    
    if (appRes.status === 401 || alertRes.status === 401) {
      localStorage.removeItem('ceb_token');
      window.location.href = 'login.html';
      return;
    }
    
    appliances = await appRes.json();
    alerts = await alertRes.json();
    
    renderChart();renderConsumers();renderAppliances();renderAlerts();renderCategories();updateLive();setTimeout(drawUsage,100);window.addEventListener('resize',drawUsage);
  } catch (err) {
    console.error(err);
    toast('Error loading data from server');
  }
}

init();
