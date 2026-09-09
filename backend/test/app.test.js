const {test,after}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
process.env.NODE_ENV='test';
const db=require('../db');
const {app}=require('../server');
const Energy=require('../../frontend/energy');
let server,base;
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.close();});
async function client(){return {cookie:'',csrf:'',async request(path,method='GET',body,extra={}){
  const headers={'X-Requested-With':'CEBEnergySaver',...extra};
  if(method!=='GET'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=this.csrf;}
  if(this.cookie)headers.Cookie=this.cookie;
  const res=await fetch(base+path,{method,headers:{...headers,...extra},body:method==='GET'?undefined:JSON.stringify(body||{})});
  if(res.headers.get('set-cookie'))this.cookie=res.headers.get('set-cookie').split(';')[0];
  const data=await res.json();if(data.csrf)this.csrf=data.csrf;
  return {status:res.status,data,headers:res.headers};
}};}
test('domestic tariff boundary and numerical regression cases',()=>{
  for(const [units,total] of [[0,80],[30,230],[31,369],[60,630],[61,1260],[90,1840],[91,2468],[120,3280],[121,3824],[180,6420],[181,8450],[200,10350]])assert.equal(Energy.bill(units).total,total,`${units} kWh`);
  for(const n of [-1,NaN,Infinity])assert.throws(()=>Energy.bill(n));
  assert.equal(Energy.bill(30.5).total,364.5);
  assert.ok(Math.abs(Energy.solar(3,4.2,80)-302.4)<1e-9);
  assert.throws(()=>Energy.ev(40,80,20,90,100));
  assert.ok(Math.abs(Energy.ev(40,20,80,90,100).energy-26.6666666667)<0.000001);
});
test('meter forecasting and overnight Sri Lanka plans',()=>{
  const rows=[{date:'2026-01-01',value:100},{date:'2026-01-03',value:110},{date:'2026-01-10',value:180}];
  assert.equal(Energy.forecast(rows,[]).daily,80/9);
  assert.equal(Energy.daily([{watts:1000,hours:0,on:true}]),0);
  const plan={enabled:true,start:'23:00',end:'01:00',days:[1]};
  assert.equal(Energy.scheduleActive(plan,new Date('2026-09-07T18:00:00Z')),true);
  assert.equal(Energy.scheduleActive(plan,new Date('2026-09-07T19:00:00Z')),true);
  assert.equal(Energy.scheduleActive(plan,new Date('2026-09-07T20:00:00Z')),false);
  assert.equal(Energy.scheduleActive({...plan,enabled:false},new Date('2026-09-07T18:00:00Z')),false);
});
test('API workflows, ownership and account security',async t=>{
  await db.migrate();await db.migrate();
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+server.address().port;
  const alice=await client(),bob=await client(),other=await client(),guest=await client();
  const password='Unique-household-passphrase-47';let appId,readingId,recovery;
  await t.test('authentication, security headers and origin checks',async()=>{
    assert.equal((await guest.request('/api/household')).status,401);
    const hostStatus=await new Promise((resolve,reject)=>{require('node:http').get(base+'/api/health',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
    assert.equal(hostStatus,421);
    assert.equal((await fetch(base+'/api/auth/signup',{method:'POST',headers:{'X-Requested-With':'CEBEnergySaver','Content-Type':'application/json'}})).status,400);
    assert.equal((await guest.request('/api/auth/signup','POST',{name:'A',email:'a@example.com',password:'short'})).status,400);
    assert.equal((await guest.request('/api/auth/signup','POST',{name:'A',email:'a@example.com',password},{Origin:'https://attacker.example'})).status,403);
    const a=await alice.request('/api/auth/signup','POST',{name:'Alice',email:'ALICE@example.com',password});
    assert.equal(a.status,201);assert.equal(a.data.user.email,'alice@example.com');recovery=a.data.recovery;
    assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Strict/);
    assert.match(a.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(a.headers.get('access-control-allow-origin'),null);
    assert.equal(a.data.token,undefined);assert.equal(a.headers.get('cache-control'),'no-store');
    assert.equal((await bob.request('/api/auth/signup','POST',{name:'Bob',email:'bob@example.com',password})).status,201);
    assert.equal((await guest.request('/api/auth/signup','POST',{name:'A',email:'Alice@example.com',password})).status,409);
    assert.equal((await other.request('/api/auth/login','POST',{email:'alice@example.com',password})).status,200);
  });
  await t.test('new accounts start empty; CSRF and validation are enforced',async()=>{
    const data=(await alice.request('/api/household')).data;assert.deepEqual(data.appliances,[]);assert.deepEqual(data.readings,[]);
    assert.equal((await alice.request('/api/settings','PUT',{budget:100},{'X-CSRF-Token':''})).status,403);
    assert.equal((await alice.request('/api/settings','PUT',{monthly_target:-1})).status,400);
    for(const value of [-2,25,'4',null])assert.equal((await alice.request('/api/appliances','POST',{name:'Fan',room:'Living',watts:75,hours:value,on:false})).status,400);
  });
  await t.test('appliance CRUD, owner isolation and zero usage',async()=>{
    const created=await alice.request('/api/appliances','POST',{name:'Fan <img src=x onerror=alert(1)>',brand:'Test',room:'Living',watts:75,hours:0,on:false});assert.equal(created.status,201);appId=created.data.id;
    assert.equal((await bob.request('/api/appliances/'+appId,'PUT',{name:'stolen'})).status,404);
    assert.equal((await bob.request('/api/appliances/'+appId,'DELETE')).status,404);
    assert.equal((await alice.request('/api/appliances/'+appId,'PUT',{on:true})).status,200);
    const data=(await alice.request('/api/household')).data;assert.equal(data.appliances[0].hours,0);assert.equal(data.appliances[0].on,true);
    assert.equal((await bob.request('/api/household')).data.appliances.length,0);
  });
  await t.test('meter records reject duplicates, future dates and decreasing readings',async()=>{
    readingId=(await alice.request('/api/readings','POST',{date:'2025-01-01',value:100})).data.id;
    assert.equal((await alice.request('/api/readings','POST',{date:'2025-01-10',value:160})).status,201);
    assert.equal((await alice.request('/api/readings','POST',{date:'2025-01-05',value:170})).status,400);
    assert.equal((await alice.request('/api/readings','POST',{date:'2025-01-05',value:120})).status,201);
    assert.equal((await alice.request('/api/readings','POST',{date:'2025-01-05',value:120})).status,409);
    assert.equal((await alice.request('/api/readings','POST',{date:'2025-02-30',value:200})).status,400);
    assert.equal((await alice.request('/api/readings','POST',{date:'2099-01-01',value:200})).status,400);
    assert.equal((await bob.request('/api/readings/'+readingId,'DELETE')).status,404);
  });
  await t.test('bill records, goals, settings and schedules persist',async()=>{
    assert.equal((await alice.request('/api/bills','POST',{month:'2025-01',units:0,amount:0})).status,201);
    assert.equal((await alice.request('/api/bills','POST',{month:'2025-01',units:4,amount:20})).status,409);
    assert.equal((await alice.request('/api/bills','POST',{month:'2025-13',units:4,amount:20})).status,400);
    assert.equal((await alice.request('/api/settings','PUT',{monthly_target:160,budget:4500,goal_name:'Our new goal',reminders:false})).status,200);
    const plan={appliance_id:appId,start:'23:00',end:'01:00',days:[1,3],enabled:true};
    assert.equal((await bob.request('/api/schedules','POST',plan)).status,404);
    assert.equal((await alice.request('/api/schedules','POST',{...plan,days:[9]})).status,400);
    assert.equal((await alice.request('/api/schedules','POST',plan)).status,201);
    assert.equal((await alice.request('/api/schedules','POST',{...plan,enabled:false})).status,201);
    const data=(await alice.request('/api/household')).data;assert.equal(data.schedules.length,1);assert.equal(data.schedules[0].enabled,false);assert.equal(data.settings.monthly_target,160);assert.equal(data.settings.reminders,false);
  });
  await t.test('profile, email reauthentication and private export',async()=>{
    const profile={name:'Alice Updated',email:'alice@example.com',phone:'+94 77 123 4567',district:'Colombo',address:'Household test',account_number:'1234567890'};
    assert.equal((await alice.request('/api/users/profile','PUT',profile)).status,200);
    assert.equal((await alice.request('/api/users/profile','PUT',{...profile,phone:'123'})).status,400);
    assert.equal((await alice.request('/api/users/profile','PUT',{...profile,email:'changed@example.com'})).status,403);
    assert.equal((await alice.request('/api/users/profile','PUT',{...profile,email:'changed@example.com',current_password:password})).status,200);
    assert.equal((await other.request('/api/household')).status,401);
    const data=(await alice.request('/api/export')).data;
    assert.equal(data.user.email,'changed@example.com');assert.equal(data.user.phone,'+94771234567');
    assert.equal(data.user.password_hash,undefined);assert.equal(data.user.recovery_hash,undefined);assert.equal(data.sessions,undefined);
    assert.equal((await other.request('/api/auth/login','POST',{email:'changed@example.com',password})).status,200);
  });
  await t.test('password change invalidates previous sessions and old password',async()=>{
    assert.equal((await alice.request('/api/security/password','POST',{current_password:'wrong',password:'Another-strong-password'})).status,403);
    assert.equal((await alice.request('/api/security/password','POST',{current_password:password,password:'Another-strong-password'})).status,200);
    assert.equal((await other.request('/api/household')).status,401);
    assert.equal((await guest.request('/api/auth/login','POST',{email:'changed@example.com',password})).status,401);
    const activity=(await alice.request('/api/security')).data;assert.equal(activity.sessions.filter(s=>s.current).length,1);assert.ok(activity.events.some(e=>e.action.includes('Password changed')));
  });
  await t.test('one-time recovery is atomic and logs out all sessions',async()=>{
    const results=await Promise.all([guest.request('/api/auth/recover','POST',{email:'changed@example.com',recovery,password:'Recovered-household-password'}),other.request('/api/auth/recover','POST',{email:'changed@example.com',recovery,password:'Recovered-household-password'})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
    assert.equal((await alice.request('/api/household')).status,401);
    assert.equal((await alice.request('/api/auth/login','POST',{email:'changed@example.com',password:'Recovered-household-password'})).status,200);
  });
  await t.test('deletion requires proof and cascades only this account',async()=>{
    assert.equal((await alice.request('/api/users/account','DELETE',{current_password:'Recovered-household-password',confirmation:'no'})).status,400);
    assert.equal((await alice.request('/api/users/account','DELETE',{current_password:'Recovered-household-password',confirmation:'DELETE'})).status,200);
    assert.equal((await alice.request('/api/household')).status,401);
    assert.equal((await bob.request('/api/household')).status,200);
    assert.equal((await db.get('SELECT count(*) n FROM appliances')).n,0);assert.equal((await db.get('SELECT count(*) n FROM readings')).n,0);assert.equal((await db.get('SELECT count(*) n FROM schedules')).n,0);
  });
  await t.test('rate limiting blocks repeated attempts and session idle timeout works',async()=>{
    const {limit}=require('../auth');await limit('test-limit',1);await assert.rejects(limit('test-limit',1),e=>e.status===429);
    await db.run('UPDATE sessions SET last_seen=?',[Date.now()-31*60*1000]);assert.equal((await bob.request('/api/household')).status,401);
  });
});
