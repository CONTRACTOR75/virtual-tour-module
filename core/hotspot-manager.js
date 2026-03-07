/**
 * hotspot-manager.js — Gestion des hotspots (création, suppression, drag, sélection)
 * Chaque hotspot est une sphère Three.js positionnée sur la surface intérieure de la sphère 360°.
 */

import * as THREE from 'three';

/* Palette de couleurs par type et état */
const COLORS = {
  navigate: { normal: 0x3b82f6, hover: 0x93c5fd, selected: 0xf59e0b },
  info:     { normal: 0x10b981, hover: 0x6ee7b7, selected: 0xf59e0b },
};

const HOTSPOT_RADIUS = 0.38; // Taille de la sphère hotspot (unités Three.js)
const SPHERE_RADIUS  = 10;   // Rayon de placement (doit correspondre à engine.js)

export class HotspotManager {
  /**
   * @param {THREE.Scene} scene — La scène Three.js dans laquelle placer les hotspots.
   */
  constructor(scene) {
    this.scene           = scene;
    this.hotspots        = []; // [{ mesh, data }]
    this.selectedHotspot = null;
    this.hoveredHotspot  = null;
  }

  /* ── Création ───────────────────────────────────────────────────────── */

  /**
   * Crée et ajoute un hotspot à la scène.
   * @param {number} yaw    Azimut en degrés.
   * @param {number} pitch  Élévation en degrés.
   * @param {object} data   Données métier { type, target?, title?, description?, label? }
   * @returns {{ mesh: THREE.Mesh, data: object }}
   */
  createHotspot(yaw, pitch, data = {}) {
    const hotspotData = {
      type:        'navigate',
      target:      '',
      label:       '',
      title:       '',
      description: '',
      ...data,
      yaw,
      pitch,
    };

    const colors   = COLORS[hotspotData.type] || COLORS.navigate;
    const geo      = new THREE.SphereGeometry(HOTSPOT_RADIUS, 20, 20);
    const mat      = new THREE.MeshBasicMaterial({
      color:       colors.normal,
      transparent: true,
      opacity:     0.88,
    });
    const mesh     = new THREE.Mesh(geo, mat);

    // Anneau de contour (ring)
    const ringGeo  = new THREE.TorusGeometry(HOTSPOT_RADIUS + 0.05, 0.06, 8, 32);
    const ringMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const ring     = new THREE.Mesh(ringGeo, ringMat);
    mesh.add(ring);

    mesh.position.copy(this._toPosition(yaw, pitch));
    // Faire pointer le hotspot vers l'intérieur (vers la caméra)
    mesh.lookAt(0, 0, 0);

    mesh.userData.isHotspot  = true;
    mesh.userData.hotspotRef = null; // sera rempli après

    this.scene.add(mesh);

    const hotspot        = { mesh, data: hotspotData };
    mesh.userData.hotspotRef = hotspot;
    this.hotspots.push(hotspot);

    return hotspot;
  }

  /* ── Suppression ────────────────────────────────────────────────────── */

  removeHotspot(hotspot) {
    if (!hotspot) return;
    this.scene.remove(hotspot.mesh);
    hotspot.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    const idx = this.hotspots.indexOf(hotspot);
    if (idx !== -1) this.hotspots.splice(idx, 1);
    if (this.selectedHotspot === hotspot) this.selectedHotspot = null;
    if (this.hoveredHotspot  === hotspot) this.hoveredHotspot  = null;
  }

  removeAllHotspots() {
    [...this.hotspots].forEach(h => this.removeHotspot(h));
  }

  /* ── Sélection / Survol ─────────────────────────────────────────────── */

  selectHotspot(hotspot) {
    if (this.selectedHotspot && this.selectedHotspot !== hotspot) {
      this._applyColor(this.selectedHotspot, 'normal');
    }
    this.selectedHotspot = hotspot;
    if (hotspot) this._applyColor(hotspot, 'selected');
  }

  clearSelection() {
    if (this.selectedHotspot) {
      this._applyColor(this.selectedHotspot, 'normal');
      this.selectedHotspot = null;
    }
  }

  hoverHotspot(hotspot) {
    // Restaurer la couleur du précédent survolé
    if (this.hoveredHotspot && this.hoveredHotspot !== hotspot && this.hoveredHotspot !== this.selectedHotspot) {
      this._applyColor(this.hoveredHotspot, 'normal');
    }
    this.hoveredHotspot = hotspot;
    if (hotspot && hotspot !== this.selectedHotspot) {
      this._applyColor(hotspot, 'hover');
    }
  }

  /* ── Déplacement ────────────────────────────────────────────────────── */

  moveHotspot(hotspot, yaw, pitch) {
    hotspot.data.yaw   = yaw;
    hotspot.data.pitch = pitch;
    hotspot.mesh.position.copy(this._toPosition(yaw, pitch));
    hotspot.mesh.lookAt(0, 0, 0);
  }

  /* ── Mise à jour des données ────────────────────────────────────────── */

  updateHotspotData(hotspot, data) {
    Object.assign(hotspot.data, data);
    hotspot.mesh.userData.hotspotRef = hotspot;
    // Rafraîchir couleur (type peut avoir changé)
    this._applyColor(hotspot, hotspot === this.selectedHotspot ? 'selected' : 'normal');
  }

  /* ── Utilitaires de raycasting ──────────────────────────────────────── */

  /** Retourne la liste de tous les meshes (pour intersection Three.js). */
  getMeshes() {
    return this.hotspots.map(h => h.mesh);
  }

  /**
   * Retrouve le hotspot à partir d'un mesh intercepté par le raycaster.
   * @param {THREE.Object3D} mesh
   * @returns {{ mesh, data }|null}
   */
  findByMesh(mesh) {
    // On remonte au parent si c'est le ring
    let target = mesh;
    if (target.parent && target.parent.userData.isHotspot) target = target.parent;
    return target.userData.hotspotRef || null;
  }

  /* ── Sérialisation ──────────────────────────────────────────────────── */

  /** Retourne un tableau propre pour l'export JSON. */
  serialize() {
    return this.hotspots.map(h => {
      const d    = h.data;
      const base = {
        type:  d.type,
        yaw:   round(d.yaw),
        pitch: round(d.pitch),
      };
      if (d.type === 'navigate') {
        base.target = d.target || '';
        base.label  = d.label  || '';
      } else {
        base.title       = d.title       || '';
        base.description = d.description || '';
      }
      return base;
    });
  }

  /* ── Méthodes privées ───────────────────────────────────────────────── */

  _toPosition(yaw, pitch) {
    const y = yaw   * (Math.PI / 180);
    const p = pitch * (Math.PI / 180);
    return new THREE.Vector3(
      SPHERE_RADIUS * Math.cos(p) * Math.sin(y),
      SPHERE_RADIUS * Math.sin(p),
      SPHERE_RADIUS * Math.cos(p) * Math.cos(y),
    );
  }

  _applyColor(hotspot, state) {
    const palette = COLORS[hotspot.data.type] || COLORS.navigate;
    hotspot.mesh.material.color.setHex(palette[state] ?? palette.normal);
  }
}

function round(n) { return Math.round(n * 100) / 100; }
