/**
 * engine.js — Moteur Three.js pour la visualisation panoramique 360°
 * Gère le rendu de la sphère, la caméra, les contrôles et le raycasting.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.scene      = new THREE.Scene();
    this.camera     = null;
    this.renderer   = null;
    this.controls   = null;
    this.sphere     = null;
    this.raycaster  = new THREE.Raycaster();
    this.mouse      = new THREE.Vector2();

    // Mode courant : 'preview' | 'edit'
    this.mode = 'preview';
    // Sous-mode édition : 'none' | 'adding' | 'dragging'
    this.editSubMode = 'none';

    this._animFrameId = null;
    this._init();
  }

  /* ── Initialisation ─────────────────────────────────────────────────── */

  _init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Caméra au centre de la sphère
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.01, 1100);
    this.camera.position.set(0, 0, 0.01);

    // Contrôles orbite (sens inversé → feel intérieur de sphère)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom  = true;
    this.controls.enablePan   = false;
    this.controls.rotateSpeed = -0.35;
    this.controls.zoomSpeed   = 0.6;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 0.05;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI - 0.2;
    this.controls.dampingFactor = 0.08;
    this.controls.enableDamping = true;

    // Sphère panoramique (normales inversées → visible de l'intérieur)
    const geo = new THREE.SphereGeometry(500, 72, 48);
    geo.scale(-1, 1, 1);
    this.sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x111827 }));
    this.scene.add(this.sphere);

    // Lumière ambiante minimale (pour les hotspots si nécessaire)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    window.addEventListener('resize', this._onResize.bind(this));
    this._animate();
  }

  /* ── Chargement de panorama ─────────────────────────────────────────── */

  /**
   * Charge une image équirectangulaire sur la sphère.
   * @param {string|null} imageUrl
   * @returns {Promise<void>}
   */
  loadPanorama(imageUrl) {
    return new Promise((resolve) => {
      if (!imageUrl) {
        this._applyFallbackMaterial();
        resolve();
        return;
      }
      const loader = new THREE.TextureLoader();
      loader.load(
        imageUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter  = THREE.LinearFilter;
          this.sphere.material.dispose();
          this.sphere.material = new THREE.MeshBasicMaterial({ map: texture });
          resolve();
        },
        undefined,
        () => {
          console.warn(`[Engine] Impossible de charger: ${imageUrl}`);
          this._applyFallbackMaterial();
          resolve();
        }
      );
    });
  }

  _applyFallbackMaterial() {
    // Dégradé ciel/sol via canvas
    const canvas  = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0,   '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1,   '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // Texte indicatif
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune image panoramique', 256, 128);
    const tex = new THREE.CanvasTexture(canvas);
    this.sphere.material.dispose();
    this.sphere.material = new THREE.MeshBasicMaterial({ map: tex });
  }

  /* ── Gestion des modes ──────────────────────────────────────────────── */

  setMode(mode) {
    this.mode = mode;
    if (mode === 'preview') this.editSubMode = 'none';
  }

  setEditSubMode(sub) {
    this.editSubMode = sub;
  }

  /** Active/désactive les contrôles de caméra */
  setControlsEnabled(enabled) {
    this.controls.enabled = enabled;
  }

  /* ── Conversions coordonnées ────────────────────────────────────────── */

  /**
   * Point cartésien → { yaw, pitch } en degrés.
   */
  cartesianToSpherical(point) {
    const n     = point.clone().normalize();
    const pitch = Math.asin(n.y)            * (180 / Math.PI);
    const yaw   = Math.atan2(n.x, n.z)     * (180 / Math.PI);
    return { yaw, pitch };
  }

  /**
   * { yaw, pitch } (degrés) → vecteur 3D sur la sphère (radius par défaut = 10).
   */
  sphericalToCartesian(yaw, pitch, radius = 10) {
    const y = yaw   * (Math.PI / 180);
    const p = pitch * (Math.PI / 180);
    return new THREE.Vector3(
      radius * Math.cos(p) * Math.sin(y),
      radius * Math.sin(p),
      radius * Math.cos(p) * Math.cos(y)
    );
  }

  /* ── Raycasting ─────────────────────────────────────────────────────── */

  _setMouse(clientX, clientY) {
    const rect    = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x  = ((clientX - rect.left) / rect.width)  *  2 - 1;
    this.mouse.y  = -((clientY - rect.top)  / rect.height) *  2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  /** Retourne l'intersection avec la sphère panoramique. */
  raycastSphere(clientX, clientY) {
    this._setMouse(clientX, clientY);
    const hits = this.raycaster.intersectObject(this.sphere);
    return hits.length > 0 ? hits[0] : null;
  }

  /** Retourne les intersections avec une liste d'objets (hotspots). */
  raycastObjects(clientX, clientY, objects) {
    if (!objects.length) return [];
    this._setMouse(clientX, clientY);
    return this.raycaster.intersectObjects(objects, true);
  }

  /* ── Boucle de rendu ────────────────────────────────────────────────── */

  _animate() {
    this._animFrameId = requestAnimationFrame(this._animate.bind(this));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this._animFrameId);
    window.removeEventListener('resize', this._onResize.bind(this));
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
