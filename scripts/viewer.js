/**
 * viewer.js — Visualiseur de visite virtuelle 360°
 * Réutilise les mêmes modules core/ que l'éditeur.
 *
 * Appel : /pages/viewer.html?tour=mon-fichier.json
 *         /pages/viewer.html?tour=https://cdn.example.com/visite.json
 */

import { Engine }         from '../core/engine.js';
import { HotspotManager } from '../core/hotspot-manager.js';
import { SceneManager }   from '../core/scene-manager.js';

/* ══════════════════════════════════════════════════════════════════════
   Initialisation moteur
   ══════════════════════════════════════════════════════════════════════ */

const viewer     = document.getElementById('viewer');
const engine     = new Engine(viewer);
const hotspotMgr = new HotspotManager(engine.scene);
const sceneMgr   = new SceneManager(engine, hotspotMgr);

engine.setMode('preview');

/* ══════════════════════════════════════════════════════════════════════
   Chargement du JSON de configuration
   ══════════════════════════════════════════════════════════════════════ */

async function loadTourFromUrl() {
  const params  = new URLSearchParams(window.location.search);
  const tourUrl = params.get('tour');

  if (!tourUrl) {
    showError(
      'Aucune visite spécifiée.',
      'Ajoutez le paramètre <strong>?tour=</strong> suivi du chemin vers votre fichier JSON.'
    );
    return;
  }

  // Cas spécial : fichier passé depuis la landing via sessionStorage
  if (tourUrl === '__session__') {
    try {
      const raw = sessionStorage.getItem('tour360_data');
      if (!raw) throw new Error('Données de session introuvables.');
      sessionStorage.removeItem('tour360_data');
      const data = JSON.parse(raw);
      await initTour(data);
    } catch (err) {
      showError('Erreur de chargement depuis la session.', err.message);
    }
    return;
  }

  // Cas normal : fetch depuis une URL
  try {
    const response = await fetch(tourUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' — ' + response.statusText);
    const data = await response.json();
    await initTour(data);
  } catch (err) {
    showError(
      'Erreur lors du chargement de ' + escHtml(tourUrl),
      err.message
    );
  }
}

async function initTour(data) {
  // Validation minimale
  if (!data?.scenes || !Object.keys(data.scenes).length) {
    showError('Fichier JSON invalide.', 'Aucune scène trouvée dans le fichier.');
    return;
  }

  // Mettre à jour le titre de la page
  document.title = `${data.name || 'Visite'} — Tour360`;

  // Câbler les callbacks avant d'importer
  sceneMgr.onSceneLoaded  = onSceneLoaded;
  sceneMgr.onScenesChange = renderSceneMap;

  await sceneMgr.importTour(data);
  hideLoading();
}

/* ══════════════════════════════════════════════════════════════════════
   Callbacks SceneManager
   ══════════════════════════════════════════════════════════════════════ */

function onSceneLoaded(id, sceneData) {
  // Nom de la scène dans le header
  document.getElementById('header-scene-name').textContent = sceneData.name || id;
  renderSceneMap();
}

/* ══════════════════════════════════════════════════════════════════════
   Minimap des scènes
   ══════════════════════════════════════════════════════════════════════ */

function renderSceneMap() {
  const map = document.getElementById('scene-map');
  map.innerHTML = '';

  const ids = sceneMgr.getSceneIds();
  if (ids.length <= 1) return; // Inutile si une seule scène

  ids.forEach(id => {
    const scene    = sceneMgr.getScene(id);
    const isActive = id === sceneMgr.currentSceneId;

    const dot = document.createElement('div');
    dot.className = `scene-dot${isActive ? ' active' : ''}`;
    dot.title     = scene.name;
    dot.innerHTML = `
      <div class="scene-dot-indicator"></div>
      <div class="scene-dot-name">${escHtml(scene.name)}</div>
    `;
    dot.addEventListener('click', () => navigateTo(id));
    map.appendChild(dot);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   Navigation entre scènes
   ══════════════════════════════════════════════════════════════════════ */

function navigateTo(sceneId) {
  const scene = sceneMgr.getScene(sceneId);
  if (!scene || sceneId === sceneMgr.currentSceneId) return;

  showNavToast(`→ ${scene.name}`);
  sceneMgr.loadScene(sceneId);
}

/* ══════════════════════════════════════════════════════════════════════
   Gestion des clics sur le viewer (hotspots)
   ══════════════════════════════════════════════════════════════════════ */

let _mouseDownPos = { x: 0, y: 0 };
const DRAG_THRESHOLD = 5;

viewer.addEventListener('mousedown', (e) => {
  _mouseDownPos = { x: e.clientX, y: e.clientY };
});

viewer.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;

  const dx = e.clientX - _mouseDownPos.x;
  const dy = e.clientY - _mouseDownPos.y;
  if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) return; // drag caméra, pas un clic

  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
  if (!hits.length) return;

  const hotspot = hotspotMgr.findByMesh(hits[0].object);
  if (!hotspot) return;

  if (hotspot.data.type === 'navigate') {
    const targetId = hotspot.data.target;
    if (targetId && sceneMgr.getScene(targetId)) {
      navigateTo(targetId);
    } else {
      showNavToast('⚠ Scène cible non définie');
    }
  } else if (hotspot.data.type === 'info') {
    showInfoOverlay(hotspot.data);
  }
});

// Curseur pointeur au survol des hotspots
viewer.addEventListener('mousemove', (e) => {
  const hits = engine.raycastObjects(e.clientX, e.clientY, hotspotMgr.getMeshes());
  if (hits.length > 0) {
    const hotspot = hotspotMgr.findByMesh(hits[0].object);
    hotspotMgr.hoverHotspot(hotspot);
    viewer.classList.add('cursor-pointer');
  } else {
    hotspotMgr.hoverHotspot(null);
    viewer.classList.remove('cursor-pointer');
  }
});

// Grabbing pendant le drag
viewer.addEventListener('mousedown', () => {
  viewer.classList.add('cursor-grabbing');
});
window.addEventListener('mouseup', () => {
  viewer.classList.remove('cursor-grabbing');
});

/* ══════════════════════════════════════════════════════════════════════
   Info overlay
   ══════════════════════════════════════════════════════════════════════ */

function showInfoOverlay(data) {
  document.getElementById('info-title').textContent = data.title || '(Sans titre)';
  document.getElementById('info-desc').textContent  = data.description || '';
  document.getElementById('info-overlay').classList.add('visible');
}

document.getElementById('info-close').addEventListener('click', () => {
  document.getElementById('info-overlay').classList.remove('visible');
});

/* ══════════════════════════════════════════════════════════════════════
   Toast de navigation
   ══════════════════════════════════════════════════════════════════════ */

let _navToastTimer = null;

function showNavToast(message) {
  const el = document.getElementById('nav-toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(_navToastTimer);
  _navToastTimer = setTimeout(() => el.classList.remove('visible'), 1800);
}

/* ══════════════════════════════════════════════════════════════════════
   Loading / Erreur
   ══════════════════════════════════════════════════════════════════════ */

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError(title, detail = '') {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error-msg').innerHTML = `${title}${detail ? '<br><br>' + detail : ''}`;
  document.getElementById('error-screen').classList.add('visible');
}

/* ══════════════════════════════════════════════════════════════════════
   Utilitaires
   ══════════════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════════════════
   Démarrage
   ══════════════════════════════════════════════════════════════════════ */

loadTourFromUrl();