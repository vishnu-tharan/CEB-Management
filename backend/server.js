require('dotenv').config({path:require('node:path').join(__dirname,'.env'),quiet:true});
const express=require('express');
const helmet=require('helmet');
const path=require('node:path');
const bcrypt=require('bcrypt');
const db=require('./db');
const auth=require('./auth');
const v=require('./validation');
const app=express();
if (process.env.NODE_ENV==='production' && (!process.env.APP_ORIGIN || !process.env.APP_ORIGIN.startsWith('https://'))) throw new Error('Production requires an HTTPS APP_ORIGIN.');
app.disable('x-powered-by');
// Reject unexpected Host headers, including DNS-rebinding requests to the local server.
app.use((req,res,next)=>{
  const allowed=process.env.APP_ORIGIN?[new URL(process.env.APP_ORIGIN).hostname]:['localhost','127.0.0.1','[::1]','::1'];
  if(!allowed.includes(req.hostname))return res.status(421).json({error:'Host is not configured for this app.'});
  next();
});
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'none'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}},strictTransportSecurity:process.env.NODE_ENV==='production'?undefined:false}));
app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if (!['GET','HEAD'].includes(req.method)) {
    const origin=process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (req.get('sec-fetch-site')==='cross-site' || (req.get('origin') && req.get('origin')!==origin) || req.get('x-requested-with')!=='CEBEnergySaver') return res.status(403).json({error:'Request origin is not allowed.'});
    if (!req.is('application/json')) return res.status(415).json({error:'Send JSON data.'});
  }
  next();
});
app.use(express.json({limit:'32kb',strict:true}));
app.use('/api',(req,res,next)=>{if(!['GET','HEAD'].includes(req.method) && (!req.body || typeof req.body!=='object' || Array.isArray(req.body)))return res.status(400).json({error:'Expected a JSON object.'});next();});
app.get('/api/health',(req,res)=>res.json({status:'ok'}));
app.use('/api/auth',auth.router);
app.use('/api',auth.authenticate);
app.use('/api',async(req,res,next)=>{try{if(!['GET','HEAD'].includes(req.method))await auth.limit('write:'+req.user.id,300);next();}catch(e){next(e);}});
async function household(user) {
  const id=user.id;
  const [appliances,readings,bills,schedules,settings,alerts]=await Promise.all([
    db.all('SELECT id,name,brand,room,watts,hours,on_state FROM appliances WHERE user_id=? ORDER BY id DESC',[id]),
    db.all('SELECT id,date,value,note FROM readings WHERE user_id=? ORDER BY date',[id]),
    db.all('SELECT id,month,units,amount FROM bills WHERE user_id=? ORDER BY month DESC',[id]),
    db.all('SELECT s.id,s.appliance_id,a.name,s.start,s.end,s.days,s.enabled FROM schedules s JOIN appliances a ON a.id=s.appliance_id WHERE s.user_id=? ORDER BY s.start',[id]),
    db.get('SELECT monthly_target,budget,high_usage,power_limit,reminders,goal_name FROM settings WHERE user_id=?',[id]),
    db.all('SELECT id,title,text,time,unread FROM alerts WHERE user_id=? ORDER BY id DESC LIMIT 100',[id])
  ]);
  return {user:auth.publicUser(user),appliances:appliances.map(a=>({...a,on:!!a.on_state})),readings,bills,schedules:schedules.map(s=>({...s,days:JSON.parse(s.days),enabled:!!s.enabled})),settings:{...settings,high_usage:!!settings.high_usage,reminders:!!settings.reminders},alerts};
}
app.get('/api/household',async(req,res)=>res.json(await household(req.user)));
app.get('/api/users/profile',(req,res)=>res.json(auth.publicUser(req.user)));
app.put('/api/users/profile',async(req,res)=>{
  const b=req.body;
  const name=v.text(b.name,'Name',100), email=v.email(b.email), phone=v.text(b.phone || '','Phone',20,false).replace(/[\s()-]/g,''), address=v.text(b.address || '','Address',250,false), district=v.text(b.district || '','District',50,false), account=v.text(b.account_number || '','Account number',10,false);
  if(phone && !/^(?:0[1-9]\d{8}|\+94[1-9]\d{8})$/.test(phone))v.bad('Enter a Sri Lankan phone number, such as 0771234567 or +94771234567.');
  if(account && !/^\d{10}$/.test(account))v.bad('The electricity account number must contain 10 digits.');
  const emailChanged=email!==req.user.email.toLowerCase();
  if(emailChanged)await auth.checkPassword(req.user,b.current_password);
  await db.transaction(async()=>{
    if(await db.get('SELECT id FROM users WHERE lower(email)=? AND id<>?',[email,req.user.id]))v.bad('This email cannot be used. Choose another email.',409);
    await db.run('UPDATE users SET name=?,email=?,phone=?,address=?,district=?,account_number=? WHERE id=?',[name,email,phone,address,district,account,req.user.id]);
    if(emailChanged)await db.run('DELETE FROM sessions WHERE user_id=? AND id<>?',[req.user.id,req.session.id]);
    await auth.event(req.user.id,emailChanged?'Email changed; other sessions signed out':'Profile updated');
  });
  res.json(auth.publicUser(await db.get('SELECT * FROM users WHERE id=?',[req.user.id])));
});
app.post('/api/security/password',async(req,res)=>{
  v.password(req.body.password);await auth.checkPassword(req.user,req.body.current_password);
  const passwordHash=await bcrypt.hash(req.body.password,12);
  await db.transaction(async()=>{
    await db.run('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,req.user.id]);
    await db.run('DELETE FROM sessions WHERE user_id=?',[req.user.id]);
    await auth.event(req.user.id,'Password changed; all old sessions revoked');
  });
  res.json(await auth.createSession(req,res,req.user));
});
app.post('/api/security/recovery',async(req,res)=>{
  await auth.checkPassword(req.user,req.body.current_password);
  const recovery=auth.secret();
  await db.run('UPDATE users SET recovery_hash=? WHERE id=?',[auth.hash(recovery),req.user.id]);
  await auth.event(req.user.id,'Recovery code replaced');res.json({recovery});
});
app.get('/api/security',async(req,res)=>{
  const sessions=await db.all('SELECT id,created_at,last_seen,expires_at,agent FROM sessions WHERE user_id=? AND expires_at>? AND last_seen>? ORDER BY created_at DESC',[req.user.id,Date.now(),Date.now()-1800000]);
  res.json({sessions:sessions.map(s=>({...s,current:s.id===req.session.id})),events:await db.all('SELECT action,created_at FROM security_events WHERE user_id=? ORDER BY id DESC LIMIT 20',[req.user.id])});
});
app.post('/api/security/revoke',async(req,res)=>{
  await db.run('DELETE FROM sessions WHERE user_id=? AND id<>?',[req.user.id,req.session.id]);await auth.event(req.user.id,'Other sessions signed out');res.json({success:true});
});
app.get('/api/export',async(req,res)=>res.set('Content-Disposition','attachment; filename="energy-saver-data.json"').json({exported_at:new Date().toISOString(),...await household(req.user)}));
app.delete('/api/users/account',async(req,res)=>{
  await auth.checkPassword(req.user,req.body.current_password);
  if(req.body.confirmation!=='DELETE')v.bad('Type DELETE to confirm account deletion.');
  await db.transaction(async()=>{
    for(const table of ['schedules','appliances','alerts','readings','bills','settings','sessions','security_events'])await db.run(`DELETE FROM ${table} WHERE user_id=?`,[req.user.id]);
    await db.run('DELETE FROM users WHERE id=?',[req.user.id]);
  });
  res.clearCookie(auth.cookieName,auth.cookieOptions).json({success:true});
});
function appliance(b) { return [v.text(b.name,'Appliance name',80),v.text(b.brand || '','Brand',80,false),v.text(b.room,'Room',50),v.number(b.watts,'Rated power',1,50000),v.number(b.hours,'Daily hours',0,24),v.bool(b.on,'Planned state')]; }
app.post('/api/appliances',async(req,res)=>{
  const values=appliance(req.body);
  if((await db.get('SELECT count(*) n FROM appliances WHERE user_id=?',[req.user.id])).n>=200)v.bad('You can save up to 200 appliances.');
  const result=await db.run('INSERT INTO appliances (name,brand,room,watts,hours,on_state,user_id) VALUES (?,?,?,?,?,?,?)',[...values,req.user.id]);res.status(201).json(result);
});
app.put('/api/appliances/:id',async(req,res)=>{
  const id=v.id(req.params.id), old=await db.get('SELECT *,on_state AS "on" FROM appliances WHERE id=? AND user_id=?',[id,req.user.id]);
  if(!old)v.bad('Appliance not found.',404);
  const b={...old,on:!!old.on,...req.body};
  const result=await db.run('UPDATE appliances SET name=?,brand=?,room=?,watts=?,hours=?,on_state=? WHERE id=? AND user_id=?',[...appliance(b),id,req.user.id]);res.json(result);
});
app.put('/api/settings',async(req,res)=>{
  const old=await db.get('SELECT * FROM settings WHERE user_id=?',[req.user.id]);
  const b={...old,high_usage:!!old.high_usage,reminders:!!old.reminders,...req.body};
  await db.run('UPDATE settings SET monthly_target=?,budget=?,high_usage=?,power_limit=?,reminders=?,goal_name=? WHERE user_id=?',[
    v.number(b.monthly_target,'Monthly target',1,50000),v.number(b.budget,'Budget',0,10000000),v.bool(b.high_usage,'Usage alerts'),v.number(b.power_limit,'Power alert limit',100,100000),v.bool(b.reminders,'Reminders'),v.text(b.goal_name,'Goal name',100),req.user.id]);
  res.json({success:true});
});
app.post('/api/readings',async(req,res)=>{
  const date=v.date(req.body.date), value=v.number(req.body.value,'Meter reading',0,999999999), note=v.text(req.body.note || '','Note',250,false);
  const result=await db.transaction(async()=>{
    const prev=await db.get('SELECT value FROM readings WHERE user_id=? AND date<? ORDER BY date DESC LIMIT 1',[req.user.id,date]);
    const next=await db.get('SELECT value FROM readings WHERE user_id=? AND date>? ORDER BY date LIMIT 1',[req.user.id,date]);
    if((prev && value<prev.value)||(next && value>next.value))v.bad('Cumulative readings must increase with time. Check the date and reading.');
    return db.run('INSERT INTO readings (user_id,date,value,note) VALUES (?,?,?,?)',[req.user.id,date,value,note]);
  });res.status(201).json(result);
});
app.post('/api/bills',async(req,res)=>{
  const month=v.text(req.body.month,'Billing month',7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month<'2000-01' || month>v.date(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).slice(0,7))v.bad('Choose a valid current or past billing month.');
  const result=await db.run('INSERT INTO bills (user_id,month,units,amount) VALUES (?,?,?,?)',[req.user.id,month,v.number(req.body.units,'Units',0,1000000),v.number(req.body.amount,'Bill amount',0,100000000)]);res.status(201).json(result);
});
app.post('/api/schedules',async(req,res)=>{
  const b=req.body,id=v.id(b.appliance_id);
  if(!await db.get('SELECT id FROM appliances WHERE id=? AND user_id=?',[id,req.user.id]))v.bad('Appliance not found.',404);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end) || b.start===b.end)v.bad('Enter different valid start and end times. Overnight plans are supported.');
  if(!Array.isArray(b.days) || !b.days.length || b.days.length>7 || b.days.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(b.days).size!==b.days.length)v.bad('Choose at least one distinct day.');
  await db.run('INSERT INTO schedules (user_id,appliance_id,start,end,days,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,appliance_id) DO UPDATE SET start=excluded.start,end=excluded.end,days=excluded.days,enabled=excluded.enabled',[req.user.id,id,b.start,b.end,JSON.stringify(b.days.sort()),v.bool(b.enabled,'Plan enabled')]);res.status(201).json({success:true});
});
app.put('/api/alerts/read-all',async(req,res)=>{await db.run('UPDATE alerts SET unread=0 WHERE user_id=?',[req.user.id]);res.json({success:true});});
for(const table of ['appliances','readings','bills','schedules'])app.delete(`/api/${table}/:id`,async(req,res)=>{
  const result=await db.run(`DELETE FROM ${table} WHERE id=? AND user_id=?`,[v.id(req.params.id),req.user.id]);if(!result.changes)v.bad('Record not found.',404);res.json({success:true});
});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
app.use(express.static(path.join(__dirname,'../frontend'),{dotfiles:'deny',etag:true}));
app.use((req,res)=>res.status(404).type('text').send('Page not found.'));
app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  let status=error.status || 500,message=error.message;
  if(error.code==='SQLITE_CONSTRAINT'){status=409;message='This record already exists or conflicts with saved data.';}
  if(error.type==='entity.parse.failed'){status=400;message='Invalid JSON data.';}
  if(status>=500){console.error('Request failed:',error.code || error.name);message='Something went wrong. Your changes could not be saved. Please try again.';}
  if(status===429)res.set('Retry-After','900');
  res.status(status).json({error:message});
});
async function start(){await db.migrate();return app.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log(`Energy Saver is ready at ${process.env.APP_ORIGIN || 'http://localhost:'+(process.env.PORT||3000)}`));}
if(require.main===module)start().then(server=>{for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>db.close().then(()=>process.exit(0))));}).catch(error=>{console.error('Startup failed:',error.message);process.exit(1);});
module.exports={app,start};
