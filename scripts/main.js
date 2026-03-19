/**
 * main.js — Point d'entrée de l'application.
 * Orchestre l'Engine, le HotspotManager, le SceneManager et l'interface utilisateur.
 */

import { Engine } from '../core/engine.js';
import { HotspotManager } from '../core/hotspot-manager.js';
import { SceneManager } from '../core/scene-manager.js';
import { TourSerializer } from '../core/tour-serializer.js';

/* ══════════════════════════════════════════════════════════════════════
   Initialisation
   ══════════════════════════════════════════════════════════════════════ */

const viewer = document.getElementById('viewer');
const engine = new Engine(viewer);
const hotspotMgr = new HotspotManager(engine.scene);
const sceneMgr = new SceneManager(engine, hotspotMgr);

// ── État application ──────────────────────────────────────────────────
let appMode = 'preview'; // 'preview' | 'edit'
let editSubMode = 'none';    // 'none' | 'adding' | 'dragging'
let isDragging = false;
let dragHotspot = null;
let mouseDownPos = { x: 0, y: 0 };
const DRAG_THRESHOLD = 5;

// ── Flags divers ──────────────────────────────────────────────────────
let _isDemoLoaded = false; // true si la démo est chargée (pas de confirmation clear)
let _pendingDeleteSceneId = null;  // id de la scène en attente de suppression
let _chainedHotspot = null;  // hotspot en attente d'une scène cible
let _chainedBanner = null;  // bannière DOM du modal chaîné
let _localImageObjectUrl = null;  // blob URL de l'image locale sélectionnée
let _hasUnsavedChanges = false; // pour le beforeunload

/* ══════════════════════════════════════════════════════════════════════
   Avertissement avant fermeture / rafraîchissement
   ══════════════════════════════════════════════════════════════════════ */

window.addEventListener('beforeunload', (e) => {
  if (_hasUnsavedChanges && sceneMgr.getSceneIds().length > 0) {
    e.preventDefault();
    e.returnValue = ''; // requis par certains navigateurs pour afficher la boîte native
  }
});

function markChanged() { _hasUnsavedChanges = true; }
function markSaved() { _hasUnsavedChanges = false; }

/* ══════════════════════════════════════════════════════════════════════
   Callbacks SceneManager
   ══════════════════════════════════════════════════════════════════════ */

sceneMgr.onSceneLoaded = (id, sceneData) => {
  const ve = document.getElementById('viewer-empty');
  ve.style.display  = 'none';
  // ve.style.position = '';   // ← important : retirer le position:absolute ajouté
  // ve.style.inset    = '';
  // ve.style.zIndex   = '';
  renderSceneList();
  updateStatus();
};

sceneMgr.onScenesChange = () => {
  renderSceneList();
  updateStatus();
  updateSidebarActions();
  markChanged();
};

/* ══════════════════════════════════════════════════════════════════════
   Sidebar — Collapse (version GRID optimale – 100% fiable)
   ══════════════════════════════════════════════════════════════════════ */
const appEl      = document.getElementById('app');
const toggleBtn  = document.getElementById('btn-sidebar-toggle');
const toggleIcon = document.getElementById('sidebar-toggle-icon');

let sidebarCollapsed = false;
const SIDEBAR_WIDTH = '260px';   // identique à var(--sidebar-w)

// Fonctions ultra-simples
function collapseOpen() {
  appEl.style.gridTemplateColumns = `${SIDEBAR_WIDTH} 1fr`;
  toggleBtn.style.left = SIDEBAR_WIDTH;
  toggleIcon.style.transform = 'rotate(0deg)';
}

function collapseClose() {
  appEl.style.gridTemplateColumns = `0fr 1fr`;
  toggleBtn.style.left = '0px';
  toggleIcon.style.transform = 'rotate(180deg)';
}

// Toggle
toggleBtn.addEventListener('click', () => {
  sidebarCollapsed = !sidebarCollapsed;
  if (sidebarCollapsed) {
    collapseClose();
  } else {
    collapseOpen();
  }
  // Fallback : forcer un resize du canvas après la fin de la transition CSS
  setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
});

// Position initiale (au chargement)
requestAnimationFrame(() => {
  toggleBtn.style.left = SIDEBAR_WIDTH;
});

/* ══════════════════════════════════════════════════════════════════════
   Sidebar — Boutons groupés (disabled si aucune scène)
   ══════════════════════════════════════════════════════════════════════ */

function updateSidebarActions() {
  const hasScenes = sceneMgr.getSceneIds().length > 0;

  const btnReset = document.getElementById('btn-reset-all-hotspots');
  const btnDelete = document.getElementById('btn-delete-all-scenes');

  btnReset.disabled = !hasScenes;
  btnDelete.disabled = !hasScenes;

  const opacity = hasScenes ? '1' : '0.35';
  const cursor = hasScenes ? 'pointer' : 'not-allowed';

  btnReset.style.opacity = opacity;
  btnReset.style.cursor = cursor;
  btnDelete.style.opacity = opacity;
  btnDelete.style.cursor = cursor;
}

/* ══════════════════════════════════════════════════════════════════════
   Gestion des modes
   ══════════════════════════════════════════════════════════════════════ */

function setMode(mode) {
  appMode = mode;
  editSubMode = 'none';
  engine.setMode(mode);
  engine.setEditSubMode('none');
  hotspotMgr.clearSelection();

  const btnPreview = document.getElementById('btn-preview');
  const btnEdit = document.getElementById('btn-edit');
  const editTools = document.getElementById('edit-tools');

  btnPreview.classList.toggle('active', mode === 'preview');
  btnEdit.classList.toggle('active', mode === 'edit');
  editTools.style.display = mode === 'edit' ? 'flex' : 'none';

  setEditSubMode('none');
  updateCursor();
  updateStatus();
  updateHotspotAppearance();
}

function setEditSubMode(sub) {
  editSubMode = sub;
  engine.setEditSubMode(sub);
  document.getElementById('btn-add-hotspot').classList.toggle('active', sub === 'adding');
  updateCursor();
  updateStatus();
}

function updateCursor() {
  viewer.className = '';
  if (appMode === 'preview') viewer.classList.add('cursor-grab');
  else if (editSubMode === 'adding') viewer.classList.add('cursor-crosshair');
  else viewer.classList.add('cursor-grab');
}

function updateHotspotAppearance() {
  hotspotMgr.hotspots.forEach(h => {
    h.mesh.material.opacity = appMode === 'preview' ? 0.7 : 0.9;
  });
}

/* ══════════════════════════════════════════════════════════════════════
   Gestion des événements souris sur le viewer
   ══════════════════════════════════════════════════════════════════════ */

viewer.addEventListener('mousedown', onMouseDown);
viewer.addEventListener('mousemove', onMouseMove);
viewer.addEventListener('mouseup', onMouseUp);

function onMouseDown(e) {
  if (e.button !== 0) return;
  mouseDownPos = { x: e.clientX, y: e.clientY };
  isDragging = false;

  if (appMode === 'edit' && editSubMode === 'none') {
    const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
    if (hits.length > 0) {
      const hotspot = hotspotMgr.findByMesh(hits[0].object);
      if (hotspot) {
        hotspotMgr.selectHotspot(hotspot);
        dragHotspot = hotspot;
        engine.setControlsEnabled(false);
        viewer.classList.add('cursor-grabbing');
        e.stopPropagation();
        return;
      }
    }
  }
}

function onMouseMove(e) {
  if (!isDragging && dragHotspot) {
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDragging = true;
      editSubMode = 'dragging';
    }
  }

  if (isDragging && dragHotspot) {
    const hit = engine.raycastSphere(e.clientX, e.clientY);
    if (hit) {
      const { yaw, pitch } = engine.cartesianToSpherical(hit.point);
      hotspotMgr.moveHotspot(dragHotspot, yaw, pitch);
    }
    return;
  }

  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
  if (hits.length > 0) {
    const hotspot = hotspotMgr.findByMesh(hits[0].object);
    hotspotMgr.hoverHotspot(hotspot);
    if (appMode === 'preview' || editSubMode === 'none') viewer.classList.add('cursor-pointer');
  } else {
    hotspotMgr.hoverHotspot(null);
    updateCursor();
  }
}

function onMouseUp(e) {
  if (e.button !== 0) return;

  engine.setControlsEnabled(true);

  if (isDragging && dragHotspot) {
    isDragging = false;
    editSubMode = 'none';
    dragHotspot = null;
    engine.setEditSubMode('none');
    updateCursor();
    updateStatus();
    sceneMgr.saveCurrentScene();
    markChanged();
    showToast('Position sauvegardée', 'success');
    return;
  }

  dragHotspot = null;
  isDragging = false;

  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return;

  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
  if (hits.length > 0) {
    const hotspot = hotspotMgr.findByMesh(hits[0].object);
    if (hotspot) {
      if (appMode === 'preview') {
        handleHotspotClickPreview(hotspot);
      } else {
        hotspotMgr.selectHotspot(hotspot);
        openHotspotPopup(hotspot);
      }
      return;
    }
  }

  if (appMode === 'edit' && editSubMode === 'adding') {
    const hit = engine.raycastSphere(e.clientX, e.clientY);
    if (hit) {
      const { yaw, pitch } = engine.cartesianToSpherical(hit.point);
      openHotspotPopup(null, yaw, pitch);
    }
    return;
  }

  if (appMode === 'edit') {
    hotspotMgr.clearSelection();
    updateStatus();
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Preview
   ══════════════════════════════════════════════════════════════════════ */

function handleHotspotClickPreview(hotspot) {
  if (hotspot.data.type === 'navigate') {
    const targetId = hotspot.data.target;
    if (targetId && sceneMgr.getScene(targetId)) {
      sceneMgr.loadScene(targetId);
      showToast(`Navigation → ${sceneMgr.getScene(targetId).name}`, 'info');
    } else {
      showToast('Scène cible non définie', 'error');
    }
  } else if (hotspot.data.type === 'info') {
    showInfoOverlay(hotspot.data);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Info overlay
   ══════════════════════════════════════════════════════════════════════ */

function showInfoOverlay(data) {
  document.getElementById('info-overlay-title').textContent = data.title || '(Sans titre)';
  document.getElementById('info-overlay-desc').textContent = data.description || '';
  document.getElementById('info-overlay').classList.add('visible');
}

document.getElementById('info-overlay-close').addEventListener('click', () => {
  document.getElementById('info-overlay').classList.remove('visible');
});

/* ══════════════════════════════════════════════════════════════════════
   Popup Hotspot (édition)
   ══════════════════════════════════════════════════════════════════════ */

let pendingHotspotPos = null;

function openHotspotPopup(hotspot, yaw, pitch) {
  const overlay = document.getElementById('modal-overlay');

  pendingHotspotPos = hotspot ? null : { yaw, pitch };

  const typeEl = document.getElementById('hs-type');
  const targEl = document.getElementById('hs-target');
  const labelEl = document.getElementById('hs-label');
  const titleEl = document.getElementById('hs-title');
  const descEl = document.getElementById('hs-desc');

  if (hotspot) {
    typeEl.value = hotspot.data.type || 'navigate';
    targEl.value = hotspot.data.target || '';
    labelEl.value = hotspot.data.label || '';
    titleEl.value = hotspot.data.title || '';
    descEl.value = hotspot.data.description || '';
  } else {
    typeEl.value = 'navigate';
    targEl.value = '';
    labelEl.value = '';
    titleEl.value = '';
    descEl.value = '';
  }

  populateTargetOptions(hotspot?.data?.target);
  toggleHotspotFormFields(typeEl.value);

  document.getElementById('modal-title-text').textContent =
    hotspot ? 'Éditer le hotspot' : 'Nouveau hotspot';
  document.getElementById('btn-hotspot-delete').style.display =
    hotspot ? 'block' : 'none';

  overlay.classList.add('visible');
  overlay.dataset.editHotspot = hotspot ? hotspotMgr.hotspots.indexOf(hotspot) : -1;
}

function populateTargetOptions(currentTarget) {
  const sel = document.getElementById('hs-target');
  sel.innerHTML = '<option value="">— Choisir une scène —</option>';
  sceneMgr.getSceneIds().forEach(id => {
    if (id === sceneMgr.currentSceneId) return;
    const scene = sceneMgr.getScene(id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = scene.name;
    if (id === currentTarget) opt.selected = true;
    sel.appendChild(opt);
  });
}

function toggleHotspotFormFields(type) {
  document.getElementById('hs-nav-fields').style.display = type === 'navigate' ? 'block' : 'none';
  document.getElementById('hs-info-fields').style.display = type === 'info' ? 'block' : 'none';
}

document.getElementById('hs-type').addEventListener('change', (e) => {
  toggleHotspotFormFields(e.target.value);
});

document.getElementById('btn-hotspot-confirm').addEventListener('click', () => {
  const overlay = document.getElementById('modal-overlay');
  const editIdx = parseInt(overlay.dataset.editHotspot ?? '-1');
  const type = document.getElementById('hs-type').value;
  const target = document.getElementById('hs-target').value;
  const label = document.getElementById('hs-label').value.trim();
  const title = document.getElementById('hs-title').value.trim();
  const description = document.getElementById('hs-desc').value.trim();

  if (type === 'navigate' && !target) {
    const data = { type, target: '', label, title, description };
    let createdHotspot = null;

    if (editIdx >= 0) {
      createdHotspot = hotspotMgr.hotspots[editIdx];
      if (createdHotspot) hotspotMgr.updateHotspotData(createdHotspot, data);
    } else if (pendingHotspotPos) {
      createdHotspot = hotspotMgr.createHotspot(pendingHotspotPos.yaw, pendingHotspotPos.pitch, data);
      hotspotMgr.selectHotspot(createdHotspot);
    }

    sceneMgr.saveCurrentScene();
    closeModal();
    openAddSceneModalChained(createdHotspot, label);
    return;
  }

  const data = { type, target, label, title, description };

  if (editIdx >= 0) {
    const hotspot = hotspotMgr.hotspots[editIdx];
    if (hotspot) hotspotMgr.updateHotspotData(hotspot, data);
  } else {
    if (pendingHotspotPos) {
      const hs = hotspotMgr.createHotspot(pendingHotspotPos.yaw, pendingHotspotPos.pitch, data);
      hotspotMgr.selectHotspot(hs);
    }
  }

  sceneMgr.saveCurrentScene();
  markChanged();
  closeModal();
  updateStatus();
  showToast('Hotspot sauvegardé', 'success');
});

/* ══════════════════════════════════════════════════════════════════════
   Modal chaîné (hotspot sans cible → créer scène de destination)
   ══════════════════════════════════════════════════════════════════════ */

function openAddSceneModalChained(hotspot, prefillLabel) {
  _chainedHotspot = hotspot;

  const addOverlay = document.getElementById('add-scene-overlay');
  document.getElementById('new-scene-name').value = prefillLabel || '';
  document.getElementById('new-scene-image').value = '';
  resetLocalFileInput();

  const modalTitle = addOverlay.querySelector('.modal-title');
  modalTitle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    </svg>
    Créer la scène de destination
  `;

  if (!_chainedBanner) {
    _chainedBanner = document.createElement('div');
    _chainedBanner.className = 'chained-banner';
    _chainedBanner.style.cssText = [
      'background:var(--accent-glow)',
      'border:1px solid var(--accent-dim)',
      'border-radius:var(--radius-sm)',
      'padding:10px 14px',
      'font-size:12px',
      'color:var(--accent)',
      'margin-bottom:16px',
      'line-height:1.5',
      'font-family:var(--font-mono)',
    ].join(';');
    modalTitle.after(_chainedBanner);
  }
  _chainedBanner.style.display = 'block';
  _chainedBanner.innerHTML =
    '<strong>Aucune scène cible sélectionnée.</strong><br>' +
    'Créez-en une nouvelle — le hotspot lui sera automatiquement lié.';

  addOverlay.classList.add('visible');
  document.getElementById('new-scene-name').focus();
}

function _closeAddSceneModal() {
  _chainedHotspot = null;
  const addOverlay = document.getElementById('add-scene-overlay');
  addOverlay.classList.remove('visible');
  const modalTitle = addOverlay.querySelector('.modal-title');
  modalTitle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
    Nouvelle scène
  `;
  if (_chainedBanner) _chainedBanner.style.display = 'none';
  resetLocalFileInput();
}

document.getElementById('btn-hotspot-cancel').addEventListener('click', closeModal);

document.getElementById('btn-hotspot-delete').addEventListener('click', () => {
  const overlay = document.getElementById('modal-overlay');
  const editIdx = parseInt(overlay.dataset.editHotspot ?? '-1');
  if (editIdx >= 0) {
    const hotspot = hotspotMgr.hotspots[editIdx];
    if (hotspot) {
      hotspotMgr.removeHotspot(hotspot);
      sceneMgr.saveCurrentScene();
      markChanged();
      showToast('Hotspot supprimé', 'info');
    }
  }
  closeModal();
  updateStatus();
});

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  pendingHotspotPos = null;
}

/* ══════════════════════════════════════════════════════════════════════
   Toolbar — Boutons mode & hotspots
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-preview').addEventListener('click', () => setMode('preview'));
document.getElementById('btn-edit').addEventListener('click', () => setMode('edit'));

document.getElementById('btn-add-hotspot').addEventListener('click', () => {
  setEditSubMode(editSubMode === 'adding' ? 'none' : 'adding');
});

document.getElementById('btn-delete-hotspot').addEventListener('click', () => {
  if (hotspotMgr.selectedHotspot) {
    hotspotMgr.removeHotspot(hotspotMgr.selectedHotspot);
    sceneMgr.saveCurrentScene();
    markChanged();
    updateStatus();
    showToast('Hotspot supprimé', 'info');
  } else {
    showToast('Aucun hotspot sélectionné', 'error');
  }
});

/* ── Effacer la scène courante ────────────────────────────────────────── */

document.getElementById('btn-clear-scene').addEventListener('click', () => {
  const scene = sceneMgr.getCurrentScene();
  if (!scene) { showToast('Aucune scène chargée', 'error'); return; }

  // if (_isDemoLoaded) {
  //   doClearScene();
  //   return;
  // }

  document.getElementById('clear-scene-name').textContent = `"${scene.name}"`;
  document.getElementById('clear-scene-overlay').classList.add('visible');
});

document.getElementById('btn-clear-scene-confirm').addEventListener('click', () => {
  document.getElementById('clear-scene-overlay').classList.remove('visible');
  doClearScene();
});

document.getElementById('btn-clear-scene-cancel').addEventListener('click', () => {
  document.getElementById('clear-scene-overlay').classList.remove('visible');
});

document.getElementById('clear-scene-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('clear-scene-overlay'))
    document.getElementById('clear-scene-overlay').classList.remove('visible');
});

function doClearScene() {
  hotspotMgr.removeAllHotspots();
  sceneMgr.saveCurrentScene();
  markChanged();
  updateStatus();
  showToast('Repères de la scène effacés', 'info');
}

/* ══════════════════════════════════════════════════════════════════════
   Sidebar — Boutons groupés (reset all / delete all)
   ══════════════════════════════════════════════════════════════════════ */

/* ── Réinitialiser tous les repères ──────────────────────────────────── */

document.getElementById('btn-reset-all-hotspots').addEventListener('click', () => {
  if (!sceneMgr.getSceneIds().length) { showToast('Aucune scène', 'error'); return; }
  document.getElementById('reset-all-overlay').classList.add('visible');
});

document.getElementById('btn-reset-all-confirm').addEventListener('click', () => {
  document.getElementById('reset-all-overlay').classList.remove('visible');
  // Vider les hotspots dans chaque scène du tourData
  sceneMgr.getSceneIds().forEach(id => {
    const s = sceneMgr.getScene(id);
    if (s) s.hotspots = [];
  });
  hotspotMgr.removeAllHotspots();
  markChanged();
  updateStatus();
  showToast('Tous les repères supprimés', 'info');
});

document.getElementById('btn-reset-all-cancel').addEventListener('click', () => {
  document.getElementById('reset-all-overlay').classList.remove('visible');
});

document.getElementById('reset-all-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('reset-all-overlay'))
    document.getElementById('reset-all-overlay').classList.remove('visible');
});

/* ── Supprimer toutes les scènes ─────────────────────────────────────── */

document.getElementById('btn-delete-all-scenes').addEventListener('click', () => {
  if (!sceneMgr.getSceneIds().length) { showToast('Aucune scène', 'error'); return; }
  document.getElementById('delete-all-overlay').classList.add('visible');
});

document.getElementById('btn-delete-all-confirm').addEventListener('click', async () => {
  document.getElementById('delete-all-overlay').classList.remove('visible');
  // Copier la liste avant de la modifier
  sceneMgr.currentSceneId = null;
  [...sceneMgr.getSceneIds()].forEach(id => sceneMgr.removeScene(id));
  hotspotMgr.removeAllHotspots();

  // Réinitialiser le moteur : efface la texture et affiche le fond neutre
  await engine.loadPanorama(null);

  // Afficher l'empty state par-dessus
  const ve = document.getElementById('viewer-empty');
  ve.style.display    = 'flex';
  // ve.style.position   = 'absolute';
  // ve.style.inset      = '0';
  // ve.style.zIndex     = '5';
  
  _isDemoLoaded = false;
  markChanged();
  updateStatus();
  updateSidebarActions();
  showToast('Toutes les scènes supprimées', 'info');
});

document.getElementById('btn-delete-all-cancel').addEventListener('click', () => {
  document.getElementById('delete-all-overlay').classList.remove('visible');
});

document.getElementById('delete-all-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('delete-all-overlay'))
    document.getElementById('delete-all-overlay').classList.remove('visible');
});

/* ── Suppression scène individuelle (poubelle dans la liste) ─────────── */

function openDeleteSceneModal(id, name) {
  _pendingDeleteSceneId = id;
  document.getElementById('delete-scene-name').textContent = `"${name}"`;
  document.getElementById('delete-scene-overlay').classList.add('visible');
}

document.getElementById('btn-delete-scene-confirm').addEventListener('click', () => {
  document.getElementById('delete-scene-overlay').classList.remove('visible');
  if (_pendingDeleteSceneId) {
    sceneMgr.removeScene(_pendingDeleteSceneId);
    _pendingDeleteSceneId = null;
    markChanged();
    showToast('Scène supprimée', 'info');
  }
});

document.getElementById('btn-delete-scene-cancel').addEventListener('click', () => {
  document.getElementById('delete-scene-overlay').classList.remove('visible');
  _pendingDeleteSceneId = null;
});

document.getElementById('delete-scene-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('delete-scene-overlay')) {
    document.getElementById('delete-scene-overlay').classList.remove('visible');
    _pendingDeleteSceneId = null;
  }
});

/* ══════════════════════════════════════════════════════════════════════
   Toolbar — Export
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-export').addEventListener('click', () => {
  const tourData = sceneMgr.exportTour();
  if (!Object.keys(tourData.scenes).length) {
    showToast('Aucune scène à exporter', 'error');
    return;
  }
  openExportModal(tourData);
});

function openExportModal(tourData) {
  const json = JSON.stringify(TourSerializer.cleanTourData(tourData), null, 2);
  document.getElementById('export-preview').textContent = json;
  document.getElementById('export-overlay').classList.add('visible');
}

document.getElementById('btn-export-confirm').addEventListener('click', () => {
  const tourData = sceneMgr.exportTour();
  const filename = (tourData.name || 'visite-virtuelle')
    .toLowerCase().replace(/[^a-z0-9]/g, '-') + '.json';
  TourSerializer.exportToFile(tourData, filename);
  document.getElementById('export-overlay').classList.remove('visible');
  markSaved(); // l'export = sauvegarde
  showToast('Export téléchargé !', 'success');
});

document.getElementById('btn-export-cancel').addEventListener('click', () => {
  document.getElementById('export-overlay').classList.remove('visible');
});

document.getElementById('export-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('export-overlay'))
    document.getElementById('export-overlay').classList.remove('visible');
});

/* ══════════════════════════════════════════════════════════════════════
   Sidebar — Liste des scènes
   ══════════════════════════════════════════════════════════════════════ */

function renderSceneList() {
  const list = document.getElementById('scene-list');
  list.innerHTML = '';

  const ids = sceneMgr.getSceneIds();
  if (!ids.length) {
    list.innerHTML = `
      <div style="padding:20px 10px; text-align:center; color:var(--text-muted); font-size:12px; font-family:var(--font-mono);">
        Aucune scène.<br>Ajoutez-en une !
      </div>`;
    updateSidebarActions();
    return;
  }

  ids.forEach(id => {
    const scene = sceneMgr.getScene(id);
    const hotspotCount = scene.hotspots?.length || 0;
    const isActive = id === sceneMgr.currentSceneId;

    const item = document.createElement('div');
    item.className = `scene-item${isActive ? ' active' : ''}`;
    item.dataset.id = id;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'scene-item-icon';
    if (scene.image) {
      const img = document.createElement('img');
      img.src = scene.image;
      img.onerror = () => { iconDiv.innerHTML = sphereIcon(); };
      iconDiv.appendChild(img);
    } else {
      iconDiv.innerHTML = sphereIcon();
    }

    const info = document.createElement('div');
    info.className = 'scene-item-info';
    info.innerHTML = `
      <div class="scene-item-name">${escHtml(scene.name)}</div>
      <div class="scene-item-meta">${hotspotCount} hotspot${hotspotCount !== 1 ? 's' : ''}</div>`;

    // Poubelle rouge à la place de la croix
    const delBtn = document.createElement('button');
    delBtn.className = 'scene-item-delete';
    delBtn.title = 'Supprimer la scène';
    delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" stroke-width="2.5">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
    </svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteSceneModal(id, scene.name);
    });

    item.appendChild(iconDiv);
    item.appendChild(info);
    item.appendChild(delBtn);
    item.addEventListener('click', () => sceneMgr.loadScene(id));

    list.appendChild(item);
  });

  updateSidebarActions();
}

/* ══════════════════════════════════════════════════════════════════════
   Modal ajout de scène — avec validation image + upload local
   ══════════════════════════════════════════════════════════════════════ */

// Types acceptés et taille max (10 Mo)
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_MB = 10;

function resetLocalFileInput() {
  _localImageObjectUrl = null;
  document.getElementById('scene-image-file').value = '';
  document.getElementById('new-scene-image').value = '';
  document.getElementById('local-file-badge').classList.remove('visible');
  document.getElementById('local-file-name').textContent = '';
}

// Bouton "Fichier local" → déclencher l'input file
document.getElementById('btn-upload-local').addEventListener('click', () => {
  document.getElementById('scene-image-file').click();
});

// Sélection d'un fichier local
document.getElementById('scene-image-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Vérification type
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    showToast(`Format non supporté : ${file.type || 'inconnu'}. Utilisez JPEG, PNG ou WebP.`, 'error');
    e.target.value = '';
    return;
  }

  // Vérification taille
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_IMAGE_SIZE_MB) {
    showToast(`Fichier trop lourd (${sizeMb.toFixed(1)} Mo). Maximum ${MAX_IMAGE_SIZE_MB} Mo.`, 'error');
    e.target.value = '';
    return;
  }

  // Révoquer l'ancien blob si besoin
  if (_localImageObjectUrl) URL.revokeObjectURL(_localImageObjectUrl);

  _localImageObjectUrl = URL.createObjectURL(file);

  // Afficher le badge et vider le champ URL
  // document.getElementById('new-scene-image').value = '';
  // document.getElementById('new-scene-image').placeholder = '(fichier local sélectionné)';
  // document.getElementById('local-file-name').textContent = file.name;
  // document.getElementById('local-file-badge').classList.add('visible');
  document.getElementById('new-scene-image').value = file.name;
  document.getElementById('local-file-name').textContent = file.name;
  document.getElementById('local-file-badge').classList.add('visible');
});

// Réinitialiser le badge si l'user retape une URL manuellement
document.getElementById('new-scene-image').addEventListener('input', () => {
  if (_localImageObjectUrl) {
    resetLocalFileInput();
    document.getElementById('new-scene-image').placeholder = 'https://… ou choisir un fichier local →';
  }
});

document.getElementById('btn-add-scene').addEventListener('click', () => {
  document.getElementById('new-scene-name').value = '';
  resetLocalFileInput();
  document.getElementById('new-scene-image').placeholder = 'https://… ou choisir un fichier local →';
  document.getElementById('add-scene-overlay').classList.add('visible');
  document.getElementById('new-scene-name').focus();
});

document.getElementById('btn-add-scene-confirm').addEventListener('click', () => {
  const name = document.getElementById('new-scene-name').value.trim();
  const imageUrl = document.getElementById('new-scene-image').value.trim();
  // Utiliser le blob URL si un fichier local a été sélectionné, sinon l'URL saisie
  const finalImage = _localImageObjectUrl || imageUrl;

  if (!name) {
    showToast('Entrez un nom de scène', 'error');
    return;
  }

  if (!finalImage) {
    showToast("Ajoutez une image panoramique (URL ou fichier local)", 'error');
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
  sceneMgr.addScene(id, name, finalImage);
  markChanged();

  if (_chainedHotspot) {
    hotspotMgr.updateHotspotData(_chainedHotspot, { target: id });
    sceneMgr.saveCurrentScene();
    showToast(`Scène "${name}" créée et liée au hotspot`, 'success');
    _closeAddSceneModal();
  } else {
    sceneMgr.loadScene(id);
    document.getElementById('add-scene-overlay').classList.remove('visible');
    resetLocalFileInput();
    showToast(`Scène "${name}" ajoutée`, 'success');
  }
  updateStatus();
});

document.getElementById('btn-add-scene-cancel').addEventListener('click', () => {
  if (_chainedHotspot) {
    showToast('Hotspot créé sans scène cible — éditable via clic dessus', 'info');
    _closeAddSceneModal();
  } else {
    document.getElementById('add-scene-overlay').classList.remove('visible');
    resetLocalFileInput();
  }
});

document.getElementById('add-scene-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('add-scene-overlay')) {
    document.getElementById('add-scene-overlay').classList.remove('visible');
    resetLocalFileInput();
  }
});

/* ══════════════════════════════════════════════════════════════════════
   Nom de la visite
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('tour-name').addEventListener('input', (e) => {
  sceneMgr.tourData.name = e.target.value;
  markChanged();
});

/* ══════════════════════════════════════════════════════════════════════
   Import JSON
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await TourSerializer.importFromFile(file);
    await sceneMgr.importTour(data);
    _isDemoLoaded = false;
    document.getElementById('tour-name').value = data.name || '';
    markChanged();
    showToast('Visite importée avec succès', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
  e.target.value = '';
});

/* ══════════════════════════════════════════════════════════════════════
   Charger la démo
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-demo').addEventListener('click', async () => {
  const data = TourSerializer.generateDemoData();
  await sceneMgr.importTour(data);
  document.getElementById('tour-name').value = data.name;
  _isDemoLoaded = true;
  markChanged();
  showToast('Données de démo chargées', 'info');
});

/* ══════════════════════════════════════════════════════════════════════
   Barre de statut
   ══════════════════════════════════════════════════════════════════════ */

function updateStatus() {
  const dot = document.getElementById('status-dot');
  const modeText = document.getElementById('status-mode');
  const sceneText = document.getElementById('status-scene');
  const hotspotText = document.getElementById('status-hotspots');

  dot.className = `status-dot ${appMode}`;

  let modeLabel = appMode === 'preview' ? 'PREVIEW' : 'ÉDITION';
  if (appMode === 'edit') {
    if (editSubMode === 'adding') modeLabel += ' › PLACEMENT';
    else if (editSubMode === 'dragging') modeLabel += ' › DÉPLACEMENT';
  }
  modeText.textContent = modeLabel;

  const scene = sceneMgr.getCurrentScene();
  sceneText.textContent = scene ? scene.name : '—';
  hotspotText.textContent = `${hotspotMgr.hotspots.length} hotspot${hotspotMgr.hotspots.length !== 1 ? 's' : ''}`;
}

/* ══════════════════════════════════════════════════════════════════════
   Toast notifications
   ══════════════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    error: `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    info: `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ══════════════════════════════════════════════════════════════════════
   Utilitaires
   ══════════════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sphereIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    <path d="M2 12h20"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════════
   Démarrage
   ══════════════════════════════════════════════════════════════════════ */

setMode('preview');
renderSceneList();
updateStatus();
updateSidebarActions();

showToast('Bienvenue ! Chargez la démo ou ajoutez une scène.', 'info', 4000);