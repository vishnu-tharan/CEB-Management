const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ceb-migration-'));
process.env.DB_PATH=path.join(directory,'test.sqlite');
const db=require('../db');
test('legacy database upgrade preserves data and persisted values survive reopening',async()=>{
  try{
    await db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    await db.run('CREATE TABLE appliances (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT, room TEXT, watts INTEGER, on_state INTEGER, hours REAL, icon TEXT)');
    await db.run("INSERT INTO users (id,name,email,password_hash) VALUES (1,'Legacy User','legacy@example.com','hash-to-preserve')");
    await db.run("INSERT INTO appliances VALUES (1,1,'Existing fan','Living',75,1,8,'fan')");
    await db.migrate();await db.migrate();
    assert.equal((await db.get('SELECT password_hash FROM users WHERE id=1')).password_hash,'hash-to-preserve');
    assert.equal((await db.get('SELECT name FROM appliances WHERE id=1')).name,'Existing fan');
    await db.run("UPDATE settings SET goal_name='Persistent target',monthly_target=180 WHERE user_id=1");
    await db.close();
    const result=execFileSync(process.execPath,['-e',`const db=require('./db');(async()=>{await db.migrate();console.log(JSON.stringify(await db.get('SELECT goal_name,monthly_target FROM settings WHERE user_id=1')));await db.close()})().catch(()=>process.exit(1))`],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});
    assert.deepEqual(JSON.parse(result.trim()),{goal_name:'Persistent target',monthly_target:180});
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
