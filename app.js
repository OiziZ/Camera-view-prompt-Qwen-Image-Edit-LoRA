import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

function getContainerSize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w > 0 && h > 0) return { width: w, height: h };
  const fallbackW = Math.min(720, window.innerWidth || 640);
  const fallbackH = Math.max(320, Math.floor((fallbackW * 10) / 16));
  return { width: fallbackW, height: fallbackH };
}

// --- LoRA data (96 poses) ---
const AZIMUTHS = [
  { angle: 0, label: 'front view' },
  { angle: 45, label: 'front-right quarter view' },
  { angle: 90, label: 'right side view' },
  { angle: 135, label: 'back-right quarter view' },
  { angle: 180, label: 'back view' },
  { angle: 225, label: 'back-left quarter view' },
  { angle: 270, label: 'left side view' },
  { angle: 315, label: 'front-left quarter view' },
];

const ELEVATIONS = [
  { angle: -30, label: 'low-angle shot' },
  { angle: 0, label: 'eye-level shot' },
  { angle: 30, label: 'elevated shot' },
  { angle: 60, label: 'high-angle shot' },
];

const DISTANCES = ['close-up', 'medium shot', 'wide shot'];

function snapAzimuth(deg) {
  const a = snapAzimuthToAngle(deg);
  return AZIMUTHS.find((x) => x.angle === a).label;
}

function snapElevation(deg) {
  const e = snapElevationToAngle(deg);
  return ELEVATIONS.find((x) => x.angle === e).label;
}

function snapAzimuthToAngle(deg) {
  let d = ((deg % 360) + 360) % 360;
  let best = AZIMUTHS[0];
  let bestDiff = Math.abs(d - best.angle);
  for (const a of AZIMUTHS) {
    const diff = Math.min(Math.abs(d - a.angle), 360 - Math.abs(d - a.angle));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best.angle;
}

function snapElevationToAngle(deg) {
  const clamped = Math.max(-30, Math.min(60, deg));
  let best = ELEVATIONS[0];
  let bestDiff = Math.abs(clamped - best.angle);
  for (const e of ELEVATIONS) {
    const diff = Math.abs(clamped - e.angle);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = e;
    }
  }
  return best.angle;
}

function sphericalToCartesian(radius, azimuthDeg, elevationDeg) {
  const ar = (azimuthDeg * Math.PI) / 180;
  const er = (elevationDeg * Math.PI) / 180;
  const cosE = Math.cos(er);
  return new THREE.Vector3(
    radius * cosE * Math.sin(ar),
    radius * Math.sin(er),
    radius * cosE * Math.cos(ar)
  );
}

function buildPrompt(azimuthLabel, elevationLabel, distanceLabel) {
  return `<sks> ${azimuthLabel} ${elevationLabel} ${distanceLabel}`;
}

function getAnglesFromCamera(camera) {
  const p = camera.position;
  const radius = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
  const azimuthRad = Math.atan2(p.x, p.z);
  let azimuthDeg = (azimuthRad * 180) / Math.PI;
  if (azimuthDeg < 0) azimuthDeg += 360;
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, p.y / radius)));
  const elevationDeg = (elevationRad * 180) / Math.PI;
  return { azimuthDeg, elevationDeg };
}

// --- Three.js ---
const container = document.getElementById('canvas-container');
const { width, height } = getContainerSize(container);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f3f5);

const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
camera.position.set(0, 0, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Central object (reference cube)
const boxGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const boxMaterial = new THREE.MeshStandardMaterial({
  color: 0x495057,
  roughness: 0.7,
  metalness: 0.1,
});
const centerObject = new THREE.Mesh(boxGeometry, boxMaterial);
scene.add(centerObject);

// Reference guides: axes (X red, Y green, Z blue) + floor grid (toggleable)
const axesHelper = new THREE.AxesHelper(1.4);
scene.add(axesHelper);

const gridHelper = new THREE.GridHelper(5, 10, 0xadb5bd, 0xdee2e6);
gridHelper.position.y = -0.5;
scene.add(gridHelper);

let showReferenceGuides = true;

// Base radius for hemisphere (medium shot)
const BASE_RADIUS = 2.2;
const DISTANCE_SCALE = { 'close-up': 0.6, 'medium shot': 1, 'wide shot': 1.8 };
let currentDistance = 'medium shot';

const hemisphereGroup = new THREE.Group();
scene.add(hemisphereGroup);

function buildHemisphereWireframe(radius) {
  const phiStart = (90 - 60) * (Math.PI / 180);
  const phiLength = (60 - (-30)) * (Math.PI / 180);
  const geo = new THREE.SphereGeometry(radius, 24, 10, phiStart, phiLength, 0, Math.PI * 2);
  const wireframe = new THREE.WireframeGeometry(geo);
  const line = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x868e96 }));
  geo.dispose();
  return line;
}

function buildCameraMarker(isActive = false) {
  const geo = new THREE.ConeGeometry(0.06, 0.14, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: isActive ? 0x339af0 : 0xadb5bd,
    transparent: true,
    opacity: isActive ? 1 : 0.85,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.isMarker = true;
  return mesh;
}

let wireframeMesh = null;
const cameraMarkers = [];
const markerAzimuth = [];
const markerElevation = [];

function updateHemisphereRadius() {
  const scale = DISTANCE_SCALE[currentDistance] ?? 1;
  const radius = BASE_RADIUS * scale;
  if (wireframeMesh) {
    hemisphereGroup.remove(wireframeMesh);
    wireframeMesh.geometry.dispose();
  }
  wireframeMesh = buildHemisphereWireframe(radius);
  wireframeMesh.visible = showReferenceGuides;
  hemisphereGroup.add(wireframeMesh);

  for (let i = 0; i < cameraMarkers.length; i++) {
    const pos = sphericalToCartesian(radius, markerAzimuth[i], markerElevation[i]);
    cameraMarkers[i].position.copy(pos);
    cameraMarkers[i].lookAt(0, 0, 0);
  }
}

function initCameraMarkers() {
  const scale = DISTANCE_SCALE[currentDistance] ?? 1;
  const radius = BASE_RADIUS * scale;
  for (const e of ELEVATIONS) {
    for (const a of AZIMUTHS) {
      const pos = sphericalToCartesian(radius, a.angle, e.angle);
      const marker = buildCameraMarker(false);
      marker.position.copy(pos);
      marker.lookAt(0, 0, 0);
      hemisphereGroup.add(marker);
      cameraMarkers.push(marker);
      markerAzimuth.push(a.angle);
      markerElevation.push(e.angle);
    }
  }
  wireframeMesh = buildHemisphereWireframe(radius);
  wireframeMesh.visible = showReferenceGuides;
  hemisphereGroup.add(wireframeMesh);
}

function updateReferenceGuidesVisibility() {
  axesHelper.visible = true;
  gridHelper.visible = showReferenceGuides;
  if (wireframeMesh) wireframeMesh.visible = showReferenceGuides;
}

function getCurrentMarkerIndex() {
  const azim = snapAzimuthToAngle(getAnglesFromCamera(camera).azimuthDeg);
  const elev = snapElevationToAngle(getAnglesFromCamera(camera).elevationDeg);
  for (let i = 0; i < cameraMarkers.length; i++) {
    if (markerAzimuth[i] === azim && markerElevation[i] === elev) return i;
  }
  return 0;
}

function updateCurrentMarker() {
  const idx = getCurrentMarkerIndex();
  cameraMarkers.forEach((m, i) => {
    m.material.color.setHex(i === idx ? 0x339af0 : 0xadb5bd);
    m.material.opacity = i === idx ? 1 : 0.85;
  });
}

initCameraMarkers();

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 3, 2);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404060, 0.6));

// OrbitControls: orbit around the cube (target at origin)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// Limit elevation between -30° and 60° (polar: 0 = above, PI = below)
controls.minPolarAngle = (90 - 60) * (Math.PI / 180);
controls.maxPolarAngle = (90 + 30) * (Math.PI / 180);

// UI elements
const promptOutput = document.getElementById('prompt-text');
const copyBtn = document.getElementById('copy-btn');

document.getElementById('toggle-references').addEventListener('change', (e) => {
  showReferenceGuides = e.target.checked;
  updateReferenceGuidesVisibility();
});

document.querySelectorAll('.distance-buttons button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.distance-buttons button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    currentDistance = btn.getAttribute('data-distance');
    updateHemisphereRadius();
    updatePrompt();
    updateCurrentMarker();
  });
});

copyBtn.addEventListener('click', () => {
  const text = promptOutput.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  });
});

function updatePrompt() {
  const { azimuthDeg, elevationDeg } = getAnglesFromCamera(camera);
  const azimuthLabel = snapAzimuth(azimuthDeg);
  const elevationLabel = snapElevation(elevationDeg);
  const prompt = buildPrompt(azimuthLabel, elevationLabel, currentDistance);
  promptOutput.textContent = prompt;
}

controls.addEventListener('change', () => {
  updatePrompt();
  updateCurrentMarker();
});
updatePrompt();
updateCurrentMarker();

function onResize() {
  const { width: w, height: h } = getContainerSize(container);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(container);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
