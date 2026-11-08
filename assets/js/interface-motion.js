// NOIR: rolling CTA labels, travelling arrows, line reveals and editorial pacing.
// Independent of the automobile's camera, materials and scroll timeline.
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const previewFull=new URLSearchParams(location.search).get('interface')==='full';
const isReduced=()=>preference.matches&&!previewFull;
document.documentElement.dataset.interfaceMotion=isReduced()?'reduced':'full';
const animations=new Set(),headings=new Map(),played=new WeakSet();
const ease='cubic-bezier(.16,1,.3,1)';
let disposed=false,resizeFrame=0;

function play(node,frames,options){
  const animation=node.animate(frames,options);animations.add(animation);
  animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));
  return animation;
}
function createArrow(){
  const holder=document.createElement('span');holder.className='ui-arrow';holder.setAttribute('aria-hidden','true');
  for(let i=0;i<2;i++){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M5 19 19 5M5 5h14v14');svg.append(path);holder.append(svg);
  }
  return holder;
}
function prepareButtons(){
  document.querySelectorAll('.head-cta,.story-cta,.submit').forEach(button=>{
    const label=button.textContent.replace(/↗/g,'').replace(/\s+/g,' ').trim();
    button.classList.add('ui-cta');button.setAttribute('aria-label',label);
    const mask=document.createElement('span'),first=document.createElement('span'),second=document.createElement('span');
    mask.className='ui-button-label';mask.setAttribute('aria-hidden','true');
    first.className='ui-label-current';second.className='ui-label-next';first.textContent=second.textContent=label;
    mask.append(first,second);button.replaceChildren(mask,createArrow());
  });
  document.querySelectorAll('.story-text-link,.services-details>a').forEach(link=>{
    const label=link.textContent.replace(/↗/g,'').trim();
    const span=document.createElement('span');span.textContent=label;span.className='ui-link-label';
    link.classList.add('ui-secondary-link');link.replaceChildren(span,createArrow());
  });
}

function splitLines(heading,record){
  heading.innerHTML=record.html;heading.classList.add('ui-heading');
  heading.setAttribute('aria-label',record.label);
  const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT),textNodes=[];
  while(walker.nextNode())textNodes.push(walker.currentNode);
  textNodes.forEach(node=>{
    const fragment=document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(part=>{
      if(!part.trim()){fragment.append(document.createTextNode(part));return;}
      const word=document.createElement('span');word.className='ui-measure-word';word.textContent=part;fragment.append(word);
    });
    node.replaceWith(fragment);
  });
  const rows=[];
  heading.querySelectorAll('.ui-measure-word').forEach(word=>{
    const top=word.getBoundingClientRect().top;
    let row=rows.at(-1);if(!row||Math.abs(row.top-top)>5){row={top,words:[]};rows.push(row);}
    let content=document.createTextNode(word.textContent);
    for(let parent=word.parentElement;parent&&parent!==heading;parent=parent.parentElement){
      const wrapper=parent.cloneNode(false);wrapper.removeAttribute('id');wrapper.append(content);content=wrapper;
    }
    row.words.push(content);
  });
  const fragment=document.createDocumentFragment();
  rows.forEach(row=>{
    const mask=document.createElement('span'),line=document.createElement('span');
    mask.className='ui-text-line';mask.setAttribute('aria-hidden','true');line.className='ui-text-line-inner';
    row.words.forEach((word,i)=>{if(i)line.append(document.createTextNode(' '));line.append(word);});
    mask.append(line);fragment.append(mask);
  });
  heading.replaceChildren(fragment);record.width=heading.getBoundingClientRect().width;
}

const groups=[...document.querySelectorAll('.intro,.services-intro,.values-copy,.section-title,.booking-copy,.form,.quote>.wrap')];
groups.forEach(group=>group.setAttribute('data-interface-group',''));
function reveal(group){
  if(played.has(group))return;played.add(group);group.dataset.uiRevealed='true';
  const reduced=isReduced();
  group.querySelectorAll('.ui-text-line-inner').forEach((line,i)=>{
    play(line,[{opacity:0,transform:reduced?'none':'translateY(108%)'},{opacity:1,transform:'none'}],
      {duration:reduced?220:720,delay:reduced?0:Math.min(i*75,225),easing:ease,fill:'backwards'});
  });
  const supporting=group.querySelectorAll(':scope>p,:scope>.intro-copy>p,:scope>.intro-copy>.intro-sign,:scope>.services-details,:scope>.value-list,:scope>.form-title,:scope>.fields,:scope>.submit,:scope>.fine,:scope>blockquote,:scope>cite');
  supporting.forEach((node,i)=>play(node,[
    {opacity:0,transform:reduced?'none':'translateY(14px)'},{opacity:1,transform:'none'}
  ],{duration:reduced?200:520,delay:reduced?0:160+Math.min(i*70,210),easing:ease,fill:'backwards'}));
}
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(entry.isIntersecting){reveal(entry.target);observer.unobserve(entry.target);}});
},{threshold:.12,rootMargin:'0px 0px -5% 0px'});
// Stagger only rows entering together. Later rows respond immediately as they
// enter the viewport, rather than waiting behind an offscreen animation queue.
const serviceRows=[...document.querySelectorAll('.service-row')];
const serviceObserver=new IntersectionObserver(entries=>{
  const incoming=entries.filter(entry=>entry.isIntersecting)
    .sort((a,b)=>serviceRows.indexOf(a.target)-serviceRows.indexOf(b.target));
  incoming.forEach((entry,index)=>{
    const row=entry.target;serviceObserver.unobserve(row);
    row.dataset.serviceRevealed='true';
    const reduced=isReduced();
    play(row,[
      {opacity:0,transform:reduced?'none':'translateY(14px)'},
      {opacity:1,transform:'none'}
    ],{duration:reduced?180:430,delay:reduced?0:index*70,easing:ease,fill:'backwards'});
  });
},{threshold:.12,rootMargin:'0px 0px -4% 0px'});
const resizeObserver=new ResizeObserver(()=>{
  if(resizeFrame||disposed)return;
  resizeFrame=requestAnimationFrame(()=>{
    resizeFrame=0;
    for(const [heading,record]of headings){
      if(Math.abs(heading.getBoundingClientRect().width-record.width)>.5){
        heading.querySelectorAll('.ui-text-line-inner').forEach(line=>line.getAnimations().forEach(animation=>animation.cancel()));
        splitLines(heading,record);
      }
    }
  });
});
function onPreferenceChange(){document.documentElement.dataset.interfaceMotion=isReduced()?'reduced':'full';animations.forEach(animation=>animation.cancel());}
let heroPlayed=false;
const heroAnimations=[];
function revealHero(){
  if(heroPlayed||document.body.dataset.scene!=='ready')return;
  heroPlayed=true;heroObserver.disconnect();
  if(scrollY>innerHeight*.25)return;
  const reduced=isReduced();
  document.querySelectorAll('.story-hero .story-word-rise').forEach(word=>{
    const line=Number(word.style.getPropertyValue('--line'))||0;
    heroAnimations.push(play(word,[{opacity:0,transform:reduced?'none':'translateY(108%)'},{opacity:1,transform:'none'}],
      {duration:reduced?220:750,delay:reduced?0:line*80,easing:ease,fill:'backwards'}));
  });
}
const heroObserver=new MutationObserver(revealHero);
heroObserver.observe(document.body,{attributes:true,attributeFilter:['data-scene']});
function onScroll(){if(scrollY>innerHeight*.2)heroAnimations.splice(0).forEach(animation=>animation.cancel());}
addEventListener('scroll',onScroll,{passive:true});
async function init(){
  prepareButtons();
  revealHero();
  await document.fonts.ready;if(disposed)return;
  document.querySelectorAll('.legacy-content h2,.booking-copy h2').forEach(heading=>{
    const record={html:heading.innerHTML,label:heading.innerText.replace(/\s+/g,' ').trim(),width:0};
    headings.set(heading,record);splitLines(heading,record);resizeObserver.observe(heading);
  });
  groups.forEach(group=>observer.observe(group));
  serviceRows.forEach(row=>serviceObserver.observe(row));
  preference.addEventListener('change',onPreferenceChange);
}
addEventListener('pagehide',event=>{
  if(event.persisted)return;disposed=true;observer.disconnect();serviceObserver.disconnect();resizeObserver.disconnect();heroObserver.disconnect();
  cancelAnimationFrame(resizeFrame);animations.forEach(animation=>animation.cancel());
  preference.removeEventListener('change',onPreferenceChange);
  removeEventListener('scroll',onScroll);
});
init().catch(error=>console.error('NOIR interface motion:',error));
