# Tour360 — Éditeur & Visualiseur de Visite Virtuelle 360°

Éditeur et visualiseur de visites virtuelles 360° basé sur **Three.js** et **JavaScript vanilla** (modules ES6). Conçu pour être intégré dans un projet Angular.

> ⚠️ **Connexion internet requise** — Three.js est chargé via CDN (`unpkg.com`) et les polices via Google Fonts. Sans connexion active, l'application ne se lance pas correctement (rendu 3D absent, polices manquantes, interface dégradée).

---

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

---

## Installation et lancement

> ⚠️ Les modules ES6 (`import/export`) nécessitent un **serveur HTTP local** — ouvrir `index.html` directement depuis le système de fichiers ne fonctionnera pas.

```bash
cd tour-editor
python3 -m http.server 8080
# Ouvrir : http://localhost:8080
```

Autres options : `npx serve .` ou l'extension **Live Server** de VS Code.

---

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil — sélection fichier JSON + lien éditeur |
| `pages/editor.html` | Éditeur complet (créer/modifier une visite) |
| `pages/viewer.html?tour=fichier.json` | Visualiseur appelé avec un fichier JSON local |
| `pages/viewer.html?tour=https://…` | Visualiseur appelé avec une URL distante |
| `pages/viewer.html?tour=__session__` | Visualiseur appelé depuis la landing (via sessionStorage) |

---

## Guide d'utilisation

### Landing (`index.html`)

- **Carte Visualiser** : glisser-déposer ou sélectionner un fichier JSON → bouton "Lancer la visite"
- **Carte Éditeur** : lien direct vers l'éditeur

### Éditeur — Mode Preview

| Action | Résultat |
|--------|----------|
| Clic-glisser | Rotation de la caméra |
| Molette | Zoom avant / arrière |
| Clic sur hotspot bleu | Navigation vers la scène cible |
| Clic sur hotspot vert | Affichage de la fiche info |

### Éditeur — Mode Édition

| Action | Résultat |
|--------|----------|
| **Ajouter hotspot** + clic sur la sphère | Ouvre la popup de création |
| Clic sur un hotspot existant | Sélection + popup d'édition |
| Glisser un hotspot | Repositionnement libre |
| **Supprimer** (toolbar) | Supprime le hotspot sélectionné |
| **Effacer la scène** (toolbar) | Supprime tous les hotspots de la scène courante (confirmation requise) |
| Hotspot navigate sans scène cible | Propose de créer la scène de destination |

### Gestion des scènes (sidebar)

- **Ajouter une scène** : nom + URL ou fichier local (JPEG/PNG/WebP, max 10 Mo) — image obligatoire
- **Clic sur une scène** : charge et affiche la scène dans l'éditeur
- **🗑 (poubelle)** : supprime la scène individuelle (confirmation requise)
- **Réinitialiser repères** : supprime tous les hotspots de toutes les scènes (scènes conservées)
- **Supprimer tout** : supprime toutes les scènes et repart de zéro (confirmation requise)
- **Importer JSON** : charge une visite depuis un fichier `.json`
- **Charger la démo** : 2 scènes préconfigurées avec hotspots d'exemple
- **◀ / ▶** : bouton de réduction/agrandissement de la sidebar (le viewer s'adapte automatiquement)

---

## Validation des données

- **Scène** : un nom et une image panoramique sont obligatoires à la création
- **Hotspot Info** : le titre et la description sont tous deux obligatoires
- **Image locale** : formats acceptés JPEG, PNG, WebP — taille max 10 Mo
- Un avertissement natif du navigateur s'affiche si vous quittez ou rafraîchissez la page avec des modifications non exportées

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
| `hotspots` | Hotspot[] | ✓ | Liste des hotspots (peut être vide `[]`) |

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
| `title` | string | Titre de la fiche (obligatoire) |
| `description` | string | Corps de la fiche (obligatoire) |

### Images panoramiques

- **Format** : JPEG ou PNG équirectangulaire (projection 360°×180°)
- **Ratio recommandé** : 2:1 — ex : 4096×2048 px
- **Sources** : Ricoh Theta, Insta360, GoPro MAX, Google Street View Takeout
- Les images peuvent être hébergées localement ou sur un CDN
- ⚠️ Si les images sont sur un domaine différent du serveur, ce dernier doit envoyer les en-têtes **CORS** appropriés

---

## Dépendances

| Lib | Version | Usage | Chargement |
|-----|---------|-------|------------|
| [Three.js](https://threejs.org) | 0.160.0 | Rendu 3D WebGL | CDN `unpkg.com` |
| OrbitControls | inclus Three.js | Contrôle caméra orbite | CDN `unpkg.com` |
| IBM Plex Sans / Mono | — | Typographie de l'interface | Google Fonts |

> Aucune installation npm requise pour le prototype standalone. Toutes les dépendances sont chargées à la volée — **une connexion internet active est donc indispensable au bon fonctionnement de l'application**.

---

## Licence

MIT — Libre d'utilisation et de modification.