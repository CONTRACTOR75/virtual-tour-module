# Tour360 — Éditeur & Visualiseur de Visite Virtuelle 360°

Éditeur et visualiseur de visites virtuelles 360° basé sur **Three.js** et **JavaScript vanilla** (modules ES6). Conçu pour être intégré dans un projet Angular.

## Structure du projet

```
tour-editor/
├── index.html                  # Page d'accueil — choix Visualiser / Éditer
├── pages/
│   ├── editor.html             # Éditeur complet
│   └── viewer.html             # Visualiseur standalone
├── scripts/
│   ├── main.js                 # Logique éditeur & événements UI
│   └── viewer.js               # Logique visualiseur
├── styles/
│   └── styles.css              # Styles éditeur (thème sombre industriel)
├── core/
│   ├── engine.js               # Moteur Three.js (sphère, caméra, raycasting)
│   ├── hotspot-manager.js      # Création, sélection, drag des hotspots
│   ├── scene-manager.js        # Chargement, sauvegarde, navigation entre scènes
│   └── tour-serializer.js      # Export/import JSON
├── visite-demo-export.json     # Exemple de JSON exporté
└── README.md
```

## Installation et lancement

> ⚠️ Les modules ES6 (`import/export`) nécessitent un **serveur HTTP local**.

```bash
cd tour-editor
python3 -m http.server 8080
# Ouvrir : http://localhost:8080/index.html
ou simplement
# Ouvrir : http://localhost:8080
```

Autres options : `npx serve .` ou l'extension **Live Server** de VS Code.

---

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil — sélection fichier JSON + lien éditeur |
| `editor.html` | Éditeur complet (créer/modifier une visite) |
| `viewer.html?tour=fichier.json` | Visualiseur appelé avec un fichier JSON |
| `viewer.html?tour=__session__` | Visualiseur appelé depuis la landing (via sessionStorage) |

---

## Guide d'utilisation

### Landing

- **Carte Visualiser** : glisser-déposer ou sélectionner un fichier JSON → bouton "Lancer la visite"
- **Carte Éditeur** : lien direct vers l'éditeur

### Mode Preview (éditeur)

| Action | Résultat |
|--------|----------|
| Clic-glisser | Rotation de la caméra |
| Molette | Zoom |
| Clic sur hotspot bleu | Navigation vers la scène cible |
| Clic sur hotspot vert | Affichage de la fiche info |

### Mode Édition

| Action | Résultat |
|--------|----------|
| **Ajouter hotspot** + clic sphère | Popup de création |
| Clic sur un hotspot | Sélection + popup d'édition |
| Glisser un hotspot | Repositionnement |
| **Supprimer** | Supprime le hotspot sélectionné |
| Aucune scène cible choisie | Propose de créer la scène de destination |

### Gestion des scènes (sidebar)

- **Ajouter une scène** : nom + URL de l'image panoramique
- **Clic sur une scène** : charge la scène
- **✕** : supprime la scène
- **Importer JSON** : charge une visite existante
- **Charger la démo** : 2 scènes d'exemple préconfigurées

---

## Format JSON

### Structure complète

```json
{
  "name": "Nom de la visite",
  "initialScene": "salon",
  "scenes": {
    "salon": {
      "name": "Salon",
      "image": "https://cdn.example.com/salon-360.jpg",
      "hotspots": [
        {
          "type": "navigate",
          "yaw": 45.0,
          "pitch": -8.0,
          "target": "cuisine",
          "label": "Vers la cuisine"
        },
        {
          "type": "info",
          "yaw": -90.0,
          "pitch": 5.0,
          "title": "Canapé",
          "description": "Canapé en cuir naturel, 3 places."
        }
      ]
    },
    "cuisine": {
      "name": "Cuisine",
      "image": "https://cdn.example.com/cuisine-360.jpg",
      "hotspots": []
    }
  }
}
```

### Référence des champs

**Racine**

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `name` | string | ✓ | Nom affiché de la visite |
| `initialScene` | string | ✓ | Clé de la scène chargée au démarrage |
| `scenes` | object | ✓ | Map `{ id: SceneObject }` |

**SceneObject**

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `name` | string | ✓ | Nom affiché de la scène |
| `image` | string | ✓ | URL de l'image panoramique équirectangulaire |
| `hotspots` | Hotspot[] | ✓ | Liste des hotspots (peut être vide) |

**Hotspot — type `navigate`**

| Champ | Type | Description |
|-------|------|-------------|
| `type` | `"navigate"` | Navigation vers une autre scène |
| `yaw` | number | Azimut en degrés (−180 à +180) |
| `pitch` | number | Élévation en degrés (−90 à +90) |
| `target` | string | ID de la scène cible (clé dans `scenes`) |
| `label` | string | Étiquette optionnelle affichée au survol |

**Hotspot — type `info`**

| Champ | Type | Description |
|-------|------|-------------|
| `type` | `"info"` | Affichage d'une fiche d'information |
| `yaw` | number | Azimut en degrés |
| `pitch` | number | Élévation en degrés |
| `title` | string | Titre de la fiche |
| `description` | string | Corps de la fiche |

### Images panoramiques

- **Format** : JPEG ou PNG équirectangulaire (projection 360°×180°)
- **Ratio recommandé** : 2:1 — ex : 4096×2048 px
- **Sources** : Ricoh Theta, Insta360, GoPro MAX, Google Street View Takeout
- Les images peuvent être hébergées localement ou sur un CDN (CORS requis si origines différentes)

---

## Dépendances

| Lib | Version | Usage |
|-----|---------|-------|
| [Three.js](https://threejs.org) | 0.160.0 | Rendu 3D WebGL |
| OrbitControls | inclus Three.js | Contrôle caméra orbite |

Chargées via CDN `unpkg.com` — aucune installation npm requise pour le prototype standalone.

---

## Licence

MIT — Libre d'utilisation et de modification.