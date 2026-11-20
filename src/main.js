import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildClip } from './animation.js';
import {
  compilePgrModel,
  applyPgrMaterialMode,
  DEFAULT_PGR_LIGHTING,
  updateRimDirection,
  updateGroundShadows,
  updateEmissionFlow,
  loadCubemapRegistry,
  createSpringBoneSystem,
  ou,
} from './materials/pgrToon.js';
import { updateHairFades } from './materials/face.js';
import {
  createPgrPostProcessor,
  DEFAULT_POST_CONFIG,
  loadDefaultLut,
  createPgrGrid,
  createShadowLights,
  updateShadowLights,
} from './post.js';
import {
  fetchCharacterList,
  fetchCharacterDetail,
  huaxuImageUrl,
  huaxuModelBaseUrl,
} from './api/huaxu.js';
import {
  COLOR_PALETTES,
  BUILTIN_PROPS,
  snapshotMeshMaterialState,
  getMeshMaterialState,
  applyMeshMaterialProperty,
  applyMeshTextureHSL,
  resetMeshMaterialState,
  applyColorPaletteToMesh,
  findCharacterSockets,
  findBoneByRawName,
  loadDonorCharacterModel,
  equipDonorMeshOnHost,
  createBuiltinPropMesh,
  loadCustomGlbFile,
  loadCustomGlbBuffer,
  serializeMeshMaterialEdits,
  applyMeshMaterialEdits,
  exportModelToGlb,
} from './editor/studioEditor.js';
import { createPoseRig } from './pose/rig.js';
import { dropStaleExtras, facingRootIndex, isOwnExport, isRemapped, STALE_MATERIAL_KEYS, STALE_NODE_KEYS } from './editor/glbTidy.js';
import { createPoseHandles } from './pose/handles.js';
import { createBodyColliders } from './pose/bodyColliders.js';
import { createBodyPatcher, defaultPartRewriteOnHide } from './editor/bodyPatch.js';
import { createHistoryManager } from './editor/history.js';
import {
  ensureFaceMask,
  applyFaceMask,
  cloneFaceMaskArray,
  restoreFaceMaskArray,
  setDeletedFaceIndices,
  visibleHitToOriginalFace,
  selectLinkedFaces,
  selectFacesInBox,
  selectFacesInCircle,
  getAllVisibleFaces,
  syncEditOverlayMesh,
  separateSelectedFaces,
  duplicateSceneObject,
  reparentPreservingWorld,
  autoSkinObjectToHost,
} from './editor/meshEdit.js';
import {
  captureViewportThumbnail,
  serializePose,
  applyPoseData,
  validatePoseJson,
  listSavedPoses,
  savePoseRecord,
  deletePoseRecord,
} from './editor/poseLibrary.js';
import {
  saveBinaryAsset,
  loadBinaryAsset,
  serializeProject,
  embedAssetsIntoProject,
  restoreEmbeddedAssetsFromProject,
  saveAutosaveProject,
  loadAutosaveProject,
  clearAutosaveProject,
  saveNamedProject,
  listSavedProjects,
  deleteSavedProject,
} from './editor/projectStore.js';
import './style.css';

const DEFAULT_BASE = 'https://assets.huaxu.app/models/charaterprefab/r3kurumimd010011/';
const params = new URLSearchParams(location.search);
let currentModelBase = withSlash(params.get('base') || DEFAULT_BASE);
const REQUESTED_CLIP = params.get('clip');
const REQUESTED_TIME = params.has('t') ? Number(params.get('t')) : null;
const REQUESTED_CAM = params.get('cam');
const REQUESTED_BG = params.get('bg');
const REQUESTED_MODE = params.get('mode');
const OPEN_CATALOG_ON_START = !params.has('clip') && !params.has('base') && !params.has('cam') && !params.has('t');

const $ = (selector) => document.querySelector(selector);

const els = {
  app: $('#app'),
  viewport: $('#viewport'),
  canvas: $('#scene'),
  loading: $('#loading'),
  loadingTitle: $('#loading-title'),
  loadingSub: $('#loading-sub'),
  progressBar: $('#progress-bar'),
  brandTitle: $('#brand-title'),
  brandSub: $('#brand-sub'),
  clipCount: $('#clip-count'),
  panel: $('#panel'),
  openBrowserModalBtn: $('#open-browser-modal-btn'),
  quickScreenshotBtn: $('#quick-screenshot-btn'),
  editorModeSwitch: $('#editor-mode-switch'),
  globalUndo: $('#global-undo'),
  globalRedo: $('#global-redo'),
  fileMenuBtn: $('#file-menu-btn'),
  fileMenuPopover: $('#file-menu-popover'),
  openProjectInput: $('#open-project-input'),
  openCharGlbInput: $('#open-char-glb-input'),
  addCharGlbInput: $('#add-char-glb-input'),
  castStrip: $('#cast-strip'),
  shortcutHelpBtn: $('#shortcut-help-btn'),
  autosaveBanner: $('#autosave-banner'),
  autosaveBannerText: $('#autosave-banner-text'),
  autosaveResumeBtn: $('#autosave-resume-btn'),
  autosaveDismissBtn: $('#autosave-dismiss-btn'),
  editmodeBar: $('#editmode-bar'),
  editSelectTool: $('#edit-select-tool'),
  editmodeCount: $('#editmode-count'),
  editSelectAllBtn: $('#edit-select-all-btn'),
  editDeleteFacesBtn: $('#edit-delete-faces-btn'),
  editSeparateFacesBtn: $('#edit-separate-faces-btn'),
  editDoneBtn: $('#edit-done-btn'),
  viewportSelectRect: $('#viewport-select-rect'),
  viewportBrushRing: $('#viewport-brush-ring'),
  modalTransformBadge: $('#modal-transform-badge'),
  openAddMenuRail: $('#open-add-menu-rail'),
  addMenuPopover: $('#add-menu-popover'),
  addMenuProps: $('#add-menu-props'),
  parentMenuPopover: $('#parent-menu-popover'),
  parentMenuOptions: $('#parent-menu-options'),
  viewportToolbar: $('#viewport-toolbar'),
  vpSelectedLabel: $('#vp-selected-label'),
  viewportHint: $('#viewport-hint'),
  poseLayer: $('#pose-layer'),
  tabs: document.querySelectorAll('.tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  // Pose
  poseUndo: $('#pose-undo'),
  poseRedo: $('#pose-redo'),
  poseReset: $('#pose-reset'),
  poseResetPart: $('#pose-reset-part'),
  poseSelectedName: $('#pose-selected-name'),
  poseFingers: $('#pose-fingers'),
  poseFingersTitle: $('#pose-fingers-title'),
  poseFingersReset: $('#pose-fingers-reset'),
  poseFingersZoom: $('#pose-fingers-zoom'),
  poseHandShapes: $('#pose-hand-shapes'),
  poseFingerList: $('#pose-finger-list'),
  poseHandSpread: $('#pose-hand-spread'),
  poseHandSpreadVal: $('#pose-hand-spread-val'),
  poseUnsupported: $('#pose-unsupported'),
  poseGuide: $('#pose-guide'),
  posePinFeet: $('#pose-pin-feet'),
  posePinHands: $('#pose-pin-hands'),
  poseCorrectives: $('#pose-correctives'),
  poseCorrectivesStatus: $('#pose-correctives-status'),
  poseCollide: $('#pose-collide'),
  // Pose Library
  poseImportBtn: $('#pose-import-btn'),
  poseExportAllBtn: $('#pose-export-all-btn'),
  poseImportInput: $('#pose-import-input'),
  poseSaveName: $('#pose-save-name'),
  poseSaveBtn: $('#pose-save-btn'),
  poseApplyScope: $('#pose-apply-scope'),
  poseApplyMirror: $('#pose-apply-mirror'),
  poseLibraryGrid: $('#pose-library-grid'),
  // Body patches
  patchGroup: $('#patch-group'),
  patchAuto: $('#patch-auto'),
  patchMode: $('#patch-mode'),
  patchFillStyle: $('#patch-fill-style'),
  patchBaselayerRow: $('#patch-baselayer-row'),
  patchBaselayerColor: $('#patch-baselayer-color'),
  patchList: $('#patch-list'),
  patchFillAllBtn: $('#patch-fill-all-btn'),
  patchCoverageBadge: $('#patch-coverage-badge'),
  patchDebugToggle: $('#patch-debug-toggle'),
  patchThickness: $('#patch-thickness'),
  patchThicknessVal: $('#patch-thickness-val'),
  list: $('#clip-list'),
  search: $('#search'),
  sourceLink: $('#source-link'),
  play: $('#play'),
  nowName: $('#now-name'),
  nowBadge: $('#now-badge'),
  nowMeta: $('#now-meta'),
  scrub: $('#scrub'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),
  speed: $('#speed'),
  speedVal: $('#speed-val'),
  loop: $('#loop'),
  skeleton: $('#skeleton'),
  resetCamera: $('#reset-camera'),
  partsList: $('#parts-list'),
  partsAll: $('#parts-all'),
  partsUnsolo: $('#parts-unsolo'),
  partsReset: $('#parts-reset'),
  outlinerAddBtn: $('#outliner-add-btn'),
  outlinerDupBtn: $('#outliner-dup-btn'),
  outlinerEditFaceBtn: $('#outliner-edit-face-btn'),
  rewriteAllOnBtn: $('#rewrite-all-on-btn'),
  rewriteAllOffBtn: $('#rewrite-all-off-btn'),
  outlinerExtraWrap: $('#outliner-extra-wrap'),
  outlinerExtraList: $('#outliner-extra-list'),
  deletedPartsGroup: $('#deleted-parts-group'),
  deletedPartsCount: $('#deleted-parts-count'),
  deletedPartsList: $('#deleted-parts-list'),
  restoreAllDeletedBtn: $('#restore-all-deleted-btn'),
  partParentBtn: $('#part-parent-btn'),
  transformTargetName: $('#transform-target-name'),
  partTransformReset: $('#part-transform-reset'),
  partPosX: $('#part-pos-x'),
  partPosXVal: $('#part-pos-x-val'),
  partPosY: $('#part-pos-y'),
  partPosYVal: $('#part-pos-y-val'),
  partPosZ: $('#part-pos-z'),
  partPosZVal: $('#part-pos-z-val'),
  partScale: $('#part-scale'),
  partScaleVal: $('#part-scale-val'),
  morphMesh: $('#morph-mesh'),
  morphList: $('#morph-list'),
  morphReset: $('#morph-reset'),
  modelScale: $('#model-scale'),
  modelScaleVal: $('#model-scale-val'),
  modelRotate: $('#model-rotate'),
  modelRotateVal: $('#model-rotate-val'),
  bindPose: $('#bind-pose'),
  playgroundReset: $('#playground-reset'),
  // Color & Shader Studio
  colorTargetSelect: $('#color-target-select'),
  colorResetBtn: $('#color-reset-btn'),
  colorPaletteGrid: $('#color-palette-grid'),
  hslResetBtn: $('#hsl-reset-btn'),
  colorHue: $('#color-hue'),
  colorHueVal: $('#color-hue-val'),
  colorSat: $('#color-sat'),
  colorSatVal: $('#color-sat-val'),
  colorLight: $('#color-light'),
  colorLightVal: $('#color-light-val'),
  colorAlbedo: $('#color-albedo'),
  colorGlobalTint: $('#color-global-tint'),
  colorShadow1: $('#color-shadow1'),
  colorShadow2: $('#color-shadow2'),
  colorRim: $('#color-rim'),
  colorOutline: $('#color-outline'),
  sliderRimIntensity: $('#slider-rim-intensity'),
  sliderRimIntensityVal: $('#slider-rim-intensity-val'),
  sliderCelThreshold: $('#slider-cel-threshold'),
  sliderCelThresholdVal: $('#slider-cel-threshold-val'),
  sliderCelSmooth: $('#slider-cel-smooth'),
  sliderCelSmoothVal: $('#slider-cel-smooth-val'),
  sliderBloomFactor: $('#slider-bloom-factor'),
  sliderBloomFactorVal: $('#slider-bloom-factor-val'),
  sliderOutlineWidth: $('#slider-outline-width'),
  sliderOutlineWidthVal: $('#slider-outline-width-val'),
  togglePartOutline: $('#toggle-part-outline'),
  togglePartWireframe: $('#toggle-part-wireframe'),
  // Kitbash Studio
  pickDonorModelBtn: $('#pick-donor-model-btn'),
  donorModelLabel: $('#donor-model-label'),
  donorBindMode: $('#donor-bind-mode'),
  donorPartsList: $('#donor-parts-list'),
  kitbashSocketSelect: $('#kitbash-socket-select'),
  builtinPropsGrid: $('#builtin-props-grid'),
  uploadGlbInput: $('#upload-glb-input'),
  clearKitbashBtn: $('#clear-kitbash-btn'),
  activeKitbashList: $('#active-kitbash-list'),
  // Scene & Export
  stageMode: $('#stage-mode'),
  materialMode: $('#material-mode'),
  customBgColor: $('#custom-bg-color'),
  toggleGrid: $('#toggle-grid'),
  toggleShadow: $('#toggle-shadow'),
  lightYaw: $('#light-yaw'),
  lightYawVal: $('#light-yaw-val'),
  lightPitch: $('#light-pitch'),
  lightPitchVal: $('#light-pitch-val'),
  exportPngBtn: $('#export-png-btn'),
  exportGlbBtn: $('#export-glb-btn'),
  exportProjectBtn: $('#export-project-btn'),
  exportOptPatches: $('#export-opt-patches'),
  exportOptBakePose: $('#export-opt-bake-pose'),
  exportOptAnims: $('#export-opt-anims'),
  // Modals
  projectsModal: $('#projects-modal'),
  projectsModalClose: $('#projects-modal-close'),
  projectsList: $('#projects-list'),
  shortcutHelpModal: $('#shortcut-help-modal'),
  shortcutHelpClose: $('#shortcut-help-close'),
  // Catalog Overlay
  catalogOverlay: $('#catalog-overlay'),
  catalogTitle: $('#catalog-title'),
  catalogSubtitle: $('#catalog-subtitle'),
  catalogBackBtn: $('#catalog-back-btn'),
  catalogCloseBtn: $('#catalog-close-btn'),
  catalogStepChars: $('#catalog-step-chars'),
  catalogStepModels: $('#catalog-step-models'),
  catalogSearchInput: $('#catalog-search-input'),
  catalogCharCount: $('#catalog-char-count'),
  catalogElementFilters: $('#catalog-element-filters'),
  catalogCharGrid: $('#catalog-char-grid'),
  selectedCharBanner: $('#selected-char-banner'),
  catalogModelsGrid: $('#catalog-models-grid'),
  toast: $('#toast'),
};

let renderer;
let scene;
let overlayScene;
let camera;
let controls;
let transformControls;
let transformHelper;
let lastFrameTime = performance.now();
let elapsedTime = 0;
let model;
/** The glTF the current model was loaded from; the export reads the game's original textures from it. */
let sourceGltf = null;
let mixer;
let skeletonHelper;
let stage;
let keyLight;
let ambientLight;

let pgrModel = null;
let springSystem = null;
let postProcessor = null;
let pgrGrid = null;
let shadowLights = null;
let modelSphere = null;
let modelBox = null;
let cubemapRegistry = new Map();

let clips = [];
let clipsByName = new Map();
let idleName = 'Stand1';
let entryName = 'Born';

let clipCache = new Map();
let nodeNames = new Map();
let meshNames = new Map();
let nodeByIndex = new Map();
let bindTransforms = new Map();
let parts = [];
let morphParts = [];
let morphOverrides = new Map();

let currentAction = null;
let currentMeta = null;
let paused = false;
let loopEnabled = true;
let requestToken = 0;
let scrubbing = false;
let bindPoseActive = false;

let stageMode = REQUESTED_BG === 'studio' ? 'studio' : 'dark';
let showGrid = params.has('grid') ? params.get('grid') !== '0' : false;
let showShadow = params.has('shadow') ? params.get('shadow') !== '0' : true;
let materialMode = REQUESTED_MODE === 'pbr' ? 'pbr' : 'pgr';
const originalMaterials = new WeakMap();
let lightYaw = 175;
let lightPitch = 30;
let activeMorphPart = null;

// Pose state
let poseRig = null;
let poseHandles = null;
let poseEdit = null;
/** Which hand ('L' or 'R') the finger panel is showing, and the slider being dragged in it. */
let fingerPanelSide = null;
let activeFingerSlider = null;
let poseSettleUntil = 0;
let poseCorrectivesState = 'idle'; // 'idle' | 'loading' | 'ready' | 'none' | 'failed'
let bodyColliders = null;
let bodyPatcher = null;
/** World matrix of every node while the model stood in its bind pose. */
let bindWorld = new Map();

// Studio Editor state
let activeTab = 'anim';
let editorMode = 'object'; // 'object' | 'edit' | 'pose'
let selectedObject = null;
const selectedObjects = new Set();
let soloPart = null;
let activeGizmoMode = 'none'; // 'none' | 'pose' | 'translate' | 'rotate' | 'scale'
let characterSockets = {};
let discoveredBones = [];
let activeKitbashItems = [];
let currentDonorBindMode = 'skeleton';
let currentModelAssetId = null;
let currentProjectId = null;
let projectDirty = false;
let lastPoseSnapshot = null;
let objectGizmoStart = null;
let currentModelMeta = {
  charName: 'Kurumi Tokisaki',
  frame: 'R3 Kurumi',
  code: 'MD010011',
};

// Edit Mode state
let editModeMesh = null;
let editSelectTool = 'click'; // 'click' | 'box' | 'brush' | 'linked'
const editSelectedFaces = new Set();
let editSelectionOverlay = null;
let editDragState = null;

// Modal numeric transform state (G/R/S + axis + digits)
let modalTransform = null;

// Gap Debug Overlay
let gapDebugGroup = null;

// Undo history. Each character in the scene keeps its own: the commands act
// on that character's rig, parts and materials.
function createCharacterHistory() {
  return createHistoryManager({
    limit: 100,
    onChange: () => {
      projectDirty = true;
      syncHistoryUI();
    },
  });
}
let history = createCharacterHistory();

function markProjectDirty() {
  projectDirty = true;
}

// Catalog state
let catalogPurpose = 'switch'; // 'switch' | 'donor'
let allCharacters = [];
let activeElementFilter = 'all';

let homePosition = new THREE.Vector3(0, 1.35, -3.8);
let homeTarget = new THREE.Vector3(0, 0.92, 0);
let cameraTween = null;
const cameraWorldPos = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

let toastTimer = 0;

const fmtTime = (seconds) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
};

function withSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function setActiveClipItem(name) {
  for (const item of els.list.querySelectorAll('.clip-item')) {
    const active = item.dataset.name === name;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) item.scrollIntoView({ block: 'nearest' });
  }
}

function setClipItemLoading(name, loading) {
  const item = els.list.querySelector(`.clip-item[data-name="${CSS.escape(name)}"]`);
  if (item) item.classList.toggle('loading', loading);
}

function toast(message, timeout = 4600) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, timeout);
}

function setLoading(progress, title, subtitle) {
  if (!els.loading) return;
  els.loading.hidden = false;
  els.loading.classList.remove('done');
  els.loading.classList.remove('is-error');
  if (title && els.loadingTitle) els.loadingTitle.textContent = title;
  if (subtitle && els.loadingSub) els.loadingSub.textContent = subtitle;
  if (els.progressBar) {
    els.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function icon(name, extraClass = '') {
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"><use href="#i-${name}" /></svg>`;
}

function viewportSize() {
  return {
    width: Math.max(1, els.viewport.clientWidth),
    height: Math.max(1, els.viewport.clientHeight),
  };
}

function finishLoading() {
  if (!els.loading) return;
  els.loading.classList.add('done');
  setTimeout(() => {
    if (els.loading.classList.contains('done')) {
      els.loading.hidden = true;
    }
  }, 650);
}

async function fetchJSON(url) {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} · ${url}`);
  const text = await response.text();
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

/* ------------------------------------------------------------------ */
/* Three.js Scene & Gizmo Initialization                              */
/* ------------------------------------------------------------------ */

function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: false,
    alpha: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
    reversedDepthBuffer: true,
  });
  const size = viewportSize();
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size.width, size.height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  overlayScene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(20, size.width / size.height, 0.01, 10000);
  camera.position.copy(homePosition);

  controls = new OrbitControls(camera, els.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 0.4;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.target.copy(homeTarget);
  controls.update();

  transformControls = new TransformControls(camera, els.canvas);
  transformControls.setSize(0.75);
  transformHelper = transformControls.getHelper();
  transformHelper.visible = false;
  overlayScene.add(transformHelper);

  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    onGizmoDragChanged(event.value);
  });
  transformControls.addEventListener('objectChange', () => {
    if (!poseEdit) return;
    poseRig.updateEdit(poseEdit);
  });
  transformControls.addEventListener('change', () => {
    if (activeGizmoMode !== 'pose') syncTransformSlidersFromSelected();
    if (renderer) renderer.shadowMap.needsUpdate = true;
  });

  poseHandles = createPoseHandles({
    layer: els.poseLayer,
    canvas: els.canvas,
    camera,
    onDragStart: pauseForPosing,
    onSelect: selectPoseHandle,
    onReset: (id) => {
      const handle = poseRig?.handle(id);
      if (handle && poseRig.resetGroup(handle.group)) toast(`${handle.label} dikembalikan ke animasi.`, 2200);
    },
  });

  ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(2, 4, -5);
  keyLight.castShadow = false;
  scene.add(keyLight);

  shadowLights = createShadowLights(scene);

  pgrGrid = createPgrGrid();
  pgrGrid.mesh.visible = showGrid && materialMode === 'pgr';
  scene.add(pgrGrid.mesh);

  postProcessor = createPgrPostProcessor(renderer, DEFAULT_POST_CONFIG);
  const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  postProcessor.setSize(drawSize.x, drawSize.y);

  loadDefaultLut()
    .then((lut) => {
      if (lut && postProcessor) postProcessor.setLut(lut);
    })
    .catch((err) => {
      console.warn('[PGR LUT] Failed to load LUT:', err);
    });

  // The canvas follows the viewport cell, which changes when the inspector
  // opens or closes as well as when the window does.
  new ResizeObserver(onResize).observe(els.viewport);
  window.addEventListener('resize', onResize);
}

function addStage() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshLambertMaterial({ color: 0x303236 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = false;
  ground.visible = false;
  scene.add(ground);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 64),
    new THREE.MeshBasicMaterial({
      color: 0xff3b46,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.002;
  glow.visible = false;
  scene.add(glow);

  stage = { ground, grid: null, glow };
  rebuildGrid();
}

function rebuildGrid() {
  if (!stage) return;
  if (stage.grid) {
    scene.remove(stage.grid);
    stage.grid.geometry.dispose();
    stage.grid.material.dispose();
  }

  const studio = stageMode === 'studio';
  const grid = new THREE.GridHelper(40, 40, studio ? 0x93a6b2 : 0x334049, studio ? 0xb9c7d0 : 0x1a2227);
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = studio ? 0.95 : 0.42;
  grid.material.depthWrite = false;
  grid.visible = showGrid && materialMode === 'pbr';
  scene.add(grid);
  stage.grid = grid;
}

function syncStageVisibility() {
  const isPgr = materialMode === 'pgr';
  if (stage) {
    stage.ground.visible = false;
    stage.glow.visible = false;
    if (stage.grid) stage.grid.visible = !isPgr && showGrid;
  }
  if (pgrGrid) {
    pgrGrid.mesh.visible = isPgr && showGrid;
  }
  if (shadowLights) {
    shadowLights.body.visible = isPgr;
    shadowLights.head.visible = isPgr;
  }
}

function applyStage(mode) {
  stageMode = mode;
  for (const button of els.stageMode.querySelectorAll('.seg-btn')) {
    button.classList.toggle('is-active', button.dataset.stage === mode);
  }

  const studio = mode === 'studio';
  if (stage) {
    stage.glow.visible = false;
    rebuildGrid();
  }

  // The canvas is transparent: the stage colour is the viewport's background.
  if (REQUESTED_BG === 'transparent') {
    els.viewport.style.background = 'transparent';
  } else {
    const background = REQUESTED_BG === 'flat' ? 0x171717 : studio ? 0x484b4f : 0x303236;
    const hexStr = `#${background.toString(16).padStart(6, '0')}`;
    if (stage) stage.ground.material.color.setHex(background);
    els.viewport.style.background = hexStr;
    if (els.customBgColor) els.customBgColor.value = hexStr;
  }

  syncStageVisibility();
  updateKeyLight();
}

function logMaterialDiscovery(gltf) {
  const json = gltf.parser.json;
  const textures = json.textures ?? [];
  const rows = (json.materials ?? []).map((material, index) => {
    const refs = {
      baseColor: material.pbrMetallicRoughness?.baseColorTexture,
      metallicRoughness: material.pbrMetallicRoughness?.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
      emissive: material.emissiveTexture,
    };
    const name = material.name ?? `material ${index}`;
    const type = /face|skin|body/i.test(name) ? 'face/body'
      : /hair|kami/i.test(name) ? 'hair'
        : /eye|pupil/i.test(name) ? 'eye'
          : /cloth|dress|skirt/i.test(name) ? 'cloth' : 'unknown';
    return {
      name,
      type,
      extras: material.extras ?? null,
      extensions: material.extensions ?? null,
      textures: Object.fromEntries(Object.entries(refs).filter(([, ref]) => ref).map(([slot, ref]) => {
        const texture = textures[ref.index];
        return [slot, { index: ref.index, name: texture?.name ?? '', source: texture?.source ?? null }];
      })),
    };
  });
  window.__materialDiscovery = rows;
}

function applyMaterialMode(mode) {
  materialMode = mode;
  for (const guest of guests) {
    if (guest.pgrModel) applyPgrMaterialMode(guest.pgrModel, mode);
  }
  if (pgrModel) {
    applyPgrMaterialMode(pgrModel, mode);
    if (mode === 'pgr' && !showShadow) {
      for (const caster of pgrModel.groundShadowCasters) {
        caster.shadow.visible = false;
      }
    }
  } else if (model) {
    model.traverse((object) => {
      if (!object.isMesh || ou(object)) return;
      const source = originalMaterials.get(object);
      if (source) object.material = source;
    });
  }

  syncStageVisibility();
  renderer.shadowMap.needsUpdate = true;

  for (const button of els.materialMode.querySelectorAll('.seg-btn')) {
    button.classList.toggle('is-active', button.dataset.material === mode);
  }
}

function updateKeyLight() {
  if (keyLight) {
    const yaw = THREE.MathUtils.degToRad(lightYaw);
    const pitch = THREE.MathUtils.degToRad(lightPitch);
    const radius = 6;
    keyLight.position.set(
      Math.sin(yaw) * Math.cos(pitch) * radius,
      Math.sin(pitch) * radius + 0.6,
      Math.cos(yaw) * Math.cos(pitch) * radius,
    );
  }
  for (const guest of guests) guest.pgrModel?.light.rotate(lightYaw - 175, lightPitch - 30);
  if (pgrModel) {
    pgrModel.light.rotate(lightYaw - 175, lightPitch - 30);
    if (shadowLights && modelBox) {
      updateShadowLights(shadowLights, pgrModel, modelBox);
    }
    renderer.shadowMap.needsUpdate = true;
  }
}

function onResize() {
  if (!renderer) return;
  const size = viewportSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  if (postProcessor) {
    const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    postProcessor.setSize(drawSize.x, drawSize.y);
  }
  // Resizing clears the drawing buffer; draw again before the browser paints.
  renderFrame();
}

/* ------------------------------------------------------------------ */
/* Model Loading & Dynamic Character Switching                        */
/* ------------------------------------------------------------------ */

let currentModelLoadToken = 0;
let isLoadingModel = false;

function disposeHierarchy(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.dispose?.();
      }
    }
  });
}

function removeAllCharacterModelsFromScene() {
  if (!scene) return;
  const preserved = new Set([
    ambientLight,
    keyLight,
    pgrGrid?.mesh,
    stage?.ground,
    stage?.grid,
    stage?.glow,
    shadowLights?.body,
    shadowLights?.body?.target,
    shadowLights?.head,
    shadowLights?.head?.target,
    // The other characters in the scene.
    ...guests.map((guest) => guest.model),
  ]);

  const toRemove = [];
  for (const child of scene.children) {
    if (!preserved.has(child)) {
      toRemove.push(child);
    }
  }
  for (const obj of toRemove) {
    scene.remove(obj);
    disposeHierarchy(obj);
  }
}

function cleanupCurrentModel() {
  if (editorMode === 'edit') exitEditMode();
  cancelModalTransform();
  detachGizmo();
  selectedObject = null;
  sourceGltf = null;
  selectedObjects.clear();
  soloPart = null;

  if (editSelectionOverlay) {
    editSelectionOverlay.parent?.remove(editSelectionOverlay);
    editSelectionOverlay.geometry?.dispose();
    editSelectionOverlay.material?.dispose();
    editSelectionOverlay = null;
  }
  if (gapDebugGroup) {
    overlayScene?.remove(gapDebugGroup);
    disposeHierarchy(gapDebugGroup);
    gapDebugGroup = null;
  }

  poseHandles?.setRig(null);
  poseRig?.dispose();
  poseRig = null;
  poseEdit = null;
  lastPoseSnapshot = null;
  fingerPanelSide = null;
  activeFingerSlider = null;
  bodyColliders = null;
  bodyPatcher = null;
  pendingPlacement = null;
  discoveredBones = [];
  els.viewport.classList.remove('is-placing');
  bindWorld.clear();
  poseSettleUntil = 0;
  poseCorrectivesState = 'idle';
  history.clear();
  projectDirty = false;

  for (const item of activeKitbashItems) {
    if (item.object) {
      item.object.parent?.remove(item.object);
      disposeHierarchy(item.object);
    }
  }
  activeKitbashItems.length = 0;

  if (mixer) {
    mixer.stopAllAction();
    mixer.removeEventListener('finished', onActionFinished);
    mixer = null;
  }
  currentAction = null;
  currentMeta = null;

  if (skeletonHelper) {
    overlayScene.remove(skeletonHelper);
    skeletonHelper.dispose?.();
    skeletonHelper = null;
  }

  if (model) {
    scene.remove(model);
    disposeHierarchy(model);
    model = null;
  }

  // Remove any remaining orphaned character models or meshes from scene
  removeAllCharacterModelsFromScene();

  pgrModel = null;
  springSystem = null;
  clipCache.clear();
  nodeNames.clear();
  meshNames.clear();
  nodeByIndex.clear();
  bindTransforms.clear();
  parts.length = 0;
  morphParts.length = 0;
  morphOverrides.clear();
}

/* ------------------------------------------------------------------ */
/* Several characters in the scene                                     */
/* ------------------------------------------------------------------ */

/*
 * The editor works on one character at a time: everything above reads and
 * writes the module state of "the" model. Other characters in the scene are
 * guests: their whole state is packed into a slot and stays alive (drawn,
 * animated, hair moving). Making a guest the one being edited swaps the
 * slots, so every tool keeps working unchanged on whoever is active.
 */

/** Characters in the scene that are not being edited right now. */
let guests = [];
let castCounter = 1;
let activeCharacterId = 1;
/** Ids in the order the characters were added, the active one included. */
let castOrder = [];

function captureCharacter() {
  return {
    id: activeCharacterId,
    model, sourceGltf, mixer, skeletonHelper, pgrModel, springSystem, modelSphere, modelBox,
    clips, clipsByName, idleName, entryName, clipCache, nodeNames, meshNames, nodeByIndex, bindTransforms,
    parts, morphParts, morphOverrides, currentAction, currentMeta, paused, bindPoseActive, activeMorphPart,
    poseRig, lastPoseSnapshot, poseSettleUntil, poseCorrectivesState, bodyColliders, bodyPatcher, bindWorld,
    soloPart, characterSockets, discoveredBones, activeKitbashItems, history,
    currentModelBase, currentModelAssetId, currentModelMeta, currentProjectId, projectDirty,
    homePosition, homeTarget,
  };
}

function applyCharacter(slot) {
  activeCharacterId = slot.id;
  model = slot.model; sourceGltf = slot.sourceGltf; mixer = slot.mixer; skeletonHelper = slot.skeletonHelper;
  pgrModel = slot.pgrModel; springSystem = slot.springSystem; modelSphere = slot.modelSphere; modelBox = slot.modelBox;
  clips = slot.clips; clipsByName = slot.clipsByName; idleName = slot.idleName; entryName = slot.entryName;
  clipCache = slot.clipCache; nodeNames = slot.nodeNames; meshNames = slot.meshNames; nodeByIndex = slot.nodeByIndex;
  bindTransforms = slot.bindTransforms; parts = slot.parts; morphParts = slot.morphParts; morphOverrides = slot.morphOverrides;
  currentAction = slot.currentAction; currentMeta = slot.currentMeta; paused = slot.paused; bindPoseActive = slot.bindPoseActive;
  activeMorphPart = slot.activeMorphPart; poseRig = slot.poseRig; lastPoseSnapshot = slot.lastPoseSnapshot;
  poseSettleUntil = slot.poseSettleUntil; poseCorrectivesState = slot.poseCorrectivesState;
  bodyColliders = slot.bodyColliders; bodyPatcher = slot.bodyPatcher; bindWorld = slot.bindWorld;
  soloPart = slot.soloPart; characterSockets = slot.characterSockets; discoveredBones = slot.discoveredBones;
  activeKitbashItems = slot.activeKitbashItems; history = slot.history;
  currentModelBase = slot.currentModelBase; currentModelAssetId = slot.currentModelAssetId;
  currentModelMeta = slot.currentModelMeta; currentProjectId = slot.currentProjectId; projectDirty = slot.projectDirty;
  homePosition = slot.homePosition; homeTarget = slot.homeTarget;
}

/** A slot with nothing loaded yet, for the character about to be added. */
function emptyCharacter() {
  return {
    id: ++castCounter,
    model: null, sourceGltf: null, mixer: null, skeletonHelper: null, pgrModel: null, springSystem: null,
    modelSphere: null, modelBox: null,
    clips: [], clipsByName: new Map(), idleName: 'Stand1', entryName: 'Born', clipCache: new Map(),
    nodeNames: new Map(), meshNames: new Map(), nodeByIndex: new Map(), bindTransforms: new Map(),
    parts: [], morphParts: [], morphOverrides: new Map(), currentAction: null, currentMeta: null,
    paused: false, bindPoseActive: false, activeMorphPart: null,
    poseRig: null, lastPoseSnapshot: null, poseSettleUntil: 0, poseCorrectivesState: 'idle',
    bodyColliders: null, bodyPatcher: null, bindWorld: new Map(),
    soloPart: null, characterSockets: {}, discoveredBones: [], activeKitbashItems: [], history: createCharacterHistory(),
    currentModelBase, currentModelAssetId: null, currentModelMeta: { ...currentModelMeta }, currentProjectId: null,
    projectDirty: false, homePosition: homePosition.clone(), homeTarget: homeTarget.clone(),
  };
}

/** Puts away whatever is half done on the active character before it becomes a guest. */
function leaveActiveCharacter() {
  if (editorMode === 'edit') exitEditMode();
  cancelModalTransform();
  if (pendingPlacement) cancelPlacement();
  closeFingerSlider();
  if (poseEdit) {
    poseRig?.endEdit(poseEdit);
    poseEdit = null;
  }
  detachGizmo();
  selectedObject = null;
  selectedObjects.clear();
  poseHandles?.select(null);
  poseHandles?.setRig(null);
  fingerPanelSide = null;
  if (skeletonHelper) skeletonHelper.visible = false;
}

/** Brings every panel in line with the character that just became active. */
function enterCharacter(slot) {
  applyCharacter(slot);
  if (skeletonHelper) skeletonHelper.visible = Boolean(els.skeleton?.checked);
  poseHandles?.setRig(poseRig);
  poseHandles?.setVisible(activeGizmoMode === 'pose' && Boolean(poseRig));
  refreshModelBounds();

  buildEditUI();
  rebuildColorTargetOptions();
  syncColorControlsFromTarget();
  renderActiveKitbashList();
  renderPatchUI();
  renderBrand();
  if (els.sourceLink && currentModelBase !== 'custom-glb') els.sourceLink.href = `${currentModelBase}manifest.json`;
  els.clipCount.textContent = `${clips.length} klip`;
  renderClipList(els.search?.value || '');
  updatePlayButton();
  updateNowPlaying();
  if (currentAction) updateTimelineUI();
  syncPoseUI();
  syncHistoryUI();
  updateGizmoAttachment();
  updateViewportHint();
  renderer.shadowMap.needsUpdate = true;
  refreshViewerHandle();
  renderCastStrip();
}

/** Bounds, shadow camera and head handle for the active character, without moving the camera. */
function refreshModelBounds() {
  if (!model) return;
  const box = computeVisibleMeshBox(model);
  modelBox = box;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  modelSphere = sphere.radius > 0 ? sphere : null;
  poseRig?.calibrate(box);
  if (shadowLights && pgrModel) updateShadowLights(shadowLights, pgrModel, box);
}

function switchCharacter(slot) {
  const index = guests.indexOf(slot);
  if (index < 0) return;
  if (isLoadingModel) {
    toast('Tunggu sampai model selesai dimuat.', 2400);
    return;
  }
  leaveActiveCharacter();
  const leaving = captureCharacter();
  guests.splice(index, 1, leaving);
  enterCharacter(slot);
  toast(`Sekarang mengedit ${characterName(currentModelMeta)}.`, 1800);
}

/**
 * Loads one more character next to the ones already in the scene and makes
 * it the active one. `load` runs one of the normal loaders.
 */
async function addCharacter(load) {
  if (!model) {
    try {
      await load();
    } catch (err) {
      console.error(err);
      finishLoading();
      toast(`Model gagal dimuat: ${err.message}`, 7000);
    }
    renderCastStrip();
    return;
  }
  if (isLoadingModel) {
    toast('Tunggu sampai model selesai dimuat.', 2400);
    return;
  }
  leaveActiveCharacter();
  const previous = captureCharacter();
  const others = [...guests, previous];
  guests.push(previous);
  applyCharacter(emptyCharacter());
  castOrder.push(activeCharacterId);

  try {
    await load();
  } catch (err) {
    console.error(err);
    finishLoading();
    toast(`Model gagal dimuat: ${err.message}`, 7000);
  }

  if (!model) {
    // Nothing came in: back to the character that was being edited.
    castOrder = castOrder.filter((id) => id !== activeCharacterId);
    guests.splice(guests.indexOf(previous), 1);
    enterCharacter(previous);
    return;
  }
  placeBesideOthers(others);
  frameCast();
  renderCastStrip();
  toast(`${characterName(currentModelMeta)} ditambahkan. Klik karakter mana pun untuk mengeditnya.`, 3600);
}

/** Stands the active character to the right of the others, as seen from the front. */
function placeBesideOthers(others) {
  const around = new THREE.Box3();
  for (const other of others) if (other.model) around.union(computeVisibleMeshBox(other.model));
  if (around.isEmpty()) return;
  const box = computeVisibleMeshBox(model);
  const width = box.max.x - box.min.x;
  // The home camera looks from -Z, so the right of the screen is -X.
  model.position.x += around.min.x - Math.max(0.2, width * 0.25) - box.max.x;
  model.updateMatrixWorld(true);
  // Hair and cloth would otherwise swing across the jump.
  springSystem?.reset();
  refreshModelBounds();
  renderer.shadowMap.needsUpdate = true;
}

/** Frames the camera on everyone in the scene. */
function frameCast() {
  const box = new THREE.Box3();
  if (model) box.union(computeVisibleMeshBox(model));
  for (const guest of guests) if (guest.model) box.union(computeVisibleMeshBox(guest.model));
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  frameCamera(box, sphere.radius > 0 ? sphere : null);
}

/** Takes a character out of the scene for good. */
function removeCharacter(id) {
  if (id === activeCharacterId) {
    if (guests.length === 0) return;
    switchCharacter(guests[guests.length - 1]);
  }
  const slot = guests.find((guest) => guest.id === id);
  if (!slot) return;
  guests.splice(guests.indexOf(slot), 1);
  castOrder = castOrder.filter((other) => other !== id);
  slot.mixer?.stopAllAction();
  if (slot.skeletonHelper) {
    overlayScene.remove(slot.skeletonHelper);
    slot.skeletonHelper.dispose?.();
  }
  slot.poseRig?.dispose();
  if (slot.model) {
    scene.remove(slot.model);
    disposeHierarchy(slot.model);
  }
  renderer.shadowMap.needsUpdate = true;
  renderCastStrip();
  toast(`${characterName(slot.currentModelMeta)} dikeluarkan dari scene.`, 2400);
}

/** Animation, hair physics and shader time for the characters not being edited. */
function tickGuests(delta) {
  let moved = false;
  const now = performance.now();
  for (const guest of guests) {
    if (guest.pgrModel) {
      guest.pgrModel.time.value = elapsedTime;
      for (const { flow, offset } of guest.pgrModel.flows) updateEmissionFlow(flow, elapsedTime, offset.value);
    }
    const playing = Boolean(guest.mixer && guest.currentAction && !guest.paused);
    if (playing) {
      guest.springSystem?.restore();
      guest.poseRig?.detach();
      guest.mixer.update(delta);
      guest.poseRig?.attach();
      moved = true;
    }
    for (const override of guest.morphOverrides.values()) {
      const influences = override.object.morphTargetInfluences;
      if (influences) influences[override.index] = override.value;
    }
    guest.bodyColliders?.sync();
    const settling = now < guest.poseSettleUntil;
    if (guest.springSystem && !guest.bindPoseActive && (playing || settling)) {
      guest.springSystem.step(delta * (playing ? guest.mixer.timeScale : 1));
      moved = true;
    }
  }
  return moved;
}

/** The guest whose body is the first thing under the pointer (raycaster already set), if any. */
function guestUnderPointer() {
  if (guests.length === 0) return null;
  const meshesOf = (list) => list.filter((part) => !part.deleted && part.object.visible).map((part) => part.object);
  const own = meshesOf(parts);
  const theirs = guests.flatMap((guest) => meshesOf(guest.parts));
  const all = [...own, ...theirs];
  refreshPickBounds(all);
  const hit = raycaster.intersectObjects(all, false).find((candidate) => !ou(candidate.object));
  if (!hit) return null;
  return guests.find((guest) => guest.parts.some((part) => part.object === hit.object)) ?? null;
}

function characterName(meta) {
  const generic = !meta?.charName || meta.charName === 'File .glb lokal' || meta.charName === 'Dibuka dari tautan';
  return (generic ? meta?.frame : meta.charName) || 'Karakter';
}

function renderBrand() {
  if (els.brandTitle) {
    els.brandTitle.innerHTML = `${escapeHtml(currentModelMeta.frame || '')}<span class="code">${escapeHtml(currentModelMeta.code || '')}</span>`;
  }
  if (els.brandSub) els.brandSub.textContent = currentModelMeta.charName || 'Construct';
  document.title = `${currentModelMeta.frame || 'Construct Studio'} · Construct Studio`;
}

/** The row of characters at the top of the viewport. */
function renderCastStrip() {
  if (!els.castStrip) return;
  if (model && !castOrder.includes(activeCharacterId)) castOrder.push(activeCharacterId);
  castOrder = castOrder.filter((id) => id === activeCharacterId || guests.some((guest) => guest.id === id));
  els.castStrip.hidden = !model;
  if (!model) return;
  const several = castOrder.length > 1;
  const chips = several
    ? castOrder.map((id) => {
      const active = id === activeCharacterId;
      const meta = active ? currentModelMeta : guests.find((guest) => guest.id === id).currentModelMeta;
      const name = characterName(meta);
      const chip = document.createElement('div');
      chip.className = 'cast-chip';
      chip.classList.toggle('is-active', active);
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'cast-name';
      pick.dataset.cast = String(id);
      pick.textContent = name;
      pick.title = active ? `${name} sedang diedit` : `Edit ${name}`;
      pick.setAttribute('aria-pressed', String(active));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cast-remove';
      remove.dataset.remove = String(id);
      remove.title = `Keluarkan ${name} dari scene`;
      remove.setAttribute('aria-label', remove.title);
      remove.innerHTML = icon('close', 'icon-s');
      chip.append(pick, remove);
      return chip;
    })
    : [];
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'cast-add';
  add.dataset.castAdd = '';
  add.title = 'Tambah karakter lain ke scene';
  add.innerHTML = `<span aria-hidden="true">+</span><span>${several ? '' : 'Tambah karakter'}</span>`;
  if (several) add.setAttribute('aria-label', add.title);
  els.castStrip.replaceChildren(...chips, add);
}

function refreshViewerHandle() {
  if (!window.__viewer) return;
  Object.assign(window.__viewer, {
    model, pgrModel, springSystem, mixer, gltf: sourceGltf, parts, morphParts,
    poseRig, bodyColliders, bodyPatcher, bindWorld, nodeNames, meshNames,
  });
}

function noteProjectHoldsOneCharacter() {
  if (guests.length) toast(`Proyek hanya menyimpan karakter yang sedang diedit (${characterName(currentModelMeta)}).`, 4200);
}


async function boot() {
  initThree();
  addStage();
  applyStage(stageMode);
  buildPaletteUI();
  buildBuiltinPropsUI();
  buildAddMenuUI();
  syncHistoryUI();
  refreshPoseLibraryUI().catch(() => {});
  tick();

  // Check if an autosaved session exists
  loadAutosaveProject()
    .then((saved) => {
      if (!saved || !els.autosaveBanner) return;
      pendingAutosaveProject = saved;
      if (els.autosaveBannerText) {
        els.autosaveBannerText.textContent = `Proyek terakhir ditemukan: ${saved.name || 'Proyek Karakter'}`;
      }
      els.autosaveBanner.hidden = false;
    })
    .catch(() => {});

  setInterval(() => {
    if (projectDirty && model && !isLoadingModel) {
      runAutosave().catch(() => {});
    }
  }, 30000);

  // If user opens root URL without specific clip/base query params, show the Character Catalog Hub first
  // and wait for user to pick a character/model (or close the catalog) so we don't waste bandwidth
  // downloading a 15MB default GLB while character portraits are loading!
  if (OPEN_CATALOG_ON_START) {
    finishLoading();
    await openCatalogModal('switch');
    // Preload cubemaps quietly in the background after portrait images have started
    setTimeout(() => {
      loadCubemapRegistry()
        .then((reg) => {
          cubemapRegistry = reg;
        })
        .catch(() => {});
    }, 1500);
    return;
  }

  // Preload cubemaps once
  try {
    cubemapRegistry = await loadCubemapRegistry();
  } catch (err) {
    console.warn('[PGR cubemaps] Failed to load cubemap registry:', err);
  }

  // A model opened by ?base= link has no catalog entry to take its name from.
  await loadCharacterModel(currentModelBase, params.has('base') ? {} : currentModelMeta, {
    initialClip: REQUESTED_CLIP,
    initialTime: REQUESTED_TIME,
  });
}

function prepareOwnExport(gltf) {
  // The export is turned to face +Z for Blender; this viewer looks at -Z.
  const turned = facingRootIndex(gltf.parser.json);
  if (turned >= 0) {
    const root = gltf.scene.children.length === 1 ? gltf.scene.children[0] : null;
    if (root) root.quaternion.identity();
  }
  // Newer exports rewrote the game data to match the file: keep it, the toon
  // shading, outlines and hair physics come back with it.
  const remapped = isRemapped(gltf.parser.json);
  dropStaleExtras(gltf.parser.json);
  const drop = (userData, keys) => {
    for (const key of keys) delete userData?.[key];
  };
  for (const root of gltf.scenes ?? [gltf.scene]) {
    if (!remapped) drop(root.userData, STALE_NODE_KEYS);
    root.traverse((object) => {
      if (object !== root) drop(object.userData, STALE_NODE_KEYS);
      if (remapped) return;
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) drop(material.userData, STALE_MATERIAL_KEYS);
    });
  }
}

async function loadCharacterFromGlbBuffer(buffer, name = 'Custom Model', assetId = null) {
  const token = ++currentModelLoadToken;
  isLoadingModel = true;
  if (projectDirty && model) await runAutosave().catch(() => {});

  const storedId = assetId || (await saveBinaryAsset(null, buffer, `${name}.glb`));
  currentModelBase = 'custom-glb';
  currentModelAssetId = storedId;
  currentModelMeta = {
    charName: 'File .glb lokal',
    frame: name.replace(/\.(glb|gltf)$/i, ''),
    code: 'GLB',
  };

  setLoading(20, `Memuat ${currentModelMeta.frame}`, 'membaca file glb');
  cleanupCurrentModel();
  syncPoseUI();
  currentModelAssetId = storedId;

  try {
    if (cubemapRegistry.size === 0) {
      try {
        cubemapRegistry = await loadCubemapRegistry();
      } catch {}
    }
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    if (token !== currentModelLoadToken) return;
    // A file exported from here (older versions kept the game's shader and
    // physics notes) opens as a plain model: those notes point at textures
    // and bones by their index in the game's file, not in this one.
    if (isOwnExport(gltf.parser.json)) prepareOwnExport(gltf);

    clips = (gltf.animations || []).map((clip, index) => ({
      index,
      name: clip.name || `Clip ${index + 1}`,
      duration: clip.duration || 0,
      frameRate: 30,
      loop: true,
      _directClip: clip,
    }));
    clipsByName = new Map(clips.map((c) => [c.name, c]));
    for (const c of clips) clipCache.set(c.name, c._directClip);

    renderBrand();
    els.clipCount.textContent = `${clips.length} klip`;
    renderClipList('');

    await setupModel(gltf, {});
    if (token !== currentModelLoadToken) return;
    currentModelAssetId = storedId;
    if (clips.length > 0) await playClipByName(clips[0].name, { fade: 0 });
    updateModelBoundsAndCamera();
    if (postProcessor) await postProcessor.compile(scene, camera);
    setLoading(100, 'Siap', currentModelMeta.frame);
    finishLoading();
  } finally {
    if (token === currentModelLoadToken) isLoadingModel = false;
  }
}

async function loadCharacterModel(baseUrl, metaInfo = {}, { initialClip = null, initialTime = null } = {}) {
  if (projectDirty && model) await runAutosave().catch(() => {});
  const token = ++currentModelLoadToken;
  isLoadingModel = true;

  const normalizedBase = withSlash(baseUrl);
  currentModelBase = normalizedBase;
  currentModelAssetId = null;
  const fallbackCode = extractModelCode(normalizedBase);
  currentModelMeta = {
    charName: metaInfo.charName || 'Dibuka dari tautan',
    frame: metaInfo.frame || metaInfo.name || fallbackCode,
    code: metaInfo.code || (metaInfo.frame || metaInfo.name ? fallbackCode : ''),
  };

  const loadingTitle = `Memuat ${currentModelMeta.frame}`;
  setLoading(6, loadingTitle, 'membaca manifest');

  cleanupCurrentModel();
  syncPoseUI();

  try {
    const manifest = await fetchJSON(`${normalizedBase}manifest.json`);
    if (token !== currentModelLoadToken) return;

    clips = (manifest.clips || [])
      .map((clip, index) => ({
        index,
        name: clip.name,
        file: clip.file,
        duration: Number(clip.duration) || 0,
        frameRate: Number(clip.frameRate) || 30,
        loop: clip.loop !== false,
      }))
      .filter((clip) => clip.name && clip.file);

    clipsByName = new Map(clips.map((clip) => [clip.name, clip]));

    idleName = manifest.contexts?.fight?.idle?.state || manifest.contexts?.menu?.idle?.state || 'Stand1';
    entryName = manifest.contexts?.fight?.entry?.state || 'Born';
    if (clips.length > 0 && !clipsByName.has(idleName)) idleName = clips[0].name;

    // Top bar and inspector headers
    renderBrand();
    els.clipCount.textContent = `${clips.length} klip`;
    if (els.sourceLink) els.sourceLink.href = `${normalizedBase}manifest.json`;
    renderClipList(els.search?.value || '');

    setLoading(16, loadingTitle, manifest.model || 'base.glb');
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        `${normalizedBase}${manifest.model || 'base.glb'}`,
        resolve,
        (event) => {
          if (token !== currentModelLoadToken) return;
          if (!event.total) {
            const loadedMb = event.loaded / 1048576;
            setLoading(16 + Math.min(70, loadedMb * 4), loadingTitle, `${loadedMb.toFixed(1)} MB`);
            return;
          }
          const ratio = event.loaded / event.total;
          setLoading(16 + ratio * 74, loadingTitle, `${(event.loaded / 1048576).toFixed(1)} / ${(event.total / 1048576).toFixed(1)} MB`);
        },
        reject,
      );
    });

    if (token !== currentModelLoadToken) return;

    logMaterialDiscovery(gltf);

    setLoading(93, 'Menyiapkan karakter', 'mengompilasi shader dan rangka');
    cleanupCurrentModel();
    await setupModel(gltf, manifest);

    if (token !== currentModelLoadToken) return;

    if (clips.length > 0) {
      const clipToPlay = initialClip && clipsByName.has(initialClip) ? initialClip : idleName;
      await playClipByName(clipToPlay, { fade: 0 });

      if (initialTime !== null && Number.isFinite(initialTime) && currentAction && mixer) {
        const duration = currentAction.getClip().duration || 0;
        currentAction.time = Math.max(0, Math.min(initialTime, duration > 0 ? duration - 1e-4 : initialTime));
        currentAction.paused = true;
        paused = true;
        advanceMixer(0);
        if (springSystem) {
          springSystem.reset();
          springSystem.step(0);
        }
        updatePlayButton();
        updateTimelineUI();
      }
    }

    updateModelBoundsAndCamera();

    if (postProcessor) {
      await postProcessor.compile(scene, camera);
    }

    setLoading(100, 'Siap', currentModelMeta.code || currentModelMeta.frame);
    finishLoading();
    if (activeGizmoMode === 'pose') ensurePoseCorrectives();
  } finally {
    if (token === currentModelLoadToken) {
      isLoadingModel = false;
    }
  }
}

function extractModelCode(baseUrl) {
  const partsArr = baseUrl.split('/').filter(Boolean);
  const last = partsArr[partsArr.length - 1] || 'MODEL';
  return last.toUpperCase();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function setupModel(gltf, manifest) {
  model = gltf.scene;
  sourceGltf = gltf;
  buildNodeMaps(gltf);

  const hidden = new Set(manifest.contexts?.fight?.hiddenNodes ?? []);

  model.traverse((object) => {
    if (!object.isMesh) return;
    originalMaterials.set(object, object.material);
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const texture of [material.map, material.emissiveMap]) {
        if (texture) texture.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });

  for (const [index, object] of nodeByIndex) {
    if (!object.isMesh) continue;
    const label = partLabel(object);
    parts.push({
      index,
      object,
      label,
      customName: null,
      defaultVisible: !hidden.has(index),
      deleted: false,
      rewriteOnHide: defaultPartRewriteOnHide(label),
    });
  }
  parts.sort((a, b) => a.index - b.index);
  for (const part of parts) part.object.visible = part.defaultVisible;

  for (const part of parts) {
    const influences = part.object.morphTargetInfluences;
    if (!influences || influences.length === 0) continue;
    const dictionary = part.object.morphTargetDictionary;
    const nameByIndex = new Map();
    if (dictionary) {
      for (const [name, targetIndex] of Object.entries(dictionary)) {
        nameByIndex.set(targetIndex, name);
      }
    }
    const targets = Array.from({ length: influences.length }, (_, index) => ({
      index,
      name: nameByIndex.get(index) ?? `morph${String(index + 1).padStart(2, '0')}`,
    }));
    morphParts.push({ ...part, targets });
  }
  morphParts.sort((a, b) => a.index - b.index);

  for (const object of nodeByIndex.values()) {
    bindTransforms.set(object, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    });
  }

  if (cubemapRegistry.size === 0) {
    try {
      cubemapRegistry = await loadCubemapRegistry();
    } catch (err) {
      console.warn('[PGR cubemaps] Failed to load cubemap registry:', err);
    }
  }

  pgrModel = await compilePgrModel(gltf, {
    cubemaps: cubemapRegistry,
    lighting: DEFAULT_PGR_LIGHTING,
  });

  springSystem = pgrModel.springs
    ? createSpringBoneSystem(pgrModel.nodes, pgrModel.springs)
    : null;

  // Hair, skirt and ribbon bones belong to the physics, not to the pose rig.
  const physicsBones = new Set();
  for (const chain of springSystem?.chains ?? []) {
    for (const particle of chain.particles) {
      if (particle.bone) physicsBones.add(particle.bone);
    }
  }
  poseRig = createPoseRig(model, { exclude: physicsBones });

  // The model is still in its bind pose here: the reference for everything
  // that has to be measured on the undeformed body.
  model.updateMatrixWorld(true);
  for (const object of nodeByIndex.values()) bindWorld.set(object, object.matrixWorld.clone());
  bodyColliders = createBodyColliders({
    rig: poseRig,
    meshes: parts.map((part) => part.object),
    springSystem,
    physicsBones,
  });
  if (bodyColliders) {
    bodyColliders.enabled = els.poseCollide.checked;
    poseRig.addLayer(bodyColliders.layer);
  }
  // The capsules already measured how thick each limb is under its clothes.
  const limbRadius = new Map((bodyColliders?.colliders ?? []).map((collider) => [collider.node, collider.row.radius]));
  bodyPatcher = createBodyPatcher({
    rig: poseRig,
    parts,
    bindWorld,
    physicsBones,
    pgrModel,
    radiusOf: (bone) => limbRadius.get(bone) ?? 0,
  });
  bodyPatcher?.setThickness(Number(els.patchThickness.value));
  bodyPatcher?.setMode(patchMode());
  bodyPatcher?.setFillStyle(patchFillStyle(), els.patchBaselayerColor?.value || '#252730');
  if (poseRig) {
    poseRig.pins.feet = els.posePinFeet.checked;
    poseRig.pins.hands = els.posePinHands.checked;
    poseRig.correctives.enabled = els.poseCorrectives.checked;
    poseRig.onChange(onPoseChanged);
    lastPoseSnapshot = poseRig.snapshotRaw();
  }
  poseHandles.setRig(poseRig);
  poseHandles.setVisible(activeGizmoMode === 'pose' && Boolean(poseRig));
  syncPoseUI();
  updateViewportHint();

  // Snapshot initial PGR material states for all parts so color/shader reset works cleanly
  for (const part of parts) {
    snapshotMeshMaterialState(part.object);
  }

  const discovered = findCharacterSockets(model);
  characterSockets = discovered.sockets;
  discoveredBones = discovered.allBones;

  buildEditUI();
  rebuildColorTargetOptions();
  syncColorControlsFromTarget();
  renderActiveKitbashList();

  removeAllCharacterModelsFromScene();
  scene.add(model);
  applyMaterialMode(materialMode);

  skeletonHelper = new THREE.SkeletonHelper(model);
  skeletonHelper.visible = Boolean(els.skeleton?.checked);
  skeletonHelper.renderOrder = 6;
  skeletonHelper.material.transparent = true;
  skeletonHelper.material.opacity = 0.7;
  skeletonHelper.material.depthTest = false;
  skeletonHelper.material.color.set(0xe8a23d);
  overlayScene.add(skeletonHelper);

  mixer = new THREE.AnimationMixer(model);
  mixer.addEventListener('finished', onActionFinished);

  applyStage(stageMode);
  updateKeyLight();

  renderCastStrip();

  window.__viewer = {
    switchCharacter: (index) => switchCharacter(guests[index]),
    get guests() {
      return guests;
    },
    THREE,
    scene,
    camera,
    controls,
    model,
    pgrModel,
    springSystem,
    postProcessor,
    shadowLights,
    mixer,
    gltf,
    manifest,
    parts,
    morphParts,
    nodeNames,
    meshNames,
    poseRig,
    poseHandles,
    bodyColliders,
    bodyPatcher,
    bindWorld,
    playClipByName,
    applyStage,
    applyMaterialMode,
    enterBindPose,
    loadCharacterModel,
    setGizmoMode,
    selectPoseHandle,
  };
}

function isObjectVisibleInHierarchy(object) {
  for (let cur = object; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

function computeVisibleMeshBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((object) => {
    if (!object.isMesh || ou(object) || !isObjectVisibleInHierarchy(object)) return;
    let meshBox;
    if (object.isSkinnedMesh && object.skeleton) {
      object.skeleton.update();
      object.computeBoundingBox();
      meshBox = object.boundingBox.clone();
    } else {
      object.geometry.computeBoundingBox();
      meshBox = object.geometry.boundingBox.clone();
    }
    meshBox.applyMatrix4(object.matrixWorld);
    box.union(meshBox);
  });
  if (!box.isEmpty()) return box;
  return computeRigBox(root) ?? new THREE.Box3().setFromObject(root);
}

function computeRigBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  root.traverse((object) => {
    if (object.isBone) box.expandByPoint(object.getWorldPosition(point));
  });
  if (box.isEmpty()) return null;
  box.expandByVector(new THREE.Vector3(0.08, 0.05, 0.08));
  return box;
}

function updateModelBoundsAndCamera() {
  if (!model) return;
  const box = computeVisibleMeshBox(model);
  modelBox = box;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  modelSphere = sphere.radius > 0 ? sphere : null;

  const size = box.getSize(new THREE.Vector3());
  resizeStage(size);
  frameCamera(box, modelSphere);
  poseRig?.calibrate(box);

  if (shadowLights && pgrModel) {
    updateShadowLights(shadowLights, pgrModel, box);
    renderer.shadowMap.needsUpdate = true;
  }
}

function partLabel(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  let name = materials.find(Boolean)?.name || object.userData.originalName || object.name || '';
  // "R3KurumiMd010011Body" → "Body": drop the model code, then the owner prefix.
  name = name.replace(/Md\d+alpha/gi, ' Alpha ').replace(/Md\d+/gi, ' ').replace(/VC$/i, '');
  const withoutOwner = name.replace(/^[A-Z]\d[A-Za-z]+[\s_]+/, '');
  if (withoutOwner.trim()) name = withoutOwner;
  name = name.replace(/_/g, ' ');
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
  name = name.replace(/\s+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : `Bagian ${object.id}`;
}

function buildNodeMaps(gltf) {
  // First save all original names for bone retargeting & socket lookup
  gltf.scene.traverse((obj) => {
    if (!obj.userData.originalName) obj.userData.originalName = obj.name;
  });

  const groups = new Map();

  for (const [object, association] of gltf.parser.associations) {
    const index = association?.nodes;
    if (typeof index !== 'number') continue;
    let group = groups.get(index);
    if (!group) {
      group = { primary: object, meshes: [] };
      groups.set(index, group);
    }
    if (object.isMesh && !group.meshes.includes(object)) group.meshes.push(object);
  }

  for (const [index, group] of groups) {
    const nodeName = `n${index}`;
    group.primary.userData.originalName = group.primary.name;
    group.primary.name = nodeName;
    nodeNames.set(index, nodeName);
    nodeByIndex.set(index, group.primary);

    let mesh = group.primary.isMesh ? group.primary : group.meshes[0];
    if (!mesh) mesh = findMeshChild(group.primary);
    if (mesh && mesh !== group.primary) {
      mesh.name = `m${index}`;
      meshNames.set(index, mesh.name);
    } else if (mesh) {
      meshNames.set(index, nodeName);
    }

    for (const extra of group.meshes) {
      if (extra === group.primary || extra === mesh) continue;
      extra.name = `x${index}_${group.meshes.indexOf(extra)}`;
    }
  }
}

function findMeshChild(object) {
  let found = null;
  object.traverse((child) => {
    if (!found && child.isMesh) found = child;
  });
  return found;
}

function resizeStage(size) {
  if (!stage) return;
  const radius = Math.max(2.4, Math.max(size.x, size.z) * 1.4);
  stage.glow.scale.setScalar(radius / 1.55);
}

function frameCamera(box, sphere) {
  if (sphere && sphere.radius > 0) {
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const vFov = 2 * Math.atan(halfFov);
    const hFov = 2 * Math.atan(halfFov * camera.aspect);
    const fitDist = Math.max(
      sphere.radius / Math.sin(vFov / 2),
      sphere.radius / Math.sin(hFov / 2),
    );

    homeTarget = sphere.center.clone();
    homePosition = sphere.center
      .clone()
      .add(new THREE.Vector3(0, sphere.radius * 0.25, -fitDist * 1.1));

    camera.position.copy(homePosition);
    camera.near = 0.01;
    camera.far = 10000;
    camera.updateProjectionMatrix();
    controls.target.copy(homeTarget);
    controls.minDistance = Math.max(sphere.radius * 0.05, fitDist * 0.05);
    controls.maxDistance = fitDist * 2.5;
    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.8);
  const target = new THREE.Vector3(center.x, box.min.y + height * 0.5, center.z);
  const distance = (height * 0.5) / Math.tan((camera.fov * Math.PI) / 360) / 0.57;

  homeTarget = target.clone();
  homePosition = new THREE.Vector3(
    REQUESTED_CAM === 'front' ? target.x : target.x + distance * 0.18,
    target.y + height * 0.06,
    target.z - distance * 0.97,
  );

  camera.position.copy(homePosition);
  camera.near = 0.01;
  camera.far = 10000;
  camera.updateProjectionMatrix();
  controls.target.copy(homeTarget);
  controls.minDistance = distance * 0.32;
  controls.maxDistance = distance * 2.3;
  controls.update();
}

/* ------------------------------------------------------------------ */
/* Outliner, Selection, Gizmo & Transform Controls                    */
/* ------------------------------------------------------------------ */

function partDisplayName(part) {
  return part.customName || part.label;
}

function syncHistoryUI() {
  const canU = history.canUndo();
  const canR = history.canRedo();
  const uLabel = history.peekUndoLabel();
  const rLabel = history.peekRedoLabel();
  if (els.globalUndo) {
    els.globalUndo.disabled = !canU;
    els.globalUndo.title = uLabel ? `Urungkan: ${uLabel} (Ctrl+Z)` : 'Urungkan (Ctrl+Z)';
  }
  if (els.globalRedo) {
    els.globalRedo.disabled = !canR;
    els.globalRedo.title = rLabel ? `Ulangi: ${rLabel} (Ctrl+Shift+Z)` : 'Ulangi (Ctrl+Shift+Z)';
  }
  if (els.poseUndo) {
    els.poseUndo.disabled = !canU;
    els.poseUndo.title = uLabel ? `Urungkan: ${uLabel} (Ctrl+Z)` : 'Urungkan (Ctrl+Z)';
  }
  if (els.poseRedo) {
    els.poseRedo.disabled = !canR;
    els.poseRedo.title = rLabel ? `Ulangi: ${rLabel} (Ctrl+Shift+Z)` : 'Ulangi (Ctrl+Shift+Z)';
  }
}

function getSelectedTargets() {
  if (selectedObjects.size > 0) return [...selectedObjects];
  return selectedObject ? [selectedObject] : [];
}

function setEditorMode(mode) {
  if (mode === editorMode) return;
  if (mode === 'edit') {
    const ok = enterEditMode();
    if (!ok) return;
  } else {
    if (editorMode === 'edit') exitEditMode();
    editorMode = mode;
    if (mode === 'pose') {
      if (activeGizmoMode !== 'pose') setGizmoMode('pose');
    } else if (activeGizmoMode === 'pose') {
      setGizmoMode('none');
    }
  }
  syncEditorModeUI();
}

function syncEditorModeUI() {
  if (!els.editorModeSwitch) return;
  for (const btn of els.editorModeSwitch.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('is-active', btn.dataset.editorMode === editorMode);
  }
  if (els.editmodeBar) els.editmodeBar.hidden = editorMode !== 'edit';
}

function startInlineRename(labelEl, currentName, onCommit) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'row-rename-input';
  input.value = currentName;
  labelEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (commit && next && next !== currentName) {
      onCommit(next);
    } else {
      buildPartsOutliner();
      renderExtraOutliner();
      renderActiveKitbashList();
    }
  };
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function buildPartsOutliner() {
  if (!els.partsList) return;
  els.partsList.replaceChildren();
  for (const part of parts) {
    if (part.deleted) continue;
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.partIndex = String(part.index);

    const eyeBtn = document.createElement('button');
    eyeBtn.type = 'button';
    eyeBtn.className = 'row-btn';
    eyeBtn.addEventListener('click', () => {
      const prev = part.object.visible;
      const next = !prev;
      history.execute({
        label: `${next ? 'Tampilkan' : 'Sembunyikan'} ${partDisplayName(part)}`,
        undo: () => applyPartVisibility(part, prev),
        redo: () => applyPartVisibility(part, next),
      });
    });

    const rewriteBtn = document.createElement('button');
    rewriteBtn.type = 'button';
    rewriteBtn.className = 'row-btn';
    rewriteBtn.innerHTML = icon('skin');
    rewriteBtn.addEventListener('click', () => {
      const prev = part.rewriteOnHide !== false;
      const next = !prev;
      history.execute({
        label: `${next ? 'Timpa kulit' : 'Kosongkan'} ${partDisplayName(part)}`,
        undo: () => applyPartRewriteFlag(part, prev),
        redo: () => applyPartRewriteFlag(part, next),
      });
    });

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'row-label';
    name.textContent = partDisplayName(part);
    name.title = `Klik pilih · Shift/Ctrl+klik pilih banyak · Klik ganda rename`;
    name.addEventListener('click', (ev) => {
      selectObjectForEditing(part.object, partDisplayName(part), {
        additive: ev.shiftKey || ev.ctrlKey || ev.metaKey,
      });
    });
    name.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      startInlineRename(name, partDisplayName(part), (nextName) => {
        const prevName = part.customName;
        history.execute({
          label: `Rename ${partDisplayName(part)}`,
          undo: () => {
            part.customName = prevName;
            buildPartsOutliner();
            rebuildColorTargetOptions();
          },
          redo: () => {
            part.customName = nextName;
            buildPartsOutliner();
            rebuildColorTargetOptions();
          },
        });
      });
    });

    const soloBtn = document.createElement('button');
    soloBtn.type = 'button';
    soloBtn.className = 'row-btn';
    soloBtn.textContent = 'S';
    soloBtn.title = 'Solo: tampilkan hanya bagian ini (/)';
    soloBtn.setAttribute('aria-label', `Solo ${partDisplayName(part)}`);
    soloBtn.addEventListener('click', () => toggleSoloPart(part));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'row-btn is-danger';
    delBtn.innerHTML = icon('trash');
    delBtn.title = `Hapus ${partDisplayName(part)} (X)`;
    delBtn.setAttribute('aria-label', `Hapus ${partDisplayName(part)}`);
    delBtn.addEventListener('click', () => deleteObjectsWithHistory([part.object]));

    row.append(eyeBtn, rewriteBtn, name, soloBtn, delBtn);
    els.partsList.appendChild(row);
    part.eyeBtn = eyeBtn;
    part.rewriteBtn = rewriteBtn;
    part.rowEl = row;
    part.soloBtn = soloBtn;
  }
  syncPartsAll();
  renderDeletedPartsUI();
  updateOutlinerHighlights();
}

function applyPartVisibility(part, visible) {
  part.object.visible = visible;
  if (soloPart) {
    soloPart = null;
    if (els.partsUnsolo) els.partsUnsolo.hidden = true;
  }
  syncPartsAll();
  updateOutlinerHighlights();
  renderer.shadowMap.needsUpdate = true;
}

function applyPartRewriteFlag(part, enabled) {
  part.rewriteOnHide = Boolean(enabled);
  bodyPatcher?.setPartRewrite(part, part.rewriteOnHide);
  syncPartsAll();
}

function renderDeletedPartsUI() {
  if (!els.deletedPartsGroup || !els.deletedPartsList) return;
  const deleted = parts.filter((p) => p.deleted);
  els.deletedPartsGroup.hidden = deleted.length === 0;
  if (els.deletedPartsCount) els.deletedPartsCount.textContent = String(deleted.length);
  els.deletedPartsList.replaceChildren();
  for (const part of deleted) {
    const row = document.createElement('div');
    row.className = 'row is-off';
    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = partDisplayName(part);
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn btn-s';
    restoreBtn.textContent = 'Pulihkan';
    restoreBtn.addEventListener('click', () => restoreDeletedPartsWithHistory([part]));
    row.append(label, restoreBtn);
    els.deletedPartsList.appendChild(row);
  }
}

function renderExtraOutliner() {
  if (!els.outlinerExtraWrap || !els.outlinerExtraList) return;
  els.outlinerExtraWrap.hidden = activeKitbashItems.length === 0;
  els.outlinerExtraList.replaceChildren();
  activeKitbashItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.kbIndex = String(index);
    if (!item.object.visible) row.classList.add('is-off');
    if (selectedObjects.has(item.object) || selectedObject === item.object) row.classList.add('is-selected');

    const eyeBtn = document.createElement('button');
    eyeBtn.type = 'button';
    eyeBtn.className = 'row-btn';
    eyeBtn.innerHTML = icon(item.object.visible ? 'eye' : 'eye-off');
    eyeBtn.title = item.object.visible ? 'Sembunyikan (H)' : 'Tampilkan';
    eyeBtn.addEventListener('click', () => {
      const prev = item.object.visible;
      const next = !prev;
      history.execute({
        label: `${next ? 'Tampilkan' : 'Sembunyikan'} ${item.name}`,
        undo: () => {
          item.object.visible = prev;
          renderExtraOutliner();
          renderActiveKitbashList();
          renderer.shadowMap.needsUpdate = true;
        },
        redo: () => {
          item.object.visible = next;
          renderExtraOutliner();
          renderActiveKitbashList();
          renderer.shadowMap.needsUpdate = true;
        },
      });
    });

    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'row-label';
    nameBtn.textContent = item.name;
    nameBtn.title = 'Klik pilih · Klik ganda rename';
    nameBtn.addEventListener('click', (ev) => {
      selectObjectForEditing(item.object, item.name, {
        additive: ev.shiftKey || ev.ctrlKey || ev.metaKey,
      });
    });
    nameBtn.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      startInlineRename(nameBtn, item.name, (nextName) => {
        const prevName = item.name;
        history.execute({
          label: `Rename ${prevName}`,
          undo: () => {
            item.name = prevName;
            item.object.userData.kitbashName = prevName;
            renderExtraOutliner();
            renderActiveKitbashList();
            rebuildColorTargetOptions();
          },
          redo: () => {
            item.name = nextName;
            item.object.userData.kitbashName = nextName;
            renderExtraOutliner();
            renderActiveKitbashList();
            rebuildColorTargetOptions();
          },
        });
      });
    });

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'row-btn';
    dupBtn.innerHTML = icon('copy');
    dupBtn.title = 'Duplikat (Shift+D)';
    dupBtn.addEventListener('click', () => duplicateObjectsWithHistory([item.object]));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'row-btn is-danger';
    delBtn.innerHTML = icon('trash');
    delBtn.title = 'Hapus (X)';
    delBtn.addEventListener('click', () => deleteObjectsWithHistory([item.object]));

    row.append(eyeBtn, nameBtn, dupBtn, delBtn);
    els.outlinerExtraList.appendChild(row);
  });
}

function buildEditUI() {
  buildPartsOutliner();
  renderExtraOutliner();

  els.morphMesh.replaceChildren();
  for (const morph of morphParts) {
    const option = document.createElement('option');
    option.value = String(morph.index);
    option.textContent = `${morph.label} (${morph.targets.length})`;
    els.morphMesh.appendChild(option);
  }
  els.morphMesh.hidden = morphParts.length === 0;
  const initialMorph = morphParts.find((part) => part.label === 'Face') ?? morphParts[0];
  if (initialMorph) {
    els.morphMesh.value = String(initialMorph.index);
    showMorphPart(initialMorph);
  } else {
    activeMorphPart = null;
    els.morphList.innerHTML = '<div class="empty-state">Model ini tidak punya ekspresi wajah.</div>';
  }

  els.modelScale.value = '1';
  els.modelScaleVal.textContent = '1.00×';
  els.modelRotate.value = '0';
  els.modelRotateVal.textContent = '0°';
  els.lightYaw.value = String(lightYaw);
  els.lightYawVal.textContent = `${lightYaw}°`;
  els.lightPitch.value = String(lightPitch);
  els.lightPitchVal.textContent = `${lightPitch}°`;
  els.toggleGrid.checked = showGrid;
  els.toggleShadow.checked = showShadow;
  syncTransformSlidersFromSelected();
}

function toggleSoloPart(part) {
  if (!part && soloPart) {
    // Un-solo back
    part = soloPart;
  }
  if (!part) return;
  if (soloPart === part) {
    soloPart = null;
    for (const p of parts) {
      if (!p.deleted) p.object.visible = p._preSoloVisible ?? p.defaultVisible;
    }
    if (els.partsUnsolo) els.partsUnsolo.hidden = true;
  } else {
    if (!soloPart) {
      for (const p of parts) p._preSoloVisible = p.object.visible;
    }
    soloPart = part;
    for (const p of parts) p.object.visible = p === part && !p.deleted;
    if (els.partsUnsolo) els.partsUnsolo.hidden = false;
  }
  syncPartsAll();
  updateOutlinerHighlights();
  renderer.shadowMap.needsUpdate = true;
}

function selectObjectForEditing(object, label = '', { additive = false } = {}) {
  if (additive && object) {
    if (selectedObjects.has(object)) {
      selectedObjects.delete(object);
      if (selectedObject === object) {
        selectedObject = [...selectedObjects].pop() ?? null;
      }
    } else {
      selectedObjects.add(object);
      selectedObject = object;
    }
  } else {
    selectedObjects.clear();
    if (object) selectedObjects.add(object);
    selectedObject = object;
  }

  const active = selectedObject;
  const count = selectedObjects.size;
  const displayLabel = active
    ? count > 1
      ? `${count} bagian dipilih`
      : label || active.userData?.kitbashName || partLabel(active)
    : 'Model utama';

  if (els.transformTargetName) {
    els.transformTargetName.textContent = active ? displayLabel : 'Model utama';
  }
  if (els.vpSelectedLabel) {
    els.vpSelectedLabel.textContent = active ? displayLabel : '';
  }

  if (els.colorTargetSelect && active) {
    const partMatch = parts.find((p) => p.object === active);
    if (partMatch) {
      els.colorTargetSelect.value = `part:${partMatch.index}`;
      syncColorControlsFromTarget();
    } else {
      const kbIdx = activeKitbashItems.findIndex((item) => item.object === active);
      if (kbIdx !== -1) {
        els.colorTargetSelect.value = `kb:${kbIdx}`;
        syncColorControlsFromTarget();
      }
    }
  }

  updateOutlinerHighlights();
  syncTransformSlidersFromSelected();
  updateGizmoAttachment();
  updateViewportHint();
}

function updateOutlinerHighlights() {
  for (const part of parts) {
    if (!part.rowEl) continue;
    const isSel = selectedObjects.has(part.object) || selectedObject === part.object;
    part.rowEl.classList.toggle('is-selected', isSel);
    if (part.soloBtn) part.soloBtn.classList.toggle('is-on', soloPart === part);
  }
  for (const listEl of [els.activeKitbashList, els.outlinerExtraList]) {
    if (!listEl) continue;
    for (const row of listEl.querySelectorAll('.row')) {
      const idx = Number(row.dataset.kbIndex);
      const item = activeKitbashItems[idx];
      const isSelected = Boolean(item && (selectedObjects.has(item.object) || selectedObject === item.object));
      row.classList.toggle('is-selected', isSelected);
    }
  }
}

function setGizmoMode(mode, { fromTab = false } = {}) {
  if (editorMode === 'edit' && mode !== 'none') exitEditMode();
  const wasPose = activeGizmoMode === 'pose';
  const isPose = mode === 'pose';
  activeGizmoMode = mode;
  editorMode = isPose ? 'pose' : editorMode === 'edit' ? 'edit' : 'object';
  syncEditorModeUI();

  for (const btn of els.viewportToolbar.querySelectorAll('.tool-btn[data-gizmo]')) {
    const active = btn.dataset.gizmo === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }

  poseHandles?.setVisible(isPose && Boolean(poseRig));
  if (wasPose && !isPose) poseHandles?.select(null);
  if (isPose) {
    if (!fromTab && activeTab !== 'pose') switchTab('pose', { fromTool: true });
    ensurePoseCorrectives();
  }

  updateGizmoAttachment();
  syncPoseUI();
  updateViewportHint();
}

function updateGizmoAttachment() {
  if (!transformControls || !transformHelper) return;

  if (activeGizmoMode === 'pose') {
    const handle = poseRig && poseHandles?.selectedId ? poseRig.handle(poseHandles.selectedId) : null;
    // Fingers are set by dragging their tip or by the sliders: rotation rings
    // around a knuckle would bury the hand and let a finger twist out of shape.
    if (!handle || handle.kind === 'finger') {
      detachGizmo();
      return;
    }
    // Rotation rings around the selected joint, on the bone's own axes.
    transformControls.setMode('rotate');
    transformControls.setSpace('local');
    transformControls.setSize(0.5);
    transformControls.attach(handle.gizmo);
    transformHelper.visible = true;
    return;
  }

  if (activeGizmoMode === 'none') {
    detachGizmo();
    return;
  }
  const target = selectedObject || model;
  if (!target) {
    detachGizmo();
    return;
  }
  transformControls.setSpace('world');
  transformControls.setSize(0.75);
  transformControls.setMode(activeGizmoMode);
  transformControls.attach(target);
  transformHelper.visible = true;
}

/* ------------------------------------------------------------------ */
/* Pose mode                                                          */
/* ------------------------------------------------------------------ */

/** Runs the mixer with the pose layer taken off, so it only ever sees its own values. */
function advanceMixer(delta) {
  if (!mixer) return;
  poseRig?.detach();
  mixer.update(delta);
  poseRig?.attach();
}

/** Posing works on a still frame; the offsets keep applying once playback resumes. */
let pauseHintShown = false;

function pauseForPosing() {
  if (!currentAction || paused) return;
  paused = true;
  currentAction.paused = true;
  updatePlayButton();
  if (!pauseHintShown) {
    pauseHintShown = true;
    toast('Animasi dijeda. Tekan Spasi untuk memutarnya lagi, pose tetap terpasang.', 5200);
  }
}

function selectPoseHandle(id) {
  if (!poseHandles) return;
  poseHandles.select(id);
  updateGizmoAttachment();
  syncPoseUI();
  updateViewportHint();
}

function restorePoseSnap(snap) {
  if (!poseRig || !snap) return;
  poseRig.restoreRaw(snap);
  lastPoseSnapshot = poseRig.snapshotRaw();
  syncPoseUI();
}

function onGizmoDragChanged(dragging) {
  if (activeGizmoMode === 'pose') {
    if (!poseRig) return;
    if (dragging) {
      const bone = transformControls.object;
      if (!bone) return;
      pauseForPosing();
      poseEdit = poseRig.beginEdit(bone);
    } else if (poseEdit) {
      poseRig.endEdit(poseEdit);
      poseEdit = null;
    }
    return;
  }

  const target = transformControls?.object;
  if (!target) return;
  if (dragging) {
    objectGizmoStart = {
      target,
      pos: target.position.clone(),
      quat: target.quaternion.clone(),
      scale: target.scale.clone(),
    };
  } else if (objectGizmoStart && objectGizmoStart.target === target) {
    const { pos: p0, quat: q0, scale: s0 } = objectGizmoStart;
    const p1 = target.position.clone();
    const q1 = target.quaternion.clone();
    const s1 = target.scale.clone();
    objectGizmoStart = null;
    const changed =
      p0.distanceToSquared(p1) > 1e-8 ||
      Math.abs(q0.dot(q1)) < 0.999999 ||
      s0.distanceToSquared(s1) > 1e-8;
    if (changed) {
      history.record({
        label: `Transform ${target.userData?.kitbashName || partLabel(target)}`,
        undo: () => {
          target.position.copy(p0);
          target.quaternion.copy(q0);
          target.scale.copy(s0);
          syncTransformSlidersFromSelected();
          renderer.shadowMap.needsUpdate = true;
        },
        redo: () => {
          target.position.copy(p1);
          target.quaternion.copy(q1);
          target.scale.copy(s1);
          syncTransformSlidersFromSelected();
          renderer.shadowMap.needsUpdate = true;
        },
      });
    }
  }
}

function onPoseChanged(reason, detail) {
  if (reason === 'stuck') {
    const isLeg = detail?.limb?.kind === 'leg';
    toast(isLeg
      ? 'Tungkainya masih lurus dan kakinya terkunci. Geser kakinya dulu, atau matikan Kunci telapak kaki.'
      : 'Lengannya masih lurus dan tangannya terkunci. Geser tangannya dulu, atau matikan Kunci tangan.', 5200);
    return;
  }
  renderer.shadowMap.needsUpdate = true;
  // Let hair and cloth physics catch up with the new pose while paused.
  poseSettleUntil = performance.now() + 2200;
  if (reason === 'commit') {
    if (!history.isApplying && poseRig && lastPoseSnapshot) {
      const prevSnap = lastPoseSnapshot;
      const nextSnap = poseRig.snapshotRaw();
      const changed = nextSnap.some(
        (cur, i) =>
          cur.active !== prevSnap[i]?.active ||
          cur.offset.angleTo(prevSnap[i].offset) > 1e-5 ||
          cur.posOffset.distanceToSquared(prevSnap[i].posOffset) > 1e-9,
      );
      if (changed) {
        lastPoseSnapshot = nextSnap;
        history.record({
          label: 'Ubah pose',
          undo: () => restorePoseSnap(prevSnap),
          redo: () => restorePoseSnap(nextSnap),
        });
      }
    }
    syncPoseUI();
  } else {
    syncFingerValues();
  }
}

function syncPoseUI() {
  const handle = poseRig && poseHandles?.selectedId ? poseRig.handle(poseHandles.selectedId) : null;
  els.poseUnsupported.hidden = Boolean(poseRig) || !model;
  els.poseGuide.hidden = Boolean(model) && !poseRig;
  syncHistoryUI();
  els.poseReset.disabled = !poseRig?.hasPose();
  els.poseSelectedName.textContent = handle ? handle.label : 'Belum ada titik dipilih';
  els.poseSelectedName.classList.toggle('is-empty', !handle);
  els.poseResetPart.disabled = !handle || !poseRig.isGroupModified(handle.group);
  poseHandles?.refresh();
  renderFingerPanel(handle?.hand ?? null);
  syncCorrectivesStatus();
}

/** The finger controls belong to a hand: they show while that hand or one of its fingers is picked. */
function renderFingerPanel(side) {
  els.poseFingers.hidden = !side;
  if (!side) {
    fingerPanelSide = null;
    return;
  }
  if (side !== fingerPanelSide) {
    fingerPanelSide = side;
    els.poseFingersTitle.textContent = `Jari tangan ${side === 'L' ? 'kiri' : 'kanan'}`;
    els.poseHandShapes.replaceChildren(...poseRig.handShapes.map((shape) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.shape = shape.id;
      chip.textContent = shape.label;
      return chip;
    }));
    els.poseFingerList.replaceChildren(...poseRig.hands[side].map((finger) => {
      const row = document.createElement('label');
      row.className = 'slider-row';
      row.dataset.finger = finger.id;
      const name = document.createElement('span');
      name.textContent = finger.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      const value = document.createElement('span');
      value.className = 'num';
      row.append(name, input, value);
      return row;
    }));
  }
  syncFingerValues();
}

function syncFingerValues() {
  if (!fingerPanelSide || !poseRig) return;
  for (const row of els.poseFingerList.children) {
    const input = row.querySelector('input');
    const percent = Math.round(THREE.MathUtils.clamp(poseRig.fingerCurl(row.dataset.finger), 0, 1) * 100);
    // The slider under the pointer already shows what was asked for.
    if (input !== activeFingerSlider) input.value = String(percent);
    row.querySelector('.num').textContent = `${percent}%`;
    row.classList.toggle('is-current', row.dataset.finger === poseHandles.selectedId);
  }
  const spread = Math.round(poseRig.handSpread(fingerPanelSide) * 100);
  if (els.poseHandSpread !== activeFingerSlider) els.poseHandSpread.value = String(spread);
  els.poseHandSpreadVal.textContent = String(spread);
  els.poseFingersReset.disabled = !poseRig.isGroupModified(`fingers${fingerPanelSide}`);
}

/** One drag of a finger slider is one undo step: opened by its first value, closed on release. */
function feedFingerSlider(input, apply) {
  if (!poseRig || !fingerPanelSide) return;
  if (activeFingerSlider !== input) {
    activeFingerSlider = input;
    pauseForPosing();
    poseRig.beginFingerEdit();
  }
  apply(Number(input.value) / 100);
}

function closeFingerSlider() {
  if (!activeFingerSlider) return;
  activeFingerSlider = null;
  poseRig?.endEdit();
}

function syncCorrectivesStatus(done = 0, total = 0) {
  if (!els.poseCorrectivesStatus) return;
  const count = poseRig?.correctives.count ?? 0;
  const text = {
    idle: 'Tulang bantu di lutut, siku, dan bahu ikut menyesuaikan pose.',
    loading: total > 0
      ? `Mempelajari bentuk sendi dari animasi (${done}/${total})`
      : 'Mempelajari bentuk sendi dari animasi',
    ready: `${count} tulang bantu ikut menyesuaikan pose.`,
    none: 'Model ini tidak punya tulang bantu, jadi tidak diperlukan.',
    failed: 'Data animasi gagal dimuat. Pose tetap bisa diatur.',
  }[poseCorrectivesState];
  els.poseCorrectivesStatus.textContent = text;
}

function updateViewportHint() {
  let hint = '';
  if (pendingPlacement) {
    hint = `Klik di badan karakter untuk menaruh ${pendingPlacement.name} · Esc untuk batal`;
  } else if (editorMode === 'edit') {
    hint = 'Mode Edit: Klik/B (Box)/C (Kuas)/L (Linked) pilih face · X hapus · P pisah · Tab selesai';
  } else if (activeGizmoMode === 'pose') {
    if (!model) hint = '';
    else if (!poseRig) hint = 'Rangka model ini tidak dikenali';
    else if (poseRig.handle(poseHandles?.selectedId)?.kind === 'finger') hint = 'Seret titik jari untuk menekuk atau memiringkannya · klik dua kali untuk mengembalikannya';
    else if (poseRig.handle(poseHandles?.selectedId)?.hand) hint = 'Seret titik kecil di ujung jari untuk menekuk jari · gelang warna memutar pergelangan';
    else if (poseHandles?.selectedId) hint = 'Seret gelang warna untuk memutar sendi · klik dua kali titik untuk mengembalikannya';
    else hint = 'Seret titik untuk mengatur pose · klik titik untuk memutarnya';
  } else if (activeGizmoMode !== 'none' && !selectedObject && model) {
    hint = 'Klik bagian model untuk memilihnya · tekan X/Y/Z untuk kunci sumbu';
  }
  if (els.viewportHint) els.viewportHint.textContent = hint;
  if (els.vpSelectedLabel) {
    els.vpSelectedLabel.hidden = !selectedObject || activeGizmoMode === 'pose' || editorMode === 'edit';
  }
}

const CALIBRATION_CLIPS = ['Run', 'Standup', 'Win', 'Attack01', 'Death', 'Falldown', 'Walk', 'Hitdown', 'Attack02', 'Stun'];
const CALIBRATION_CLIP_COUNT = 5;

/** Clips with a wide range of motion teach the helper bones the most. */
function pickCalibrationClips() {
  const pool = clips.filter((meta) => !clipCache.has(meta.name) && meta.duration >= 0.4 && meta.duration <= 8);
  const picked = [];
  for (const name of CALIBRATION_CLIPS) {
    const meta = pool.find((item) => item.name === name);
    if (meta) picked.push(meta);
    if (picked.length >= CALIBRATION_CLIP_COUNT) return picked;
  }
  for (const meta of [...pool].sort((a, b) => a.duration - b.duration)) {
    if (!picked.includes(meta)) picked.push(meta);
    if (picked.length >= CALIBRATION_CLIP_COUNT) break;
  }
  return picked;
}

/**
 * Repair and twist bones only follow the baked animation. The first time pose
 * mode is used on a model, a few extra clips are fetched so the rig can learn
 * how those bones depend on their joints (see pose/correctives.js).
 */
async function ensurePoseCorrectives() {
  if (!poseRig || poseCorrectivesState !== 'idle' || clipCache.size === 0) return;
  const rig = poseRig;
  if (!rig.correctives.hasCandidates([...clipCache.values()])) {
    poseCorrectivesState = 'none';
    syncCorrectivesStatus();
    return;
  }

  poseCorrectivesState = 'loading';
  const picks = pickCalibrationClips();
  let done = 0;
  syncCorrectivesStatus(done, picks.length);
  await Promise.all(picks.map(async (meta) => {
    try {
      await ensureClip(meta);
    } catch (err) {
      console.warn(`[pose] calibration clip "${meta.name}" failed to load`, err);
    }
    done++;
    if (rig === poseRig) syncCorrectivesStatus(done, picks.length);
  }));
  if (rig !== poseRig) return;

  const summary = rig.correctives.learn([...clipCache.values()], (bone) => bindTransforms.get(bone));
  poseCorrectivesState = summary.helpers > 0 ? 'ready' : clipCache.size > 1 ? 'none' : 'failed';
  rig.refresh();
  syncCorrectivesStatus();
}

function detachGizmo() {
  if (!transformControls || !transformHelper) return;
  transformControls.detach();
  transformHelper.visible = false;
}

function syncTransformSlidersFromSelected() {
  const target = selectedObject || model;
  if (!target || !els.partPosX) return;
  els.partPosX.value = String(target.position.x.toFixed(2));
  els.partPosXVal.textContent = target.position.x.toFixed(2);
  els.partPosY.value = String(target.position.y.toFixed(2));
  els.partPosYVal.textContent = target.position.y.toFixed(2);
  els.partPosZ.value = String(target.position.z.toFixed(2));
  els.partPosZVal.textContent = target.position.z.toFixed(2);
  els.partScale.value = String(target.scale.x.toFixed(2));
  els.partScaleVal.textContent = `${target.scale.x.toFixed(2)}×`;
}

function syncPartsAll() {
  const activeParts = parts.filter((part) => !part.deleted);
  const visible = activeParts.filter((part) => part.object.visible).length;
  els.partsAll.checked = visible === activeParts.length && activeParts.length > 0;
  els.partsAll.indeterminate = visible > 0 && visible < activeParts.length;
  for (const part of parts) {
    if (!part.eyeBtn) continue;
    const shown = part.object.visible && !part.deleted;
    part.eyeBtn.innerHTML = icon(shown ? 'eye' : 'eye-off');
    part.eyeBtn.setAttribute('aria-pressed', String(shown));
    part.eyeBtn.title = shown ? 'Sembunyikan (H)' : 'Tampilkan';
    part.eyeBtn.setAttribute('aria-label', `${shown ? 'Sembunyikan' : 'Tampilkan'} ${partDisplayName(part)}`);
    if (part.rewriteBtn) {
      const rw = part.rewriteOnHide !== false;
      part.rewriteBtn.classList.toggle('is-rewrite-on', rw);
      part.rewriteBtn.classList.toggle('is-rewrite-off', !rw);
      part.rewriteBtn.setAttribute('aria-pressed', String(rw));
      part.rewriteBtn.title = rw
        ? 'Saat disembunyikan: Timpa area bawah dengan kulit (ON — klik untuk biarkan kosong)'
        : 'Saat disembunyikan: Tetap kosong, jangan timpa kulit (OFF — klik untuk timpa kulit)';
    }
    part.rowEl?.classList.toggle('is-off', !shown);
  }
  syncBodyPatches();
}

function setAllParts(visible) {
  const activeParts = parts.filter((p) => !p.deleted);
  const prevMap = activeParts.map((p) => [p, p.object.visible]);
  const prevSolo = soloPart;
  history.execute({
    label: visible ? 'Tampilkan semua bagian' : 'Sembunyikan semua bagian',
    undo: () => {
      soloPart = prevSolo;
      if (els.partsUnsolo) els.partsUnsolo.hidden = !soloPart;
      for (const [p, v] of prevMap) p.object.visible = v;
      syncPartsAll();
      updateOutlinerHighlights();
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      soloPart = null;
      if (els.partsUnsolo) els.partsUnsolo.hidden = true;
      for (const p of activeParts) p.object.visible = visible;
      syncPartsAll();
      updateOutlinerHighlights();
      renderer.shadowMap.needsUpdate = true;
    },
  });
}

function deleteObjectsWithHistory(objects) {
  const targets = (objects || []).filter(Boolean);
  if (targets.length === 0) return;

  const partDeletes = [];
  const kbDeletes = [];
  for (const obj of targets) {
    const p = parts.find((entry) => entry.object === obj && !entry.deleted);
    if (p) {
      partDeletes.push({ part: p, prevVisible: p.object.visible });
      continue;
    }
    const kb = activeKitbashItems.find((entry) => entry.object === obj);
    if (kb) {
      kbDeletes.push({ item: kb, index: activeKitbashItems.indexOf(kb), parent: kb.object.parent });
    }
  }
  if (partDeletes.length === 0 && kbDeletes.length === 0) return;

  history.execute({
    label: `Hapus ${targets.length} bagian`,
    undo: () => {
      for (const { part, prevVisible } of partDeletes) {
        part.deleted = false;
        part.object.visible = prevVisible;
      }
      for (const { item, index, parent } of kbDeletes) {
        if (parent) parent.add(item.object);
        if (!activeKitbashItems.includes(item)) {
          activeKitbashItems.splice(Math.min(index, activeKitbashItems.length), 0, item);
        }
      }
      buildPartsOutliner();
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      syncBodyPatches();
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      for (const { part } of partDeletes) {
        part.deleted = true;
        part.object.visible = false;
        if (soloPart === part) soloPart = null;
      }
      for (const { item } of kbDeletes) {
        item.object.parent?.remove(item.object);
        const idx = activeKitbashItems.indexOf(item);
        if (idx >= 0) activeKitbashItems.splice(idx, 1);
      }
      if (targets.some((o) => selectedObjects.has(o) || selectedObject === o)) {
        selectObjectForEditing(null);
      }
      if (els.partsUnsolo) els.partsUnsolo.hidden = !soloPart;
      buildPartsOutliner();
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      syncBodyPatches();
      renderer.shadowMap.needsUpdate = true;
    },
  });
  toast(`${partDeletes.length + kbDeletes.length} bagian dihapus (Ctrl+Z untuk batal).`, 2600);
}

function restoreDeletedPartsWithHistory(targetParts) {
  const list = targetParts.filter((p) => p.deleted);
  if (list.length === 0) return;
  history.execute({
    label: `Pulihkan ${list.length} bagian`,
    undo: () => {
      for (const p of list) {
        p.deleted = true;
        p.object.visible = false;
      }
      buildPartsOutliner();
      rebuildColorTargetOptions();
      syncBodyPatches();
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      for (const p of list) {
        p.deleted = false;
        p.object.visible = true;
      }
      buildPartsOutliner();
      rebuildColorTargetOptions();
      syncBodyPatches();
      renderer.shadowMap.needsUpdate = true;
    },
  });
}

function duplicateObjectsWithHistory(objects) {
  const targets = (objects || []).filter(Boolean);
  if (targets.length === 0 || !model) return;
  const created = [];
  for (const src of targets) {
    const srcPart = parts.find((p) => p.object === src);
    const baseName = srcPart ? partDisplayName(srcPart) : src.userData?.kitbashName || partLabel(src);
    const copyName = `${baseName} (Salinan)`;
    const dup = duplicateSceneObject(src, copyName);
    if (!dup) continue;
    if (src.parent) src.parent.add(dup);
    else model.add(dup);
    dup.traverse((c) => {
      if (c.isMesh) snapshotMeshMaterialState(c);
    });
    const entry = {
      name: copyName,
      type: 'duplicate',
      object: dup,
      sourcePartIndex: srcPart?.index ?? null,
    };
    created.push({ entry, parent: dup.parent });
  }
  if (created.length === 0) return;

  history.execute({
    label: `Duplikat ${created.length} bagian`,
    undo: () => {
      for (const { entry } of created) {
        entry.object.parent?.remove(entry.object);
        const idx = activeKitbashItems.indexOf(entry);
        if (idx >= 0) activeKitbashItems.splice(idx, 1);
      }
      selectObjectForEditing(null);
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      for (const { entry, parent } of created) {
        (parent || model).add(entry.object);
        if (!activeKitbashItems.includes(entry)) activeKitbashItems.push(entry);
      }
      selectObjectForEditing(created[created.length - 1].entry.object, created[created.length - 1].entry.name);
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      renderer.shadowMap.needsUpdate = true;
    },
  });
  toast(`${created.length} bagian diduplikat.`, 2200);
}

/* --- Edit Mode (Tab): face selection, delete & separate --- */

function firstEditableMesh(obj) {
  if (!obj) return null;
  if (obj.isMesh && !ou(obj)) return obj;
  let found = null;
  obj.traverse((c) => {
    if (!found && c.isMesh && !ou(c) && !c.userData?.isDebugOverlay) found = c;
  });
  return found;
}

function enterEditMode() {
  const mesh = firstEditableMesh(selectedObject);
  if (!mesh) {
    toast('Pilih satu bagian model dulu sebelum masuk Mode Edit Face (Tab).', 3200);
    return false;
  }
  ensureFaceMask(mesh);
  editModeMesh = mesh;
  editSelectedFaces.clear();
  editorMode = 'edit';
  if (activeGizmoMode === 'pose') poseHandles?.setVisible(false);
  detachGizmo();
  syncEditorModeUI();
  updateEditModeUI();
  updateViewportHint();
  return true;
}

function exitEditMode() {
  if (editorMode !== 'edit') return;
  editSelectedFaces.clear();
  if (editSelectionOverlay) editSelectionOverlay.visible = false;
  if (els.viewportBrushRing) els.viewportBrushRing.hidden = true;
  if (els.viewportSelectRect) els.viewportSelectRect.hidden = true;
  editDragState = null;
  editModeMesh = null;
  editorMode = activeGizmoMode === 'pose' ? 'pose' : 'object';
  syncEditorModeUI();
  updateGizmoAttachment();
  updateViewportHint();
}

function setEditSelectTool(tool) {
  editSelectTool = tool;
  if (els.editSelectTool) {
    for (const btn of els.editSelectTool.querySelectorAll('.seg-btn')) {
      btn.classList.toggle('is-active', btn.dataset.selectTool === tool);
    }
  }
  if (els.viewportBrushRing && tool !== 'brush') els.viewportBrushRing.hidden = true;
  if (controls) controls.enabled = tool === 'click' || tool === 'linked';
}

function updateEditModeUI() {
  if (els.editmodeCount) {
    els.editmodeCount.textContent = `${editSelectedFaces.size} face`;
  }
  editSelectionOverlay = syncEditOverlayMesh(editSelectionOverlay, editModeMesh, editSelectedFaces);
  renderer.shadowMap.needsUpdate = true;
}

function deleteSelectedEditFaces() {
  if (!editModeMesh || editSelectedFaces.size === 0) return;
  const targetMesh = editModeMesh;
  const beforeMask = cloneFaceMaskArray(targetMesh);
  const data = ensureFaceMask(targetMesh);
  if (!data || !beforeMask) return;
  const afterMask = beforeMask.slice();
  let removed = 0;
  for (const t of editSelectedFaces) {
    if (afterMask[t] === 1) {
      afterMask[t] = 0;
      removed++;
    }
  }
  if (removed === 0) return;

  const part = parts.find((p) => p.object === targetMesh);
  const prevSelection = new Set(editSelectedFaces);

  history.execute({
    label: `Hapus ${removed} face`,
    undo: () => {
      restoreFaceMaskArray(targetMesh, beforeMask);
      if (part) bodyPatcher?.invalidatePart(part);
      syncBodyPatches();
      if (editModeMesh === targetMesh) {
        editSelectedFaces.clear();
        for (const f of prevSelection) editSelectedFaces.add(f);
        updateEditModeUI();
      }
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      restoreFaceMaskArray(targetMesh, afterMask);
      if (part) bodyPatcher?.invalidatePart(part);
      syncBodyPatches();
      if (editModeMesh === targetMesh) {
        editSelectedFaces.clear();
        updateEditModeUI();
      }
      renderer.shadowMap.needsUpdate = true;
    },
  });
  toast(`${removed} face dihapus.`, 2200);
}

function separateSelectedEditFaces() {
  if (!editModeMesh || editSelectedFaces.size === 0) return;
  const sourceMesh = editModeMesh;
  const beforeMask = cloneFaceMaskArray(sourceMesh);
  const srcPart = parts.find((p) => p.object === sourceMesh);
  const srcLabel = srcPart ? partDisplayName(srcPart) : sourceMesh.userData?.kitbashName || partLabel(sourceMesh);
  const newName = `${srcLabel} (Potongan)`;
  const separated = separateSelectedFaces(sourceMesh, editSelectedFaces, newName);
  if (!separated) return;

  const { newMesh, extractedTris } = separated;
  const afterMask = cloneFaceMaskArray(sourceMesh);
  snapshotMeshMaterialState(newMesh);
  const parentNode = sourceMesh.parent || model;
  const entry = {
    name: newName,
    type: 'separated',
    object: newMesh,
    sourcePartIndex: srcPart?.index ?? null,
    separatedFaces: extractedTris,
  };

  history.record({
    label: `Pisah ${extractedTris.length} face`,
    undo: () => {
      newMesh.parent?.remove(newMesh);
      const idx = activeKitbashItems.indexOf(entry);
      if (idx >= 0) activeKitbashItems.splice(idx, 1);
      restoreFaceMaskArray(sourceMesh, beforeMask);
      if (srcPart) bodyPatcher?.invalidatePart(srcPart);
      syncBodyPatches();
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      updateEditModeUI();
      renderer.shadowMap.needsUpdate = true;
    },
    redo: () => {
      restoreFaceMaskArray(sourceMesh, afterMask);
      parentNode.add(newMesh);
      if (!activeKitbashItems.includes(entry)) activeKitbashItems.push(entry);
      if (srcPart) bodyPatcher?.invalidatePart(srcPart);
      syncBodyPatches();
      renderExtraOutliner();
      renderActiveKitbashList();
      rebuildColorTargetOptions();
      updateEditModeUI();
      renderer.shadowMap.needsUpdate = true;
    },
  });

  parentNode.add(newMesh);
  activeKitbashItems.push(entry);
  if (srcPart) bodyPatcher?.invalidatePart(srcPart);
  syncBodyPatches();
  editSelectedFaces.clear();
  updateEditModeUI();
  renderExtraOutliner();
  renderActiveKitbashList();
  rebuildColorTargetOptions();
  toast(`${extractedTris.length} face dipisah menjadi "${newName}".`, 2600);
}

/* ------------------------------------------------------------------ */
/* Color & Shader Studio (`#tab-color`)                               */
/* ------------------------------------------------------------------ */

function buildPaletteUI() {
  if (!els.colorPaletteGrid) return;
  els.colorPaletteGrid.replaceChildren();
  for (const palette of COLOR_PALETTES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.style.background = palette.swatch;
    const label = document.createElement('span');
    label.textContent = palette.name;
    btn.append(dot, label);
    btn.addEventListener('click', () => {
      const targets = getSelectedColorTargetMeshes();
      const beforeStates = targets.map((mesh) => [mesh, getMeshMaterialState(mesh)]);
      history.execute({
        label: `Palet ${palette.name}`,
        undo: () => {
          for (const [m, st] of beforeStates) applyMeshMaterialEdits(m, st);
          syncColorControlsFromTarget();
        },
        redo: () => {
          for (const m of targets) applyColorPaletteToMesh(m, palette);
          syncColorControlsFromTarget();
        },
      });
      toast(`Palet ${palette.name} diterapkan.`, 2400);
    });
    els.colorPaletteGrid.appendChild(btn);
  }
}

function rebuildColorTargetOptions() {
  if (!els.colorTargetSelect) return;
  const prevValue = els.colorTargetSelect.value;
  els.colorTargetSelect.replaceChildren();

  const allOpt = document.createElement('option');
  allOpt.value = '__all__';
  allOpt.textContent = 'Semua bagian';
  els.colorTargetSelect.appendChild(allOpt);

  for (const part of parts) {
    if (part.deleted) continue;
    const opt = document.createElement('option');
    opt.value = `part:${part.index}`;
    opt.textContent = partDisplayName(part);
    els.colorTargetSelect.appendChild(opt);
  }

  activeKitbashItems.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = `kb:${idx}`;
    opt.textContent = `Kitbash · ${item.name}`;
    els.colorTargetSelect.appendChild(opt);
  });

  if ([...els.colorTargetSelect.options].some((o) => o.value === prevValue)) {
    els.colorTargetSelect.value = prevValue;
  }
}

function getSelectedColorTargetMeshes() {
  const val = els.colorTargetSelect?.value || '__all__';
  if (val === '__all__') {
    const allMeshes = parts.filter((p) => !p.deleted).map((p) => p.object);
    for (const item of activeKitbashItems) {
      item.object.traverse((c) => {
        if (c.isMesh && !ou(c)) allMeshes.push(c);
      });
    }
    return allMeshes;
  }
  if (val.startsWith('part:')) {
    const idx = Number(val.slice(5));
    const found = parts.find((p) => p.index === idx && !p.deleted);
    return found ? [found.object] : [];
  }
  if (val.startsWith('kb:')) {
    const idx = Number(val.slice(3));
    const item = activeKitbashItems[idx];
    if (!item) return [];
    const meshes = [];
    item.object.traverse((c) => {
      if (c.isMesh && !ou(c)) meshes.push(c);
    });
    return meshes;
  }
  return [];
}

function syncColorControlsFromTarget() {
  const meshes = getSelectedColorTargetMeshes();
  // Read the controls from a mesh that is actually on screen.
  const primary = meshes.find((m) => m.visible && !/eye|face/i.test(partLabel(m)))
    || meshes.find((m) => !/eye|face/i.test(partLabel(m)))
    || meshes[0];
  if (!primary) return;
  const state = getMeshMaterialState(primary);
  if (!state) return;

  els.colorAlbedo.value = state.albedoHex;
  els.colorGlobalTint.value = state.globalTintHex;
  els.colorShadow1.value = state.shadow1Hex;
  els.colorShadow2.value = state.shadow2Hex;
  els.colorRim.value = state.rimHex;
  els.colorOutline.value = state.outlineHex;

  els.sliderRimIntensity.value = String(state.rimIntensity);
  els.sliderRimIntensityVal.textContent = Number(state.rimIntensity).toFixed(2);

  els.sliderCelThreshold.value = String(state.celThreshold);
  els.sliderCelThresholdVal.textContent = Number(state.celThreshold).toFixed(2);

  els.sliderCelSmooth.value = String(state.celSmooth);
  els.sliderCelSmoothVal.textContent = Number(state.celSmooth).toFixed(2);

  els.sliderBloomFactor.value = String(state.bloomFactor);
  els.sliderBloomFactorVal.textContent = Number(state.bloomFactor).toFixed(2);

  els.sliderOutlineWidth.value = String(state.outlineWidth);
  els.sliderOutlineWidthVal.textContent = Number(state.outlineWidth).toFixed(2);

  els.togglePartOutline.checked = state.outlineVisible;
  els.togglePartWireframe.checked = state.wireframe;

  els.colorHue.value = String(state.hueShift);
  els.colorHueVal.textContent = `${Math.round(state.hueShift)}°`;
  els.colorSat.value = String(state.satShift);
  els.colorSatVal.textContent = `${Math.round(state.satShift)}%`;
  els.colorLight.value = String(state.lightShift);
  els.colorLightVal.textContent = `${Math.round(state.lightShift)}%`;
}

/* ------------------------------------------------------------------ */
/* Kitbash / Add Assets Studio (`#tab-kitbash`)                       */
/* ------------------------------------------------------------------ */

function buildBuiltinPropsUI() {
  if (!els.builtinPropsGrid) return;
  els.builtinPropsGrid.replaceChildren();
  for (const prop of BUILTIN_PROPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    const label = document.createElement('span');
    label.textContent = prop.name;
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      if (!model) return;
      requestAccessory(prop.name, 'prop', () => createBuiltinPropMesh(prop.id));
    });
    els.builtinPropsGrid.appendChild(btn);
  }
}

function getChosenSocketNode() {
  const key = els.kitbashSocketSelect?.value || 'root';
  return characterSockets[key] || model;
}

/* --- Accessories: placed where the user clicks, or on a chosen socket --- */

/** Waiting for a click on the model: { name, type, create }. */
let pendingPlacement = null;

function requestAccessory(name, type, create) {
  if (els.kitbashSocketSelect?.value === 'pick') {
    pendingPlacement = { name, type, create };
    els.viewport.classList.add('is-placing');
    updateViewportHint();
    return;
  }
  attachAccessory(create(), name, type, getChosenSocketNode());
}

function cancelPlacement() {
  if (!pendingPlacement) return;
  pendingPlacement = null;
  els.viewport.classList.remove('is-placing');
  updateViewportHint();
}

/** Skinned meshes keep the bounds of the pose they were first measured in. */
function refreshPickBounds(meshes) {
  for (const mesh of meshes) {
    if (!mesh.isSkinnedMesh) continue;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }
}

/** The joint that carries most of the surface under a raycast hit. */
function boneUnderHit(hit) {
  const mesh = hit.object;
  if (!mesh.isSkinnedMesh || !hit.face) return null;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  if (!skinIndex || !skinWeight) return null;
  let best = -1;
  let bestWeight = 0;
  for (let k = 0; k < 4; k++) {
    const weight = skinWeight.getComponent(hit.face.a, k);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = skinIndex.getComponent(hit.face.a, k);
    }
  }
  return best >= 0 ? mesh.skeleton.bones[best] : null;
}

function placePendingAt(event) {
  const pending = pendingPlacement;
  const pickables = parts.filter((part) => part.object.visible).map((part) => part.object);
  refreshPickBounds(pickables);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) {
    toast('Klik tepat di badan karakter untuk menaruhnya di sana.', 2600);
    return;
  }
  cancelPlacement();
  attachAccessory(pending.create(), pending.name, pending.type, boneUnderHit(hit) || model, hit.point);
}

/**
 * Parents an accessory to a bone so it follows the animation. With `worldPoint`
 * it is centred on that spot and keeps the orientation it was authored with.
 */
function attachAccessory(object, name, type, parentNode, worldPoint = null, { recordHistory = true } = {}) {
  if (!object || !parentNode) return null;
  parentNode.add(object);
  if (worldPoint) {
    parentNode.updateWorldMatrix(true, false);
    const upright = object.quaternion.clone();
    object.position.copy(parentNode.worldToLocal(worldPoint.clone()));
    object.quaternion.copy(parentNode.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(upright));
  }

  object.traverse((child) => {
    if (child.isMesh) snapshotMeshMaterialState(child);
  });

  const entry = {
    id: `kb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: object.userData.kitbashName || name,
    type,
    object,
    propId: object.userData?.propId || null,
    assetId: object.userData?.assetId || null,
    donorBaseUrl: object.userData?.donorBaseUrl || null,
    donorMeshIndex: object.userData?.donorMeshIndex ?? null,
    bindMode: object.userData?.bindMode || null,
  };

  if (recordHistory) {
    history.record({
      label: `Tambah ${entry.name}`,
      undo: () => {
        entry.object.parent?.remove(entry.object);
        const idx = activeKitbashItems.indexOf(entry);
        if (idx >= 0) activeKitbashItems.splice(idx, 1);
        if (selectedObject === entry.object) selectObjectForEditing(null);
        rebuildColorTargetOptions();
        renderExtraOutliner();
        renderActiveKitbashList();
        renderer.shadowMap.needsUpdate = true;
      },
      redo: () => {
        parentNode.add(entry.object);
        if (!activeKitbashItems.includes(entry)) activeKitbashItems.push(entry);
        rebuildColorTargetOptions();
        renderExtraOutliner();
        renderActiveKitbashList();
        selectObjectForEditing(entry.object, entry.name);
        renderer.shadowMap.needsUpdate = true;
      },
    });
  }

  activeKitbashItems.push(entry);
  rebuildColorTargetOptions();
  renderExtraOutliner();
  renderActiveKitbashList();
  selectObjectForEditing(object, entry.name);
  if (activeGizmoMode === 'none' || activeGizmoMode === 'pose') setGizmoMode('translate');
  renderer.shadowMap.needsUpdate = true;
  if (recordHistory) {
    toast(`${entry.name} ditambahkan. G geser · R putar · S skala.`, 3800);
  }
  return entry;
}

function removeKitbashItem(item) {
  deleteObjectsWithHistory([item.object]);
}

/* --- Body patches: generated limbs & trunk for hidden/cut parts --- */

function patchMode() {
  return els.patchMode?.querySelector('.seg-btn.is-active')?.dataset.mode ?? 'shell';
}

function patchFillStyle() {
  return els.patchFillStyle?.querySelector('.seg-btn.is-active')?.dataset.fill ?? 'skin';
}

function syncGapDebugOverlay() {
  if (!overlayScene) return;
  if (!bodyPatcher || !els.patchDebugToggle?.checked) {
    if (gapDebugGroup) gapDebugGroup.visible = false;
    return;
  }
  if (!gapDebugGroup) {
    gapDebugGroup = new THREE.Group();
    gapDebugGroup.name = 'gap-debug-overlay';
    gapDebugGroup.userData.isDebugOverlay = true;
    overlayScene.add(gapDebugGroup);
  }
  while (gapDebugGroup.children.length > 0) {
    const child = gapDebugGroup.children.pop();
    child.geometry?.dispose();
    child.material?.dispose();
  }
  const report = bodyPatcher.getGapReport();
  const sphereGeo = new THREE.SphereGeometry(0.012, 8, 8);
  const missMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false });
  const okMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false });
  for (const m of report.markers) {
    const dot = new THREE.Mesh(sphereGeo, m.status === 'missing' ? missMat : okMat);
    dot.position.copy(m.pos);
    dot.renderOrder = 998;
    gapDebugGroup.add(dot);
  }
  gapDebugGroup.visible = true;
}

function syncBodyPatches() {
  if (!bodyPatcher) return;
  const activeParts = parts.filter((part) => !part.deleted);
  const stillShown = activeParts.filter((part) => part.object.visible).length;
  // Suspend only while inspecting a single part (solo) or when every part is hidden.
  const inspecting = Boolean(soloPart) || (activeParts.length > 0 && stillShown === 0);
  bodyPatcher.setSuspended(inspecting);

  if (!inspecting) {
    const added = bodyPatcher.sync({ auto: els.patchAuto.checked });
    if (added.length && !isLoadingModel) {
      const names = added.map((region) => region.label.toLowerCase());
      const list = names.length > 2
        ? `${names.length} bagian tubuh`
        : names.join(' dan ');
      toast(`${list.charAt(0).toUpperCase()}${list.slice(1)} ditambal otomatis.`, 3200);
    }
  }
  if (materialMode === 'pbr' && pgrModel) applyPgrMaterialMode(pgrModel, 'pbr');
  renderPatchUI();
  syncGapDebugOverlay();
  renderer.shadowMap.needsUpdate = true;
}

function renderPatchUI() {
  if (!els.patchList) return;
  els.patchGroup.hidden = !bodyPatcher;
  if (!bodyPatcher) return;
  els.patchThickness.closest('.slider-row').hidden = patchMode() === 'shell';
  if (els.patchBaselayerRow) {
    els.patchBaselayerRow.hidden = patchFillStyle() !== 'baselayer';
  }
  const report = bodyPatcher.getGapReport();
  if (els.patchCoverageBadge) {
    els.patchCoverageBadge.textContent = report.missingCount === 0
      ? `${report.coveragePct}%`
      : `${report.coveragePct}% · ${report.missingCount} bolong`;
  }
  const bare = new Set(bodyPatcher.bareRegions().map((region) => region.id));
  els.patchList.replaceChildren(...bodyPatcher.regions.map((region) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.region = region.id;
    const on = bodyPatcher.has(region.id);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? `Lepas tambalan ${region.label.toLowerCase()}` : `Tambal ${region.label.toLowerCase()}`;
    if (!on && !bodyPatcher.canBuild(region.id)) {
      button.disabled = true;
      button.title = 'Hanya bisa ditambal dari bagian yang disembunyikan, misalnya sarung tangan.';
    }
    const label = document.createElement('span');
    label.textContent = region.label;
    button.appendChild(label);
    if (bare.has(region.id) && !on) button.classList.add('is-suggested');
    return button;
  }));
}

let currentDonorBaseUrl = '';

async function handleDonorModelSelected(baseUrl, donorTitle) {
  currentDonorBaseUrl = withSlash(baseUrl);
  if (els.donorModelLabel) {
    els.donorModelLabel.textContent = `Memuat ${donorTitle}`;
  }
  if (els.donorPartsList) {
    els.donorPartsList.innerHTML = `<div class="empty-state">Mengunduh bagian dari ${escapeHtml(donorTitle)}</div>`;
  }

  try {
    const donorData = await loadDonorCharacterModel(currentDonorBaseUrl, cubemapRegistry);
    if (els.donorModelLabel) {
      els.donorModelLabel.textContent = donorTitle;
    }
    renderDonorPartsList(donorData, donorTitle, currentDonorBaseUrl);
    toast(`Bagian dari ${donorTitle} siap dipasang.`);
  } catch (err) {
    console.error(err);
    if (els.donorModelLabel) {
      els.donorModelLabel.textContent = 'Pilih karakter sumber';
    }
    if (els.donorPartsList) {
      els.donorPartsList.innerHTML = `<div class="empty-state">Model sumber gagal dimuat: ${escapeHtml(err.message)}</div>`;
    }
    toast(`Model sumber gagal dimuat: ${err.message}`);
  }
}

function renderDonorPartsList(donorData, donorTitle, donorBaseUrl = currentDonorBaseUrl) {
  if (!els.donorPartsList) return;
  els.donorPartsList.replaceChildren();

  for (const dPart of donorData.donorParts) {
    const row = document.createElement('div');
    row.className = 'row';

    const name = document.createElement('span');
    name.className = 'row-label';
    name.textContent = `${dPart.label}`;

    const equipBtn = document.createElement('button');
    equipBtn.type = 'button';
    equipBtn.className = 'btn btn-s';
    equipBtn.textContent = 'Pasang';
    equipBtn.addEventListener('click', () => {
      if (!model) return;
      const socketNode = getChosenSocketNode();
      const equipped = equipDonorMeshOnHost(dPart.mesh, model, {
        bindMode: currentDonorBindMode,
        socketNode,
      });
      const itemName = `${donorTitle.split('·')[0].trim()} · ${dPart.label}`;
      equipped.userData.kitbashName = itemName;
      equipped.userData.donorBaseUrl = donorBaseUrl;
      equipped.userData.donorMeshIndex = dPart.index;
      equipped.userData.bindMode = currentDonorBindMode;

      attachAccessory(equipped, itemName, 'donor', equipped.parent || model);
    });

    row.append(name, equipBtn);
    els.donorPartsList.appendChild(row);
  }
}

function renderActiveKitbashList() {
  if (!els.activeKitbashList) return;
  els.activeKitbashList.replaceChildren();

  if (activeKitbashItems.length === 0) {
    els.activeKitbashList.innerHTML = `<div class="empty-state">Belum ada aset tambahan.</div>`;
    return;
  }

  activeKitbashItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.kbIndex = String(index);
    if (selectedObject === item.object) row.classList.add('is-selected');

    const eyeBtn = document.createElement('button');
    eyeBtn.type = 'button';
    eyeBtn.className = 'row-btn';
    const syncEye = () => {
      const shown = item.object.visible;
      eyeBtn.innerHTML = icon(shown ? 'eye' : 'eye-off');
      eyeBtn.title = shown ? 'Sembunyikan' : 'Tampilkan';
      eyeBtn.setAttribute('aria-label', `${shown ? 'Sembunyikan' : 'Tampilkan'} ${item.name}`);
      eyeBtn.setAttribute('aria-pressed', String(shown));
      row.classList.toggle('is-off', !shown);
    };
    eyeBtn.addEventListener('click', () => {
      const prev = item.object.visible;
      const next = !prev;
      history.execute({
        label: `${next ? 'Tampilkan' : 'Sembunyikan'} ${item.name}`,
        undo: () => {
          item.object.visible = prev;
          syncEye();
          renderExtraOutliner();
          renderer.shadowMap.needsUpdate = true;
        },
        redo: () => {
          item.object.visible = next;
          syncEye();
          renderExtraOutliner();
          renderer.shadowMap.needsUpdate = true;
        },
      });
    });
    syncEye();

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'row-label';
    name.textContent = item.name;
    name.title = 'Pilih dan atur posisinya';
    name.addEventListener('click', () => {
      selectObjectForEditing(item.object, item.name);
      if (activeGizmoMode === 'none' || activeGizmoMode === 'pose') setGizmoMode('translate');
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'row-btn';
    delBtn.innerHTML = icon('trash');
    delBtn.title = 'Hapus aset ini';
    delBtn.setAttribute('aria-label', `Hapus ${item.name}`);
    delBtn.addEventListener('click', () => removeKitbashItem(item));

    row.append(eyeBtn, name, delBtn);
    els.activeKitbashList.appendChild(row);
  });
}

/* ------------------------------------------------------------------ */
/* Character & Model Catalog Hub (`#catalog-overlay`)                 */
/* ------------------------------------------------------------------ */

function skeletonTiles(className, count) {
  return Array.from({ length: count }, () => `<div class="${className}" aria-hidden="true"></div>`).join('');
}

function elementLabel(element) {
  const raw = String(element || 'physical').toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function openCatalogModal(purpose = 'switch') {
  catalogPurpose = purpose;
  if (!els.catalogOverlay) return;
  els.catalogOverlay.hidden = false;
  showCatalogStep('chars');

  if (allCharacters.length === 0) {
    els.catalogCharGrid.innerHTML = skeletonTiles('char-skeleton', 18);
    els.catalogCharGrid.setAttribute('aria-busy', 'true');
    try {
      allCharacters = await fetchCharacterList('ap');
      buildElementFilters();
      renderCharacterCatalogGrid();
    } catch (err) {
      console.error(err);
      els.catalogCharGrid.innerHTML = `<div class="empty-state">Daftar karakter gagal dimuat (${escapeHtml(err.message)}). Periksa koneksi, lalu buka katalog lagi.</div>`;
    } finally {
      els.catalogCharGrid.removeAttribute('aria-busy');
    }
  } else {
    renderCharacterCatalogGrid();
  }
}

/** One filter per element that actually occurs in the list, most common first. */
function buildElementFilters() {
  if (!els.catalogElementFilters) return;
  const counts = new Map();
  for (const ch of allCharacters) {
    const element = String(ch.element || 'physical').toLowerCase();
    counts.set(element, (counts.get(element) || 0) + 1);
  }
  const elements = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([element]) => element);
  if (!counts.has(activeElementFilter)) activeElementFilter = 'all';
  els.catalogElementFilters.replaceChildren(...['all', ...elements].map((element) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-tab';
    button.classList.toggle('is-active', element === activeElementFilter);
    button.dataset.element = element;
    button.textContent = element === 'all' ? 'Semua' : elementLabel(element);
    return button;
  }));
}

function closeCatalogModal(loadDefaultIfEmpty = true) {
  if (els.catalogOverlay) els.catalogOverlay.hidden = true;
  if (loadDefaultIfEmpty && !model && catalogPurpose === 'switch' && !isLoadingModel) {
    loadCharacterModel(currentModelBase, currentModelMeta).catch((err) => {
      console.error(err);
      finishLoading();
      toast(`Model gagal dimuat: ${err.message}`, 7000);
    });
  }
}

function showCatalogStep(step) {
  const isChars = step === 'chars';
  const donor = catalogPurpose === 'donor';
  const adding = catalogPurpose === 'add';
  if (els.catalogStepChars) els.catalogStepChars.hidden = !isChars;
  if (els.catalogStepModels) els.catalogStepModels.hidden = isChars;
  if (els.catalogBackBtn) els.catalogBackBtn.hidden = isChars;
  if (isChars) {
    els.catalogTitle.textContent = donor ? 'Pilih karakter sumber' : adding ? 'Tambah karakter ke scene' : 'Pilih karakter';
    els.catalogSubtitle.textContent = donor
      ? 'Baju, rambut, atau senjatanya bisa dipasang ke karakter yang sedang dibuka.'
      : adding
        ? 'Karakter baru berdiri di samping yang sudah ada. Klik karakter mana pun untuk mengeditnya.'
        : 'Model 3D dan animasi dari Punishing: Gray Raven.';
  } else {
    els.catalogTitle.textContent = donor ? 'Pilih model sumber' : 'Pilih model';
    els.catalogSubtitle.textContent = 'Coating dan model chibi yang tersedia untuk karakter ini.';
  }
}

function renderCharacterCatalogGrid() {
  if (!els.catalogCharGrid) return;
  const query = (els.catalogSearchInput?.value || '').trim().toLowerCase();

  const filtered = allCharacters.filter((ch) => {
    if (activeElementFilter !== 'all') {
      const primaryMatch = (ch.element || '').toLowerCase() === activeElementFilter;
      const listMatch = (ch.elements || []).some((e) => {
        const elName = typeof e === 'string' ? e : e?.element || '';
        return elName.toLowerCase() === activeElementFilter;
      });
      if (!primaryMatch && !listMatch) return false;
    }
    if (!query) return true;
    const cName = (ch.characterName || ch.name || '').toLowerCase();
    const fName = (ch.frameName || ch.frame || '').toLowerCase();
    const fCode = (ch.frameCode || '').toLowerCase();
    const slug = (ch.slug || '').toLowerCase();
    return cName.includes(query) || fName.includes(query) || fCode.includes(query) || slug.includes(query);
  });

  if (els.catalogCharCount) els.catalogCharCount.textContent = String(filtered.length);

  if (filtered.length === 0) {
    els.catalogCharGrid.innerHTML = `<div class="empty-state">Tidak ada karakter yang cocok. Coba nama lain atau ganti elemen.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((ch, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'char-card';
    card.setAttribute('role', 'listitem');

    const cName = ch.characterName || ch.name || 'Construct';
    const fName = ch.frameName || ch.frame || '';
    const imgUrl = ch.iconUrl || ch.portraitUrl || ch.iconFallbackUrl || '';
    const fallbackUrl = ch.iconFallbackUrl || ch.portraitUrl || '';
    const rankLetter = ch.quality >= 3 ? 'S' : ch.quality === 2 ? 'A' : 'B';
    const elemRaw = (ch.element || (typeof ch.elements?.[0] === 'string' ? ch.elements[0] : ch.elements?.[0]?.element) || 'physical').toLowerCase();
    const loadAttr = idx < 21 ? 'eager' : 'lazy';

    card.innerHTML = `
      <span class="char-thumb">
        <img src="${escapeHtml(imgUrl)}" data-fallback="${escapeHtml(fallbackUrl)}" alt="" loading="${loadAttr}" />
      </span>
      <span class="char-info">
        <span class="char-frame">${escapeHtml(fName || cName)}</span>
        <span class="char-name">${escapeHtml(cName)}</span>
        <span class="char-meta">
          <span class="elem-dot" data-elem="${escapeHtml(elemRaw)}"></span>
          <span>${escapeHtml(elementLabel(elemRaw))}</span>
          <span class="char-rank" title="Rank ${escapeHtml(rankLetter)}">${escapeHtml(rankLetter)}</span>
        </span>
      </span>
    `;
    const imgEl = card.querySelector('img');
    imgEl?.addEventListener('error', () => {
      if (imgEl.dataset.fallback && imgEl.src !== imgEl.dataset.fallback) {
        imgEl.src = imgEl.dataset.fallback;
      }
    }, { once: true });

    card.addEventListener('click', () => {
      openCharacterModelsStep(ch);
    });
    fragment.appendChild(card);
  });

  els.catalogCharGrid.replaceChildren(fragment);
}

function renderCharBanner(imageUrl, cName, fName, facts) {
  if (!els.selectedCharBanner) return;
  els.selectedCharBanner.innerHTML = `
    <img src="${escapeHtml(imageUrl)}" alt="" />
    <div>
      <h3>${escapeHtml(fName || cName)}</h3>
      <p>${facts.map((fact) => `<span>${fact}</span>`).join('<span aria-hidden="true">·</span>')}</p>
    </div>
  `;
}

async function openCharacterModelsStep(charSummary) {
  showCatalogStep('models');
  const cName = charSummary.characterName || charSummary.name || 'Construct';
  const fName = charSummary.frameName || charSummary.frame || '';
  const portraitUrl = charSummary.iconUrl || charSummary.portraitUrl || '';
  const elemRaw = String(charSummary.element || 'physical').toLowerCase();
  const baseFacts = [
    ...(fName && fName !== cName ? [escapeHtml(cName)] : []),
    `<span class="elem-dot" data-elem="${escapeHtml(elemRaw)}"></span> ${escapeHtml(elementLabel(elemRaw))}`,
  ];

  renderCharBanner(portraitUrl, cName, fName, [...baseFacts, escapeHtml(charSummary.rankLabel || 'S-Rank')]);
  if (els.catalogModelsGrid) {
    els.catalogModelsGrid.innerHTML = skeletonTiles('model-skeleton', 4);
  }

  try {
    const detail = await fetchCharacterDetail(charSummary.slug);
    const coatings = detail.coatings || [];
    const chibis = detail.chibis || [];

    renderCharBanner(detail.iconUrl || portraitUrl, cName, fName, [
      ...baseFacts,
      escapeHtml(detail.rankLabel || 'S-Rank'),
      `${coatings.length} coating`,
      `${chibis.length} chibi`,
    ]);

    const fragment = document.createDocumentFragment();
    const addCard = ({ thumbUrl, name, kind, code, description, modelBase, meta }) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'model-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <img src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" />
        <span class="model-card-text">
          <span class="model-card-name">${escapeHtml(name)}</span>
          <span class="model-card-kind">${escapeHtml(kind)} · ${escapeHtml(code)}</span>
          ${description ? `<span class="model-card-desc">${escapeHtml(description)}</span>` : ''}
        </span>
        ${icon('chevron')}
      `;
      card.addEventListener('click', () => onModelCardChosen(modelBase, meta));
      fragment.appendChild(card);
    };

    coatings.forEach((coating, idx) => {
      const code = ((coating.modelPath || '').split('/').pop() || `coating-${idx + 1}`).toUpperCase();
      addCard({
        thumbUrl: coating.iconUrl || coating.cardArtUrl || portraitUrl,
        name: coating.name || `Coating ${idx + 1}`,
        kind: coating.generic ? 'Bawaan' : 'Coating',
        code,
        description: coating.subtitle || coating.description || '',
        modelBase: coating.baseUrl || huaxuModelBaseUrl(coating.modelPath),
        meta: { charName: `${cName} · ${fName}`, frame: coating.name || fName, code },
      });
    });

    chibis.forEach((chibi, idx) => {
      const code = ((chibi.modelPath || '').split('/').pop() || `chibi-${idx + 1}`).toUpperCase();
      addCard({
        thumbUrl: chibi.iconUrl || chibi.cardArtUrl || portraitUrl,
        name: chibi.name || `Chibi ${idx + 1}`,
        kind: 'Chibi',
        code,
        description: 'Model kecil dari mode Dorm, lengkap dengan animasinya.',
        modelBase: chibi.baseUrl || huaxuModelBaseUrl(chibi.modelPath),
        meta: { charName: `${cName} · chibi`, frame: chibi.name || `${cName} chibi`, code },
      });
    });

    if (coatings.length === 0 && chibis.length === 0) {
      els.catalogModelsGrid.innerHTML = `<div class="empty-state">Belum ada model 3D untuk karakter ini.</div>`;
    } else {
      els.catalogModelsGrid.replaceChildren(fragment);
    }
  } catch (err) {
    console.error(err);
    els.catalogModelsGrid.innerHTML = `<div class="empty-state">Daftar model gagal dimuat (${escapeHtml(err.message)}). Kembali lalu pilih karakternya lagi.</div>`;
  }
}

async function onModelCardChosen(modelBase, metaInfo) {
  closeCatalogModal(false);
  if (catalogPurpose === 'donor') {
    await handleDonorModelSelected(modelBase, `${metaInfo.charName} · ${metaInfo.frame}`);
    return;
  }
  if (catalogPurpose === 'add') {
    await addCharacter(() => loadCharacterModel(modelBase, metaInfo));
    return;
  }

  try {
    await loadCharacterModel(modelBase, metaInfo);
  } catch (err) {
    console.error(err);
    finishLoading();
    toast(`Model gagal dimuat: ${err.message}`, 7000);
  }
}

/* ------------------------------------------------------------------ */
/* Morphs & Pose                                                      */
/* ------------------------------------------------------------------ */

function morphKey(object, index) {
  return `${object.uuid}:${index}`;
}

function setMorphOverride(object, index, value) {
  const key = morphKey(object, index);
  if (value <= 0.0005) morphOverrides.delete(key);
  else morphOverrides.set(key, { object, index, value });
  renderer.shadowMap.needsUpdate = true;
}

function applyMorphOverrides() {
  for (const override of morphOverrides.values()) {
    const influences = override.object.morphTargetInfluences;
    if (influences) influences[override.index] = override.value;
  }
}

function showMorphPart(part) {
  activeMorphPart = part;
  els.morphList.replaceChildren();
  if (!part) return;

  const fragment = document.createDocumentFragment();
  for (const target of part.targets) {
    const row = document.createElement('label');
    row.className = 'morph-row';

    const name = document.createElement('span');
    name.className = 'morph-name';
    name.textContent = target.name;
    name.title = target.name;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    const override = morphOverrides.get(morphKey(part.object, target.index));
    const value = override ? override.value : 0;
    input.value = String(value);

    const readout = document.createElement('span');
    readout.className = 'morph-val';
    readout.textContent = value.toFixed(2);

    input.addEventListener('input', () => {
      const next = Number(input.value);
      readout.textContent = next.toFixed(2);
      setMorphOverride(part.object, target.index, next);
    });

    row.append(name, input, readout);
    fragment.appendChild(row);
  }

  els.morphList.replaceChildren(fragment);
  els.morphList.scrollTop = 0;
}

function resetMorphs() {
  morphOverrides.clear();
  for (const part of morphParts) {
    part.object.morphTargetInfluences?.fill(0);
  }
  if (activeMorphPart) showMorphPart(activeMorphPart);
  renderer.shadowMap.needsUpdate = true;
}

function enterBindPose() {
  if (!model) return;

  // The bind pose becomes the new base; pose offsets stay on top of it.
  poseRig?.detach();
  mixer?.stopAllAction();
  currentAction = null;
  currentMeta = null;
  paused = true;
  bindPoseActive = true;
  morphOverrides.clear();

  for (const [object, transform] of bindTransforms) {
    object.position.copy(transform.position);
    object.quaternion.copy(transform.quaternion);
    object.scale.copy(transform.scale);
  }
  for (const part of morphParts) part.object.morphTargetInfluences?.fill(0);
  if (springSystem) springSystem.reset();
  poseRig?.attach();

  model.updateMatrixWorld(true);
  renderer.shadowMap.needsUpdate = true;
  setActiveClipItem(null);
  updateNowPlaying();
  updatePlayButton();
  updateTimelineUI();
  if (activeMorphPart) showMorphPart(activeMorphPart);
}

function resetPlayground() {
  els.modelScale.value = '1';
  els.modelScaleVal.textContent = '1.00×';
  els.modelRotate.value = '0';
  els.modelRotateVal.textContent = '0°';
  if (model) {
    model.scale.setScalar(1);
    model.rotation.y = 0;
    renderer.shadowMap.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Animation Clips                                                    */
/* ------------------------------------------------------------------ */

function groupFor(meta) {
  // Clips that came inside a local .glb have no file of their own.
  if (!meta.file) return 'Dari file';
  if (meta.name.startsWith('Ui') || !meta.file.includes('BaseLayer')) return 'Menu';
  if (/^(StandAct|BoardAct)/.test(meta.name)) return 'Pajangan';
  return 'Tempur';
}

function renderClipList(filter = '') {
  const query = filter.trim().toLowerCase();
  const groups = new Map();

  for (const meta of clips) {
    if (query && !meta.name.toLowerCase().includes(query)) continue;
    const group = groupFor(meta);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(meta);
  }

  if (groups.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Tidak ada animasi yang cocok.';
    els.list.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const [group, items] of groups) {
    const label = document.createElement('div');
    label.className = 'clip-group';
    label.textContent = group;
    fragment.appendChild(label);

    for (const meta of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'clip-item';
      button.dataset.name = meta.name;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');

      const name = document.createElement('span');
      name.className = 'clip-name';
      name.textContent = meta.name;

      const time = document.createElement('span');
      time.className = 'clip-time';
      time.textContent = `${meta.duration.toFixed(2)}s`;

      const tags = document.createElement('span');
      tags.className = 'clip-tags';
      const tagText = meta.name === entryName ? 'masuk' : meta.name === idleName ? 'idle' : !meta.loop ? '1×' : '';
      if (tagText) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tagText;
        tag.title = { masuk: 'Animasi masuk, lanjut ke idle', idle: 'Pose diam', '1×': 'Diputar sekali' }[tagText];
        tags.appendChild(tag);
      }

      button.append(name, time, tags);
      fragment.appendChild(button);
    }
  }

  els.list.replaceChildren(fragment);
  if (currentMeta) setActiveClipItem(currentMeta.name);
}

/** Resolves to null when another model started loading while the clip was on its way. */
async function ensureClip(meta) {
  if (clipCache.has(meta.name)) return clipCache.get(meta.name);
  const generation = currentModelLoadToken;
  const url = new URL(meta.file, currentModelBase).href;
  const data = await fetchJSON(url);
  if (generation !== currentModelLoadToken) return null;
  if (clipCache.has(meta.name)) return clipCache.get(meta.name);
  const clip = buildClip(
    meta.name,
    data,
    meta,
    (index) => nodeNames.get(index) ?? `n${index}`,
    (index) => meshNames.get(index) ?? nodeNames.get(index) ?? `n${index}`,
  );
  clipCache.set(meta.name, clip);
  return clip;
}

async function playClipByName(name, { fade = 0.22 } = {}) {
  const meta = clipsByName.get(name);
  if (!meta || !mixer) return;

  const token = ++requestToken;
  setActiveClipItem(name);
  setClipItemLoading(name, true);

  let clip;
  try {
    clip = await ensureClip(meta);
  } catch (error) {
    console.error(error);
    if (token === requestToken) {
      setClipItemLoading(name, false);
      toast(`Animasi ${name} gagal dimuat. Periksa koneksi, lalu coba lagi.`);
    }
    return;
  }

  if (!clip || !mixer || token !== requestToken) return;
  setClipItemLoading(name, false);

  if (springSystem) {
    springSystem.restore();
    springSystem.reset();
  }

  // Actions save and restore bone values when they start and stop, so the
  // pose layer comes off for the whole switch.
  poseRig?.detach();
  const action = mixer.clipAction(clip);
  const shouldLoop = loopEnabled && meta.loop;
  action.reset();
  action.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
  action.clampWhenFinished = true;
  action.enabled = true;
  action.paused = false;
  action.setEffectiveWeight(1);

  if (currentAction && currentAction !== action) {
    if (fade > 0) {
      currentAction.fadeOut(fade);
      action.fadeIn(fade);
    } else {
      currentAction.stop();
      action.setEffectiveWeight(1);
    }
  }

  action.play();
  mixer.update(0);
  poseRig?.attach();
  if (springSystem) springSystem.step(0);
  renderer.shadowMap.needsUpdate = true;

  currentAction = action;
  currentMeta = meta;
  paused = false;
  bindPoseActive = false;
  updateNowPlaying();
  updatePlayButton();
  updateTimelineUI();
}

function onActionFinished(event) {
  if (event.action !== currentAction) return;

  if (currentMeta?.name === entryName) {
    const idle = clipsByName.has(idleName) ? idleName : clips[0]?.name;
    if (idle && idle !== currentMeta.name) {
      playClipByName(idle, { fade: 0.25 });
      return;
    }
  }

  paused = true;
  currentAction.paused = true;
  updatePlayButton();
  updateTimelineUI();
}

function togglePlayback() {
  if (bindPoseActive && !currentAction) {
    playClipByName(idleName);
    return;
  }
  if (!currentAction) return;

  if (paused) {
    const clip = currentAction.getClip();
    const atEnd = currentAction.time >= clip.duration - 1e-3;
    if (atEnd && currentAction.loop === THREE.LoopOnce) {
      currentAction.reset();
      if (currentMeta) {
        const shouldLoop = loopEnabled && currentMeta.loop;
        currentAction.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
      }
    }
    currentAction.paused = false;
    paused = false;
  } else {
    paused = true;
    currentAction.paused = true;
  }

  updatePlayButton();
}

function applyLoopMode() {
  if (!currentAction || !currentMeta) return;
  const shouldLoop = loopEnabled && currentMeta.loop;
  currentAction.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
  currentAction.clampWhenFinished = true;
  paused = false;
  currentAction.paused = false;
  updatePlayButton();
}

/* ------------------------------------------------------------------ */
/* UI & Render Loop                                                   */
/* ------------------------------------------------------------------ */

function updateNowPlaying() {
  if (bindPoseActive) {
    els.nowName.textContent = 'Pose dasar';
    els.nowMeta.textContent = 'tanpa animasi';
    els.nowBadge.hidden = true;
    return;
  }

  if (!currentMeta) {
    els.nowName.textContent = '—';
    els.nowMeta.textContent = '';
    els.nowBadge.hidden = true;
    return;
  }

  els.nowName.textContent = currentMeta.name;
  els.nowMeta.textContent = `${currentMeta.duration.toFixed(2)} dtk · ${currentMeta.frameRate} fps · ${currentMeta.loop ? 'berulang' : 'sekali'}`;

  const badge = currentMeta.name === entryName ? 'masuk' : currentMeta.name === idleName ? 'idle' : '';
  els.nowBadge.hidden = !badge;
  els.nowBadge.textContent = badge;
}

function updatePlayButton() {
  const playing = Boolean(currentAction) && !paused;
  els.play.classList.toggle('playing', playing);
  els.play.setAttribute('aria-label', playing ? 'Jeda' : 'Putar');
}

function updateTimelineUI() {
  if (!currentAction) {
    els.scrub.value = '0';
    els.scrub.style.setProperty('--pct', '0%');
    els.timeCurrent.textContent = fmtTime(0);
    els.timeTotal.textContent = fmtTime(0);
    return;
  }
  const duration = currentAction.getClip().duration || 0;
  const time = Math.min(currentAction.time, duration);
  if (!scrubbing) els.scrub.value = duration > 0 ? String((time / duration) * 1000) : '0';
  els.scrub.style.setProperty('--pct', `${(Number(els.scrub.value) / 10).toFixed(2)}%`);
  els.timeCurrent.textContent = fmtTime(time);
  els.timeTotal.textContent = fmtTime(duration);
}

function tick() {
  requestAnimationFrame(tick);

  const frameNow = performance.now();
  const delta = Math.min((frameNow - lastFrameTime) / 1000, 0.05);
  lastFrameTime = frameNow;
  elapsedTime += delta;

  if (pgrModel) {
    pgrModel.time.value = elapsedTime;
    for (const { flow, offset } of pgrModel.flows) {
      updateEmissionFlow(flow, elapsedTime, offset.value);
    }
  }

  const animActive = Boolean(mixer && currentAction && !paused);
  if (animActive) {
    if (springSystem) springSystem.restore();
    advanceMixer(delta);
  }
  applyMorphOverrides();

  // While paused the physics normally sleeps; a pose change wakes it for a
  // moment so hair and cloth settle onto the new pose instead of freezing.
  const settling = !animActive && frameNow < poseSettleUntil;
  // Hair and cloth only need to avoid the body once a pose has moved it away
  // from what the clips were authored for.
  bodyColliders?.sync();
  if (springSystem && !bindPoseActive && (animActive || settling)) {
    const rate = animActive && mixer ? mixer.timeScale : 1;
    springSystem.step(delta * rate);
  }

  if (tickGuests(delta)) renderer.shadowMap.needsUpdate = true;

  if (animActive || settling || morphOverrides.size > 0) {
    renderer.shadowMap.needsUpdate = true;
  }

  if (cameraTween) {
    const now = performance.now();
    const t = Math.min(1, (now - cameraTween.start) / cameraTween.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (t >= 1) cameraTween = null;
  }

  controls.update();
  renderFrame();

  if (currentAction) updateTimelineUI();
}

/** Draws the current state. `overlays: false` leaves gizmos and bone lines out. */
function renderFrame({ overlays = true } = {}) {
  if (!renderer || !scene || !camera) return;
  scene.updateMatrixWorld();
  poseHandles?.update();

  const hasOverlay = overlays && Boolean(skeletonHelper?.visible || transformHelper?.visible || gapDebugGroup?.visible);

  if (materialMode === 'pgr' && pgrModel && postProcessor) {
    camera.getWorldPosition(cameraWorldPos);
    // Every character in the scene, the one being edited and the others.
    const shaded = [{ pgr: pgrModel, sphere: modelSphere }, ...guests.map((guest) => ({ pgr: guest.pgrModel, sphere: guest.modelSphere }))];
    for (const { pgr, sphere } of shaded) {
      if (!pgr) continue;
      updateRimDirection(camera.quaternion, DEFAULT_PGR_LIGHTING.rimEulerOffset, pgr.rimDirection.value);
      updateHairFades(pgr.hairFades, camera.fov, cameraWorldPos, sphere ? sphere.center : null);
      const shadowHeight = pgr.groundShadowProjection?.height ?? 0;
      const canShowGroundShadow = showShadow && cameraWorldPos.y >= shadowHeight;
      for (const caster of pgr.groundShadowCasters) {
        caster.shadow.visible = canShowGroundShadow;
      }
      if (canShowGroundShadow) {
        updateGroundShadows(pgr.groundShadowCasters, shadowHeight);
      }
    }

    postProcessor.render(scene, camera);

    if (hasOverlay) {
      renderer.setRenderTarget(null);
      renderer.render(overlayScene, camera);
    }
  } else {
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    if (hasOverlay) {
      renderer.render(overlayScene, camera);
    }
  }
}

/** Brings the camera close enough to a hand for its fingertip points to be easy to grab. */
function flyToHand(side) {
  const hand = poseRig?.hands[side];
  if (!hand) return;
  const wrist = new THREE.Vector3().setFromMatrixPosition(poseRig.bones.arms[side].end.matrixWorld);
  const centre = new THREE.Vector3();
  const knuckle = new THREE.Vector3();
  let reach = 0;
  for (const finger of hand) {
    knuckle.setFromMatrixPosition(finger.knuckle.bone.matrixWorld);
    centre.add(knuckle);
    reach = Math.max(reach, knuckle.distanceTo(wrist));
  }
  centre.multiplyScalar(1 / hand.length);
  // Same viewing direction as now; the hand ends up filling about a third of the view.
  const direction = camera.position.clone().sub(controls.target).normalize();
  const distance = (reach * 3.75) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  cameraTween = {
    fromPosition: camera.position.clone(),
    toPosition: centre.clone().addScaledVector(direction, distance),
    fromTarget: controls.target.clone(),
    toTarget: centre,
    start: performance.now(),
    duration: 450,
  };
}

function flyHome() {
  cameraTween = {
    fromPosition: camera.position.clone(),
    toPosition: homePosition.clone(),
    fromTarget: controls.target.clone(),
    toTarget: homeTarget.clone(),
    start: performance.now(),
    duration: 550,
  };
}

function capturePngScreenshot() {
  if (!renderer) return;
  // Gizmo rings and bone lines are editing aids, not part of the picture.
  renderFrame({ overlays: false });
  const link = document.createElement('a');
  const slug = (currentModelMeta.code || currentModelMeta.frame || 'model').toLowerCase();
  link.download = `${slug}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  toast('PNG disimpan.', 2400);
}

/* ------------------------------------------------------------------ */
/* Add Menu (Shift+A), Parent Menu (Ctrl+P) & Modal Transform         */
/* ------------------------------------------------------------------ */

let pendingAutosaveProject = null;

function buildAddMenuUI() {
  if (!els.addMenuProps) return;
  els.addMenuProps.replaceChildren();
  for (const prop of BUILTIN_PROPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    const label = document.createElement('span');
    label.textContent = prop.name;
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      closePopovers();
      if (!model) return;
      const targetSocket = characterSockets[prop.defaultSocket] || model;
      attachAccessory(createBuiltinPropMesh(prop.id), prop.name, 'prop', targetSocket);
    });
    els.addMenuProps.appendChild(btn);
  }
}

function closePopovers() {
  if (els.fileMenuPopover) els.fileMenuPopover.hidden = true;
  if (els.fileMenuBtn) els.fileMenuBtn.setAttribute('aria-expanded', 'false');
  if (els.addMenuPopover) els.addMenuPopover.hidden = true;
  if (els.parentMenuPopover) els.parentMenuPopover.hidden = true;
}

function toggleAddMenu(clientX = null, clientY = null) {
  if (!els.addMenuPopover) return;
  const open = els.addMenuPopover.hidden;
  closePopovers();
  if (!open) return;
  if (clientX != null && clientY != null && els.viewport) {
    const rect = els.viewport.getBoundingClientRect();
    const left = THREE.MathUtils.clamp(clientX - rect.left, 16, Math.max(16, rect.width - 285));
    const top = THREE.MathUtils.clamp(clientY - rect.top, 16, Math.max(16, rect.height - 280));
    els.addMenuPopover.style.left = `${left}px`;
    els.addMenuPopover.style.top = `${top}px`;
  } else {
    els.addMenuPopover.style.left = '60px';
    els.addMenuPopover.style.top = '56px';
  }
  els.addMenuPopover.hidden = false;
}

function openParentMenu() {
  if (!els.parentMenuPopover || !els.parentMenuOptions || !model) return;
  const targets = getSelectedTargets();
  if (targets.length === 0) {
    toast('Pilih bagian atau aksesori dulu untuk di-parent ke tulang.', 2600);
    return;
  }
  closePopovers();
  els.parentMenuOptions.replaceChildren();

  const socketChoices = [
    { key: 'head', label: 'Kepala (Head)' },
    { key: 'chest', label: 'Dada / Punggung (Spine2)' },
    { key: 'pelvis', label: 'Pinggul (Pelvis)' },
    { key: 'rightHand', label: 'Tangan kanan (R Hand)' },
    { key: 'leftHand', label: 'Tangan kiri (L Hand)' },
    { key: 'weapon1', label: 'Slot senjata 1' },
    { key: 'weapon2', label: 'Slot senjata 2' },
    { key: 'root', label: 'Model utama (Root)' },
  ];
  for (const s of socketChoices) {
    const node = characterSockets[s.key] || (s.key === 'root' ? model : null);
    if (!node) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item';
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      closePopovers();
      const prevParents = targets.map((t) => ({
        obj: t,
        parent: t.parent,
        pos: t.position.clone(),
        quat: t.quaternion.clone(),
        scale: t.scale.clone(),
      }));
      history.execute({
        label: `Parent ke ${s.label}`,
        undo: () => {
          for (const p of prevParents) {
            if (p.parent) p.parent.add(p.obj);
            p.obj.position.copy(p.pos);
            p.obj.quaternion.copy(p.quat);
            p.obj.scale.copy(p.scale);
          }
          syncTransformSlidersFromSelected();
        },
        redo: () => {
          for (const t of targets) reparentPreservingWorld(t, node);
          syncTransformSlidersFromSelected();
        },
      });
      toast(`Dipasang ke ${s.label}.`, 2200);
    });
    els.parentMenuOptions.appendChild(btn);
  }

  const sep = document.createElement('div');
  sep.className = 'menu-sep';
  els.parentMenuOptions.appendChild(sep);

  const autoSkinBtn = document.createElement('button');
  autoSkinBtn.type = 'button';
  autoSkinBtn.className = 'menu-item';
  autoSkinBtn.textContent = 'Skin otomatis ke rangka karakter';
  autoSkinBtn.addEventListener('click', () => {
    closePopovers();
    const mainBones = poseRig ? poseRig.entries.filter((e) => e.role !== 'com').map((e) => e.bone) : [];
    if (mainBones.length === 0) {
      toast('Rangka karakter tidak ditemukan.', 2400);
      return;
    }
    let convertedCount = 0;
    for (const target of targets) {
      const created = autoSkinObjectToHost(target, model, mainBones);
      for (const sm of created) {
        snapshotMeshMaterialState(sm);
        const kb = activeKitbashItems.find((k) => k.object === target);
        if (kb) kb.object = sm;
        else {
          activeKitbashItems.push({ name: sm.name || 'Auto-skinned', type: 'prop', object: sm });
        }
        convertedCount++;
      }
    }
    renderExtraOutliner();
    renderActiveKitbashList();
    rebuildColorTargetOptions();
    if (convertedCount > 0) toast(`${convertedCount} mesh di-skin ke rangka.`, 2600);
    else toast('Bagian ini sudah terskin ke rangka.', 2400);
  });
  els.parentMenuOptions.appendChild(autoSkinBtn);

  els.parentMenuPopover.hidden = false;
}

function startModalTransform(mode) {
  setGizmoMode(mode);
  const target = selectedObject || model;
  if (!target) return;
  modalTransform = {
    mode,
    target,
    axis: null,
    digits: '',
    startPos: target.position.clone(),
    startQuat: target.quaternion.clone(),
    startScale: target.scale.clone(),
  };
  updateModalTransformUI();
}

function updateModalTransformUI() {
  if (!els.modalTransformBadge) return;
  if (!modalTransform || (!modalTransform.axis && !modalTransform.digits)) {
    els.modalTransformBadge.hidden = true;
    return;
  }
  const verb = { translate: 'Geser', rotate: 'Putar', scale: 'Skala' }[modalTransform.mode];
  const ax = modalTransform.axis ? modalTransform.axis.toUpperCase() : 'XYZ';
  const val = modalTransform.digits || 'seret / ketik angka';
  els.modalTransformBadge.textContent = `${verb} ${ax}: ${val}  ·  Enter ok / Esc batal`;
  els.modalTransformBadge.hidden = false;
}

function applyModalTransformPreview() {
  if (!modalTransform) return;
  const { mode, target, axis, digits, startPos, startQuat, startScale } = modalTransform;
  target.position.copy(startPos);
  target.quaternion.copy(startQuat);
  target.scale.copy(startScale);

  const num = Number(digits);
  if (!digits || !Number.isFinite(num)) return;

  if (mode === 'translate') {
    const ax = axis || 'x';
    target.position[ax] += num;
  } else if (mode === 'rotate') {
    const rad = THREE.MathUtils.degToRad(num);
    const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const delta = new THREE.Quaternion().setFromAxisAngle(axisVec, rad);
    target.quaternion.multiply(delta);
  } else if (mode === 'scale') {
    const factor = Math.max(0.01, num);
    if (!axis) target.scale.multiplyScalar(factor);
    else target.scale[axis] *= factor;
  }
  syncTransformSlidersFromSelected();
  renderer.shadowMap.needsUpdate = true;
}

function commitModalTransform() {
  if (!modalTransform) return;
  const { target, startPos, startQuat, startScale, digits } = modalTransform;
  modalTransform = null;
  if (transformControls) {
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
  }
  updateModalTransformUI();
  if (!digits) return;
  const endPos = target.position.clone();
  const endQuat = target.quaternion.clone();
  const endScale = target.scale.clone();
  if (
    startPos.distanceToSquared(endPos) > 1e-8 ||
    Math.abs(startQuat.dot(endQuat)) < 0.999999 ||
    startScale.distanceToSquared(endScale) > 1e-8
  ) {
    history.record({
      label: `Transform ${target.userData?.kitbashName || partLabel(target)}`,
      undo: () => {
        target.position.copy(startPos);
        target.quaternion.copy(startQuat);
        target.scale.copy(startScale);
        syncTransformSlidersFromSelected();
        renderer.shadowMap.needsUpdate = true;
      },
      redo: () => {
        target.position.copy(endPos);
        target.quaternion.copy(endQuat);
        target.scale.copy(endScale);
        syncTransformSlidersFromSelected();
        renderer.shadowMap.needsUpdate = true;
      },
    });
  }
}

function cancelModalTransform() {
  if (!modalTransform) return;
  const { target, startPos, startQuat, startScale } = modalTransform;
  if (modalTransform.digits) {
    target.position.copy(startPos);
    target.quaternion.copy(startQuat);
    target.scale.copy(startScale);
    syncTransformSlidersFromSelected();
    renderer.shadowMap.needsUpdate = true;
  }
  modalTransform = null;
  if (transformControls) {
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
  }
  updateModalTransformUI();
}

/* ------------------------------------------------------------------ */
/* Pose Library (IndexedDB + .pose.json)                              */
/* ------------------------------------------------------------------ */

async function refreshPoseLibraryUI() {
  if (!els.poseLibraryGrid) return;
  const poses = await listSavedPoses();
  els.poseLibraryGrid.replaceChildren();
  if (poses.length === 0) {
    els.poseLibraryGrid.innerHTML = `<div class="empty-state">Belum ada pose tersimpan. Atur pose lalu klik Simpan.</div>`;
    return;
  }
  for (const pose of poses) {
    const card = document.createElement('div');
    card.className = 'pose-card';

    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'pose-card-thumb';
    thumbBtn.title = `Terapkan pose ${pose.name}`;
    if (pose.thumbnail) {
      const img = document.createElement('img');
      img.src = pose.thumbnail;
      img.alt = pose.name;
      thumbBtn.appendChild(img);
    }
    thumbBtn.addEventListener('click', () => applySavedPoseRecord(pose));

    const body = document.createElement('div');
    body.className = 'pose-card-body';

    const nameEl = document.createElement('div');
    nameEl.className = 'pose-card-name';
    nameEl.textContent = pose.name;
    nameEl.title = pose.name;

    const actions = document.createElement('div');
    actions.className = 'pose-card-actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-s';
    applyBtn.textContent = 'Pakai';
    applyBtn.addEventListener('click', () => applySavedPoseRecord(pose));

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'row-btn';
    dlBtn.innerHTML = icon('download');
    dlBtn.title = 'Unduh .pose.json';
    dlBtn.addEventListener('click', () => {
      const slug = pose.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadJsonFile(pose, `${slug || 'pose'}.pose.json`);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'row-btn is-danger';
    delBtn.innerHTML = icon('trash');
    delBtn.title = 'Hapus pose';
    delBtn.addEventListener('click', async () => {
      await deletePoseRecord(pose.id);
      await refreshPoseLibraryUI();
      toast(`Pose "${pose.name}" dihapus.`, 2000);
    });

    actions.append(applyBtn, dlBtn, delBtn);
    body.append(nameEl, actions);
    card.append(thumbBtn, body);
    els.poseLibraryGrid.appendChild(card);
  }
}

async function saveCurrentPoseToLibrary() {
  if (!poseRig) {
    toast('Model ini tidak memiliki rangka pose.', 2400);
    return;
  }
  const rawName = els.poseSaveName?.value?.trim();
  const name = rawName || `Pose ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  renderFrame({ overlays: false });
  const thumbnail = captureViewportThumbnail(els.canvas, 240);
  const pose = serializePose({
    name,
    rig: poseRig,
    model,
    morphParts,
    morphOverrides,
    clipName: currentMeta?.name || null,
    clipTime: currentAction?.time || 0,
    bindPoseActive,
    thumbnail,
    includeMorphs: true,
    includeRoot: true,
    includeClip: false,
  });
  await savePoseRecord(pose);
  if (els.poseSaveName) els.poseSaveName.value = '';
  await refreshPoseLibraryUI();
  toast(`Pose "${name}" disimpan ke Library.`, 2400);
}

function applySavedPoseRecord(poseData) {
  if (!poseRig || !poseData) {
    toast('Buka karakter yang punya rangka untuk menerapkan pose.', 2600);
    return;
  }
  pauseForPosing();
  const scope = els.poseApplyScope?.value || 'all';
  const mirror = Boolean(els.poseApplyMirror?.checked);
  const prevSnap = poseRig.snapshotRaw();

  const res = applyPoseData(poseData, {
    rig: poseRig,
    model,
    morphParts,
    setMorphOverride,
    clearMorphs: resetMorphs,
    scope,
    mirror,
  });

  const nextSnap = poseRig.snapshotRaw();
  lastPoseSnapshot = nextSnap;
  history.record({
    label: `Terapkan pose ${poseData.name}`,
    undo: () => restorePoseSnap(prevSnap),
    redo: () => restorePoseSnap(nextSnap),
  });

  syncPoseUI();
  if (activeMorphPart) showMorphPart(activeMorphPart);
  renderer.shadowMap.needsUpdate = true;

  if (res.missingBones.length > 0) {
    toast(`Pose "${poseData.name}" diterapkan (${res.missingBones.length} tulang tidak cocok dilewati).`, 3600);
  } else {
    toast(`Pose "${poseData.name}" diterapkan.`, 2200);
  }
}

/* ------------------------------------------------------------------ */
/* Project Save / Load / Autosave (.kproj.json)                       */
/* ------------------------------------------------------------------ */

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function buildCurrentProjectObject(customName = '') {
  if (!model) return null;
  return serializeProject({
    id: currentProjectId,
    name: customName || currentModelMeta?.frame || currentModelMeta?.charName || 'Proyek Karakter',
    modelBase: currentModelBase,
    modelMeta: currentModelMeta,
    modelAssetId: currentModelAssetId,
    model,
    bindTransforms,
    parts,
    activeKitbashItems,
    bodyPatcher,
    patchAuto: els.patchAuto?.checked ?? true,
    rig: poseRig,
    morphParts,
    morphOverrides,
    currentClipName: currentMeta?.name || null,
    currentClipTime: currentAction?.time || 0,
    bindPoseActive,
    sceneSettings: {
      materialMode,
      stageMode,
      customBgColor: els.customBgColor?.value || '#303236',
      showGrid,
      showShadow,
      lightYaw,
      lightPitch,
    },
  });
}

async function runAutosave() {
  const proj = buildCurrentProjectObject();
  if (!proj) return;
  await saveAutosaveProject(proj);
}

async function saveProjectToFile() {
  noteProjectHoldsOneCharacter();
  const proj = buildCurrentProjectObject();
  if (!proj) return;
  toast('Menyiapkan file proyek…');
  const full = await embedAssetsIntoProject(proj);
  const slug = (currentModelMeta.code || currentModelMeta.frame || 'proyek').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadJsonFile(full, `${slug}.kproj.json`);
  projectDirty = false;
  toast('Proyek .kproj.json disimpan.', 2600);
}

async function saveProjectLocally() {
  const proj = buildCurrentProjectObject();
  if (!proj) return;
  const name = prompt('Nama proyek lokal:', proj.name);
  if (!name) return;
  proj.name = name.trim();
  const saved = await saveNamedProject(proj);
  currentProjectId = saved.id;
  projectDirty = false;
  toast(`Proyek "${saved.name}" disimpan di browser.`, 2400);
}

async function applyProjectData(proj) {
  if (!proj || proj.type !== 'kurumi-project') {
    toast('Format file proyek tidak dikenali.', 3200);
    return;
  }
  await restoreEmbeddedAssetsFromProject(proj);
  closeCatalogModal(false);
  currentProjectId = proj.id && proj.id !== '__autosave__' ? proj.id : null;

  if (proj.modelBase === 'custom-glb' && proj.modelAssetId) {
    const asset = await loadBinaryAsset(proj.modelAssetId);
    if (!asset?.buffer) {
      toast('Asset GLB proyek tidak ditemukan.', 3600);
      return;
    }
    await loadCharacterFromGlbBuffer(asset.buffer, asset.name || proj.name, proj.modelAssetId);
  } else if (proj.modelBase) {
    await loadCharacterModel(proj.modelBase, proj.modelMeta || {}, {
      initialClip: proj.clip?.name || null,
      initialTime: proj.clip?.time ?? null,
    });
  }

  if (proj.clip?.bindPoseActive) {
    enterBindPose();
  }

  // Restore root transform
  if (model && proj.modelTransform) {
    const sc = Number(proj.modelTransform.scale ?? 1);
    const ry = Number(proj.modelTransform.rotationY ?? 0);
    model.scale.setScalar(sc);
    model.rotation.y = THREE.MathUtils.degToRad(ry);
    if (els.modelScale) els.modelScale.value = String(sc);
    if (els.modelScaleVal) els.modelScaleVal.textContent = `${sc.toFixed(2)}×`;
    if (els.modelRotate) els.modelRotate.value = String(ry);
    if (els.modelRotateVal) els.modelRotateVal.textContent = `${Math.round(ry)}°`;
  }

  // Restore parts state (visibility, deleted, rewriteOnHide, faceMask, transform, materialEdits)
  for (const ps of proj.parts || []) {
    const part = parts.find((p) => p.index === ps.index) || parts.find((p) => p.label === ps.label);
    if (!part) continue;
    part.customName = ps.customName || null;
    part.deleted = Boolean(ps.deleted);
    part.rewriteOnHide = ps.rewriteOnHide !== false;
    bodyPatcher?.setPartRewrite(part, part.rewriteOnHide);
    part.object.visible = !part.deleted && ps.visible !== false;
    part.object.userData.exportExcluded = Boolean(ps.exportExcluded);
    if (ps.transform) {
      part.object.position.fromArray(ps.transform.p);
      part.object.quaternion.fromArray(ps.transform.q);
      part.object.scale.fromArray(ps.transform.s);
    }
    if (Array.isArray(ps.deletedFaces) && ps.deletedFaces.length > 0) {
      setDeletedFaceIndices(part.object, ps.deletedFaces);
      bodyPatcher?.invalidatePart(part);
    }
    if (ps.materialEdits) applyMeshMaterialEdits(part.object, ps.materialEdits);
  }

  // Restore kitbash / added / duplicated / separated objects
  for (const kb of proj.kitbash || []) {
    let obj = null;
    const parentBone =
      (kb.parentBoneName && findBoneByRawName(model, kb.parentBoneName)) || model;

    if (kb.kind === 'prop' && kb.propId) {
      obj = createBuiltinPropMesh(kb.propId);
    } else if (kb.kind === 'custom-glb' && kb.assetId) {
      const asset = await loadBinaryAsset(kb.assetId);
      if (asset?.buffer) {
        obj = await loadCustomGlbBuffer(asset.buffer, kb.assetName || kb.name);
        obj.userData.assetId = kb.assetId;
        obj.userData.customAssetName = kb.assetName || kb.name;
      }
    } else if (kb.kind === 'donor' && kb.donorBaseUrl != null && kb.donorMeshIndex != null) {
      try {
        const donorData = await loadDonorCharacterModel(withSlash(kb.donorBaseUrl), cubemapRegistry);
        const dPart = donorData.donorParts.find((d) => d.index === kb.donorMeshIndex);
        if (dPart) {
          obj = equipDonorMeshOnHost(dPart.mesh, model, {
            bindMode: kb.bindMode || 'skeleton',
            socketNode: parentBone,
          });
          obj.userData.donorBaseUrl = kb.donorBaseUrl;
          obj.userData.donorMeshIndex = kb.donorMeshIndex;
          obj.userData.bindMode = kb.bindMode || 'skeleton';
        }
      } catch (err) {
        console.warn('[project] failed to load donor part:', err);
      }
    } else if (kb.kind === 'duplicate' && kb.sourcePartIndex != null) {
      const srcPart = parts.find((p) => p.index === kb.sourcePartIndex);
      if (srcPart) obj = duplicateSceneObject(srcPart.object, kb.name);
    } else if (kb.kind === 'separated' && kb.sourcePartIndex != null && Array.isArray(kb.separatedFaces)) {
      const srcPart = parts.find((p) => p.index === kb.sourcePartIndex);
      if (srcPart) {
        const res = separateSelectedFaces(srcPart.object, new Set(kb.separatedFaces), kb.name);
        obj = res?.newMesh ?? null;
      }
    }

    if (!obj) continue;
    obj.userData.kitbashName = kb.name;
    obj.userData.exportExcluded = Boolean(kb.exportExcluded);
    obj.visible = kb.visible !== false;
    if (kb.transform) {
      obj.position.fromArray(kb.transform.p);
      obj.quaternion.fromArray(kb.transform.q);
      obj.scale.fromArray(kb.transform.s);
    }
    const entry = attachAccessory(obj, kb.name, kb.kind, obj.parent || parentBone, null, {
      recordHistory: false,
    });
    if (entry && kb.sourcePartIndex != null) entry.sourcePartIndex = kb.sourcePartIndex;
    if (entry && kb.separatedFaces) entry.separatedFaces = kb.separatedFaces;

    const firstMesh = obj.isMesh ? obj : firstEditableMesh(obj);
    if (firstMesh) {
      if (Array.isArray(kb.deletedFaces) && kb.deletedFaces.length > 0) {
        setDeletedFaceIndices(firstMesh, kb.deletedFaces);
      }
      if (kb.materialEdits) applyMeshMaterialEdits(firstMesh, kb.materialEdits);
    }
  }

  // Restore body patch config
  if (proj.patches && bodyPatcher) {
    if (els.patchAuto) els.patchAuto.checked = proj.patches.auto !== false;
    const pMode = proj.patches.mode || 'hybrid';
    for (const btn of els.patchMode?.querySelectorAll('.seg-btn') || []) {
      btn.classList.toggle('is-active', btn.dataset.mode === pMode);
    }
    bodyPatcher.setMode(pMode);
    const thick = Number(proj.patches.thickness ?? 1);
    if (els.patchThickness) els.patchThickness.value = String(thick);
    if (els.patchThicknessVal) els.patchThicknessVal.textContent = `${thick.toFixed(2)}×`;
    bodyPatcher.setThickness(thick);

    const fill = proj.patches.fillStyle || 'skin';
    const blCol = proj.patches.baseLayerColor || '#252730';
    for (const btn of els.patchFillStyle?.querySelectorAll('.seg-btn') || []) {
      btn.classList.toggle('is-active', btn.dataset.fill === fill);
    }
    if (els.patchBaselayerColor) els.patchBaselayerColor.value = blCol;
    bodyPatcher.setFillStyle(fill, blCol);
    bodyPatcher.restoreState({
      manualIds: proj.patches.manualIds || [],
      dismissedIds: proj.patches.dismissedIds || [],
    });
  }

  // Restore pose & morphs
  if (proj.pose && poseRig) {
    applyPoseData(proj.pose, {
      rig: poseRig,
      model,
      morphParts,
      setMorphOverride,
      clearMorphs: resetMorphs,
      scope: 'all',
      mirror: false,
    });
    lastPoseSnapshot = poseRig.snapshotRaw();
  }

  // Restore scene settings
  if (proj.scene) {
    applyMaterialMode(proj.scene.materialMode || 'pgr');
    applyStage(proj.scene.stageMode || 'dark');
    if (proj.scene.customBgColor && els.customBgColor) {
      els.customBgColor.value = proj.scene.customBgColor;
      els.viewport.style.background = proj.scene.customBgColor;
    }
    showGrid = Boolean(proj.scene.showGrid);
    showShadow = proj.scene.showShadow !== false;
    if (els.toggleGrid) els.toggleGrid.checked = showGrid;
    if (els.toggleShadow) els.toggleShadow.checked = showShadow;
    lightYaw = Number(proj.scene.lightYaw ?? 175);
    lightPitch = Number(proj.scene.lightPitch ?? 30);
    if (els.lightYaw) els.lightYaw.value = String(lightYaw);
    if (els.lightYawVal) els.lightYawVal.textContent = `${lightYaw}°`;
    if (els.lightPitch) els.lightPitch.value = String(lightPitch);
    if (els.lightPitchVal) els.lightPitchVal.textContent = `${lightPitch}°`;
    syncStageVisibility();
    updateKeyLight();
  }

  buildPartsOutliner();
  renderExtraOutliner();
  renderActiveKitbashList();
  rebuildColorTargetOptions();
  syncColorControlsFromTarget();
  syncPoseUI();
  history.clear();
  projectDirty = false;
  toast(`Proyek "${proj.name}" dimuat.`, 2800);
}

async function openSavedProjectsModal() {
  if (!els.projectsModal || !els.projectsList) return;
  const list = await listSavedProjects();
  els.projectsList.replaceChildren();
  if (list.length === 0) {
    els.projectsList.innerHTML = `<div class="empty-state">Belum ada proyek tersimpan di browser ini.</div>`;
  } else {
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'project-row';
      const meta = document.createElement('div');
      meta.className = 'project-meta';
      const dt = p.savedAt ? new Date(p.savedAt).toLocaleString('id-ID') : '';
      meta.innerHTML = `<strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.modelMeta?.frame || '')} · ${escapeHtml(dt)}</small>`;
      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-s btn-primary';
      openBtn.textContent = 'Buka';
      openBtn.addEventListener('click', async () => {
        els.projectsModal.hidden = true;
        await applyProjectData(p);
      });

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'btn btn-s';
      dlBtn.textContent = '.kproj';
      dlBtn.addEventListener('click', async () => {
        const full = await embedAssetsIntoProject(p);
        downloadJsonFile(full, `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.kproj.json`);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-s btn-danger';
      delBtn.textContent = 'Hapus';
      delBtn.addEventListener('click', async () => {
        await deleteSavedProject(p.id);
        await openSavedProjectsModal();
      });

      actions.append(openBtn, dlBtn, delBtn);
      row.append(meta, actions);
      els.projectsList.appendChild(row);
    }
  }
  els.projectsModal.hidden = false;
}

async function triggerExportGlb() {
  if (!model) return;
  toast('Mengekspor model .glb…');
  try {
    const slug = (currentModelMeta.code || currentModelMeta.frame || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const includePatches = els.exportOptPatches ? els.exportOptPatches.checked : true;
    const bakePoseToMesh = els.exportOptBakePose ? els.exportOptBakePose.checked : false;
    const includeAnimations = els.exportOptAnims ? els.exportOptAnims.checked : false;
    await exportModelToGlb(model, `${slug}-custom.glb`, {
      pgrModel,
      name: currentModelMeta.charName || currentModelMeta.frame || 'Character',
      // The viewer's home camera looks at the character's front.
      front: homePosition.clone().sub(homeTarget),
      source: sourceGltf,
      includePatches,
      bakePoseToMesh,
      includeAnimations,
      animations: includeAnimations ? [...clipCache.values()] : [],
    });
    toast('File .glb berhasil diunduh.', 2600);
  } catch (err) {
    console.error(err);
    toast(`Ekspor gagal: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Event Wiring                                                       */
/* ------------------------------------------------------------------ */

const PART_TABS = new Set(['edit', 'color', 'kitbash']);

function switchTab(name, { fromTool = false } = {}) {
  activeTab = name;
  for (const tab of els.tabs) {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  }
  for (const panel of els.tabPanels) {
    panel.hidden = panel.id !== `tab-${name}`;
  }
  if (fromTool) return;

  // The Pose tab and the pose tool go together. Tabs that work on mesh parts
  // need clicks on the model to select parts again.
  if (name === 'pose') {
    if (activeGizmoMode !== 'pose') setGizmoMode('pose', { fromTab: true });
  } else if (activeGizmoMode === 'pose' && PART_TABS.has(name)) {
    setGizmoMode('none', { fromTab: true });
  }
}

function setInspectorCollapsed(collapsed) {
  els.panel.classList.toggle('collapsed', collapsed);
}

function wireUI() {
  for (const tab of els.tabs) {
    tab.addEventListener('click', () => {
      // Clicking the open tab again folds the inspector away.
      if (tab.dataset.tab === activeTab && !els.panel.classList.contains('collapsed')) {
        setInspectorCollapsed(true);
        return;
      }
      setInspectorCollapsed(false);
      switchTab(tab.dataset.tab);
    });
  }
  // On small screens the inspector is a sheet over the viewport: start closed.
  if (window.matchMedia('(max-width: 860px)').matches) setInspectorCollapsed(true);

  // Catalog
  els.openBrowserModalBtn?.addEventListener('click', () => openCatalogModal('switch'));
  els.catalogCloseBtn?.addEventListener('click', () => closeCatalogModal());
  els.catalogBackBtn?.addEventListener('click', () => showCatalogStep('chars'));
  els.catalogSearchInput?.addEventListener('input', renderCharacterCatalogGrid);

  els.catalogElementFilters?.addEventListener('click', (event) => {
    const chosen = event.target.closest('.filter-tab');
    if (!chosen) return;
    activeElementFilter = chosen.dataset.element || 'all';
    for (const other of els.catalogElementFilters.querySelectorAll('.filter-tab')) {
      other.classList.toggle('is-active', other === chosen);
    }
    renderCharacterCatalogGrid();
  });

  els.quickScreenshotBtn?.addEventListener('click', capturePngScreenshot);
  els.exportPngBtn?.addEventListener('click', capturePngScreenshot);
  els.exportGlbBtn?.addEventListener('click', triggerExportGlb);
  els.exportProjectBtn?.addEventListener('click', saveProjectToFile);

  // Topbar: Editor Mode, Global Undo/Redo, File Menu, Shortcut Help
  els.editorModeSwitch?.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn[data-editor-mode]');
    if (!btn) return;
    setEditorMode(btn.dataset.editorMode);
  });

  els.globalUndo?.addEventListener('click', () => history.undo());
  els.globalRedo?.addEventListener('click', () => history.redo());

  els.fileMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = els.fileMenuPopover?.hidden;
    closePopovers();
    if (els.fileMenuPopover) els.fileMenuPopover.hidden = !open;
    els.fileMenuBtn.setAttribute('aria-expanded', String(Boolean(open)));
  });

  els.fileMenuPopover?.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-file-action]');
    if (!item) return;
    const action = item.dataset.fileAction;
    closePopovers();
    if (action === 'save-project') await saveProjectToFile();
    else if (action === 'save-local') await saveProjectLocally();
    else if (action === 'open-project') els.openProjectInput?.click();
    else if (action === 'open-local-projects') await openSavedProjectsModal();
    else if (action === 'open-glb-char') els.openCharGlbInput?.click();
    else if (action === 'add-character') await openCatalogModal('add');
    else if (action === 'add-glb-char') els.addCharGlbInput?.click();
    else if (action === 'export-glb') await triggerExportGlb();
    else if (action === 'export-png') capturePngScreenshot();
    else if (action === 'new-project') {
      await clearAutosaveProject();
      if (currentModelBase && currentModelBase !== 'custom-glb') {
        await loadCharacterModel(currentModelBase, currentModelMeta);
      } else {
        openCatalogModal('switch');
      }
    }
  });

  els.openProjectInput?.addEventListener('change', async () => {
    const file = els.openProjectInput.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      await applyProjectData(json);
    } catch (err) {
      console.error(err);
      toast(`Gagal membuka proyek: ${err.message}`, 4000);
    } finally {
      els.openProjectInput.value = '';
    }
  });

  els.addCharGlbInput?.addEventListener('change', async () => {
    const file = els.addCharGlbInput.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      await addCharacter(() => loadCharacterFromGlbBuffer(buf, file.name));
    } finally {
      els.addCharGlbInput.value = '';
    }
  });

  els.castStrip?.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.castAdd !== undefined) {
      openCatalogModal('add');
      return;
    }
    if (target.dataset.remove) {
      const id = Number(target.dataset.remove);
      const meta = id === activeCharacterId ? currentModelMeta : guests.find((guest) => guest.id === id)?.currentModelMeta;
      if (window.confirm(`Keluarkan ${characterName(meta)} dari scene? Editan pada karakter ini ikut hilang.`)) removeCharacter(id);
      return;
    }
    if (target.dataset.cast) {
      const guest = guests.find((item) => item.id === Number(target.dataset.cast));
      if (guest) switchCharacter(guest);
    }
  });

  els.openCharGlbInput?.addEventListener('change', async () => {
    const file = els.openCharGlbInput.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      await loadCharacterFromGlbBuffer(buf, file.name);
      toast(`${file.name} dimuat sebagai karakter.`, 2600);
    } catch (err) {
      console.error(err);
      toast(`GLB gagal dimuat: ${err.message}`, 4000);
    } finally {
      els.openCharGlbInput.value = '';
    }
  });

  els.autosaveResumeBtn?.addEventListener('click', async () => {
    if (els.autosaveBanner) els.autosaveBanner.hidden = true;
    if (pendingAutosaveProject) {
      const proj = pendingAutosaveProject;
      pendingAutosaveProject = null;
      await applyProjectData(proj);
    }
  });

  els.autosaveDismissBtn?.addEventListener('click', async () => {
    if (els.autosaveBanner) els.autosaveBanner.hidden = true;
    pendingAutosaveProject = null;
    await clearAutosaveProject();
  });

  els.projectsModalClose?.addEventListener('click', () => {
    if (els.projectsModal) els.projectsModal.hidden = true;
  });

  els.shortcutHelpBtn?.addEventListener('click', () => {
    if (els.shortcutHelpModal) els.shortcutHelpModal.hidden = !els.shortcutHelpModal.hidden;
  });
  els.shortcutHelpClose?.addEventListener('click', () => {
    if (els.shortcutHelpModal) els.shortcutHelpModal.hidden = true;
  });

  // Add Menu (Shift+A) & Parent Menu (Ctrl+P)
  els.openAddMenuRail?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAddMenu();
  });

  els.addMenuPopover?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-add-action]');
    if (!btn) return;
    const action = btn.dataset.addAction;
    closePopovers();
    if (action === 'donor') openCatalogModal('donor');
    else if (action === 'import-glb') els.uploadGlbInput?.click();
    else if (action === 'patch-missing') {
      const added = bodyPatcher?.patchAllMissing() ?? [];
      syncBodyPatches();
      toast(added.length ? `${added.length} bagian bolong ditambal.` : 'Semua bagian sudah tertambal.', 2400);
    }
  });

  els.partParentBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    openParentMenu();
  });

  document.addEventListener('click', (event) => {
    if (
      !event.target.closest('.popover-menu') &&
      !event.target.closest('#file-menu-btn') &&
      !event.target.closest('#open-add-menu-rail') &&
      !event.target.closest('#part-parent-btn')
    ) {
      closePopovers();
    }
  });

  // Outliner Actions
  els.outlinerAddBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAddMenu();
  });
  els.outlinerDupBtn?.addEventListener('click', () => duplicateObjectsWithHistory(getSelectedTargets()));
  els.outlinerEditFaceBtn?.addEventListener('click', () => {
    setEditorMode(editorMode === 'edit' ? 'object' : 'edit');
  });
  els.restoreAllDeletedBtn?.addEventListener('click', () => {
    restoreDeletedPartsWithHistory(parts.filter((p) => p.deleted));
  });

  const setAllRewriteFlags = (enabled) => {
    const activeParts = parts.filter((p) => !p.deleted);
    if (activeParts.length === 0) return;
    const prev = activeParts.map((p) => [p, p.rewriteOnHide !== false]);
    history.execute({
      label: enabled ? 'Semua timpa kulit' : 'Semua biarkan kosong',
      undo: () => {
        for (const [p, rw] of prev) {
          p.rewriteOnHide = rw;
          bodyPatcher?.setPartRewrite(p, rw);
        }
        syncPartsAll();
      },
      redo: () => {
        for (const p of activeParts) {
          p.rewriteOnHide = enabled;
          bodyPatcher?.setPartRewrite(p, enabled);
        }
        syncPartsAll();
      },
    });
  };
  els.rewriteAllOnBtn?.addEventListener('click', () => setAllRewriteFlags(true));
  els.rewriteAllOffBtn?.addEventListener('click', () => setAllRewriteFlags(false));

  // Edit Mode Bar
  els.editSelectTool?.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn[data-select-tool]');
    if (btn) setEditSelectTool(btn.dataset.selectTool);
  });
  els.editSelectAllBtn?.addEventListener('click', () => {
    if (!editModeMesh) return;
    const all = getAllVisibleFaces(editModeMesh);
    if (editSelectedFaces.size === all.size) editSelectedFaces.clear();
    else {
      editSelectedFaces.clear();
      for (const f of all) editSelectedFaces.add(f);
    }
    updateEditModeUI();
  });
  els.editDeleteFacesBtn?.addEventListener('click', deleteSelectedEditFaces);
  els.editSeparateFacesBtn?.addEventListener('click', separateSelectedEditFaces);
  els.editDoneBtn?.addEventListener('click', exitEditMode);

  // Pose (Global history undo/redo)
  els.poseUndo.addEventListener('click', () => history.undo());
  els.poseRedo.addEventListener('click', () => history.redo());

  // Pose Library
  els.poseSaveBtn?.addEventListener('click', saveCurrentPoseToLibrary);
  els.poseSaveName?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCurrentPoseToLibrary();
    }
  });
  els.poseImportBtn?.addEventListener('click', () => els.poseImportInput?.click());
  els.poseImportInput?.addEventListener('change', async () => {
    const file = els.poseImportInput.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const poses = validatePoseJson(json);
      if (poses.length === 0) throw new Error('File bukan format pose yang valid.');
      for (const p of poses) await savePoseRecord(p);
      await refreshPoseLibraryUI();
      if (poses.length === 1 && poseRig) applySavedPoseRecord(poses[0]);
      toast(`${poses.length} pose diimpor.`, 2400);
    } catch (err) {
      toast(`Gagal impor pose: ${err.message}`, 3600);
    } finally {
      els.poseImportInput.value = '';
    }
  });
  els.poseExportAllBtn?.addEventListener('click', async () => {
    const poses = await listSavedPoses();
    if (poses.length === 0) {
      toast('Belum ada pose untuk diekspor.', 2200);
      return;
    }
    downloadJsonFile({ type: 'kurumi-pose-bundle', version: 1, poses }, 'kurumi-poses.pose.json');
    toast(`${poses.length} pose diekspor.`, 2200);
  });
  els.poseReset.addEventListener('click', () => {
    if (poseRig?.resetAll()) toast('Pose dikembalikan ke animasi. Ctrl+Z untuk membatalkan.', 3200);
  });
  els.poseResetPart.addEventListener('click', () => {
    const handle = poseRig && poseHandles.selectedId ? poseRig.handle(poseHandles.selectedId) : null;
    if (handle) poseRig.resetGroup(handle.group);
  });
  els.poseHandShapes.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip[data-shape]');
    if (!chip || !poseRig || !fingerPanelSide) return;
    pauseForPosing();
    poseRig.shapeHand(fingerPanelSide, chip.dataset.shape);
  });
  els.poseFingerList.addEventListener('input', (event) => {
    const row = event.target.closest('[data-finger]');
    if (row) feedFingerSlider(event.target, (amount) => poseRig.setFingerCurl(row.dataset.finger, amount));
  });
  els.poseFingerList.addEventListener('change', closeFingerSlider);
  els.poseHandSpread.addEventListener('input', () => {
    feedFingerSlider(els.poseHandSpread, (amount) => poseRig.setHandSpread(fingerPanelSide, amount));
  });
  els.poseHandSpread.addEventListener('change', closeFingerSlider);
  els.poseFingersZoom.addEventListener('click', () => {
    if (fingerPanelSide) flyToHand(fingerPanelSide);
  });
  els.poseFingersReset.addEventListener('click', () => {
    if (fingerPanelSide && poseRig?.resetGroup(`fingers${fingerPanelSide}`)) toast('Jari dikembalikan ke animasi.', 2200);
  });
  els.posePinFeet.addEventListener('change', () => {
    if (poseRig) poseRig.pins.feet = els.posePinFeet.checked;
    poseHandles.refresh();
  });
  els.posePinHands.addEventListener('change', () => {
    if (poseRig) poseRig.pins.hands = els.posePinHands.checked;
    poseHandles.refresh();
  });
  els.poseCollide.addEventListener('change', () => {
    if (!bodyColliders) return;
    bodyColliders.enabled = els.poseCollide.checked;
    poseRig?.refresh();
  });
  els.poseCorrectives.addEventListener('change', () => {
    if (!poseRig) return;
    poseRig.correctives.enabled = els.poseCorrectives.checked;
    poseRig.refresh();
    if (els.poseCorrectives.checked) ensurePoseCorrectives();
  });

  // Body patches
  els.patchList.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip[data-region]');
    if (!chip || !bodyPatcher) return;
    const id = chip.dataset.region;
    const wasOn = bodyPatcher.has(id);
    history.execute({
      label: `${wasOn ? 'Lepas' : 'Tambal'} ${id}`,
      undo: () => {
        if (wasOn) bodyPatcher.add(id);
        else bodyPatcher.remove(id);
        syncBodyPatches();
      },
      redo: () => {
        if (wasOn) bodyPatcher.remove(id);
        else bodyPatcher.add(id);
        syncBodyPatches();
      },
    });
  });
  els.patchAuto.addEventListener('change', syncBodyPatches);
  els.patchMode.addEventListener('click', (event) => {
    const button = event.target.closest('.seg-btn');
    if (!button) return;
    for (const other of els.patchMode.querySelectorAll('.seg-btn')) other.classList.toggle('is-active', other === button);
    bodyPatcher?.setMode(patchMode());
    syncBodyPatches();
  });
  els.patchFillStyle?.addEventListener('click', (event) => {
    const button = event.target.closest('.seg-btn');
    if (!button) return;
    for (const other of els.patchFillStyle.querySelectorAll('.seg-btn')) other.classList.toggle('is-active', other === button);
    bodyPatcher?.setFillStyle(patchFillStyle(), els.patchBaselayerColor?.value || '#252730');
    syncBodyPatches();
  });
  els.patchBaselayerColor?.addEventListener('input', () => {
    bodyPatcher?.setFillStyle(patchFillStyle(), els.patchBaselayerColor.value);
    renderer.shadowMap.needsUpdate = true;
  });
  els.patchFillAllBtn?.addEventListener('click', () => {
    if (!bodyPatcher) return;
    const added = bodyPatcher.patchAllMissing();
    syncBodyPatches();
    toast(added.length ? `${added.length} area ditambal.` : 'Tidak ada area bolong.', 2200);
  });
  els.patchDebugToggle?.addEventListener('change', syncGapDebugOverlay);
  els.patchThickness.addEventListener('input', () => {
    const value = Number(els.patchThickness.value);
    els.patchThicknessVal.textContent = `${value.toFixed(2)}×`;
    bodyPatcher?.setThickness(value);
    renderer.shadowMap.needsUpdate = true;
  });

  // Viewport tools and click / Edit Mode selection
  els.viewportToolbar?.addEventListener('click', (event) => {
    const btn = event.target.closest('.tool-btn[data-gizmo]');
    if (!btn) return;
    setGizmoMode(btn.dataset.gizmo);
  });

  const paintBrushAt = (clientX, clientY, additive = true) => {
    if (!editModeMesh) return;
    const rect = els.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const rx = 28 / Math.max(1, rect.width);
    const ry = 28 / Math.max(1, rect.height);
    const hitFaces = selectFacesInCircle(editModeMesh, camera, ndcX, ndcY, rx, ry);
    if (!additive) editSelectedFaces.clear();
    for (const f of hitFaces) editSelectedFaces.add(f);
    updateEditModeUI();
  };

  els.canvas.addEventListener('pointerdown', (event) => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
    if (editorMode === 'edit' && editModeMesh && event.button === 0) {
      if (editSelectTool === 'box') {
        if (controls) controls.enabled = false;
        editDragState = { kind: 'box', startX: event.clientX, startY: event.clientY, additive: event.shiftKey };
        if (els.viewportSelectRect) {
          els.viewportSelectRect.hidden = false;
          els.viewportSelectRect.style.left = `${event.clientX}px`;
          els.viewportSelectRect.style.top = `${event.clientY}px`;
          els.viewportSelectRect.style.width = '0px';
          els.viewportSelectRect.style.height = '0px';
        }
      } else if (editSelectTool === 'brush') {
        if (controls) controls.enabled = false;
        editDragState = { kind: 'brush' };
        paintBrushAt(event.clientX, event.clientY, true);
      }
    }
  });

  els.canvas.addEventListener('pointermove', (event) => {
    if (editorMode !== 'edit') return;
    const vpRect = els.viewport.getBoundingClientRect();
    if (editSelectTool === 'brush' && els.viewportBrushRing) {
      els.viewportBrushRing.hidden = false;
      els.viewportBrushRing.style.left = `${event.clientX - vpRect.left}px`;
      els.viewportBrushRing.style.top = `${event.clientY - vpRect.top}px`;
      els.viewportBrushRing.style.width = '56px';
      els.viewportBrushRing.style.height = '56px';
    }
    if (!editDragState) return;
    if (editDragState.kind === 'box' && els.viewportSelectRect) {
      const x0 = Math.min(editDragState.startX, event.clientX) - vpRect.left;
      const y0 = Math.min(editDragState.startY, event.clientY) - vpRect.top;
      const w = Math.abs(event.clientX - editDragState.startX);
      const h = Math.abs(event.clientY - editDragState.startY);
      els.viewportSelectRect.style.left = `${x0}px`;
      els.viewportSelectRect.style.top = `${y0}px`;
      els.viewportSelectRect.style.width = `${w}px`;
      els.viewportSelectRect.style.height = `${h}px`;
    } else if (editDragState.kind === 'brush') {
      paintBrushAt(event.clientX, event.clientY, true);
    }
  });

  els.canvas.addEventListener('pointerup', (event) => {
    if (editorMode === 'edit' && editDragState) {
      const drag = editDragState;
      editDragState = null;
      if (els.viewportSelectRect) els.viewportSelectRect.hidden = true;
      if (controls) controls.enabled = editSelectTool === 'click' || editSelectTool === 'linked';
      if (drag.kind === 'box' && editModeMesh) {
        const rect = els.canvas.getBoundingClientRect();
        const x0 = ((Math.min(drag.startX, event.clientX) - rect.left) / rect.width) * 2 - 1;
        const x1 = ((Math.max(drag.startX, event.clientX) - rect.left) / rect.width) * 2 - 1;
        const y0 = -((Math.max(drag.startY, event.clientY) - rect.top) / rect.height) * 2 + 1;
        const y1 = -((Math.min(drag.startY, event.clientY) - rect.top) / rect.height) * 2 + 1;
        const boxFaces = selectFacesInBox(editModeMesh, camera, x0, y0, x1, y1);
        if (!drag.additive) editSelectedFaces.clear();
        for (const f of boxFaces) editSelectedFaces.add(f);
        updateEditModeUI();
        return;
      }
      if (drag.kind === 'brush') return;
    }

    const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (dist > 5 || !model || transformControls?.dragging) return;

    const rect = els.canvas.getBoundingClientRect();
    pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    if (pendingPlacement) {
      placePendingAt(event);
      return;
    }

    if (editorMode !== 'edit') {
      const guest = guestUnderPointer();
      if (guest) {
        switchCharacter(guest);
        return;
      }
    }

    if (editorMode === 'edit' && editModeMesh) {
      refreshPickBounds([editModeMesh]);
      const hits = raycaster.intersectObject(editModeMesh, false);
      if (hits.length > 0 && hits[0].faceIndex != null) {
        const origFace = visibleHitToOriginalFace(editModeMesh, hits[0].faceIndex);
        if (origFace >= 0) {
          if (editSelectTool === 'linked') {
            const linked = selectLinkedFaces(editModeMesh, origFace);
            if (!event.shiftKey) editSelectedFaces.clear();
            for (const f of linked) editSelectedFaces.add(f);
          } else {
            if (!event.shiftKey && !event.ctrlKey) {
              if (editSelectedFaces.has(origFace) && editSelectedFaces.size === 1) editSelectedFaces.clear();
              else {
                editSelectedFaces.clear();
                editSelectedFaces.add(origFace);
              }
            } else if (editSelectedFaces.has(origFace)) {
              editSelectedFaces.delete(origFace);
            } else {
              editSelectedFaces.add(origFace);
            }
          }
          updateEditModeUI();
        }
      } else if (!event.shiftKey) {
        editSelectedFaces.clear();
        updateEditModeUI();
      }
      return;
    }

    // In pose mode the model is not pickable: a click on it clears the joint selection.
    if (activeGizmoMode === 'pose') {
      if (poseHandles?.selectedId) selectPoseHandle(null);
      return;
    }

    const pickables = [
      ...parts.filter((p) => !p.deleted && p.object.visible).map((p) => p.object),
      ...activeKitbashItems.filter((k) => k.object.visible).map((k) => k.object),
    ];
    refreshPickBounds(pickables);
    const hits = raycaster.intersectObjects(pickables, true).filter((h) => !ou(h.object));
    if (hits.length > 0) {
      let hitObj = hits[0].object;
      const kbMatch = activeKitbashItems.find((k) => k.object === hitObj || k.object.children.includes(hitObj));
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (kbMatch) {
        selectObjectForEditing(kbMatch.object, kbMatch.name, { additive });
      } else {
        const partMatch = parts.find((p) => p.object === hitObj);
        selectObjectForEditing(hitObj, partMatch ? partDisplayName(partMatch) : partLabel(hitObj), { additive });
      }
    }
  });

  // Transform Sliders for Selected Part (with undo tracking)
  let transformSliderBefore = null;
  const beginTransformSlider = () => {
    const target = selectedObject || model;
    if (!target || transformSliderBefore) return;
    transformSliderBefore = {
      target,
      pos: target.position.clone(),
      quat: target.quaternion.clone(),
      scale: target.scale.clone(),
    };
  };
  const onPartTransformSlider = () => {
    beginTransformSlider();
    const target = selectedObject || model;
    if (!target) return;
    const px = Number(els.partPosX.value);
    const py = Number(els.partPosY.value);
    const pz = Number(els.partPosZ.value);
    const sc = Number(els.partScale.value);
    target.position.set(px, py, pz);
    target.scale.setScalar(sc);
    els.partPosXVal.textContent = px.toFixed(2);
    els.partPosYVal.textContent = py.toFixed(2);
    els.partPosZVal.textContent = pz.toFixed(2);
    els.partScaleVal.textContent = `${sc.toFixed(2)}×`;
    renderer.shadowMap.needsUpdate = true;
  };
  const commitTransformSlider = () => {
    if (!transformSliderBefore) return;
    const { target, pos: p0, quat: q0, scale: s0 } = transformSliderBefore;
    transformSliderBefore = null;
    const p1 = target.position.clone();
    const q1 = target.quaternion.clone();
    const s1 = target.scale.clone();
    if (p0.distanceToSquared(p1) > 1e-8 || s0.distanceToSquared(s1) > 1e-8) {
      history.record({
        label: `Geser/Skala ${target.userData?.kitbashName || partLabel(target)}`,
        undo: () => {
          target.position.copy(p0);
          target.quaternion.copy(q0);
          target.scale.copy(s0);
          syncTransformSlidersFromSelected();
          renderer.shadowMap.needsUpdate = true;
        },
        redo: () => {
          target.position.copy(p1);
          target.quaternion.copy(q1);
          target.scale.copy(s1);
          syncTransformSlidersFromSelected();
          renderer.shadowMap.needsUpdate = true;
        },
      });
    }
  };
  for (const sl of [els.partPosX, els.partPosY, els.partPosZ, els.partScale]) {
    sl?.addEventListener('input', onPartTransformSlider);
    sl?.addEventListener('change', commitTransformSlider);
  }

  els.partTransformReset?.addEventListener('click', () => {
    const target = selectedObject || model;
    if (!target) return;
    const p0 = target.position.clone();
    const q0 = target.quaternion.clone();
    const s0 = target.scale.clone();
    const orig = bindTransforms.get(target);
    const p1 = orig ? orig.position.clone() : new THREE.Vector3(0, 0, 0);
    const q1 = orig ? orig.quaternion.clone() : new THREE.Quaternion();
    const s1 = orig ? orig.scale.clone() : new THREE.Vector3(1, 1, 1);
    history.execute({
      label: `Reset posisi ${target.userData?.kitbashName || partLabel(target)}`,
      undo: () => {
        target.position.copy(p0);
        target.quaternion.copy(q0);
        target.scale.copy(s0);
        syncTransformSlidersFromSelected();
        renderer.shadowMap.needsUpdate = true;
      },
      redo: () => {
        target.position.copy(p1);
        target.quaternion.copy(q1);
        target.scale.copy(s1);
        syncTransformSlidersFromSelected();
        renderer.shadowMap.needsUpdate = true;
      },
    });
  });

  // Color & Shader Studio Controls
  els.colorTargetSelect?.addEventListener('change', syncColorControlsFromTarget);

  els.colorResetBtn?.addEventListener('click', () => {
    const targets = getSelectedColorTargetMeshes();
    const beforeStates = targets.map((m) => [m, getMeshMaterialState(m)]);
    history.execute({
      label: 'Reset warna & shader',
      undo: () => {
        for (const [m, st] of beforeStates) applyMeshMaterialEdits(m, st);
        syncColorControlsFromTarget();
      },
      redo: () => {
        for (const m of targets) resetMeshMaterialState(m);
        syncColorControlsFromTarget();
      },
    });
    toast('Warna dan shader dikembalikan.', 2400);
  });

  const onHslSlider = () => {
    const h = Number(els.colorHue.value);
    const s = Number(els.colorSat.value);
    const l = Number(els.colorLight.value);
    els.colorHueVal.textContent = `${Math.round(h)}°`;
    els.colorSatVal.textContent = `${Math.round(s)}%`;
    els.colorLightVal.textContent = `${Math.round(l)}%`;
    for (const mesh of getSelectedColorTargetMeshes()) {
      applyMeshTextureHSL(mesh, h, s, l);
    }
  };
  els.colorHue?.addEventListener('change', onHslSlider);
  els.colorSat?.addEventListener('change', onHslSlider);
  els.colorLight?.addEventListener('change', onHslSlider);
  els.colorHue?.addEventListener('input', () => {
    els.colorHueVal.textContent = `${Math.round(Number(els.colorHue.value))}°`;
  });
  els.colorSat?.addEventListener('input', () => {
    els.colorSatVal.textContent = `${Math.round(Number(els.colorSat.value))}%`;
  });
  els.colorLight?.addEventListener('input', () => {
    els.colorLightVal.textContent = `${Math.round(Number(els.colorLight.value))}%`;
  });

  els.hslResetBtn?.addEventListener('click', () => {
    els.colorHue.value = '0';
    els.colorSat.value = '0';
    els.colorLight.value = '0';
    onHslSlider();
  });

  const wireColorProp = (inputEl, propName, valEl = null) => {
    inputEl?.addEventListener('input', () => {
      const val = inputEl.type === 'checkbox' ? inputEl.checked : inputEl.value;
      if (valEl) valEl.textContent = Number(val).toFixed(2);
      for (const mesh of getSelectedColorTargetMeshes()) {
        applyMeshMaterialProperty(mesh, propName, val);
      }
    });
  };

  wireColorProp(els.colorAlbedo, 'albedoHex');
  wireColorProp(els.colorGlobalTint, 'globalTintHex');
  wireColorProp(els.colorShadow1, 'shadow1Hex');
  wireColorProp(els.colorShadow2, 'shadow2Hex');
  wireColorProp(els.colorRim, 'rimHex');
  wireColorProp(els.colorOutline, 'outlineHex');
  wireColorProp(els.sliderRimIntensity, 'rimIntensity', els.sliderRimIntensityVal);
  wireColorProp(els.sliderCelThreshold, 'celThreshold', els.sliderCelThresholdVal);
  wireColorProp(els.sliderCelSmooth, 'celSmooth', els.sliderCelSmoothVal);
  wireColorProp(els.sliderBloomFactor, 'bloomFactor', els.sliderBloomFactorVal);
  wireColorProp(els.sliderOutlineWidth, 'outlineWidth', els.sliderOutlineWidthVal);
  wireColorProp(els.togglePartOutline, 'outlineVisible');
  wireColorProp(els.togglePartWireframe, 'wireframe');

  // Kitbash Studio Controls
  els.pickDonorModelBtn?.addEventListener('click', () => {
    openCatalogModal('donor');
  });

  els.donorBindMode?.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;
    currentDonorBindMode = btn.dataset.bind || 'skeleton';
    for (const b of els.donorBindMode.querySelectorAll('.seg-btn')) {
      b.classList.toggle('is-active', b === btn);
    }
  });

  els.uploadGlbInput?.addEventListener('change', async () => {
    const file = els.uploadGlbInput.files?.[0];
    if (!file || !model) return;
    toast(`Memuat ${file.name}…`);
    try {
      const customRoot = await loadCustomGlbFile(file);
      if (customRoot.userData.customAssetBuffer) {
        const assetId = await saveBinaryAsset(null, customRoot.userData.customAssetBuffer, file.name);
        customRoot.userData.assetId = assetId;
      }
      requestAccessory(customRoot.userData.kitbashName || file.name, 'custom-glb', () => customRoot);
    } catch (err) {
      console.error(err);
      toast(`File gagal dimuat: ${err.message}`);
    } finally {
      els.uploadGlbInput.value = '';
    }
  });

  els.clearKitbashBtn?.addEventListener('click', () => {
    if (activeKitbashItems.length === 0) return;
    deleteObjectsWithHistory(activeKitbashItems.map((item) => item.object));
  });

  // Playback & Animation Controls
  els.play.addEventListener('click', togglePlayback);

  els.list.addEventListener('click', (event) => {
    const item = event.target.closest('.clip-item');
    if (!item) return;
    playClipByName(item.dataset.name);
  });

  els.search.addEventListener('input', () => renderClipList(els.search.value));

  els.scrub.addEventListener('pointerdown', () => {
    scrubbing = true;
  });

  els.scrub.addEventListener('input', () => {
    if (!currentAction) return;
    const duration = currentAction.getClip().duration || 0;
    const time = (Number(els.scrub.value) / 1000) * duration;
    if (springSystem) {
      springSystem.restore();
      springSystem.reset();
    }
    currentAction.time = Math.min(time, duration - 1e-4);
    advanceMixer(0);
    if (springSystem) springSystem.step(0);
    renderer.shadowMap.needsUpdate = true;
    updateTimelineUI();
  });

  const endScrub = () => {
    scrubbing = false;
  };
  els.scrub.addEventListener('pointerup', endScrub);
  els.scrub.addEventListener('pointercancel', endScrub);
  els.scrub.addEventListener('change', endScrub);

  els.speed.addEventListener('input', () => {
    const speed = Number(els.speed.value);
    if (mixer) mixer.timeScale = speed;
    els.speedVal.textContent = `${speed.toFixed(1)}×`;
  });

  els.loop.addEventListener('change', () => {
    loopEnabled = els.loop.checked;
    applyLoopMode();
    updateNowPlaying();
  });

  els.skeleton.addEventListener('change', () => {
    if (skeletonHelper) skeletonHelper.visible = els.skeleton.checked;
  });

  els.resetCamera.addEventListener('click', flyHome);

  els.partsAll.addEventListener('change', () => setAllParts(els.partsAll.checked));
  els.partsUnsolo?.addEventListener('click', () => {
    if (soloPart) toggleSoloPart(soloPart);
  });
  els.partsReset.addEventListener('click', () => {
    const snapshot = parts.map((p) => ({ part: p, vis: p.object.visible, del: p.deleted }));
    history.execute({
      label: 'Reset tampilan bagian',
      undo: () => {
        for (const s of snapshot) {
          s.part.deleted = s.del;
          s.part.object.visible = s.vis;
        }
        buildPartsOutliner();
        renderer.shadowMap.needsUpdate = true;
      },
      redo: () => {
        soloPart = null;
        if (els.partsUnsolo) els.partsUnsolo.hidden = true;
        for (const part of parts) {
          part.deleted = false;
          part.object.visible = part.defaultVisible;
        }
        buildPartsOutliner();
        renderer.shadowMap.needsUpdate = true;
      },
    });
  });

  els.morphMesh.addEventListener('change', () => {
    const part = morphParts.find((item) => String(item.index) === els.morphMesh.value);
    showMorphPart(part ?? null);
  });
  els.morphReset.addEventListener('click', resetMorphs);

  els.modelScale.addEventListener('input', () => {
    const value = Number(els.modelScale.value);
    if (model) {
      model.scale.setScalar(value);
      renderer.shadowMap.needsUpdate = true;
    }
    els.modelScaleVal.textContent = `${value.toFixed(2)}×`;
  });

  els.modelRotate.addEventListener('input', () => {
    const value = Number(els.modelRotate.value);
    if (model) {
      model.rotation.y = THREE.MathUtils.degToRad(value);
      renderer.shadowMap.needsUpdate = true;
    }
    els.modelRotateVal.textContent = `${Math.round(value)}°`;
  });

  els.bindPose.addEventListener('click', enterBindPose);
  els.playgroundReset.addEventListener('click', resetPlayground);

  els.stageMode.addEventListener('click', (event) => {
    const button = event.target.closest('.seg-btn');
    if (!button) return;
    applyStage(button.dataset.stage);
  });

  els.customBgColor?.addEventListener('input', () => {
    const hex = els.customBgColor.value;
    els.viewport.style.background = hex;
    if (stage?.ground) stage.ground.material.color.set(hex);
  });

  els.materialMode.addEventListener('click', (event) => {
    const button = event.target.closest('.seg-btn');
    if (button) applyMaterialMode(button.dataset.material);
  });

  els.toggleGrid.addEventListener('change', () => {
    showGrid = els.toggleGrid.checked;
    syncStageVisibility();
  });

  els.toggleShadow.addEventListener('change', () => {
    showShadow = els.toggleShadow.checked;
    if (pgrModel && !showShadow) {
      for (const caster of pgrModel.groundShadowCasters) {
        caster.shadow.visible = false;
      }
    }
  });

  els.lightYaw.addEventListener('input', () => {
    lightYaw = Number(els.lightYaw.value);
    els.lightYawVal.textContent = `${lightYaw}°`;
    updateKeyLight();
  });

  els.lightPitch.addEventListener('input', () => {
    lightPitch = Number(els.lightPitch.value);
    els.lightPitchVal.textContent = `${lightPitch}°`;
    updateKeyLight();
  });

  const isTextEntry = (target) => {
    if (!target || !target.tagName) return false;
    if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
    return target.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'file'].includes(target.type);
  };

  window.addEventListener('keydown', (event) => {
    if (isTextEntry(event.target)) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }
    const catalogOpen = !els.catalogOverlay?.hidden;
    const projectsOpen = els.projectsModal && !els.projectsModal.hidden;
    const helpOpen = els.shortcutHelpModal && !els.shortcutHelpModal.hidden;
    const key = event.key.toLowerCase();

    if (event.key === 'Escape') {
      if (helpOpen) els.shortcutHelpModal.hidden = true;
      else if (projectsOpen) els.projectsModal.hidden = true;
      else if (catalogOpen) closeCatalogModal();
      else if (!els.addMenuPopover?.hidden || !els.parentMenuPopover?.hidden || !els.fileMenuPopover?.hidden) closePopovers();
      else if (modalTransform) cancelModalTransform();
      else if (pendingPlacement) cancelPlacement();
      else if (editorMode === 'edit') {
        if (editSelectedFaces.size > 0) {
          editSelectedFaces.clear();
          updateEditModeUI();
        } else {
          exitEditMode();
        }
      } else if (activeGizmoMode === 'pose' && poseHandles?.selectedId) selectPoseHandle(null);
      else setGizmoMode('none');
      return;
    }
    if (catalogOpen || projectsOpen) return;

    if (event.key === '?') {
      if (els.shortcutHelpModal) els.shortcutHelpModal.hidden = !els.shortcutHelpModal.hidden;
      return;
    }
    if (helpOpen) return;

    // Ctrl / Cmd shortcuts
    if (event.ctrlKey || event.metaKey) {
      if (event.altKey) return;
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (key === 'y') {
        event.preventDefault();
        history.redo();
      } else if (key === 's') {
        event.preventDefault();
        saveProjectToFile();
      } else if (key === 'p') {
        event.preventDefault();
        openParentMenu();
      }
      return;
    }

    // Alt shortcuts
    if (event.altKey) {
      if (key === 'h') {
        event.preventDefault();
        setAllParts(true);
      } else if (key === 'a') {
        event.preventDefault();
        if (editorMode === 'edit') {
          editSelectedFaces.clear();
          updateEditModeUI();
        } else {
          selectObjectForEditing(null);
        }
      }
      return;
    }

    // Modal numeric transform capture (G / R / S + X/Y/Z + digits + Enter)
    if (modalTransform) {
      if (key === 'x' || key === 'y' || key === 'z') {
        event.preventDefault();
        modalTransform.axis = modalTransform.axis === key ? null : key;
        if (transformControls) {
          transformControls.showX = !modalTransform.axis || modalTransform.axis === 'x';
          transformControls.showY = !modalTransform.axis || modalTransform.axis === 'y';
          transformControls.showZ = !modalTransform.axis || modalTransform.axis === 'z';
        }
        applyModalTransformPreview();
        updateModalTransformUI();
        return;
      }
      if (/^[0-9.\-]$/.test(event.key)) {
        event.preventDefault();
        modalTransform.digits += event.key;
        applyModalTransformPreview();
        updateModalTransformUI();
        return;
      }
      if (event.key === 'Backspace' && modalTransform.digits.length > 0) {
        event.preventDefault();
        modalTransform.digits = modalTransform.digits.slice(0, -1);
        applyModalTransformPreview();
        updateModalTransformUI();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commitModalTransform();
        return;
      }
    }

    // Shift shortcuts
    if (event.shiftKey) {
      if (key === 'a') {
        event.preventDefault();
        toggleAddMenu();
      } else if (key === 'd') {
        event.preventDefault();
        duplicateObjectsWithHistory(getSelectedTargets());
      } else if (key === 'h') {
        event.preventDefault();
        const keep = new Set(getSelectedTargets());
        if (keep.size === 0) return;
        const activeParts = parts.filter((p) => !p.deleted);
        const prevVis = activeParts.map((p) => [p, p.object.visible]);
        history.execute({
          label: 'Sembunyikan yang tidak dipilih',
          undo: () => {
            for (const [p, v] of prevVis) p.object.visible = v;
            syncPartsAll();
            renderer.shadowMap.needsUpdate = true;
          },
          redo: () => {
            for (const p of activeParts) p.object.visible = keep.has(p.object);
            syncPartsAll();
            renderer.shadowMap.needsUpdate = true;
          },
        });
      }
      return;
    }

    // Tab: Toggle Edit Mode (Face Edit)
    if (event.key === 'Tab') {
      event.preventDefault();
      setEditorMode(editorMode === 'edit' ? 'object' : 'edit');
      return;
    }

    // Edit Mode shortcuts
    if (editorMode === 'edit') {
      if (key === 'b') {
        setEditSelectTool('box');
      } else if (key === 'c') {
        setEditSelectTool(editSelectTool === 'brush' ? 'click' : 'brush');
      } else if (key === 'l') {
        setEditSelectTool('linked');
      } else if (key === 'a') {
        const all = getAllVisibleFaces(editModeMesh);
        if (editSelectedFaces.size === all.size) editSelectedFaces.clear();
        else {
          editSelectedFaces.clear();
          for (const f of all) editSelectedFaces.add(f);
        }
        updateEditModeUI();
      } else if (key === 'x' || event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedEditFaces();
      } else if (key === 'p') {
        event.preventDefault();
        separateSelectedEditFaces();
      }
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace' || key === 'x') {
      const targets = getSelectedTargets();
      if (targets.length > 0) {
        event.preventDefault();
        deleteObjectsWithHistory(targets);
      }
      return;
    }

    if (event.key === 'F2') {
      const target = selectedObject;
      if (!target) return;
      const part = parts.find((p) => p.object === target);
      if (part?.rowEl) {
        event.preventDefault();
        const lbl = part.rowEl.querySelector('.row-label');
        if (lbl) lbl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    } else if (event.key === 'Home') {
      flyHome();
    } else if (key === 'h') {
      const targets = getSelectedTargets();
      if (targets.length === 0) return;
      const changes = targets
        .map((obj) => ({ obj, prev: obj.visible }))
        .filter((c) => c.prev);
      if (changes.length === 0) return;
      history.execute({
        label: `Sembunyikan ${changes.length} bagian`,
        undo: () => {
          for (const c of changes) c.obj.visible = c.prev;
          syncPartsAll();
          renderExtraOutliner();
          renderActiveKitbashList();
          renderer.shadowMap.needsUpdate = true;
        },
        redo: () => {
          for (const c of changes) c.obj.visible = false;
          syncPartsAll();
          renderExtraOutliner();
          renderActiveKitbashList();
          renderer.shadowMap.needsUpdate = true;
        },
      });
    } else if (event.key === '/') {
      const part = selectedObject ? parts.find((p) => p.object === selectedObject) : null;
      toggleSoloPart(part || soloPart);
    } else if (key === 'a') {
      selectedObjects.clear();
      for (const p of parts) {
        if (!p.deleted && p.object.visible) selectedObjects.add(p.object);
      }
      for (const k of activeKitbashItems) {
        if (k.object.visible) selectedObjects.add(k.object);
      }
      selectedObject = [...selectedObjects][0] ?? null;
      updateOutlinerHighlights();
      updateViewportHint();
    } else if (key === 'p') {
      setGizmoMode(activeGizmoMode === 'pose' ? 'none' : 'pose');
    } else if (key === 'g') {
      startModalTransform('translate');
    } else if (key === 'r' || key === 't') {
      startModalTransform('rotate');
    } else if (key === 's') {
      startModalTransform('scale');
    }
  });

  // Keeps Space from also "clicking" whichever button was focused last.
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && !isTextEntry(event.target) && els.catalogOverlay?.hidden) {
      event.preventDefault();
    }
  });
}

/* ------------------------------------------------------------------ */

wireUI();
boot().catch((error) => {
  console.error(error);
  els.loading.hidden = false;
  els.loading.classList.remove('done');
  els.loading.classList.add('is-error');
  els.loadingTitle.textContent = 'Gagal memuat';
  els.loadingSub.textContent = error?.message ?? String(error);
  toast(`Aset gagal dimuat: ${error?.message ?? error}`, 12000);
});

window.__viewerReady = () => Boolean(model && pgrModel);
