/**
 * main.js — Point d'entrée de l'application.
 * Orchestre l'Engine, le HotspotManager, le SceneManager et l'interface utilisateur.
 */

import { Engine }          from './core/engine.js';
import { HotspotManager }  from './core/hotspot-manager.js';
import { SceneManager }    from './core/scene-manager.js';
import { TourSerializer }  from './core/tour-serializer.js';

/* ══════════════════════════════════════════════════════════════════════
   Initialisation
   ══════════════════════════════════════════════════════════════════════ */

const viewer         = document.getElementById('viewer');
const engine         = new Engine(viewer);
const hotspotMgr     = new HotspotManager(engine.scene);
const sceneMgr       = new SceneManager(engine, hotspotMgr);

// ── État application ──────────────────────────────────────────────────
let appMode       = 'preview'; // 'preview' | 'edit'
let editSubMode   = 'none';    // 'none' | 'adding' | 'dragging'
let isDragging    = false;
let dragHotspot   = null;
let mouseDownPos  = { x: 0, y: 0 };
const DRAG_THRESHOLD = 5; // pixels

/* ══════════════════════════════════════════════════════════════════════
   Callbacks SceneManager
   ══════════════════════════════════════════════════════════════════════ */

sceneMgr.onSceneLoaded = (id, sceneData) => {
  renderSceneList();
  updateStatus();
  document.getElementById('viewer-empty').style.display = 'none';
};

sceneMgr.onScenesChange = () => {
  renderSceneList();
  updateStatus();
};

/* ══════════════════════════════════════════════════════════════════════
   Gestion des modes
   ══════════════════════════════════════════════════════════════════════ */

function setMode(mode) {
  appMode     = mode;
  editSubMode = 'none';
  engine.setMode(mode);
  engine.setEditSubMode('none');
  hotspotMgr.clearSelection();

  // UI
  const btnPreview = document.getElementById('btn-preview');
  const btnEdit    = document.getElementById('btn-edit');
  const editTools  = document.getElementById('edit-tools');

  btnPreview.classList.toggle('active', mode === 'preview');
  btnEdit.classList.toggle('active',    mode === 'edit');
  editTools.style.display = mode === 'edit' ? 'flex' : 'none';

  setEditSubMode('none');
  updateCursor();
  updateStatus();
  updateHotspotAppearance();
}

function setEditSubMode(sub) {
  editSubMode = sub;
  engine.setEditSubMode(sub);

  const btnAdd = document.getElementById('btn-add-hotspot');
  btnAdd.classList.toggle('active', sub === 'adding');
  updateCursor();
  updateStatus();
}

function updateCursor() {
  viewer.className = '';
  if (appMode === 'preview') {
    viewer.classList.add('cursor-grab');
  } else if (editSubMode === 'adding') {
    viewer.classList.add('cursor-crosshair');
  } else {
    viewer.classList.add('cursor-grab');
  }
}

/** En preview : hotspots blancs translucides. En edit : colorés. */
function updateHotspotAppearance() {
  // L'apparence est gérée par HotspotManager via ses couleurs normales.
  // On applique une opacité réduite en preview.
  hotspotMgr.hotspots.forEach(h => {
    h.mesh.material.opacity = appMode === 'preview' ? 0.7 : 0.9;
  });
}

/* ══════════════════════════════════════════════════════════════════════
   Gestion des événements souris sur le viewer
   ══════════════════════════════════════════════════════════════════════ */

viewer.addEventListener('mousedown', onMouseDown);
viewer.addEventListener('mousemove', onMouseMove);
viewer.addEventListener('mouseup',   onMouseUp);

function onMouseDown(e) {
  if (e.button !== 0) return;
  mouseDownPos = { x: e.clientX, y: e.clientY };
  isDragging   = false;

  if (appMode === 'edit' && editSubMode === 'none') {
    // Vérifier si on clique sur un hotspot pour le drag
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
    if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
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

  // Hover sur les hotspots
  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
  if (hits.length > 0) {
    const hotspot = hotspotMgr.findByMesh(hits[0].object);
    hotspotMgr.hoverHotspot(hotspot);
    if (appMode === 'preview') viewer.classList.add('cursor-pointer');
    else if (editSubMode === 'none') viewer.classList.add('cursor-pointer');
  } else {
    hotspotMgr.hoverHotspot(null);
    updateCursor();
  }
}

function onMouseUp(e) {
  if (e.button !== 0) return;

  engine.setControlsEnabled(true);

  if (isDragging && dragHotspot) {
    // Fin de drag — sauvegarder la position
    isDragging  = false;
    editSubMode = 'none';
    dragHotspot = null;
    engine.setEditSubMode('none');
    updateCursor();
    updateStatus();
    sceneMgr.saveCurrentScene();
    showToast('Position sauvegardée', 'success');
    return;
  }

  dragHotspot = null;
  isDragging  = false;

  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) return; // c'était un drag caméra

  // ── CLICK ─────────────────────────────────────────────────────────────

  // Priorité : clic sur hotspot
  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());

  if (hits.length > 0) {
    const hotspot = hotspotMgr.findByMesh(hits[0].object);
    if (hotspot) {
      if (appMode === 'preview') {
        handleHotspotClickPreview(hotspot);
      } else {
        // Edit : sélectionner et ouvrir popup
        hotspotMgr.selectHotspot(hotspot);
        openHotspotPopup(hotspot);
      }
      return;
    }
  }

  // Clic sur la sphère
  if (appMode === 'edit' && editSubMode === 'adding') {
    const hit = engine.raycastSphere(e.clientX, e.clientY);
    if (hit) {
      const { yaw, pitch } = engine.cartesianToSpherical(hit.point);
      openHotspotPopup(null, yaw, pitch);
    }
    return;
  }

  // Clic vide → désélectionner
  if (appMode === 'edit') {
    hotspotMgr.clearSelection();
    updateStatus();
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Comportement Preview
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
   Info overlay (preview)
   ══════════════════════════════════════════════════════════════════════ */

function showInfoOverlay(data) {
  const overlay = document.getElementById('info-overlay');
  document.getElementById('info-overlay-title').textContent = data.title || '(Sans titre)';
  document.getElementById('info-overlay-desc').textContent  = data.description || '';
  overlay.classList.add('visible');
}

document.getElementById('info-overlay-close').addEventListener('click', () => {
  document.getElementById('info-overlay').classList.remove('visible');
});

/* ══════════════════════════════════════════════════════════════════════
   Popup Hotspot (édition)
   ══════════════════════════════════════════════════════════════════════ */

let pendingHotspotPos = null; // { yaw, pitch } pour la création

function openHotspotPopup(hotspot, yaw, pitch) {
  const overlay = document.getElementById('modal-overlay');
  const form    = document.getElementById('hotspot-form');

  pendingHotspotPos = hotspot ? null : { yaw, pitch };

  // Remplir le formulaire
  const typeEl  = document.getElementById('hs-type');
  const targEl  = document.getElementById('hs-target');
  const labelEl = document.getElementById('hs-label');
  const titleEl = document.getElementById('hs-title');
  const descEl  = document.getElementById('hs-desc');

  if (hotspot) {
    typeEl.value  = hotspot.data.type || 'navigate';
    targEl.value  = hotspot.data.target || '';
    labelEl.value = hotspot.data.label  || '';
    titleEl.value = hotspot.data.title  || '';
    descEl.value  = hotspot.data.description || '';
  } else {
    typeEl.value  = 'navigate';
    targEl.value  = '';
    labelEl.value = '';
    titleEl.value = '';
    descEl.value  = '';
  }

  // Peupler la liste des scènes cibles
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
    if (id === sceneMgr.currentSceneId) return; // Pas la scène courante
    const scene  = sceneMgr.getScene(id);
    const opt    = document.createElement('option');
    opt.value    = id;
    opt.textContent = scene.name;
    if (id === currentTarget) opt.selected = true;
    sel.appendChild(opt);
  });
}

function toggleHotspotFormFields(type) {
  const navFields  = document.getElementById('hs-nav-fields');
  const infoFields = document.getElementById('hs-info-fields');
  navFields.style.display  = type === 'navigate' ? 'block' : 'none';
  infoFields.style.display = type === 'info'     ? 'block' : 'none';
}

document.getElementById('hs-type').addEventListener('change', (e) => {
  toggleHotspotFormFields(e.target.value);
});

// Confirmer la création/édition
document.getElementById('btn-hotspot-confirm').addEventListener('click', () => {
  const overlay     = document.getElementById('modal-overlay');
  const editIdx     = parseInt(overlay.dataset.editHotspot ?? '-1');
  const type        = document.getElementById('hs-type').value;
  const target      = document.getElementById('hs-target').value;
  const label       = document.getElementById('hs-label').value.trim();
  const title       = document.getElementById('hs-title').value.trim();
  const description = document.getElementById('hs-desc').value.trim();

  // ── Cas spécial : navigate sans scène cible → proposer d'en créer une ──
  if (type === 'navigate' && !target) {
    // On crée/édite le hotspot en mode "en attente de cible"
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

    // Ouvrir le modal "Ajouter une scène" en mode chaîné
    openAddSceneModalChained(createdHotspot, label);
    return;
  }

  // ── Cas normal ────────────────────────────────────────────────────────
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
  closeModal();
  updateStatus();
  showToast('Hotspot sauvegardé', 'success');
});

// ── État global pour le mode chaîné (hotspot sans cible) ────────────
let _chainedHotspot  = null;
let _chainedBanner   = null;

/**
 * Ouvre le modal "Ajouter une scène" en mode chaîné :
 * une fois la scène créée, elle est automatiquement assignée comme cible du hotspot.
 * Le flag _chainedHotspot est lu par les listeners confirm/cancel du modal.
 */
function openAddSceneModalChained(hotspot, prefillLabel) {
  _chainedHotspot = hotspot;

  const addOverlay = document.getElementById('add-scene-overlay');
  document.getElementById('new-scene-name').value  = prefillLabel || '';
  document.getElementById('new-scene-image').value = '';

  // Titre contextuel
  const modalTitle = addOverlay.querySelector('.modal-title');
  modalTitle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    </svg>
    Créer la scène de destination
  `;

  // Bannière explicative (créée une seule fois)
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

/** Ferme le modal ajout-scène et restaure son état normal. */
function _closeAddSceneModal() {
  _chainedHotspot = null;
  const addOverlay = document.getElementById('add-scene-overlay');
  addOverlay.classList.remove('visible');
  // Remettre le titre par défaut
  const modalTitle = addOverlay.querySelector('.modal-title');
  modalTitle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
    Nouvelle scène
  `;
  if (_chainedBanner) _chainedBanner.style.display = 'none';
}

// Annuler
document.getElementById('btn-hotspot-cancel').addEventListener('click', closeModal);

// Supprimer depuis la popup
document.getElementById('btn-hotspot-delete').addEventListener('click', () => {
  const overlay = document.getElementById('modal-overlay');
  const editIdx = parseInt(overlay.dataset.editHotspot ?? '-1');
  if (editIdx >= 0) {
    const hotspot = hotspotMgr.hotspots[editIdx];
    if (hotspot) {
      hotspotMgr.removeHotspot(hotspot);
      sceneMgr.saveCurrentScene();
      showToast('Hotspot supprimé', 'info');
    }
  }
  closeModal();
  updateStatus();
});

// Fermer en cliquant sur l'overlay
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  pendingHotspotPos = null;
}

/* ══════════════════════════════════════════════════════════════════════
   Toolbar — Boutons
   ══════════════════════════════════════════════════════════════════════ */

document.getElementById('btn-preview').addEventListener('click', () => setMode('preview'));
document.getElementById('btn-edit').addEventListener('click',    () => setMode('edit'));

document.getElementById('btn-add-hotspot').addEventListener('click', () => {
  setEditSubMode(editSubMode === 'adding' ? 'none' : 'adding');
});

document.getElementById('btn-delete-hotspot').addEventListener('click', () => {
  if (hotspotMgr.selectedHotspot) {
    hotspotMgr.removeHotspot(hotspotMgr.selectedHotspot);
    sceneMgr.saveCurrentScene();
    updateStatus();
    showToast('Hotspot supprimé', 'info');
  } else {
    showToast('Aucun hotspot sélectionné', 'error');
  }
});

document.getElementById('btn-export').addEventListener('click', () => {
  const tourData = sceneMgr.exportTour();
  if (!Object.keys(tourData.scenes).length) {
    showToast('Aucune scène à exporter', 'error');
    return;
  }
  openExportModal(tourData);
});

/* ══════════════════════════════════════════════════════════════════════
   Modal Export
   ══════════════════════════════════════════════════════════════════════ */

function openExportModal(tourData) {
  const json = JSON.stringify(TourSerializer.cleanTourData(tourData), null, 2);
  document.getElementById('export-preview').textContent = json;
  document.getElementById('export-overlay').classList.add('visible');
  document.getElementById('export-overlay').dataset.tourJson = json;
}

document.getElementById('btn-export-confirm').addEventListener('click', () => {
  const tourData = sceneMgr.exportTour();
  const filename = (tourData.name || 'visite-virtuelle')
    .toLowerCase().replace(/[^a-z0-9]/g, '-') + '.json';
  TourSerializer.exportToFile(tourData, filename);
  document.getElementById('export-overlay').classList.remove('visible');
  showToast('Export téléchargé !', 'success');
});

document.getElementById('btn-export-cancel').addEventListener('click', () => {
  document.getElementById('export-overlay').classList.remove('visible');
});

document.getElementById('export-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('export-overlay')) {
    document.getElementById('export-overlay').classList.remove('visible');
  }
});

/* ══════════════════════════════════════════════════════════════════════
   Sidebar — Scènes
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
    return;
  }

  ids.forEach(id => {
    const scene = sceneMgr.getScene(id);
    const hotspotCount = scene.hotspots?.length || 0;
    const isActive     = id === sceneMgr.currentSceneId;

    const item = document.createElement('div');
    item.className = `scene-item${isActive ? ' active' : ''}`;
    item.dataset.id = id;

    // Thumbnail
    const iconDiv = document.createElement('div');
    iconDiv.className = 'scene-item-icon';
    if (scene.image) {
      const img   = document.createElement('img');
      img.src     = scene.image;
      img.onerror = () => { iconDiv.innerHTML = sphereIcon(); };
      iconDiv.appendChild(img);
    } else {
      iconDiv.innerHTML = sphereIcon();
    }

    // Info
    const info = document.createElement('div');
    info.className = 'scene-item-info';
    info.innerHTML = `
      <div class="scene-item-name">${escHtml(scene.name)}</div>
      <div class="scene-item-meta">${hotspotCount} hotspot${hotspotCount !== 1 ? 's' : ''}</div>`;

    // Bouton supprimer
    const delBtn = document.createElement('button');
    delBtn.className = 'scene-item-delete';
    delBtn.title     = 'Supprimer la scène';
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer la scène "${scene.name}" ?`)) {
        sceneMgr.removeScene(id);
      }
    });

    item.appendChild(iconDiv);
    item.appendChild(info);
    item.appendChild(delBtn);
    item.addEventListener('click', () => sceneMgr.loadScene(id));

    list.appendChild(item);
  });
}

/* ── Modal ajout de scène ─────────────────────────────────────────────── */

document.getElementById('btn-add-scene').addEventListener('click', () => {
  document.getElementById('new-scene-name').value  = '';
  document.getElementById('new-scene-image').value = '';
  document.getElementById('add-scene-overlay').classList.add('visible');
  document.getElementById('new-scene-name').focus();
});

document.getElementById('btn-add-scene-confirm').addEventListener('click', () => {
  const name  = document.getElementById('new-scene-name').value.trim();
  const image = document.getElementById('new-scene-image').value.trim();

  if (!name) { showToast('Entrez un nom de scène', 'error'); return; }

  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
  sceneMgr.addScene(id, name, image);

  if (_chainedHotspot) {
    // Mode chaîné : lier le hotspot à la nouvelle scène sans la charger
    hotspotMgr.updateHotspotData(_chainedHotspot, { target: id });
    sceneMgr.saveCurrentScene();
    showToast(`Scène "${name}" créée et liée au hotspot`, 'success');
    _closeAddSceneModal();
  } else {
    // Mode normal : charger la scène
    sceneMgr.loadScene(id);
    document.getElementById('add-scene-overlay').classList.remove('visible');
    showToast(`Scène "${name}" ajoutée`, 'success');
  }
  updateStatus();
});

document.getElementById('btn-add-scene-cancel').addEventListener('click', () => {
  if (_chainedHotspot) {
    showToast("Hotspot créé sans scène cible — éditable via clic dessus", 'info');
    _closeAddSceneModal();
  } else {
    document.getElementById('add-scene-overlay').classList.remove('visible');
  }
});

document.getElementById('add-scene-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('add-scene-overlay')) {
    document.getElementById('add-scene-overlay').classList.remove('visible');
  }
});

/* ── Nom de la visite ─────────────────────────────────────────────────── */

document.getElementById('tour-name').addEventListener('input', (e) => {
  sceneMgr.tourData.name = e.target.value;
});

/* ── Import JSON ─────────────────────────────────────────────────────── */

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await TourSerializer.importFromFile(file);
    await sceneMgr.importTour(data);
    document.getElementById('tour-name').value = data.name || '';
    showToast('Visite importée avec succès', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
  e.target.value = '';
});

/* ── Charger la démo ─────────────────────────────────────────────────── */

document.getElementById('btn-demo').addEventListener('click', async () => {
  const data = TourSerializer.generateDemoData();
  await sceneMgr.importTour(data);
  document.getElementById('tour-name').value = data.name;
  showToast('Données de démo chargées', 'info');
});

/* ══════════════════════════════════════════════════════════════════════
   Barre de statut
   ══════════════════════════════════════════════════════════════════════ */

function updateStatus() {
  const dot        = document.getElementById('status-dot');
  const modeText   = document.getElementById('status-mode');
  const sceneText  = document.getElementById('status-scene');
  const hotspotText= document.getElementById('status-hotspots');

  dot.className = `status-dot ${appMode}`;

  let modeLabel = appMode === 'preview' ? 'PREVIEW' : 'ÉDITION';
  if (appMode === 'edit') {
    if (editSubMode === 'adding')  modeLabel += ' › PLACEMENT';
    else if (editSubMode === 'dragging') modeLabel += ' › DÉPLACEMENT';
  }
  modeText.textContent = modeLabel;

  const scene = sceneMgr.getCurrentScene();
  sceneText.textContent  = scene ? scene.name : '—';
  hotspotText.textContent = `${hotspotMgr.hotspots.length} hotspot${hotspotMgr.hotspots.length !== 1 ? 's' : ''}`;
}

/* ══════════════════════════════════════════════════════════════════════
   Toast notifications
   ══════════════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    error:   `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    info:    `<svg class="toast-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ══════════════════════════════════════════════════════════════════════
   Utilitaires
   ══════════════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sphereIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/><path d="M2 12h20"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════════
   Démarrage
   ══════════════════════════════════════════════════════════════════════ */

setMode('preview');
renderSceneList();
updateStatus();

// Afficher le message de bienvenue
showToast('Bienvenue ! Chargez la démo ou ajoutez une scène.', 'info', 4000);
