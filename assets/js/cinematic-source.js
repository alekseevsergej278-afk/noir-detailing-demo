import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import {prepareTimeline, sampleTimeline} from './motion-timeline.js';
import {createEditorialMotion} from './editorial-motion.js';

// The source GLB, its geometry, UVs, normals, textures and materials are read-only.
// Treatment effects reference existing geometry with independent materials.
const mount = document.getElementById('noir-scene');
const status = document.getElementById('scene-status');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const editorial = createEditorialMotion(reduceMotion,()=>invalidate());
const query = new URLSearchParams(location.search);
const debug = query.has('perf');
const chapterNodes = [...document.querySelectorAll('[data-chapter]')];
const sourceURL = new URL('../models/bmw-m5-f90-source.glb', import.meta.url).href;
let renderer, scene, camera, rig, original, reflection, reflectionPass, environment;
let modelReady = false, frame = 0, active = true, disposed = false;
const motionAllowed=()=>!reduceMotion.matches||(debug&&query.get('motion')==='full');
let motionEnabled=motionAllowed();
let w = innerWidth, h = innerHeight, dprCap = 1.5, previousTime = 0, slowFrames = 0;
let anchors = [], chapterBounds = [], currentChapter = 'hero', frameNumber = 0, lastRender = 0;
let sceneRanges=[];
let entranceTime = 0, storyPosition = scrollY, timeline, nextFrameAt=0;
let sceneOpacity = 1, reflectionOpacity;
let originalMeshes = [], originalMaterials = [], originalChecks = [];
let dirtyLayers = [], glossLayers = [], ceramicLayers = [], filmLayers = [], waveLayers = [];
let water, waterSeeds = [], waterMaterial, hood, paintColor = new THREE.Color('#154835');
const GRAPHITE_COLOR='#4b535c';
const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set();
const look = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
const BASE_POSE = Object.freeze({x:5.6,y:2.55,z:7.8,tx:0,ty:.65,tz:0,fov:34,yaw:-.2,offset:.18,dirty:0,polish:0,ceramic:0,film:0,lift:1,water:0,reflect:1,light:1});
const motionState = {...BASE_POSE};
const props = Object.keys(motionState);
const uniforms = {sweep:{value:0},wave:{value:0},filmLay:{value:0}};
const metrics = {source:'bmw-m5-f90-source.glb',sourceTriangles:259930,modelLoads:0,frames:0,intervals:[],adaptiveReductions:0,loadStart:performance.now(),sourceMaterialsUnchanged:true,sourceGeometryUnchanged:true};
const diagnostic = debug ? document.createElement('output') : null;
if (diagnostic) {diagnostic.id='scene-diagnostics';diagnostic.hidden=true;document.body.appendChild(diagnostic);}

function keepGeometry(g){ownedGeometries.add(g);return g;}
function keepMaterial(m){ownedMaterials.add(m);return m;}
function keepTexture(t){ownedTextures.add(t);return t;}
function smooth(x){x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);}
function pose(values){return {...BASE_POSE,...values};}
function addKey(at,state){anchors.push({at,state:pose(state)});}
function cacheTimeline(){
  w=innerWidth;h=innerHeight;
  chapterBounds=chapterNodes.map(node=>({node,copy:node.querySelector('.story-copy'),name:node.dataset.chapter,top:node.getBoundingClientRect().top+scrollY,height:node.offsetHeight}));
  const b=Object.fromEntries(chapterBounds.map(r=>[r.name,r]));
  sceneRanges=[{start:0,end:b.result.top+b.result.height},{start:b.finale.top,end:b.finale.top+b.finale.height}];
  anchors=[];
  addKey(0,{});
  addKey(b.condition.top-h*.55,{x:4.6,y:2.4,z:6.4});
  addKey(b.condition.top+h*.25,{x:.72,y:1.65,z:2.9,tx:0,ty:.87,tz:1.45,fov:32,yaw:0,dirty:1,reflect:0,light:1.2});
  addKey(b.polish.top-h*.55,{x:.64,y:1.62,z:2.7,tx:.03,ty:.86,tz:1.43,fov:31,yaw:0,dirty:1,reflect:0,light:1.2});
  addKey(b.polish.top+h*.5,{x:-.62,y:1.6,z:2.72,tx:0,ty:.87,tz:1.45,fov:31,yaw:0,dirty:1,polish:1,reflect:0,light:1.55});
  addKey(b.ceramic.top-h*.5,{x:-.72,y:1.85,z:3.15,tx:0,ty:.85,tz:1.4,fov:34,yaw:0,polish:1,reflect:0,light:1.45});
  addKey(b.ceramic.top+h*.5,{x:.62,y:1.7,z:2.93,tx:0,ty:.86,tz:1.5,fov:32,yaw:0,polish:1,ceramic:1,water:1,reflect:0,light:1.55});
  addKey(b.ppf.top-h*.48,{x:2.9,y:2.05,z:5.15,tx:0,ty:.75,tz:.85,fov:33,yaw:0,polish:1,ceramic:.6,film:.8,lift:1,reflect:0,light:1.35});
  addKey(b.ppf.top+h*.5,{x:2.5,y:1.95,z:4.8,tx:0,ty:.75,tz:.9,fov:33,yaw:0,polish:1,ceramic:.6,film:1,lift:0,reflect:0,light:1.4});
  addKey(b.interior.top-h*.5,{x:2.0,y:1.7,z:3.3,tx:0,ty:1,tz:.1,fov:40,yaw:0,polish:1,reflect:0,light:1.1});
  addKey(b.interior.top-h*.12,{x:.05,y:1.45,z:1.4,tx:0,ty:1,tz:.3,fov:60,yaw:0,offset:.12,reflect:0,light:1.4});
  addKey(b.interior.top+h*.15,{x:.03,y:1.12,z:-.68,tx:0,ty:1.0,tz:.8,fov:66,yaw:0,offset:.12,reflect:0,light:1.5});
  addKey(b.interior.top+h*.72,{x:-.12,y:1.13,z:-.6,tx:.14,ty:.98,tz:.8,fov:64,yaw:0,offset:.12,reflect:0,light:1.5});
  addKey(b.interior.top+h*.88,{x:.05,y:1.45,z:1.4,tx:0,ty:1,tz:.3,fov:60,yaw:0,offset:.12,reflect:0,light:1.4});
  addKey(b.result.top-h*.05,{x:5.6,y:2.55,z:7.8,polish:1,ceramic:.4,light:1.5});
  addKey(b.result.top+h*1.3,{x:5.6,y:2.35,z:7.8,yaw:Math.PI*2-.2,polish:1,ceramic:.4,light:1.55});
  addKey(b.finale.top-h*.55,{x:5.6,y:2.55,z:7.8,yaw:Math.PI*2-.2,polish:1,ceramic:.4,light:1.5});
  addKey(b.finale.top+h*.4,{x:5.2,y:2.4,z:7.4,yaw:Math.PI*2-.16,polish:1,ceramic:.4,light:1.45});
  anchors.sort((a,b)=>a.at-b.at);
  timeline=prepareTimeline(anchors,props);
  measureHeadingLines();
  resizeRenderer();invalidate();
}
function timelineAt(y){
  if(!motionEnabled){
    // Reduced motion keeps a stable exterior composition. Treatment layers still
    // explain each service; no interior flight or 360-degree rotation is needed.
    const effects=sampleTimeline(timeline,y);
    return {...effects,...Object.fromEntries(['x','y','z','tx','ty','tz','fov','yaw','offset'].map(p=>[p,BASE_POSE[p]]))};
  }
  return sampleTimeline(timeline,y);
}

function prepareHeadings(){
  for(const node of chapterNodes){
    const disclaimer=node.querySelector('.scene-disclaimer');
    if(disclaimer)node.querySelector('.story-copy').append(disclaimer);
    const heading=node.querySelector('h1,h2');
    heading.setAttribute('aria-label',heading.innerText.replace(/\s+/g,' ').trim());
    const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const text of nodes){
      const fragment=document.createDocumentFragment();
      text.textContent.split(/(\s+)/).forEach(word=>{
        if(!word.trim()){fragment.append(document.createTextNode(word));return;}
        const clip=document.createElement('span'),rise=document.createElement('span');
        clip.className='story-word';clip.setAttribute('aria-hidden','true');
        rise.className='story-word-rise';rise.textContent=word;clip.append(rise);fragment.append(clip);
      });
      text.replaceWith(fragment);
    }
  }
}
function measureHeadingLines(){
  for(const node of chapterNodes){
    let last=-Infinity,line=-1;
    for(const word of node.querySelectorAll('.story-word')){
      const top=word.offsetTop;if(Math.abs(top-last)>8){line++;last=top;}
      word.firstElementChild.style.setProperty('--line',line);
    }
  }
}
function updatePresentation(position,entrance=1){
  let opacity=0,selected=null,strongest=0;
  for(const b of chapterBounds){
    const start=b.top-h*(b.name==='result'?.04:.6),end=b.top+b.height;
    let enter=b.name==='hero'?1:smooth((position-start)/(h*.36));
    const leave=smooth((position-(end-h*.85))/(h*.34));
    if(b.name==='hero')enter*=entrance;
    const amount=enter*(1-leave);
    b.copy.style.setProperty('--copy-alpha',amount.toFixed(4));
    b.copy.style.setProperty('--copy-enter',enter.toFixed(4));
    b.copy.style.setProperty('--copy-leave',leave.toFixed(4));
    if(amount>strongest){strongest=amount;selected=b;}
  }
  for(const range of sceneRanges){
    const enter=range.start===0?1:smooth((position-(range.start-h))/(h*.45));
    const leave=1-smooth((position-(range.end-h*.7))/(h*.65));
    opacity=Math.max(opacity,enter*leave);
  }
  // Never superimpose two headings, even in the nearly transparent crossover.
  for(const b of chapterBounds){
    const visible=b===selected&&strongest>.002;
    b.copy.style.visibility=visible?'visible':'hidden';b.copy.inert=!visible;
    b.copy.setAttribute('aria-hidden',String(!visible));
  }
  currentChapter=selected?.name??currentChapter;
  sceneOpacity=opacity;mount.style.opacity=opacity.toFixed(4);
  active=opacity>.001;
  document.body.dataset.studioActive=String(active);
}
function recordOriginals(){
  originalMeshes=[];const mats=new Set();
  original.traverse(node=>{if(node.isMesh){originalMeshes.push({node,geometry:node.geometry,index:node.geometry.index,position:node.geometry.attributes.position,normal:node.geometry.attributes.normal,uv:node.geometry.attributes.uv});(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>mats.add(m));}});
  originalMaterials=[...mats];originalChecks=originalMaterials.map(material=>({material,state:materialState(material)}));
}
function materialState(m){return JSON.stringify([m.color?.getHex(),m.roughness,m.metalness,m.opacity,m.transparent,m.side,m.map?.uuid,m.normalMap?.uuid,m.roughnessMap?.uuid,m.metalnessMap?.uuid,m.normalScale?.toArray(),m.clearcoat,m.clearcoatRoughness]);}
function verifyOriginals(){
  metrics.sourceMaterialsUnchanged=originalChecks.every(({material,state})=>state===materialState(material));
  metrics.sourceGeometryUnchanged=originalMeshes.every(({node,geometry,index,position,normal,uv})=>node.geometry===geometry&&geometry.index===index&&geometry.attributes.position===position&&geometry.attributes.normal===normal&&geometry.attributes.uv===uv);
}
function presentationMaterials(){
  const replacements=new Map();let glassMeshes=0;
  for(const source of originalMaterials){
    if(source.name==='BUMWERK deep green metallic'){
      const material=keepMaterial(source.clone());material.color.set(GRAPHITE_COLOR);replacements.set(source,material);
    }else if(source.name==='BUMWERK black tinted glass'){
      // Restore a clear, lightly tinted window using a disposable runtime copy.
      // The opaque BUMWERK material and source GLB remain available unchanged.
      const material=keepMaterial(source.clone());material.color.set('#b9cbd5');material.metalness=0;material.roughness=.1;material.opacity=.16;material.transparent=true;material.depthWrite=false;material.side=THREE.FrontSide;
      material.clearcoat=1;material.clearcoatRoughness=.04;replacements.set(source,material);
    }
  }
  for(const {node}of originalMeshes){const replace=m=>{const copy=replacements.get(m);if(copy&&m.name==='BUMWERK black tinted glass')glassMeshes++;return copy??m;};node.material=Array.isArray(node.material)?node.material.map(replace):replace(node.material);}
  metrics.clearWindowMeshes=glassMeshes;metrics.presentationMaterialsAreCopies=true;metrics.finish='graphite';verifyOriginals();
}
function environmentStudio(){
  const envScene=new THREE.Scene();envScene.background=new THREE.Color('#030405');
  const boxes=[[-4,3,2,1.7,7,[4,4,4]],[4,3,-2,1.2,6,[2.5,3.1,4]],[-2,3,-4,1,5,[2.5,1.9,1.2]],[0,6,0,4,5,[3,3,3]]];
  for(const [x,y,z,sx,sy,color]of boxes){const g=new THREE.PlaneGeometry(sx,sy);const m=new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide});const p=new THREE.Mesh(g,m);p.position.set(x,y,z);p.lookAt(0,.6,0);envScene.add(p);}
  const generator=new THREE.PMREMGenerator(renderer);const target=generator.fromScene(envScene,.025,.1,100);generator.dispose();
  envScene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  return target;
}
function createStudio(){
  scene=new THREE.Scene();scene.background=new THREE.Color('#08090b');scene.fog=new THREE.Fog('#08090b',14,35);
  scene.environmentIntensity=1.4;
  environment=environmentStudio();scene.environment=environment.texture;
  const key=new THREE.DirectionalLight('#fff4df',3.2);key.position.set(-3,6,5);key.name='studio-key';scene.add(key);
  const rim=new THREE.DirectionalLight('#b6d0ec',2.7);rim.position.set(4,3,-3);rim.name='studio-rim';scene.add(rim);
  scene.add(new THREE.HemisphereLight('#d4dfed','#17120d',.8));
  const wallMaterial=keepMaterial(new THREE.ShaderMaterial({vertexShader:'varying vec2 vStudioUv;void main(){vStudioUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vStudioUv;void main(){vec2 p=(vStudioUv-vec2(.5,.28))*vec2(7.0,3.6);float pool=exp(-dot(p,p)*1.8)*smoothstep(.2,.34,vStudioUv.y);gl_FragColor=vec4(mix(vec3(.0024,.0027,.0034),vec3(.016,.019,.024),pool),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
  const wall=new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(70,20)),wallMaterial);wall.position.set(0,6,-10);scene.add(wall);
  const floor=new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(70,70)),keepMaterial(new THREE.MeshBasicMaterial({color:'#090b0e'})));floor.rotation.x=-Math.PI/2;floor.position.y=-.04;scene.add(floor);
  reflection=new Reflector(keepGeometry(new THREE.PlaneGeometry(36,36)),{textureWidth:1024,textureHeight:512,color:0x303238,multisample:0,clipBias:.003});
  reflection.rotation.x=-Math.PI/2;reflection.position.y=-.025;
  reflection.material.transparent=true;reflection.material.depthWrite=false;
  reflectionOpacity={value:.32};reflection.material.uniforms.noirReflection=reflectionOpacity;
  const shader=reflection.material;
  shader.fragmentShader=shader.fragmentShader.replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec2 uv=vUv.xy/vUv.w;vec2 px=vec2(2.0/1024.0,2.0/512.0);vec4 base=texture2D(tDiffuse,uv)*.4; base+=texture2D(tDiffuse,uv+px)*.15; base+=texture2D(tDiffuse,uv-px)*.15;base+=texture2D(tDiffuse,uv+vec2(px.x,-px.y))*.15;base+=texture2D(tDiffuse,uv+vec2(-px.x,px.y))*.15;`)
    .replace('uniform vec3 color;','uniform vec3 color;\nuniform float noirReflection;')
    .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4( blendOverlay( base.rgb, color ), noirReflection )');
  // Demand rendering stops work when still. Moving reflections use the current camera.
  reflectionPass=reflection.onBeforeRender;scene.add(reflection);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');const gradient=ctx.createRadialGradient(64,64,8,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.9)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const contact=new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(3.3,6.2)),keepMaterial(new THREE.MeshBasicMaterial({map:keepTexture(new THREE.CanvasTexture(canvas)),transparent:true,depthWrite:false})));contact.rotation.x=-Math.PI/2;contact.position.y=-.012;scene.add(contact);
}
function attachSurface(originalMesh,material,list){
  const layer=new THREE.Mesh(originalMesh.geometry,material);layer.name='NOIR reversible surface';layer.renderOrder=20;layer.frustumCulled=true;originalMesh.add(layer);list.push(layer);return layer;
}
function createLayers(){
  const body=[];original.traverse(n=>{if(n.isMesh&&!Array.isArray(n.material)&&n.material.name==='BUMWERK deep green metallic')body.push(n);});
  if(!body.length)throw new Error('Expected original car body material was not found.');
  paintColor.copy(body[0].material.color);
  hood=body.find(n=>n.name.includes('__hood'));
  const scratchCanvas=document.createElement('canvas');scratchCanvas.width=scratchCanvas.height=2048;
  const scratchContext=scratchCanvas.getContext('2d');scratchContext.fillStyle='#000';scratchContext.fillRect(0,0,2048,2048);
  for(let i=0;i<900;i++){const seed=n=>Math.abs(Math.sin(n*127.1+43.7)*43758.5453)%1;const x=seed(i)*2048,y=seed(i+900)*2048,r=40+seed(i+1800)*190;scratchContext.strokeStyle=`rgba(255,255,255,${.12+seed(i+2700)*.25})`;scratchContext.lineWidth=.5+seed(i+3600)*.6;scratchContext.beginPath();scratchContext.arc(x,y,r,seed(i+4500)*6.28,seed(i+4500)*6.28+.08+seed(i+5400)*.25);scratchContext.stroke();}
  const scratchTexture=keepTexture(new THREE.CanvasTexture(scratchCanvas));
  const dirty=keepMaterial(new THREE.MeshPhysicalMaterial({color:paintColor.clone().multiplyScalar(.92),metalness:.6,roughness:.5,clearcoat:.04,transparent:true,opacity:.72,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  dirty.onBeforeCompile=shader=>{
    shader.uniforms.uSweep=uniforms.sweep;
    shader.uniforms.uScratches={value:scratchTexture};
    shader.vertexShader='varying vec3 vStudioPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStudioPosition=position;');
    shader.fragmentShader='varying vec3 vStudioPosition;uniform float uSweep;uniform sampler2D uScratches;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      float polished=smoothstep(mix(2.7,-3.0,uSweep)-.2,mix(2.7,-3.0,uSweep)+.2,vStudioPosition.z);
      diffuseColor.a*=1.0-polished;
      float marks=texture2D(uScratches,vStudioPosition.xz*vec2(.5,.5)+vec2(.5,-.25)).r;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.4,.43,.4),marks*.22);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(marks*.025,-marks*.012,0.0));');
  };
  dirty.customProgramCacheKey=()=> 'noir-dirt-surface-1';
  const gloss=keepMaterial(new THREE.MeshPhysicalMaterial({color:paintColor,metalness:.65,roughness:.12,clearcoat:1,clearcoatRoughness:.045,transparent:true,opacity:.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
  const ceramic=keepMaterial(new THREE.MeshPhysicalMaterial({color:'#dce8eb',metalness:.2,roughness:.07,clearcoat:1,clearcoatRoughness:.025,transparent:true,opacity:.075,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  const wave=keepMaterial(new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5,uniforms:{uWave:uniforms.wave},vertexShader:'varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*.002,1.0);}',fragmentShader:'varying vec3 vP;varying vec3 vN;uniform float uWave;void main(){float band=exp(-pow((vP.z-mix(2.8,-3.0,uWave))*10.0,2.0));float edge=.25+pow(1.0-abs(vN.z),2.0);gl_FragColor=vec4(.92,.9,.8,band*edge*.3);}'}));
  for(const mesh of body){attachSurface(mesh,dirty,dirtyLayers);attachSurface(mesh,gloss,glossLayers);attachSurface(mesh,ceramic,ceramicLayers);attachSurface(mesh,wave,waveLayers);}
  if(hood){
    const film=keepMaterial(new THREE.MeshPhysicalMaterial({color:'#e0ebed',metalness:.15,roughness:.09,clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}));
    film.onBeforeCompile=shader=>{shader.uniforms.uFilmLay=uniforms.filmLay;shader.vertexShader='uniform float uFilmLay;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat placed=smoothstep(mix(2.7,.6,uFilmLay)-.15,mix(2.7,.6,uFilmLay)+.15,position.z);transformed+=normal*(.003+(1.0-placed)*.08);');};
    film.customProgramCacheKey=()=> 'noir-ppf-hood-1';attachSurface(hood,film,filmLayers);
    const bumper=body.find(n=>n.name==='f_bmw_f90_m5_119_Carpaint_0_0');
    if(bumper){const bumperFilm=keepMaterial(film.clone());bumperFilm.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vP;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvP=position;transformed+=normal*.004;');shader.fragmentShader='varying vec3 vP;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vP.z<1.7||vP.y>.78)discard;');};bumperFilm.customProgramCacheKey=()=> 'noir-ppf-bumper-1';attachSurface(bumper,bumperFilm,filmLayers);}
    createWater();
  }
  metrics.effectGeometryShared=body.every(n=>n.children.filter(c=>c.name==='NOIR reversible surface').every(c=>c.geometry===n.geometry));
}
function createWater(){
  original.updateWorldMatrix(true,true);const caster=new THREE.Raycaster();const normalMatrix=new THREE.Matrix3().getNormalMatrix(hood.matrixWorld);
  for(let i=0;i<90;i++){
    const x=(Math.sin(i*127.1)*43758.5453%1)*.58,z=1.0+Math.abs(Math.sin(i*78.233)*12345.7%1)*1.04;
    caster.set(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));const hit=caster.intersectObject(hood,false)[0];if(!hit)continue;
    caster.set(new THREE.Vector3(x,2,z+.12),new THREE.Vector3(0,-1,0));const endHit=caster.intersectObject(hood,false)[0];
    waterSeeds.push({point:hit.point.clone(),endPoint:(endHit?.point??hit.point).clone(),normal:hit.face.normal.clone().applyMatrix3(normalMatrix).normalize(),size:.0025+Math.abs(Math.sin(i*4.19))*.0055});
  }
  waterMaterial=keepMaterial(new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:.035,metalness:0,transmission:.94,thickness:.006,ior:1.333,clearcoat:1,clearcoatRoughness:.02,transparent:true,opacity:1,depthWrite:false}));
  water=new THREE.InstancedMesh(keepGeometry(new THREE.SphereGeometry(1,24,16)),waterMaterial,waterSeeds.length);water.name='NOIR hydrophobic beads';water.renderOrder=30;water.instanceMatrix.setUsage(THREE.DynamicDrawUsage);rig.add(water);metrics.waterDrops=waterSeeds.length;
}
const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
function updateEffects(state,time){
  uniforms.sweep.value=state.polish;uniforms.wave.value=state.ceramic;uniforms.filmLay.value=1-state.lift;
  dirtyLayers.forEach(o=>{o.visible=state.dirty>.005&&state.polish<.999;});
  glossLayers.forEach(o=>{o.visible=state.polish>.005;o.material.opacity=.22*state.polish;});
  ceramicLayers.forEach(o=>{o.visible=state.ceramic>.005;o.material.opacity=.075*state.ceramic;});
  waveLayers.forEach(o=>o.visible=currentChapter==='ceramic'&&state.ceramic>.02&&state.ceramic<.98);
  filmLayers.forEach(o=>{o.visible=state.film>.005;o.material.opacity=state.film*.13;});
  if(water){water.visible=state.water>.01;if(water.visible){waterMaterial.opacity=state.water;for(let i=0;i<waterSeeds.length;i++){const s=waterSeeds[i];dummy.position.lerpVectors(s.point,s.endPoint,state.water).addScaledVector(s.normal,s.size*.4);dummy.quaternion.setFromUnitVectors(up,s.normal);dummy.scale.set(s.size,s.size*.63,s.size);dummy.updateMatrix();water.setMatrixAt(i,dummy.matrix);}water.instanceMatrix.needsUpdate=true;}}
}
function invalidate(){if(!frame&&!disposed&&document.visibilityState!=='hidden')frame=requestAnimationFrame(render);}
function resizeRenderer(){if(!renderer)return;renderer.setPixelRatio(Math.min(devicePixelRatio,dprCap));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function render(timestamp){
  frame=0;if(disposed||document.visibilityState==='hidden')return;
  // Carry the deadline remainder across frames: a 90/144 Hz display still
  // averages 60 updates, rather than permanently dropping to 45/48 FPS.
  if(timestamp+.5<nextFrameAt){invalidate();return;}
  const cadence=1000/60;
  nextFrameAt=timestamp-nextFrameAt>100?timestamp+cadence:nextFrameAt+cadence*Math.max(1,Math.floor((timestamp-nextFrameAt)/cadence)+1);
  const dt=Math.min((timestamp-previousTime)/1000||.016,.05);previousTime=timestamp;
  // One filtered position drives the DOM, camera, vehicle, light and treatments.
  storyPosition=motionEnabled?THREE.MathUtils.damp(storyPosition,scrollY,12,dt):scrollY;
  const moving=Math.abs(storyPosition-scrollY)>.08;
  if(!moving)storyPosition=scrollY;
  const entrance=motionEnabled&&scrollY<h*.25?Math.min(1,(performance.now()-entranceTime)/1100):1;
  updatePresentation(storyPosition,entrance);
  editorial.update();
  if(!renderer||!modelReady||!active){if(moving)invalidate();return;}
  Object.assign(motionState,timelineAt(storyPosition));
  // Introductory motion finishes. Subsequent motion belongs to the visitor's scroll.
  rig.rotation.y=motionState.yaw;rig.position.y=-(1-smooth(entrance))*.04;
  cameraPosition.set(motionState.x+(1-smooth(entrance))*.14,motionState.y,motionState.z);
  camera.position.copy(cameraPosition);look.set(motionState.tx,motionState.ty,motionState.tz);camera.lookAt(look);
  camera.fov=motionState.fov;camera.setViewOffset(w,h,-w*motionState.offset,0,w,h);camera.updateProjectionMatrix();
  scene.environmentIntensity=1.25*motionState.light;
  scene.getObjectByName('studio-key').intensity=3.2*motionState.light;
  scene.getObjectByName('studio-rim').intensity=2.7*motionState.light;
  renderer.toneMappingExposure=(.1+.9*smooth(entrance))*1.2;
  updateEffects(motionState,timestamp/1000);
  reflectionOpacity.value=.32*smooth(motionState.reflect);reflection.visible=reflectionOpacity.value>.001;
  renderer.info.reset();frameNumber++;
  const started=performance.now();renderer.render(scene,camera);const cpuMs=performance.now()-started;
  metrics.frames++;
  if(lastRender&&timestamp-lastRender<150&&timestamp-lastRender>0){
    const interval=timestamp-lastRender;
    if(debug){metrics.intervals.push(interval);if(metrics.intervals.length>240)metrics.intervals.shift();}
    slowFrames=interval>32?slowFrames+1:Math.max(0,slowFrames-1);
  }
  lastRender=timestamp;
  if(slowFrames>45&&dprCap>1){dprCap=1;metrics.adaptiveReductions++;resizeRenderer();}
  if(diagnostic)diagnostic.textContent=JSON.stringify({...metrics,chapter:currentChapter,scrollY,storyPosition,sceneOpacity,pose:{...motionState},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,frameCpuMs:cpuMs,pixelRatio:renderer.getPixelRatio(),active,modelReady,motionEnabled});
  if(moving||entrance<1)invalidate();
}
function fail(error){console.error('NOIR cinematic:',error);document.body.dataset.scene='error';status.textContent='Не удалось открыть 3D-сцену. Услуги и запись доступны.';document.getElementById('scene-retry').hidden=false;}
async function init(){
  document.body.dataset.scene='loading';prepareHeadings();cacheTimeline();
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.info.autoReset=false;
    renderer.transmissionResolutionScale=.5;
    renderer.domElement.setAttribute('aria-hidden','true');mount.appendChild(renderer.domElement);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;fail(new Error('WebGL context lost'));});
    camera=new THREE.PerspectiveCamera(34,w/h,.035,100);createStudio();resizeRenderer();
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);metrics.modelLoads++;
    const gltf=await loader.loadAsync(sourceURL,e=>{status.textContent=e.total?'Готовим автомобиль · '+Math.round(e.loaded/e.total*100)+'%':'Готовим автомобиль…';});
    original=gltf.scene;recordOriginals();presentationMaterials();
    const box=new THREE.Box3().setFromObject(original),size=box.getSize(new THREE.Vector3());original.scale.setScalar(4.8/Math.max(size.x,size.z));
    const normalized=new THREE.Box3().setFromObject(original),center=normalized.getCenter(new THREE.Vector3());original.position.set(-center.x,-normalized.min.y,-center.z);
    rig=new THREE.Group();rig.add(original);scene.add(rig);rig.updateWorldMatrix(true,true);createLayers();
    status.textContent='Настраиваем студийный свет…';
    const sourceTextures=new Set();originalMaterials.forEach(m=>Object.values(m).forEach(v=>{if(v?.isTexture)sourceTextures.add(v);}));
    for(const texture of [...sourceTextures,...ownedTextures])renderer.initTexture(texture);
    // Warm every additional shader while the model is still loading. The first
    // visit to a treatment section must not trigger shader compilation.
    [...dirtyLayers,...glossLayers,...ceramicLayers,...waveLayers,...filmLayers].forEach(n=>n.visible=true);if(water)water.visible=true;
    const initial=timelineAt(scrollY);Object.assign(motionState,initial);camera.position.set(initial.x,initial.y,initial.z);camera.lookAt(initial.tx,initial.ty,initial.tz);rig.rotation.y=initial.yaw;
    await renderer.compileAsync(scene,camera);
    // Allocate buffers, the water refraction target and reflection pass behind
    // the loading state. Shader compilation alone does not warm these resources.
    camera.position.set(BASE_POSE.x,BASE_POSE.y,BASE_POSE.z);camera.lookAt(BASE_POSE.tx,BASE_POSE.ty,BASE_POSE.tz);rig.rotation.y=BASE_POSE.yaw;
    updateEffects(pose({dirty:1,polish:.5,ceramic:.5,film:.5,water:1}),0);
    [...dirtyLayers,...glossLayers,...ceramicLayers,...waveLayers,...filmLayers].forEach(n=>n.visible=true);
    renderer.render(scene,camera);
    camera.position.set(initial.x,initial.y,initial.z);camera.lookAt(initial.tx,initial.ty,initial.tz);rig.rotation.y=initial.yaw;
    camera.fov=initial.fov;camera.setViewOffset(w,h,-w*initial.offset,0,w,h);camera.updateProjectionMatrix();
    updateEffects(initial,0);reflectionOpacity.value=.32*smooth(initial.reflect);reflection.visible=reflectionOpacity.value>.001;
    renderer.toneMappingExposure=motionEnabled&&currentChapter==='hero'?.12:1.2;
    renderer.render(scene,camera);
    modelReady=true;entranceTime=performance.now();metrics.loadReadyMs=Math.round(entranceTime-metrics.loadStart);metrics.originalMeshCount=originalMeshes.length;metrics.originalMaterialCount=originalMaterials.length;
    document.body.dataset.scene='ready';document.body.classList.add('story-choreography');verifyOriginals();cacheTimeline();invalidate();
  }catch(error){fail(error);}
}
function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);
  editorial.dispose();layoutObserver.disconnect();
  const geometries=new Set(ownedGeometries),materials=new Set(ownedMaterials),textures=new Set(ownedTextures);
  originalMeshes.forEach(({geometry})=>geometries.add(geometry));originalMaterials.forEach(m=>{materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());reflection?.getRenderTarget().dispose();reflection?.material.dispose();environment?.dispose();renderer?.dispose();
}
addEventListener('scroll',invalidate,{passive:true});addEventListener('resize',cacheTimeline,{passive:true});
document.fonts?.ready.then(cacheTimeline);
const layoutObserver=new ResizeObserver(()=>cacheTimeline());layoutObserver.observe(document.querySelector('main'));

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){cancelAnimationFrame(frame);frame=0;}else{previousTime=0;invalidate();}});
addEventListener('pagehide',e=>{if(!e.persisted)dispose();});addEventListener('pageshow',()=>{if(!disposed){cacheTimeline();invalidate();}});
reduceMotion.addEventListener('change',()=>{motionEnabled=motionAllowed();storyPosition=scrollY;invalidate();});
document.getElementById('scene-retry').addEventListener('click',()=>location.reload());
init();
