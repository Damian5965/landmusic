import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const drawingCanvas = $('#drawingCanvas');
const drawContext = drawingCanvas.getContext('2d');
const sceneCanvas = $('#threeCanvas');
const fallbackCanvas = $('#fallbackCanvas');
const fallbackContext = fallbackCanvas.getContext('2d');
const sceneWrap = $('#sceneWrap');
const toast = $('#toast');

const state = {
  depth: 42,
  bevel: 38,
  roughness: 18,
  finish: 'chrome',
  finishName: 'LIQUID CHROME',
  preset: 'blob',
  lightAngle: 35,
  points: [],
  isDrawing: false,
  isDemo: true,
  autoRotate: true,
  recording: false,
  sourceName: 'BLOB',
  customTexture: null,
};

const finishes = {
  chrome: { name: 'LIQUID CHROME', color: '#d4d6dd', metalness: 1, roughnessOffset: 0.03, env: 2.4 },
  violet: { name: 'ULTRA VIOLET', color: '#8c5cff', metalness: .93, roughnessOffset: .10, env: 2.0 },
  acid: { name: 'ACID METAL', color: '#b8ef25', metalness: .87, roughnessOffset: .16, env: 1.6 },
  pearl: { name: 'ICE PEARL', color: '#bdeaff', metalness: .72, roughnessOffset: .25, env: 1.8 },
};

let modelGroup = new THREE.Group();
let currentShapes = [];
let currentTextureURL = null;

// --- THREE / studio -------------------------------------------------------
// Arena's embedded preview can be opened with WebGL disabled. The editor must
// remain usable in that case, so the renderer is optional and has a canvas fallback.
let renderer = null;
let usingFallback = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
camera.position.set(0, .25, 7.1);

const formRoot = new THREE.Group();
formRoot.rotation.x = -.11;
scene.add(formRoot);

const material = new THREE.MeshPhysicalMaterial({
  color: finishes.chrome.color,
  metalness: 1,
  roughness: .18,
  envMapIntensity: 2.4,
  clearcoat: .62,
  clearcoatRoughness: .12,
  reflectivity: 1,
});

const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
keyLight.position.set(3, 4, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xa0a2ff, 2.4);
rimLight.position.set(-4, -1, -4);
scene.add(rimLight);
const fillLight = new THREE.PointLight(0xcaff3d, 9, 12, 2);
scene.add(fillLight);

try {
  renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environmentScene, .055).texture;
  environmentScene.dispose();
  pmrem.dispose();
} catch (error) {
  console.warn('WebGL preview unavailable; using canvas renderer instead.', error);
  if (renderer) renderer.dispose();
  renderer = null;
  usingFallback = true;
  sceneWrap.classList.add('is-fallback');
  $('#renderStatus').textContent = 'CANVAS MODE';
}

const controls = new OrbitControls(camera, sceneCanvas);
controls.enableDamping = true;
controls.dampingFactor = .06;
controls.enablePan = false;
controls.minDistance = 3.5;
controls.maxDistance = 12;
controls.autoRotate = false;
controls.target.set(0, 0, 0);

function resizeRenderer() {
  const width = Math.max(1, sceneWrap.clientWidth);
  const height = Math.max(1, sceneWrap.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
  } else {
    const ratio = Math.min(window.devicePixelRatio, 2);
    fallbackCanvas.width = Math.round(width * ratio);
    fallbackCanvas.height = Math.round(height * ratio);
    fallbackCanvas.style.width = `${width}px`;
    fallbackCanvas.style.height = `${height}px`;
    renderFallback();
  }
}

function updateLight() {
  const radians = THREE.MathUtils.degToRad(state.lightAngle);
  const x = Math.cos(radians) * 4.2;
  const y = Math.sin(radians) * 4.2;
  keyLight.position.set(x, y, 4.5);
  fillLight.position.set(-x * .65, -y * .4, 3);
  $('#lightValue').textContent = `${state.lightAngle >= 0 ? '+' : ''}${Math.round(state.lightAngle)}°`;
  $('#lightDot').style.transform = `rotate(${state.lightAngle - 35}deg)`;
  if (!renderer) renderFallback();
}

function clearModel() {
  if (!modelGroup) return;
  modelGroup.traverse((child) => {
    if (child.isMesh) child.geometry.dispose();
  });
  formRoot.remove(modelGroup);
}

function createGeometry(shape) {
  const depth = state.depth / 69;
  const bevelSize = state.bevel === 0 ? 0 : .025 + (state.bevel / 75) * .22;
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: state.bevel > 0,
    bevelSegments: state.bevel > 52 ? 5 : 3,
    bevelThickness: bevelSize,
    bevelSize,
    curveSegments: 4,
    steps: 1,
  });
}

function rebuildModel() {
  if (!currentShapes.length) return;
  clearModel();
  modelGroup = new THREE.Group();

  currentShapes.forEach((shape) => {
    try {
      const geometry = createGeometry(shape);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      modelGroup.add(mesh);
    } catch (error) {
      console.warn('Could not extrude the shape', error);
    }
  });

  const initialBounds = new THREE.Box3().setFromObject(modelGroup);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(initialSize.x, initialSize.y, .01);
  const scale = 4.05 / largestSide;
  modelGroup.scale.setScalar(scale);
  const bounds = new THREE.Box3().setFromObject(modelGroup);
  const center = bounds.getCenter(new THREE.Vector3());
  modelGroup.position.sub(center);
  modelGroup.position.y -= .05;
  formRoot.add(modelGroup);
  updateMaterial();
  if (!renderer) renderFallback();
}

function updateMaterial() {
  const finish = finishes[state.finish];
  material.color.set(finish.color);
  material.metalness = finish.metalness;
  material.roughness = THREE.MathUtils.clamp(state.roughness / 100 + finish.roughnessOffset, .025, .85);
  material.envMapIntensity = finish.env;
  material.map = state.customTexture;
  material.needsUpdate = true;
}

// --- Shapes ---------------------------------------------------------------
function regularShape(points) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return shape;
}

function pointsForPreset(name, count = 64) {
  const out = [];
  if (name === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? .42 : .18;
      out.push({ x: .5 + Math.cos(a) * radius, y: .5 + Math.sin(a) * radius });
    }
  } else if (name === 'heart') {
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push({ x: .5 + x / 39, y: .51 - y / 39 });
    }
  } else if (name === 'flower') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      const radius = .28 + .13 * Math.cos(6 * a);
      out.push({ x: .5 + Math.cos(a) * radius, y: .5 + Math.sin(a) * radius });
    }
  } else if (name === 'diamond') {
    return [{ x: .5, y: .07 }, { x: .88, y: .5 }, { x: .5, y: .93 }, { x: .12, y: .5 }];
  } else {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      const radius = .35 + .06 * Math.sin(a * 3 + .4) + .045 * Math.cos(a * 5 - .2) + .022 * Math.sin(a * 8);
      out.push({ x: .5 + Math.cos(a) * radius, y: .5 + Math.sin(a) * radius });
    }
  }
  return out;
}

function pointsToShape(points) {
  const limited = simplifyPoints(points, 160);
  const worldPoints = limited.map((point) => ({ x: (point.x - .5) * 5, y: (.5 - point.y) * 5 }));
  return regularShape(worldPoints);
}

function renderFallback() {
  if (renderer || !fallbackContext || !fallbackCanvas.width) return;
  const ratio = Math.min(window.devicePixelRatio, 2);
  const width = fallbackCanvas.width / ratio;
  const height = fallbackCanvas.height / ratio;
  const context = fallbackContext;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const source = state.points.length > 2 ? state.points : pointsForPreset(state.preset);
  if (source.length < 3) return;
  const scale = Math.min(width, height) * .67;
  const turn = formRoot.rotation.y;
  const squash = .73 + Math.abs(Math.cos(turn)) * .22;
  const points = source.map((point) => ({
    x: width / 2 + (point.x - .5) * scale * squash,
    y: height / 2 + (point.y - .5) * scale,
  }));
  const depth = 9 + state.depth * .48;
  const sideX = Math.cos(turn + .55) * depth * .52;
  const sideY = Math.sin(turn + .55) * depth * .34 + depth * .48;
  const trace = (offsetX = 0, offsetY = 0) => {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x + offsetX, point.y + offsetY);
      else context.lineTo(point.x + offsetX, point.y + offsetY);
    });
    context.closePath();
  };
  const finish = state.finish;
  const palettes = {
    chrome: ['#101217', '#eef1f7', '#727783', '#fcfcff', '#242831'],
    violet: ['#21103a', '#f0b9ff', '#6337df', '#f4dcff', '#321555'],
    acid: ['#233100', '#e3ff65', '#668a00', '#f2ffb0', '#304600'],
    pearl: ['#46616d', '#f4ffff', '#a6d9ff', '#ffe9fb', '#5a9fa5'],
  };
  const palette = palettes[finish] || palettes.chrome;

  context.save();
  context.filter = 'blur(18px)';
  context.globalAlpha = .38;
  context.fillStyle = finish === 'acid' ? '#bdf542' : finish === 'violet' ? '#a067ff' : '#dce5ff';
  trace(sideX * .7, sideY + 15);
  context.fill();
  context.restore();

  for (let layer = Math.ceil(depth); layer >= 0; layer -= 2) {
    const part = layer / depth;
    const side = context.createLinearGradient(width / 2, height / 2, width / 2 + sideX, height / 2 + sideY);
    side.addColorStop(0, palette[0]);
    side.addColorStop(.55, palette[2]);
    side.addColorStop(1, '#08090d');
    context.fillStyle = side;
    trace(sideX * part, sideY * part);
    context.fill();
  }

  const radians = THREE.MathUtils.degToRad(state.lightAngle);
  const metal = context.createLinearGradient(
    width / 2 - Math.cos(radians) * scale * .55,
    height / 2 - Math.sin(radians) * scale * .55,
    width / 2 + Math.cos(radians) * scale * .55,
    height / 2 + Math.sin(radians) * scale * .55,
  );
  metal.addColorStop(0, palette[0]);
  metal.addColorStop(.20, palette[1]);
  metal.addColorStop(.46, palette[2]);
  metal.addColorStop(.68, palette[3]);
  metal.addColorStop(1, palette[4]);
  trace();
  context.fillStyle = metal;
  context.fill();
  context.lineWidth = Math.max(1, state.bevel / 25);
  context.strokeStyle = 'rgba(255,255,255,.58)';
  context.stroke();

  context.save();
  context.globalAlpha = .25;
  context.globalCompositeOperation = 'screen';
  const glint = context.createRadialGradient(width / 2 - scale * .12, height / 2 - scale * .2, 1, width / 2, height / 2, scale * .6);
  glint.addColorStop(0, '#fff');
  glint.addColorStop(.25, 'rgba(255,255,255,.2)');
  glint.addColorStop(1, 'rgba(255,255,255,0)');
  trace();
  context.fillStyle = glint;
  context.fill();
  context.restore();
}

function simplifyPoints(points, maximum) {
  if (points.length <= maximum) return points;
  const step = Math.ceil(points.length / maximum);
  return points.filter((_, index) => index % step === 0);
}

function setPreset(name) {
  state.preset = name;
  state.sourceName = name.toUpperCase();
  state.isDemo = true;
  state.points = pointsForPreset(name);
  currentShapes = [pointsToShape(state.points)];
  rebuildModel();
  renderDrawing();
  $('#strokeInfo').textContent = `PRESET / ${name.toUpperCase()}`;
  $('#modelStatus').textContent = `FORM_001 / ${name.toUpperCase()}`;
  $$('.preset').forEach((button) => button.classList.toggle('is-selected', button.dataset.preset === name));
}

function setDrawnShape() {
  if (state.points.length < 3) {
    showToast('Нарисуй контур: нужно минимум 3 точки');
    return false;
  }
  state.isDemo = false;
  state.sourceName = 'DRAWN';
  currentShapes = [pointsToShape(state.points)];
  rebuildModel();
  $('#modelStatus').textContent = `FORM_001 / HAND DRAWN`;
  $('#strokeInfo').textContent = `${state.points.length} PTS / LIVE`;
  $$('.preset').forEach((button) => button.classList.remove('is-selected'));
  return true;
}

// --- Drawing pad ----------------------------------------------------------
function resizeDrawingCanvas() {
  const bounds = drawingCanvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio, 2);
  drawingCanvas.width = Math.max(1, Math.round(bounds.width * ratio));
  drawingCanvas.height = Math.max(1, Math.round(bounds.height * ratio));
  drawContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderDrawing();
}

function renderDrawing() {
  const width = drawingCanvas.clientWidth;
  const height = drawingCanvas.clientHeight;
  drawContext.clearRect(0, 0, width, height);
  const hint = $('#drawHint');
  hint.classList.toggle('show', state.points.length === 0);
  if (state.points.length < 2) return;

  const points = state.points.map((point) => ({ x: point.x * width, y: point.y * height }));
  drawContext.save();
  drawContext.lineJoin = 'round';
  drawContext.lineCap = 'round';
  drawContext.shadowColor = '#cbff3d';
  drawContext.shadowBlur = 9;
  drawContext.strokeStyle = '#d4ff51';
  drawContext.lineWidth = 2;
  drawContext.beginPath();
  drawContext.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => drawContext.lineTo(point.x, point.y));
  if (!state.isDrawing && state.points.length > 2) drawContext.closePath();
  drawContext.stroke();
  drawContext.shadowBlur = 0;
  drawContext.fillStyle = '#efffb4';
  points.forEach((point, index) => {
    if (index === 0 || index === points.length - 1) {
      drawContext.beginPath();
      drawContext.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      drawContext.fill();
    }
  });
  drawContext.restore();
}

function drawingPoint(event) {
  const bounds = drawingCanvas.getBoundingClientRect();
  return {
    x: THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width, .02, .98),
    y: THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height, .02, .98),
  };
}

drawingCanvas.addEventListener('pointerdown', (event) => {
  drawingCanvas.setPointerCapture(event.pointerId);
  state.isDrawing = true;
  state.isDemo = false;
  state.points = [drawingPoint(event)];
  $('#strokeInfo').textContent = 'DRAWING…';
  renderDrawing();
});
drawingCanvas.addEventListener('pointermove', (event) => {
  if (!state.isDrawing) return;
  const point = drawingPoint(event);
  const previous = state.points[state.points.length - 1];
  if (Math.hypot(previous.x - point.x, previous.y - point.y) > .006) {
    state.points.push(point);
    renderDrawing();
  }
});
drawingCanvas.addEventListener('pointerup', () => {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  renderDrawing();
  setDrawnShape();
});
drawingCanvas.addEventListener('pointercancel', () => { state.isDrawing = false; renderDrawing(); });

$('#clearDrawing').addEventListener('click', () => {
  state.points = [];
  state.isDemo = false;
  renderDrawing();
  $('#strokeInfo').textContent = 'EMPTY CANVAS';
});
$('#applyDrawing').addEventListener('click', () => setDrawnShape());

// --- Uploading shapes -----------------------------------------------------
async function processShapeFile(file) {
  if (!file) return;
  try {
    if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
      const svgText = await file.text();
      const parsed = new SVGLoader().parse(svgText);
      const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
      if (!shapes.length) throw new Error('В SVG не найден замкнутый контур');
      currentShapes = shapes;
      state.sourceName = 'UPLOADED SVG';
      state.points = [];
      rebuildModel();
      renderDrawing();
      $('#modelStatus').textContent = 'FORM_001 / CUSTOM SVG';
      $('#strokeInfo').textContent = 'CUSTOM SVG';
      showToast('SVG превращён в объёмную форму');
    } else if (file.type.startsWith('image/')) {
      const image = await fileToImage(file);
      const shapePoints = rasterToSilhouette(image);
      if (shapePoints.length < 3) throw new Error('Не удалось найти силуэт');
      state.points = shapePoints;
      state.sourceName = 'IMAGE SHAPE';
      setDrawnShape();
      $('#modelStatus').textContent = 'FORM_001 / IMAGE SHAPE';
      showToast('Силуэт из изображения готов');
    } else {
      throw new Error('Поддерживаются SVG, PNG, JPG и WEBP');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Не удалось прочитать этот файл');
  }
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Файл изображения повреждён')); };
    image.src = url;
  });
}

function rasterToSilhouette(image) {
  const size = 240;
  const scale = Math.min(size / image.width, size / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  let hasTransparentPixels = false;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 245) { hasTransparentPixels = true; break; }
  }
  const active = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = (Math.floor(y) * width + Math.floor(x)) * 4;
    const luminosity = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    return hasTransparentPixels ? data[i + 3] > 80 : luminosity < 225;
  };
  let totalX = 0, totalY = 0, total = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (active(x, y)) { totalX += x; totalY += y; total++; }
  }
  if (!total) return [];
  const centerX = totalX / total;
  const centerY = totalY / total;
  const maxRadius = Math.hypot(width, height);
  const points = [];
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    let last = null;
    for (let radius = 0; radius < maxRadius; radius += 1.2) {
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (active(x, y)) last = { x, y };
    }
    if (last) points.push({ x: last.x / width, y: last.y / height });
  }
  return points;
}

function wireDropZone(zone, input, onFile) {
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-drag');
    onFile(event.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => onFile(input.files[0]));
}
wireDropZone($('#shapeDrop'), $('#shapeInput'), processShapeFile);

// --- Texture upload -------------------------------------------------------
function setTexture(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Выбери изображение в JPG, PNG или WEBP');
    return;
  }
  if (currentTextureURL) URL.revokeObjectURL(currentTextureURL);
  currentTextureURL = URL.createObjectURL(file);
  new THREE.TextureLoader().load(currentTextureURL, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.35, 1.35);
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    if (state.customTexture) state.customTexture.dispose();
    state.customTexture = texture;
    updateMaterial();
    const preview = $('#texturePreview');
    preview.innerHTML = '';
    const previewImage = document.createElement('img');
    previewImage.src = currentTextureURL;
    preview.append(previewImage);
    $('#textureText').textContent = file.name;
    $('#clearTexture').disabled = false;
    showToast('Текстура нанесена на металл');
  }, undefined, () => showToast('Не удалось загрузить texture map'));
}
wireDropZone($('#textureDrop'), $('#textureInput'), setTexture);
$('#clearTexture').addEventListener('click', () => {
  if (state.customTexture) state.customTexture.dispose();
  state.customTexture = null;
  if (currentTextureURL) URL.revokeObjectURL(currentTextureURL);
  currentTextureURL = null;
  $('#texturePreview').innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m5 18 4.5-5 3.2 3 2.2-2 4.1 4"/></svg>';
  $('#textureText').textContent = 'Добавить texture map';
  $('#clearTexture').disabled = true;
  updateMaterial();
  showToast('Текстура сброшена');
});

// --- Controls -------------------------------------------------------------
function updateRange(input, output) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  input.style.setProperty('--value', `${((value - min) / (max - min)) * 100}%`);
  output.textContent = value;
}

const rangeLinks = [
  ['#depthRange', '#depthValue', 'depth', true],
  ['#bevelRange', '#bevelValue', 'bevel', true],
  ['#roughnessRange', '#roughnessValue', 'roughness', false],
];
rangeLinks.forEach(([inputSelector, outputSelector, key, shouldBuild]) => {
  const input = $(inputSelector);
  const output = $(outputSelector);
  updateRange(input, output);
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    updateRange(input, output);
    if (shouldBuild) rebuildModel();
    else updateMaterial();
  });
});

$$('.finish-card').forEach((button) => button.addEventListener('click', () => {
  state.finish = button.dataset.finish;
  state.finishName = finishes[state.finish].name;
  $('#finishName').textContent = state.finishName;
  $$('.finish-card').forEach((card) => card.classList.toggle('is-selected', card === button));
  updateMaterial();
}));

$$('.preset').forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.preset)));

$('#randomizeMaterial').addEventListener('click', () => {
  const choices = Object.keys(finishes);
  const options = choices.filter((item) => item !== state.finish);
  const next = options[Math.floor(Math.random() * options.length)];
  document.querySelector(`[data-finish="${next}"]`).click();
  const roughness = 8 + Math.floor(Math.random() * 42);
  $('#roughnessRange').value = roughness;
  $('#roughnessRange').dispatchEvent(new Event('input'));
  state.lightAngle = -100 + Math.random() * 200;
  updateLight();
  showToast('Новый металл сгенерирован');
});

$('#toggleRotate').addEventListener('click', (event) => {
  state.autoRotate = !state.autoRotate;
  event.currentTarget.classList.toggle('is-active', state.autoRotate);
  showToast(state.autoRotate ? 'Автовращение включено' : 'Автовращение выключено');
});
$('#randomizeAngle').addEventListener('click', () => {
  formRoot.rotation.y += Math.PI / 2 + Math.random() * Math.PI;
  showToast('Новый угол камеры');
});

function changeCameraDistance(multiplier) {
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(multiplier);
  const length = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
  offset.setLength(length);
  camera.position.copy(controls.target).add(offset);
  controls.update();
  const percent = Math.round((7.1 / length) * 100);
  $('#zoomValue').textContent = `${percent}%`;
}
$('#zoomIn').addEventListener('click', () => changeCameraDistance(.88));
$('#zoomOut').addEventListener('click', () => changeCameraDistance(1.13));
$('#resetCamera').addEventListener('click', () => {
  camera.position.set(0, .25, 7.1);
  controls.target.set(0, 0, 0);
  formRoot.rotation.set(-.11, 0, 0);
  $('#zoomValue').textContent = '100%';
  showToast('Камера сброшена');
});

let movingLight = false;
function updateLightFromPointer(event) {
  const orbit = $('.light-orbit').getBoundingClientRect();
  const dx = event.clientX - (orbit.left + orbit.width / 2);
  const dy = event.clientY - (orbit.top + orbit.height / 2);
  state.lightAngle = Math.round(THREE.MathUtils.radToDeg(Math.atan2(dy, dx)));
  updateLight();
}
$('#lightDot').addEventListener('pointerdown', (event) => { movingLight = true; event.currentTarget.setPointerCapture(event.pointerId); updateLightFromPointer(event); });
$('#lightDot').addEventListener('pointermove', (event) => { if (movingLight) updateLightFromPointer(event); });
$('#lightDot').addEventListener('pointerup', () => { movingLight = false; });

// tabs
$$('.create-tab').forEach((button) => button.addEventListener('click', () => {
  $$('.create-tab').forEach((tab) => { tab.classList.toggle('is-active', tab === button); tab.setAttribute('aria-selected', tab === button ? 'true' : 'false'); });
  const type = button.dataset.tab;
  $('#drawTab').classList.toggle('is-active', type === 'draw');
  $('#shapeTab').classList.toggle('is-active', type === 'shape');
  if (type === 'draw') requestAnimationFrame(resizeDrawingCanvas);
}));

// --- Export ---------------------------------------------------------------
function saveBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportPNG() {
  const button = $('#exportPng');
  const label = button.innerHTML;
  button.innerHTML = '<span>◌</span> RENDER…';
  button.disabled = true;
  const width = sceneWrap.clientWidth;
  const height = sceneWrap.clientHeight;
  const scale = 3840 / Math.max(width, height);
  const exportWidth = Math.round(width * scale);
  const exportHeight = Math.round(height * scale);
  try {
    if (!renderer) {
      const output = document.createElement('canvas');
      output.width = exportWidth;
      output.height = exportHeight;
      output.getContext('2d').drawImage(fallbackCanvas, 0, 0, exportWidth, exportHeight);
      const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Browser не смог создать PNG');
      saveBlob(blob, `chromeform-${Date.now()}.png`);
      showToast('PNG 4K сохранён с прозрачным фоном');
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(exportWidth, exportHeight, false);
    camera.aspect = exportWidth / exportHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Browser не смог создать PNG');
    saveBlob(blob, `chromeform-${Date.now()}.png`);
    showToast('PNG 4K сохранён с прозрачным фоном');
  } catch (error) {
    console.error(error);
    showToast('Экспорт PNG не удался. Попробуй ещё раз.');
  } finally {
    resizeRenderer();
    button.innerHTML = label;
    button.disabled = false;
  }
}
$('#exportPng').addEventListener('click', exportPNG);

function exportVideo() {
  if (!window.MediaRecorder || state.recording) {
    if (!window.MediaRecorder) showToast('Экспорт видео не поддерживается этим браузером');
    return;
  }
  const button = $('#exportVideo');
  const outputCanvas = renderer ? renderer.domElement : fallbackCanvas;
  const stream = outputCanvas.captureStream(60);
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 9_000_000 } : undefined);
  const chunks = [];
  const previousAutoRotate = state.autoRotate;
  state.autoRotate = true;
  state.recording = true;
  button.classList.add('is-recording');
  button.innerHTML = '<span>●</span> REC 0:06';
  $('#renderStatus').textContent = 'RECORDING';
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    saveBlob(blob, `chromeform-motion-${Date.now()}.webm`);
    state.recording = false;
    state.autoRotate = previousAutoRotate;
    button.classList.remove('is-recording');
    button.innerHTML = '<span>◉</span> VIDEO';
    $('#renderStatus').textContent = 'REALTIME';
    showToast('6-секундный WEBM сохранён');
  });
  recorder.start(150);
  showToast('Запись поворота: 6 секунд');
  window.setTimeout(() => recorder.stop(), 6000);
}
$('#exportVideo').addEventListener('click', exportVideo);

// help & messages
let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
$('#helpButton').addEventListener('click', () => { $('#helpModal').classList.add('is-open'); $('#helpModal').setAttribute('aria-hidden', 'false'); });
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { $('#helpModal').classList.remove('is-open'); $('#helpModal').setAttribute('aria-hidden', 'true'); }));
$('#helpModal').addEventListener('click', (event) => { if (event.target === $('#helpModal')) event.currentTarget.classList.remove('is-open'); });

// --- render loop ----------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  if (state.autoRotate && modelGroup) modelGroup.rotation.y += .004;
  controls.update();
  if (renderer) renderer.render(scene, camera);
  else renderFallback();
}

window.addEventListener('resize', () => { resizeRenderer(); resizeDrawingCanvas(); });
resizeRenderer();
resizeDrawingCanvas();
setPreset('blob');
updateLight();
animate();
