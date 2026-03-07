/**
 * tour-serializer.js — Export/import JSON de la visite virtuelle.
 * Fournit aussi des données de démonstration.
 */

export class TourSerializer {

  /* ── Export ─────────────────────────────────────────────────────────── */

  /**
   * Exporte les données en JSON et déclenche un téléchargement.
   * @param {object} tourData
   * @param {string} [filename]
   * @returns {string} Le JSON produit
   */
  static exportToFile(tourData, filename = 'visite-virtuelle.json') {
    const clean = TourSerializer.cleanTourData(tourData);
    const json  = JSON.stringify(clean, null, 2);
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);

    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return json;
  }

  /* ── Import ─────────────────────────────────────────────────────────── */

  /**
   * Importe depuis un fichier File (input[type=file]).
   * @param {File} file
   * @returns {Promise<object>}
   */
  static importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw       = JSON.parse(e.target.result);
          const validated = TourSerializer.validateTourData(raw);
          resolve(validated);
        } catch (err) {
          reject(new Error('Fichier JSON invalide : ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsText(file);
    });
  }

  /* ── Nettoyage ──────────────────────────────────────────────────────── */

  /**
   * Retourne une copie propre sans champs techniques superflus.
   */
  static cleanTourData(data) {
    const clean = {
      name:         data.name || 'Visite Virtuelle',
      initialScene: data.initialScene,
      scenes:       {},
    };

    Object.entries(data.scenes || {}).forEach(([id, scene]) => {
      clean.scenes[id] = {
        name:     scene.name || id,
        image:    scene.image || '',
        hotspots: (scene.hotspots || []).map(h => {
          const base = {
            type:  h.type,
            yaw:   round(h.yaw),
            pitch: round(h.pitch),
          };
          if (h.type === 'navigate') {
            base.target = h.target || '';
            if (h.label) base.label = h.label;
          } else {
            base.title       = h.title       || '';
            base.description = h.description || '';
          }
          return base;
        }),
      };
    });

    return clean;
  }

  /* ── Validation ─────────────────────────────────────────────────────── */

  static validateTourData(data) {
    if (!data || typeof data !== 'object') throw new Error('Format de données invalide');
    if (!data.scenes || typeof data.scenes !== 'object') throw new Error('Aucune scène trouvée');

    // Assurer les champs manquants
    Object.entries(data.scenes).forEach(([id, scene]) => {
      if (!scene.hotspots) scene.hotspots = [];
      if (!scene.name)     scene.name     = id;
    });

    if (!data.name)  data.name  = 'Visite Virtuelle';
    if (!data.initialScene && Object.keys(data.scenes).length > 0) {
      data.initialScene = Object.keys(data.scenes)[0];
    }

    return data;
  }

  /* ── Données de démonstration ───────────────────────────────────────── */

  /**
   * Retourne des données de visite de démo avec 2 scènes.
   * Les images utilisent des panoramas publics libres de droits.
   */
  static generateDemoData() {
    // URLs de panoramas équirectangulaires publics (libres de droits, source : Unsplash/Wikimedia)
    return {
      name:         'Visite Démo — Appartement',
      initialScene: 'salon',
      scenes: {
        salon: {
          name:  'Salon',
          // Panorama libre (vous pouvez le remplacer par votre propre image)
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Gotham.jpg/2560px-Above_Gotham.jpg',
          hotspots: [
            {
              type:   'navigate',
              yaw:    45,
              pitch:  -8,
              target: 'cuisine',
              label:  'Vers la Cuisine',
            },
            {
              type:        'info',
              yaw:         -90,
              pitch:       5,
              title:       'Canapé',
              description: 'Canapé en cuir naturel, 3 places, réalisé par un artisan local.',
            },
            {
              type:        'info',
              yaw:         160,
              pitch:       10,
              title:       'Bibliothèque',
              description: 'Bibliothèque sur mesure en chêne massif, 400 ouvrages.',
            },
          ],
        },
        cuisine: {
          name:  'Cuisine',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/2560px-Camponotus_flavomarginatus_ant.jpg',
          hotspots: [
            {
              type:   'navigate',
              yaw:    -135,
              pitch:  -5,
              target: 'salon',
              label:  'Vers le Salon',
            },
            {
              type:        'info',
              yaw:         30,
              pitch:       5,
              title:       'Îlot central',
              description: 'Plan de travail en marbre de Carrare blanc, 3m × 1,2m.',
            },
          ],
        },
      },
    };
  }
}

function round(n) { return Math.round((n ?? 0) * 100) / 100; }
