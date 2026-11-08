// Navigation only: no scene, renderer or animation-timeline dependencies.
const toggle=document.querySelector('.mobile-menu-toggle');
const menu=document.getElementById('mobile-menu');
const closeButton=menu.querySelector('.mobile-menu__close');
const mobile=matchMedia('(max-width:1024px)');
const reduce=matchMedia('(prefers-reduced-motion:reduce)');
let closing=false;
function openMenu(){
  if(menu.open||!mobile.matches)return;
  menu.classList.remove('is-closing');menu.showModal();
  document.body.classList.add('mobile-menu-open');toggle.setAttribute('aria-expanded','true');
  closeButton.focus({preventScroll:true});
}
async function closeMenu(target){
  if(!menu.open||closing)return;
  closing=true;menu.classList.add('is-closing');
  await Promise.all(menu.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  menu.close();menu.classList.remove('is-closing');document.body.classList.remove('mobile-menu-open');
  toggle.setAttribute('aria-expanded','false');closing=false;
  if(target){
    target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
    target.scrollIntoView({behavior:reduce.matches?'instant':'smooth',block:'start'});
    target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});
  }else if(mobile.matches)toggle.focus({preventScroll:true});
}
toggle.addEventListener('click',openMenu);
closeButton.addEventListener('click',()=>closeMenu());
menu.addEventListener('cancel',event=>{event.preventDefault();closeMenu();});
menu.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();closeMenu(document.getElementById(link.hash.slice(1)));
}));
mobile.addEventListener('change',event=>{if(!event.matches)closeMenu();});
addEventListener('pagehide',()=>{menu.close();document.body.classList.remove('mobile-menu-open');toggle.setAttribute('aria-expanded','false');});
