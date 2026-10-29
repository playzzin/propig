import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {createStaticExportServer} from './serve-static-export.mjs';
const base=await mkdtemp(path.join(tmpdir(),'propig-static-server-'));const root=path.join(base,'export');let server;
try{
 await mkdir(path.join(root,'corp'),{recursive:true});await mkdir(path.join(root,'downloads'),{recursive:true});
 await writeFile(path.join(root,'corp.html'),'<h1>exported corp</h1>');await writeFile(path.join(root,'corp','__next._tree.txt'),'RSC exported');
 await writeFile(path.join(root,'downloads','app.apk'),Buffer.from([0,1,2,255]));await writeFile(path.join(root,'.env'),'must-not-serve');await writeFile(path.join(base,'private.txt'),'private');
 // Directory junction works without Windows Developer Mode; avoid privileged file symlinks.
 await mkdir(path.join(base,'private'),{recursive:true});await writeFile(path.join(base,'private','secret.txt'),'private');await symlink(path.join(base,'private'),path.join(root,'escape'),process.platform==='win32'?'junction':'dir');
 server=await createStaticExportServer(root);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const request=(target,method='GET')=>new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port,path:target,method},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:Buffer.concat(chunks)}));});q.on('error',reject);q.end();});
 for(const route of ['/corp','/corp/','/corp.html?x=1']){const r=await request(route);assert.equal(r.status,200);assert.equal(r.body.toString(),'<h1>exported corp</h1>');}
 assert.equal((await request('/corp/__next._tree.txt?_rsc=x')).body.toString(),'RSC exported');
 const head=await request('/corp','HEAD');assert.equal(head.status,200);assert.equal(head.body.length,0);assert(head.headers['content-length']);
 assert.deepEqual((await request('/downloads/app.apk')).body,Buffer.from([0,1,2,255]));
 assert.equal((await request('/escape/secret.txt')).status,403);
 for(const p of ['/../private.txt','/%2e%2e/private.txt','/.env','/%2Eenv','/%00','/%zz','/a%5c..%5cprivate.txt'])assert.equal((await request(p)).status,400,p);
 assert.equal((await request('/missing')).status,404);assert.equal((await request('/api/analyze-bookmark')).status,503);assert.equal((await request('/api/analyze-bookmark','POST')).status,405);
 assert.equal(JSON.parse((await request('/__propig_static_health')).body).kind,'propig-static-export');
 console.log('PASS exported bytes/cleanUrls/trailing slash/RSC/HEAD/APK; traversal, dotfiles, symlink escape blocked; API has no proxy');
}finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(base,{recursive:true,force:true});}
