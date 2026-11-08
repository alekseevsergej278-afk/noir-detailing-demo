import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
// Run from the repository root. An explicit baseline remains usable after merge.
const base=process.argv[2]||'62ce2d48db76938bffeb777e3f0730addd2653e1';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const files=git('ls-tree','-r','--name-only',base,'assets').split('\n');
for(const file of files){
  assert.equal(git('hash-object','--path='+file,file),git('rev-parse',base+':'+file),`Existing asset changed: ${file}`);
}
const before=execFileSync('git',['show',base+':index.html'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
const after=readFileSync('index.html','utf8').replace(/\r\n/g,'\n');
for(const id of ['experience','condition','polishing','ceramic','ppf','interior-care','finish','your-car']){
  const pattern=new RegExp('<section[^>]*id="'+id+'"[\\s\\S]*?<\\/section>');
  assert.equal(after.match(pattern)?.[0],before.match(pattern)?.[0],`Story chapter changed: ${id}`);
}
assert.equal((after.match(/data-chapter=/g)||[]).length,8);
const source=readFileSync('assets/models/bmw-m5-f90-source.glb');
assert.equal(createHash('sha256').update(source).digest('hex'),'8d064b8dc6412bc324041d3f964c305994e683b6d427381958ce2807388cb776');
console.log(`PASS: ${files.length} existing assets and all 8 story chapters unchanged; source GLB SHA-256 matches.`);
