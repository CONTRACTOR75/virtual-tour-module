/**
 * scene-manager.js — Gestion des scènes de la visite virtuelle.
 * Orchestre le chargement, la sauvegarde et le préchargement des scènes.
 */

export class SceneManager {
  /**
   * @param {import('./engine.js').Engine}           engine
   * @param {import('./hotspot-manager.js').HotspotManager} hotspotManager
   */
  constructor(engine, hotspotManager) {
    this.engine         = engine;
    this.hotspotManager = hotspotManager;

    /** Structure de données principale de la visite */
    this.tourData = {
      name:         'Ma Visite Virtuelle',
      initialScene: null,
      scenes:       {},
    };

    this.currentSceneId = null;
    this._preloadCache  = new Map(); // url → HTMLImageElement

    // Callbacks que main.js peut surcharger
    this.onSceneLoaded  = null; // (id, sceneData) => void
    this.onScenesChange = null; // () => void
  }

  /* ── Gestion des scènes ─────────────────────────────────────────────── */

  /**
   * Ajoute une nouvelle scène.
   * @param {string} id       Identifiant unique (ex: "salon")
   * @param {string} name     Nom affiché
   * @param {string} imageUrl URL de l'image panoramique
   */
  addScene(id, name, imageUrl) {
    if (!id || this.tourData.scenes[id]) return null;
    this.tourData.scenes[id] = { name, image: imageUrl, hotspots: [] };
    if (!this.tourData.initialScene) {
      this.tourData.initialScene = id;
    }
    this.onScenesChange?.();
    return this.tourData.scenes[id];
  }

  /**
   * Supprime une scène et nettoie les références.
   * @param {string} id
   */
  removeScene(id) {
    if (!this.tourData.scenes[id]) return;

    delete this.tourData.scenes[id];

    // Nettoyer les hotspots navigate qui pointent vers cette scène
    Object.values(this.tourData.scenes).forEach(scene => {
      scene.hotspots = scene.hotspots.filter(
        h => !(h.type === 'navigate' && h.target === id)
      );
    });

    // Recalculer la scène initiale si nécessaire
    if (this.tourData.initialScene === id) {
      const remaining = Object.keys(this.tourData.scenes);
      this.tourData.initialScene = remaining[0] ?? null;
    }

    this.onScenesChange?.();

    // Si la scène courante est supprimée, charger une autre
    if (this.currentSceneId === id) {
      const remaining = Object.keys(this.tourData.scenes);
      this.currentSceneId = null; // forcer le rechargement
      if (remaining.length > 0) {
        this.loadScene(remaining[0]);
      } else {
        this.hotspotManager.removeAllHotspots();
        this.engine.loadPanorama(null);
      }
    }
  }

  /**
   * Renomme une scène.
   */
  renameScene(id, newName) {
    if (this.tourData.scenes[id]) {
      this.tourData.scenes[id].name = newName;
      this.onScenesChange?.();
    }
  }

  /* ── Chargement ─────────────────────────────────────────────────────── */

  /**
   * Sauvegarde l'état courant (hotspots) avant de changer de scène.
   */
  saveCurrentScene() {
    if (!this.currentSceneId) return;
    const scene = this.tourData.scenes[this.currentSceneId];
    if (scene) scene.hotspots = this.hotspotManager.serialize();
  }

  /**
   * Charge une scène : sauvegarde l'ancienne, charge l'image, recrée les hotspots.
   * @param {string} sceneId
   */
  async loadScene(sceneId) {
    if (sceneId === this.currentSceneId) return;
    const scene = this.tourData.scenes[sceneId];
    if (!scene) { console.warn(`[SceneManager] Scène inconnue: ${sceneId}`); return; }

    this.saveCurrentScene();
    this.currentSceneId = sceneId;

    // Supprimer les hotspots de la scène précédente
    this.hotspotManager.removeAllHotspots();

    // Charger le panorama
    await this.engine.loadPanorama(scene.image);

    // Recréer les hotspots
    (scene.hotspots || []).forEach(h => {
      this.hotspotManager.createHotspot(h.yaw, h.pitch, h);
    });

    this.onSceneLoaded?.(sceneId, scene);

    // Précharger les scènes voisines
    this._preloadNeighbors(sceneId);
  }

  /* ── Accès aux données ──────────────────────────────────────────────── */

  getSceneIds() {
    return Object.keys(this.tourData.scenes);
  }

  getScene(id) {
    return this.tourData.scenes[id] ?? null;
  }

  getCurrentScene() {
    return this.currentSceneId ? this.tourData.scenes[this.currentSceneId] : null;
  }

  /* ── Import / Export ────────────────────────────────────────────────── */

  /** Importe des données de visite et charge la première scène. */
  async importTour(data) {
    this.currentSceneId = null;
    this.hotspotManager.removeAllHotspots();
    this.tourData = data;
    this.onScenesChange?.();
    if (data.initialScene && data.scenes[data.initialScene]) {
      await this.loadScene(data.initialScene);
    } else {
      const first = Object.keys(data.scenes)[0];
      if (first) await this.loadScene(first);
    }
  }

  /** Exporte les données en sauvegardant d'abord la scène courante. */
  exportTour() {
    this.saveCurrentScene();
    return JSON.parse(JSON.stringify(this.tourData));
  }

  /* ── Préchargement ──────────────────────────────────────────────────── */

  _preloadNeighbors(sceneId) {
    const scene = this.tourData.scenes[sceneId];
    if (!scene) return;
    scene.hotspots
      .filter(h => h.type === 'navigate' && h.target)
      .forEach(h => {
        const target = this.tourData.scenes[h.target];
        if (target?.image && !this._preloadCache.has(target.image)) {
          const img = new Image();
          img.src = target.image;
          this._preloadCache.set(target.image, img);
        }
      });
  }
}
