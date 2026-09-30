const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const drawCanvas = $('#drawingCanvas');
const drawContext = drawCanvas.getContext('2d');
const previewCanvas = $('#fallbackCanvas');
const previewContext = previewCanvas.getContext('2d');
const sceneWrap = $('#sceneWrap');
const toast = $('#toast');

const finishes = {
  chrome: { label: 'LIQUID CHROME', colors: ['#11141b', '#fbfcff', '#777d89', '#ffffff', '#262a33'] },
  violet: { label: 'ULTRA VIOLET', colors: ['#20103c', '#f3b6ff', '#6034d8', '#f7e1ff', '#321455'] },
  acid: { label: 'ACID METAL', colors: ['#263700', '#edff77', '#6d9200', '#f5ffc1', '#344900'] },
  pearl: { label: 'ICE PEARL', colors: ['#3e6c75', '#f6ffff', '#91d5ff', '#fff0fc', '#4f9fa5'] },
};

const state = {
  points: [],
  preset: 'blob',
  finish: 'chrome',
  depth: 42,
  bevel: 38,
  roughness: 18,
  lightAngle: 35,
  rotation: -.45,
  zoom: 1,
  autoRotate: true,
  drawing: false,
  recording: false,
  texture: null,
};

// The embedded Arena preview does not expose a reliable WebGL context. This
// canvas renderer deliberately does not depend on WebGL so creation, drawing,
// material changes and export are always available in the preview.
sceneWrap.classList.add('is-fallback');
$('#renderStatus').textContent = 'CANVAS 3D';
$('#fallbackNotice').textContent = 'CANVAS METAL ENGINE';

function presetPoints(name, count = 72) {
  const result = [];
  if (name === 'star') {
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? .18 : .42;
      result.push({ x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius });
    }
  } else if (name === 'heart') {
    for (let i = 0; i < count; i += 1) {
      const t = i / count * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      result.push({ x: .5 + x / 39, y: .51 - y / 39 });
    }
  } else if (name === 'flower') {
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2 - Math.PI / 2;
      const radius = .28 + .13 * Math.cos(6 * angle);
      result.push({ x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius });
    }
  } else if (name === 'diamond') {
    return [{ x: .5, y: .07 }, { x: .88, y: .5 }, { x: .5, y: .93 }, { x: .12, y: .5 }];
  } else {
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2 - Math.PI / 2;
      const radius = .35 + .06 * Math.sin(angle * 3 + .4) + .045 * Math.cos(angle * 5 - .2) + .022 * Math.sin(angle * 8);
      result.push({ x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius });
    }
  }
  return result;
}

function setCanvasSize(canvas, context, width, height) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ratio;
}

function resizeAll() {
  setCanvasSize(drawCanvas, drawContext, drawCanvas.clientWidth, drawCanvas.clientHeight);
  setCanvasSize(previewCanvas, previewContext, sceneWrap.clientWidth, sceneWrap.clientHeight);
  drawPad();
  renderForm();
}

function pathFor(context, points, width, height, offsetX = 0, offsetY = 0, scale = 1) {
  const centerX = width / 2;
  const centerY = height / 2;
  context.beginPath();
  points.forEach((point, index) => {
    const x = centerX + (point.x - .5) * scale + offsetX;
    const y = centerY + (point.y - .5) * scale + offsetY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function drawPad() {
  const width = drawCanvas.clientWidth;
  const height = drawCanvas.clientHeight;
  drawContext.clearRect(0, 0, width, height);
  const hint = $('#drawHint');
  hint.classList.toggle('show', state.points.length === 0);
  if (state.points.length < 2) return;
  drawContext.save();
  drawContext.lineJoin = 'round';
  drawContext.lineCap = 'round';
  drawContext.strokeStyle = '#d5ff55';
  drawContext.shadowColor = '#cbff3d';
  drawContext.shadowBlur = 8;
  drawContext.lineWidth = 2;
  drawContext.beginPath();
  state.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) drawContext.moveTo(x, y);
    else drawContext.lineTo(x, y);
  });
  if (!state.drawing && state.points.length > 2) drawContext.closePath();
  drawContext.stroke();
  drawContext.shadowBlur = 0;
  drawContext.fillStyle = '#eeffba';
  [state.points[0], state.points[state.points.length - 1]].forEach((point) => {
    drawContext.beginPath();
    drawContext.arc(point.x * width, point.y * height, 2.7, 0, Math.PI * 2);
    drawContext.fill();
  });
  drawContext.restore();
}

function renderForm() {
  const width = previewCanvas.clientWidth;
  const height = previewCanvas.clientHeight;
  if (!width || !height || state.points.length < 3) return;
  const context = previewContext;
  context.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) * .74 * state.zoom;
  const palette = finishes[state.finish].colors;
  const depth = 10 + state.depth * .53;
  const sideX = Math.cos(state.rotation + .48) * depth * .62;
  const sideY = Math.sin(state.rotation + .48) * depth * .30 + depth * .52;

  context.save();
  context.filter = 'blur(24px)';
  context.globalAlpha = .32;
  context.fillStyle = state.finish === 'acid' ? '#bbfb46' : state.finish === 'violet' ? '#995cff' : '#c9dcff';
  pathFor(context, state.points, width, height, sideX * .7, sideY + 17, scale);
  context.fill();
  context.restore();

  for (let layer = Math.ceil(depth); layer >= 1; layer -= 2) {
    const amount = layer / depth;
    const side = context.createLinearGradient(width / 2, height / 2, width / 2 + sideX, height / 2 + sideY);
    side.addColorStop(0, palette[0]);
    side.addColorStop(.5, palette[2]);
    side.addColorStop(1, '#08090e');
    context.fillStyle = side;
    pathFor(context, state.points, width, height, sideX * amount, sideY * amount, scale);
    context.fill();
  }

  const light = state.lightAngle * Math.PI / 180;
  const metal = context.createLinearGradient(
    width / 2 - Math.cos(light) * scale * .55,
    height / 2 - Math.sin(light) * scale * .55,
    width / 2 + Math.cos(light) * scale * .55,
    height / 2 + Math.sin(light) * scale * .55,
  );
  metal.addColorStop(0, palette[0]);
  metal.addColorStop(.19, palette[1]);
  metal.addColorStop(.44, palette[2]);
  metal.addColorStop(.68, palette[3]);
  metal.addColorStop(1, palette[4]);
  pathFor(context, state.points, width, height, 0, 0, scale);
  context.fillStyle = metal;
  context.fill();

  if (state.texture) {
    context.save();
    pathFor(context, state.points, width, height, 0, 0, scale);
    context.clip();
    context.globalAlpha = .37;
    const pattern = context.createPattern(state.texture, 'repeat');
    if (pattern) {
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  }

  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = .32;
  const shine = context.createRadialGradient(width * .42, height * .32, 2, width * .5, height * .5, scale * .62);
  shine.addColorStop(0, '#ffffff');
  shine.addColorStop(.23, 'rgba(255,255,255,.22)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  pathFor(context, state.points, width, height, 0, 0, scale);
  context.fillStyle = shine;
  context.fill();
  context.restore();

  pathFor(context, state.points, width, height, 0, 0, scale);
  context.lineWidth = Math.max(1, state.bevel / 26);
  context.strokeStyle = 'rgba(255,255,255,.58)';
  context.stroke();
}

function clampPoint(event) {
  const box = drawCanvas.getBoundingClientRect();
  return {
    x: Math.max(.02, Math.min(.98, (event.clientX - box.left) / box.width)),
    y: Math.max(.02, Math.min(.98, (event.clientY - box.top) / box.height)),
  };
}

function applyPoints(points, name = 'HAND DRAWN') {
  if (points.length < 3) {
    showToast('Нарисуй замкнутый контур — нужно минимум 3 точки');
    return;
  }
  state.points = simplify(points, 180);
  state.drawing = false;
  $('#modelStatus').textContent = `FORM_001 / ${name}`;
  $('#strokeInfo').textContent = `${state.points.length} PTS / LIVE`;
  drawPad();
  renderForm();
}

function simplify(points, maximum) {
  if (points.length <= maximum) return points;
  const step = Math.ceil(points.length / maximum);
  return points.filter((_, index) => index % step === 0);
}

// Drawing
drawCanvas.addEventListener('pointerdown', (event) => {
  drawCanvas.setPointerCapture(event.pointerId);
  state.drawing = true;
  state.points = [clampPoint(event)];
  $('#strokeInfo').textContent = 'DRAWING…';
  drawPad();
});
drawCanvas.addEventListener('pointermove', (event) => {
  if (!state.drawing) return;
  const point = clampPoint(event);
  const previous = state.points[state.points.length - 1];
  if (Math.hypot(point.x - previous.x, point.y - previous.y) > .006) {
    state.points.push(point);
    drawPad();
    renderForm();
  }
});
drawCanvas.addEventListener('pointerup', () => applyPoints(state.points));
drawCanvas.addEventListener('pointercancel', () => { state.drawing = false; drawPad(); });

$('#clearDrawing').addEventListener('click', () => {
  state.points = [];
  $('#strokeInfo').textContent = 'EMPTY CANVAS';
  drawPad();
  previewContext.clearRect(0, 0, previewCanvas.clientWidth, previewCanvas.clientHeight);
});
$('#applyDrawing').addEventListener('click', () => applyPoints(state.points));

function selectPreset(name) {
  state.preset = name;
  state.rotation = -.45;
  applyPoints(presetPoints(name), name.toUpperCase());
  $$('.preset').forEach((button) => button.classList.toggle('is-selected', button.dataset.preset === name));
}
$$('.preset').forEach((button) => button.addEventListener('click', () => selectPreset(button.dataset.preset)));

// Material controls
function updateRange(input, output) {
  const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
  input.style.setProperty('--value', `${percent}%`);
  output.textContent = input.value;
}
[['#depthRange', '#depthValue', 'depth'], ['#bevelRange', '#bevelValue', 'bevel'], ['#roughnessRange', '#roughnessValue', 'roughness']].forEach(([inputId, outputId, key]) => {
  const input = $(inputId);
  updateRange(input, $(outputId));
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    updateRange(input, $(outputId));
    renderForm();
  });
});

$$('.finish-card').forEach((button) => button.addEventListener('click', () => {
  state.finish = button.dataset.finish;
  $('#finishName').textContent = finishes[state.finish].label;
  $$('.finish-card').forEach((card) => card.classList.toggle('is-selected', card === button));
  renderForm();
}));

function updateLight(event) {
  if (event) {
    const orbit = $('.light-orbit').getBoundingClientRect();
    state.lightAngle = Math.round(Math.atan2(event.clientY - orbit.top - orbit.height / 2, event.clientX - orbit.left - orbit.width / 2) * 180 / Math.PI);
  }
  $('#lightValue').textContent = `${state.lightAngle >= 0 ? '+' : ''}${state.lightAngle}°`;
  $('#lightDot').style.transform = `rotate(${state.lightAngle - 35}deg)`;
  renderForm();
}
let changingLight = false;
$('#lightDot').addEventListener('pointerdown', (event) => { changingLight = true; event.currentTarget.setPointerCapture(event.pointerId); updateLight(event); });
$('#lightDot').addEventListener('pointermove', (event) => { if (changingLight) updateLight(event); });
$('#lightDot').addEventListener('pointerup', () => { changingLight = false; });

$('#randomizeMaterial').addEventListener('click', () => {
  const choices = Object.keys(finishes).filter((finish) => finish !== state.finish);
  document.querySelector(`[data-finish="${choices[Math.floor(Math.random() * choices.length)]}"]`).click();
  $('#roughnessRange').value = 10 + Math.floor(Math.random() * 45);
  $('#roughnessRange').dispatchEvent(new Event('input'));
  state.lightAngle = -100 + Math.round(Math.random() * 200);
  updateLight();
  showToast('Новый материал сгенерирован');
});

// Shape and texture upload
function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть файл')); };
    image.src = url;
  });
}

function imageToSilhouette(image) {
  const source = document.createElement('canvas');
  const size = 220;
  const ratio = Math.min(size / image.width, size / image.height);
  source.width = Math.max(1, Math.round(image.width * ratio));
  source.height = Math.max(1, Math.round(image.height * ratio));
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, source.width, source.height);
  const data = context.getImageData(0, 0, source.width, source.height).data;
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 245) { transparent = true; break; }
  const active = (x, y) => {
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return false;
    const i = (Math.floor(y) * source.width + Math.floor(x)) * 4;
    const luminance = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    return transparent ? data[i + 3] > 80 : luminance < 225;
  };
  let cx = 0, cy = 0, total = 0;
  for (let y = 0; y < source.height; y += 2) for (let x = 0; x < source.width; x += 2) if (active(x, y)) { cx += x; cy += y; total += 1; }
  if (!total) return [];
  cx /= total; cy /= total;
  const radius = Math.hypot(source.width, source.height);
  const points = [];
  for (let step = 0; step < 96; step += 1) {
    const angle = step / 96 * Math.PI * 2;
    let last = null;
    for (let r = 0; r < radius; r += 1.2) {
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (active(x, y)) last = { x, y };
    }
    if (last) points.push({ x: last.x / source.width, y: last.y / source.height });
  }
  return points;
}

async function loadShape(file) {
  if (!file) return;
  try {
    const image = await imageFromFile(file);
    const silhouette = imageToSilhouette(image);
    if (silhouette.length < 3) throw new Error('Не удалось найти контур в этом файле');
    applyPoints(silhouette, file.type.includes('svg') ? 'CUSTOM SVG' : 'IMAGE SHAPE');
    showToast('Свой шейп готов');
  } catch (error) { showToast(error.message || 'Файл не удалось обработать'); }
}

function loadTexture(file) {
  if (!file || !file.type.startsWith('image/')) { showToast('Выбери PNG, JPG или WEBP'); return; }
  imageFromFile(file).then((image) => {
    state.texture = image;
    const preview = $('#texturePreview');
    preview.innerHTML = '';
    const imageNode = document.createElement('img');
    imageNode.src = URL.createObjectURL(file);
    preview.append(imageNode);
    $('#textureText').textContent = file.name;
    $('#clearTexture').disabled = false;
    renderForm();
    showToast('Текстура добавлена');
  }).catch(() => showToast('Текстуру не удалось загрузить'));
}

function wireDropZone(zone, input, callback) {
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
  zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('is-drag'); callback(event.dataTransfer.files[0]); });
  input.addEventListener('change', () => callback(input.files[0]));
}
wireDropZone($('#shapeDrop'), $('#shapeInput'), loadShape);
wireDropZone($('#textureDrop'), $('#textureInput'), loadTexture);
$('#clearTexture').addEventListener('click', () => {
  state.texture = null;
  $('#texturePreview').innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m5 18 4.5-5 3.2 3 2.2-2 4.1 4"/></svg>';
  $('#textureText').textContent = 'Добавить texture map';
  $('#clearTexture').disabled = true;
  renderForm();
});

// Viewer interaction
let orbiting = false;
let lastOrbitX = 0;
previewCanvas.addEventListener('pointerdown', (event) => { orbiting = true; lastOrbitX = event.clientX; previewCanvas.setPointerCapture(event.pointerId); });
previewCanvas.addEventListener('pointermove', (event) => {
  if (!orbiting) return;
  state.rotation += (event.clientX - lastOrbitX) * .012;
  lastOrbitX = event.clientX;
  renderForm();
});
previewCanvas.addEventListener('pointerup', () => { orbiting = false; });

function setZoom(change) {
  state.zoom = Math.max(.62, Math.min(1.55, state.zoom * change));
  $('#zoomValue').textContent = `${Math.round(state.zoom * 100)}%`;
  renderForm();
}
$('#zoomIn').addEventListener('click', () => setZoom(1.12));
$('#zoomOut').addEventListener('click', () => setZoom(.89));
$('#toggleRotate').addEventListener('click', (event) => { state.autoRotate = !state.autoRotate; event.currentTarget.classList.toggle('is-active', state.autoRotate); });
$('#randomizeAngle').addEventListener('click', () => { state.rotation += Math.PI / 2; renderForm(); });
$('#resetCamera').addEventListener('click', () => { state.rotation = -.45; state.zoom = 1; $('#zoomValue').textContent = '100%'; renderForm(); });

// Tabs and help
$$('.create-tab').forEach((button) => button.addEventListener('click', () => {
  const tab = button.dataset.tab;
  $$('.create-tab').forEach((item) => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-selected', item === button ? 'true' : 'false'); });
  $('#drawTab').classList.toggle('is-active', tab === 'draw');
  $('#shapeTab').classList.toggle('is-active', tab === 'shape');
  if (tab === 'draw') requestAnimationFrame(resizeAll);
}));
$('#helpButton').addEventListener('click', () => $('#helpModal').classList.add('is-open'));
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => $('#helpModal').classList.remove('is-open')));
$('#helpModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.classList.remove('is-open'); });

function saveBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportPNG() {
  const width = previewCanvas.clientWidth;
  const height = previewCanvas.clientHeight;
  const longest = 3840;
  const ratio = longest / Math.max(width, height);
  const output = document.createElement('canvas');
  output.width = Math.round(width * ratio);
  output.height = Math.round(height * ratio);
  output.getContext('2d').drawImage(previewCanvas, 0, 0, output.width, output.height);
  const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
  if (blob) { saveBlob(blob, `chromeform-${Date.now()}.png`); showToast('PNG 4K сохранён'); }
}
$('#exportPng').addEventListener('click', exportPNG);

function exportVideo() {
  if (!window.MediaRecorder || state.recording) { showToast('Запись видео не поддерживается браузером'); return; }
  const recorder = new MediaRecorder(previewCanvas.captureStream(60), { videoBitsPerSecond: 7_000_000 });
  const chunks = [];
  const button = $('#exportVideo');
  state.recording = true;
  const before = state.autoRotate;
  state.autoRotate = true;
  button.classList.add('is-recording');
  button.innerHTML = '<span>●</span> REC 0:06';
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    saveBlob(new Blob(chunks, { type: 'video/webm' }), `chromeform-motion-${Date.now()}.webm`);
    state.autoRotate = before;
    state.recording = false;
    button.classList.remove('is-recording');
    button.innerHTML = '<span>◉</span> VIDEO';
    showToast('WEBM-видео сохранено');
  });
  recorder.start(150);
  showToast('Запись поворота: 6 секунд');
  setTimeout(() => recorder.stop(), 6000);
}
$('#exportVideo').addEventListener('click', exportVideo);

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function loop() {
  if (state.autoRotate && !orbiting) {
    state.rotation += .004;
    renderForm();
  }
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resizeAll);
selectPreset('blob');
resizeAll();
updateLight();
loop();
