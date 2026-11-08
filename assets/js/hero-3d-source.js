import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const hero = document.querySelector('.hero3d');
const stage = document.querySelector('#car-stage');
const status = document.querySelector('#scene-status');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const paintButtons = [...document.querySelectorAll('[data-paint]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const pauseButton = document.querySelector('#scene-motion');
const resetButton = document.querySelector('#scene-reset');
const query = new URLSearchParams(location.search);
const lowPower = query.get('quality') === 'mobile' || (query.get('quality') !== 'balanced' && (innerWidth < 700 || navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4));
let pixelRatioCap = lowPower ? 1 : 1.5;
const diagnosticMode = query.has('perf');
const diagnostics = diagnosticMode ? document.createElement('output') : null;
if (diagnostics) { diagnostics.id = 'scene-diagnostics'; diagnostics.hidden = true; hero.appendChild(diagnostics); }
const measurements = { profile: lowPower ? 'mobile' : 'balanced', renderedFrames: 0, frameIntervals: [], loadStarted: performance.now(), adaptiveReductions: 0 };
let previousFrameTime = 0, slowFrames = 0;
let benchmarkUntil = 0, benchmarkButton;
if (diagnosticMode) {
  benchmarkButton = document.createElement('button');
  benchmarkButton.id = 'run-benchmark'; benchmarkButton.textContent = 'Замерить 3D · 3 секунды';
  benchmarkButton.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:100;padding:12px;background:#202521;color:white;border:0;font:12px sans-serif';
  benchmarkButton.disabled = true;
  document.body.appendChild(benchmarkButton);
  benchmarkButton.addEventListener('click', () => {
    measurements.frameIntervals.length = 0; measurements.benchmarkComplete = false;
    measurements.benchmarkFrames = 0; previousFrameTime = 0;
    benchmarkUntil = performance.now() + 3000; benchmarkButton.disabled = true;
    invalidate();
  });
}
const paintColors = { silver: '#a9b6bd', graphite: '#252c32', red: '#8b121c' };
const paintNames = { silver: 'Серебро', graphite: 'Графит', red: 'Кармин' };
let renderer, scene, camera, car, frame = 0, observer, inView = true;
let paused = motion.matches, dragging = false, dragged = false, lastX = 0;
const initialYaw = -.2;
let yaw = initialYaw, targetYaw = initialYaw, pointerX = 0, pointerY = 0, scrollProgress = 0;
let paintMaterials = [], loading = true, disposed = false;
const clock = new THREE.Clock();
const cameraLook = new THREE.Vector3(0, .7, 0);
const targetPaint = new THREE.Color(paintColors.silver);
const baseCamera = new THREE.Vector3(5.3, 2.9, 6.3);
const damp = (a, b, dt) => THREE.MathUtils.damp(a, b, 5, dt);

function announce(message) { status.textContent = message; }
function syncPause() {
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.querySelector('span').textContent = paused ? 'Включить движение' : 'Остановить движение';
  hero.dataset.motion = paused ? 'paused' : 'active';
}
function resize() {
  if (!renderer) return;
  const { width, height } = stage.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.fov = innerWidth < 700 ? 40 : 35;
  camera.updateProjectionMatrix();
  invalidate();
}
function invalidate() {
  if (!frame && !disposed && inView && document.visibilityState !== 'hidden') frame = requestAnimationFrame(render);
}
function render(timestamp) {
  frame = 0;
  const dt = Math.min(clock.getDelta(), .04);
  let unsettled = false;
  if (benchmarkUntil) {
    if (performance.now() < benchmarkUntil) {
      targetYaw += .018; measurements.benchmarkFrames++; unsettled = true;
    } else {
      benchmarkUntil = 0; measurements.benchmarkComplete = true;
      benchmarkButton.disabled = false;
    }
  }
  if (car) {
    const orbit = targetYaw + (!paused && !dragging ? scrollProgress * .62 + pointerX * .09 : 0);
    yaw = damp(yaw, orbit, dt);
    car.rotation.y = yaw;
    unsettled ||= Math.abs(yaw - orbit) > .0003;
    for (const material of paintMaterials) {
      unsettled ||= Math.abs(material.color.r-targetPaint.r)+Math.abs(material.color.g-targetPaint.g)+Math.abs(material.color.b-targetPaint.b) > .001;
      material.color.lerp(targetPaint, 1 - Math.exp(-7 * dt));
    }
    const y = baseCamera.y + (!paused ? pointerY * .14 + scrollProgress * .5 : 0);
    camera.position.y = damp(camera.position.y, y, dt);
    unsettled ||= Math.abs(camera.position.y - y) > .001;
    camera.lookAt(cameraLook);
  }
  renderer.render(scene, camera);
  measurements.renderedFrames++;
  const interval = timestamp - previousFrameTime;
  if (car && interval > 0 && interval < 120) {
    if (diagnosticMode) { measurements.frameIntervals.push(interval); if (measurements.frameIntervals.length > 240) measurements.frameIntervals.shift(); }
    slowFrames = interval > 38 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames >= 18 && pixelRatioCap > .8) {
      pixelRatioCap = Math.max(.8, pixelRatioCap - .25);
      renderer.shadowMap.enabled = false;
      measurements.adaptiveReductions++; slowFrames = 0; resize();
    }
  }
  previousFrameTime = timestamp;
  if (diagnostics) diagnostics.textContent = JSON.stringify({ ...measurements, pixelRatio: renderer.getPixelRatio(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
  if (unsettled) invalidate();
}
function fail(error) {
  console.error('NOIR 3D:', error);
  loading = false;
  hero.dataset.scene = 'error';
  stage.setAttribute('aria-label', '3D-сцена недоступна');
  announce('Не удалось открыть 3D-сцену. Услуги и запись доступны ниже.');
  document.querySelector('#scene-retry').hidden = false;
  document.querySelectorAll('.scene-controls button, .scene-toolbar button').forEach(button => button.disabled = true);
}

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0xe8e9e5, 0);
    // The soft contact texture anchors the stationary car without a second
    // geometry pass for shadow maps on every turn of the model.
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context lost')); });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    camera.position.copy(baseCamera);
    camera.lookAt(cameraLook);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .03);
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.2;
    room.dispose(); pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8c9095, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.bias = -.001;
    key.shadow.normalBias = .025;
    key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcbdfff, 3);
    rim.position.set(4, 3, -4); scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .07 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; floor.receiveShadow = true; scene.add(floor);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(30,35,40,.4)'); gradient.addColorStop(1, 'rgba(30,35,40,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI/2; contact.position.y = .001; scene.add(contact);
    resize();
    new ResizeObserver(resize).observe(stage);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const modelFile = (lowPower ? hero.dataset.modelMobile : hero.dataset.modelBalanced) || 'bmw-m5-f90-balanced.glb';
    measurements.modelFile = modelFile;
    const localBaseline = diagnosticMode && query.has('source') && ['127.0.0.1','localhost'].includes(location.hostname);
    const modelURL = localBaseline ? '/__model-source.glb' : new URL('../models/' + modelFile, import.meta.url).href;
    if (localBaseline) measurements.modelFile = 'unoptimized-source';
    const gltf = await loader.loadAsync(modelURL, event => {
      if (event.total) announce('Загружаем автомобиль · ' + Math.round(event.loaded / event.total * 100) + '%');
    });
    car = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(car);
    const dimensions = bounds.getSize(new THREE.Vector3());
    car.scale.setScalar(4.8 / Math.max(dimensions.x, dimensions.z));
    const scaledBounds = new THREE.Box3().setFromObject(car);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    car.position.set(-center.x, -scaledBounds.min.y, -center.z);
    const pivot = new THREE.Group(); pivot.add(car); car = pivot;
    car.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ((material.name === 'NOIR_BODY' || material.name === 'BUMWERK deep green metallic') && !paintMaterials.includes(material)) {
          material.color.copy(targetPaint);
          material.metalness = .85;
          material.roughness = .22;
          material.clearcoat = 1;
          material.clearcoatRoughness = .07;
          material.iridescence = 0;
          material.normalScale?.set(.12, .12);
          paintMaterials.push(material);
        }
        if (/^(NOIR_GLASS|EXt_GLASS|BUMWERK black tinted glass)$/.test(material.name)) {
          material.transmission = 0;
          material.color.set('#33434a'); material.metalness = .65;
          material.roughness = .12; material.opacity = 1; material.transparent = false;
        }
      }
    });
    scene.add(car);
    announce('Настраиваем свет…');
    await renderer.compileAsync(scene, camera);
    measurements.loadReadyMs = Math.round(performance.now() - measurements.loadStarted);
    car.rotation.y = yaw;
    loading = false;
    hero.dataset.scene = 'ready';
    announce('Вращайте автомобиль мышью или стрелками');
    stage.setAttribute('aria-label', 'Интерактивная 3D-модель автомобиля. Вращайте перетаскиванием или клавишами влево и вправо.');
    document.querySelectorAll('.scene-controls button, .scene-toolbar button').forEach(button => button.disabled = false);
    if (benchmarkButton) benchmarkButton.disabled = false;
    syncPause(); invalidate();
  } catch (error) { fail(error); }
}

stage.addEventListener('pointerdown', event => {
  if (!car || event.button !== 0) return;
  dragging = true; dragged = false; lastX = event.clientX; stage.setPointerCapture(event.pointerId);
  stage.classList.add('is-dragging');
});
stage.addEventListener('pointermove', event => {
  if (dragging) {
    const dx = event.clientX - lastX; dragged ||= Math.abs(dx) > 1;
    targetYaw += dx * .009; lastX = event.clientX; invalidate();
  } else if (finePointer.matches && !paused) {
    const bounds = stage.getBoundingClientRect();
    pointerX = (event.clientX - bounds.left) / bounds.width - .5;
    pointerY = (event.clientY - bounds.top) / bounds.height - .5;
    invalidate();
  }
});
function endDrag() { dragging = false; stage.classList.remove('is-dragging'); }
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('lostpointercapture', endDrag);
stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; invalidate(); });
stage.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); targetYaw += event.key === 'ArrowLeft' ? -.18 : .18; invalidate();
  } else if (event.key === 'Home') { event.preventDefault(); targetYaw = initialYaw; if (motion.matches) yaw = targetYaw; invalidate(); }
});
paintButtons.forEach(button => button.addEventListener('click', () => {
  targetPaint.set(paintColors[button.dataset.paint]);
  paintButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelector('#paint-name').textContent = paintNames[button.dataset.paint];
  announce('Цвет кузова: ' + paintNames[button.dataset.paint]);
  if (motion.matches) paintMaterials.forEach(material => material.color.copy(targetPaint));
  invalidate();
}));
viewButtons.forEach(button => button.addEventListener('click', () => {
  targetYaw = { front: initialYaw, side: -.87, rear: -2.44 }[button.dataset.view];
  pointerX = pointerY = 0; scrollProgress = 0;
  viewButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  if (motion.matches) yaw = targetYaw;
  announce('Ракурс: ' + button.textContent.trim()); invalidate();
}));
resetButton.addEventListener('click', () => {
  targetYaw = initialYaw; pointerX = pointerY = scrollProgress = 0;
  viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === 'front')));
  if (motion.matches) yaw = targetYaw;
  announce('Исходный ракурс'); invalidate();
});
pauseButton.addEventListener('click', () => { paused = !paused; syncPause(); invalidate(); });
motion.addEventListener('change', () => { paused = motion.matches; syncPause(); invalidate(); });
addEventListener('scroll', () => {
  if (paused) return;
  scrollProgress = THREE.MathUtils.clamp(-hero.getBoundingClientRect().top / hero.offsetHeight, 0, 1);
  invalidate();
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { cancelAnimationFrame(frame); frame = 0; }
  else { clock.getDelta(); invalidate(); }
});
observer = new IntersectionObserver(entries => {
  inView = entries[0].isIntersecting;
  if (inView) { clock.getDelta(); invalidate(); }
  else { cancelAnimationFrame(frame); frame = 0; }
});
observer.observe(hero);
document.querySelector('#scene-retry').addEventListener('click', () => location.reload());
init();
