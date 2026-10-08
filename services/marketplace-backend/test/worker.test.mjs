import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('a supervised SQLite worker does not bind the API port during migration compatibility mode',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'market-worker-')),api=createServer();await new Promise(r=>api.listen(0,'::',r));
 const child=spawn(process.execPath,['services/marketplace-backend/src/worker.mjs','metadata'],{env:{...process.env,DATABASE_URL:'',MARKETPLACE_STORE:'sqlite',MARKETPLACE_DB:join(dir,'chain.sqlite'),MARKETPLACE_CHAIN:'LOCAL',MARKETPLACE_REGISTRY_JSON:JSON.stringify({chains:{LOCAL:{chainId:'0x1',marketplace:null,collections:[],currencies:[]}}}),MARKETPLACE_BACKGROUND_ENABLED:'false',PORT:String(api.address().port),MARKETPLACE_HOST:'::'}});
 let stderr='';child.stderr.on('data',v=>stderr+=v);child.stdout.resume();
 t.after(async()=>{if(child.exitCode===null){const closed=once(child,'exit');child.kill('SIGTERM');await closed;}await new Promise(r=>api.close(r));rmSync(dir,{recursive:true,force:true});});
 await new Promise(r=>setTimeout(r,500));assert.equal(child.exitCode,null,stderr);assert.doesNotMatch(stderr,/EADDRINUSE/);
});
