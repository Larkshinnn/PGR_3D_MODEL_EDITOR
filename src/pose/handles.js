import * as THREE from 'three';

/**
 * Draws the pose rig's handles as DOM dots over the canvas and turns pointer
 * gestures on them into rig drags. Dots live in the DOM (not the WebGL scene)
 * so they stay crisp, never get occluded by the model and never end up in a
 * screenshot.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4;
/**
 * Fingertip dots show unasked once the hand is this large on screen (wrist to
 * knuckle, in pixels), and go away again below the second value.
 */
const FINGERS_SHOW = 44;
const FINGERS_HIDE = 36;
/** Wrists closer together than this on screen count as overlapping hands. */
const HANDS_APART = 260;

const _world = new THREE.Vector3();
const _view = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _eye = new THREE.Vector3();

export function createPoseHandles({
  layer,
  canvas,
  camera,
  onDragStart = null,
  onDragEnd = null,
  onSelect = null,
  onReset = null,
}) {
  const raycaster = new THREE.Raycaster();
  const dots = new Map();
  let lines = [];
  let rig = null;
  let visible = false;
  let selectedId = null;
  let press = null;
  /** Per hand ('L', 'R'): the wrist's dot, and whether its fingertip dots are out. */
  let wrists = {};
  const fingersOut = { L: false, R: false };
  const closeUp = { L: false, R: false };

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('pose-bones');
  svg.setAttribute('aria-hidden', 'true');
  layer.appendChild(svg);

  function pointerOnPlane(event, plane, out) {
    const rect = canvas.getBoundingClientRect();
    _ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(_ndc, camera);
    return raycaster.ray.intersectPlane(plane, out);
  }

  function onPointerDown(event) {
    if (!rig || press || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const el = event.currentTarget;
    event.preventDefault();
    event.stopPropagation();
    el.setPointerCapture(event.pointerId);
    press = {
      id: el.dataset.handle,
      el,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      plane: new THREE.Plane(),
      grabOffset: new THREE.Vector3(),
      rigDrag: null,
    };
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!press.rigDrag) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD) return;
      onDragStart?.(press.id);
      const rigDrag = rig.beginDrag(press.id);
      if (!rigDrag) return;
      press.rigDrag = rigDrag;
      // Drag in the plane that faces the camera and passes through the joint,
      // so the joint follows the pointer exactly as seen on screen.
      press.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(_world), rigDrag.start);
      if (pointerOnPlane(event, press.plane, _hit)) press.grabOffset.subVectors(rigDrag.start, _hit);
      layer.classList.add('is-dragging');
      press.el.classList.add('is-dragging');
    }
    if (!pointerOnPlane(event, press.plane, _hit)) return;
    rig.dragTo(press.rigDrag, _hit.add(press.grabOffset), _eye.setFromMatrixPosition(camera.matrixWorld));
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    const { id, el, rigDrag } = press;
    press = null;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    layer.classList.remove('is-dragging');
    el.classList.remove('is-dragging');
    if (rigDrag) {
      rig.endDrag(rigDrag);
      onDragEnd?.(id);
    } else if (event.type === 'pointerup') {
      onSelect?.(id === selectedId ? null : id);
    }
  }

  function setRig(nextRig) {
    for (const dot of dots.values()) dot.el.remove();
    dots.clear();
    for (const line of lines) line.el.remove();
    lines = [];
    press = null;
    selectedId = null;
    wrists = {};
    closeUp.L = false;
    closeUp.R = false;
    rig = nextRig;
    if (!rig) return;

    for (const link of rig.links) {
      const el = document.createElementNS(SVG_NS, 'line');
      svg.appendChild(el);
      lines.push({ el, link, shown: true });
    }

    for (const handle of rig.handles) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pose-dot';
      el.dataset.handle = handle.id;
      el.dataset.kind = handle.kind;
      el.setAttribute('aria-label', handle.label);
      const label = document.createElement('span');
      label.className = 'pose-dot-label';
      label.textContent = handle.label;
      el.appendChild(label);

      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
      // Capture can be taken away without a pointerup (window loses focus, …).
      el.addEventListener('lostpointercapture', onPointerUp);
      el.addEventListener('dblclick', (event) => {
        event.preventDefault();
        onReset?.(handle.id);
      });
      // Keyboard activation arrives as a click with no pointer behind it.
      el.addEventListener('click', (event) => {
        if (event.detail === 0) onSelect?.(handle.id === selectedId ? null : handle.id);
      });

      layer.appendChild(el);
      const dot = { el, handle, shown: true, depth: -1, at: { x: 0, y: 0 }, distance: 0 };
      dots.set(handle.id, dot);
      if (handle.hand && handle.kind !== 'finger') wrists[handle.hand] = dot;
    }
    refresh();
  }

  /** Syncs the selected / pinned / modified markers with the rig. */
  function refresh() {
    if (!rig) return;
    for (const [id, dot] of dots) {
      dot.el.classList.toggle('is-selected', id === selectedId);
      dot.el.classList.toggle('is-pinned', rig.isPinned(dot.handle));
      dot.el.classList.toggle('is-modified', rig.isGroupModified(dot.handle.group));
    }
  }

  function project(out) {
    _view.copy(_world).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_view.z;
    _view.applyMatrix4(camera.projectionMatrix);
    out.x = (_view.x * 0.5 + 0.5) * canvas.clientWidth;
    out.y = (-_view.y * 0.5 + 0.5) * canvas.clientHeight;
    return depth;
  }

  const _a = { x: 0, y: 0 };
  const _b = { x: 0, y: 0 };

  /** Call once per frame after the scene's world matrices are up to date. */
  function update() {
    if (!visible || !rig) return;

    for (const dot of dots.values()) {
      rig.handlePosition(dot.handle, _world);
      dot.distance = project(dot.at);
    }

    // Ten fingertip dots would only clutter a full-body view. A hand shows
    // its own when it is picked, being dragged, or seen from close by.
    const picked = dots.get(press?.id ?? selectedId)?.handle.hand ?? null;
    for (const side of ['L', 'R']) {
      const wrist = wrists[side];
      let span = 0;
      if (wrist) {
        for (const dot of dots.values()) {
          if (dot.handle.kind !== 'finger' || dot.handle.hand !== side) continue;
          _world.setFromMatrixPosition(dot.handle.gizmo.matrixWorld);
          project(_a);
          span = Math.max(span, Math.hypot(_a.x - wrist.at.x, _a.y - wrist.at.y));
        }
      }
      closeUp[side] = span > (closeUp[side] ? FINGERS_HIDE : FINGERS_SHOW);
    }
    // Seen from the side, the far hand sits behind the body: of two hands
    // that overlap on screen only the nearer one shows its fingertips unasked.
    if (closeUp.L && closeUp.R) {
      const { L, R } = wrists;
      if (Math.hypot(L.at.x - R.at.x, L.at.y - R.at.y) < HANDS_APART) {
        closeUp[L.distance > R.distance ? 'L' : 'R'] = false;
      }
    }
    for (const side of ['L', 'R']) fingersOut[side] = picked === side || closeUp[side];

    for (const dot of dots.values()) {
      const depth = dot.distance;
      const shown = depth > camera.near && (dot.handle.kind !== 'finger' || fingersOut[dot.handle.hand]);
      if (shown !== dot.shown) {
        dot.shown = shown;
        dot.el.style.visibility = shown ? '' : 'hidden';
      }
      if (!shown) continue;
      dot.el.style.transform = `translate3d(${dot.at.x.toFixed(1)}px, ${dot.at.y.toFixed(1)}px, 0)`;
      // Nearer joints stay on top so overlapping dots pick the one in front.
      const order = 100000 - Math.round(depth * 1000);
      if (order !== dot.depth) {
        dot.depth = order;
        dot.el.style.zIndex = String(order);
      }
    }

    for (const line of lines) {
      rig.pointPosition(line.link[0], _world);
      const depthA = project(_a);
      rig.pointPosition(line.link[1], _world);
      const depthB = project(_b);
      const shown = depthA > camera.near && depthB > camera.near && (!line.link.hand || fingersOut[line.link.hand]);
      if (shown !== line.shown) {
        line.shown = shown;
        line.el.style.visibility = shown ? '' : 'hidden';
      }
      if (!shown) continue;
      line.el.setAttribute('x1', _a.x.toFixed(1));
      line.el.setAttribute('y1', _a.y.toFixed(1));
      line.el.setAttribute('x2', _b.x.toFixed(1));
      line.el.setAttribute('y2', _b.y.toFixed(1));
    }
  }

  return {
    setRig,
    update,
    refresh,
    setVisible(next) {
      visible = Boolean(next);
      layer.hidden = !visible;
    },
    select(id) {
      selectedId = id && dots.has(id) ? id : null;
      refresh();
    },
    get selectedId() {
      return selectedId;
    },
    get dragging() {
      return Boolean(press?.rigDrag);
    },
  };
}
