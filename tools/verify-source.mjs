import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const source = readFileSync(new URL('../assets/models/bmw-m5-f90-source.glb', import.meta.url));
const expected = '8d064b8dc6412bc324041d3f964c305994e683b6d427381958ce2807388cb776';
assert.equal(createHash('sha256').update(source).digest('hex'), expected, 'Protected model changed');
assert.equal(source.readUInt32LE(0), 0x46546c67);
const gltf = JSON.parse(source.subarray(20,20+source.readUInt32LE(12)).toString());
const triangles=gltf.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+(p.mode===undefined||p.mode===4?gltf.accessors[p.indices??p.attributes.POSITION].count/3:0),0);
assert.equal(triangles,259930);
assert.equal(gltf.materials.length,96);
assert.equal(gltf.images.length,55);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const backup=execFileSync('git',['show','backup/pre-cinematic-desktop:index.html'],{encoding:'utf8'});
for(const name of ['intro','services','visual','values','portfolio','quote','booking']){
  const pattern=new RegExp(`<section\\b(?:(?!<\\/section>)[\\s\\S])*?class="[^"]*\\b${name}\\b[^"]*"(?:(?!<\\/section>)[\\s\\S])*?<\\/section>`);
  // Two dead legacy photo URLs were repaired using imagery already in the project.
  const clean=value=>value?.replace(/ (?:loading|decoding)="[^"]*"/g,'')
    .replace('https://images.unsplash.com/photo-1613214150384-2f3b7b9d9e2f?auto=format&fit=crop&w=1100&q=85','assets/images/studio-car.jpg')
    .replace('https://images.unsplash.com/photo-1600705722904-9f7dcd1b2c7d?auto=format&fit=crop&w=900&q=85','assets/video/noir-detailing-poster.jpg')
    .replace(/\s+/g,' ').trim();
  assert.ok(backup.match(pattern),`Missing backup section ${name}`);
  assert.equal(clean(html.match(pattern)?.[0]),clean(backup.match(pattern)?.[0]),`Existing ${name} content changed`);
}
for(const id of ['services','philosophy','works','contact','leadForm'])assert.ok(html.includes(`id="${id}"`));
assert.equal((html.match(/data-chapter=/g)||[]).length,8);
console.log(JSON.stringify({sha256:expected,bytes:source.length,triangles,materials:gltf.materials.length,textures:gltf.images.length,legacySectionsPreserved:7,storyChapters:8},null,2));
