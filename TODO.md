# Tour360 — TODOLIST

## Éditeur — UX & fonctionnalités

* **Édition d'une scène** : permettre de changer l'image panoramique et de renommer une scène déjà créée depuis la sidebar
* **Ordre des scènes** : réordonner les scènes dans la sidebar par drag-and-drop ou via des flèches haut/bas selon sa convenance
* **Minimap des scènes dans l'éditeur** : afficher une miniature de chaque scène pour s'y déplacer sans quitter la vue 3D
* **Annuler / Rétablir (Undo/Redo)** : Ctrl+Z pour revenir en arrière sur les actions (ajout, suppression, déplacement de hotspot)
* **Étiquette flottante sur les hotspots** : afficher le label ou le titre du hotspot au survol directement dans le viewer
* **Dupliquer une scène** : créer une copie d'une scène existante avec ses hotspots pour partir d'une base existante
* **Scène initiale configurable** : choisir quelle scène s'ouvre en premier dans le viewer, indépendamment de l'ordre de création

---

## Viewer — expérience visiteur

* **Support mobile / tactile** : gestes touch (pinch to zoom, swipe to rotate) pour smartphone et tablette
* **Mode plein écran** : bouton fullscreen natif (Fullscreen API) pour une immersion totale
* **Rotation automatique au démarrage** : animation lente de la caméra à l'ouverture pour donner envie d'explorer
* **Transition animée entre scènes** : fondu enchaîné ou effet de flou lors du changement de panorama

---

## Export & intégration

* **Intégrations framework** : créer des implémentations toutes faites ou des guides exhaustifs pour Angular, React et Vue
* **Export d'un snippet d'intégration** : générer une balise `<iframe>` ou un `<script>` prêt à coller dans n'importe quel site
* **Sauvegarde automatique locale** : persister le travail en cours dans `localStorage` pour ne rien perdre en cas de fermeture accidentelle
* **Import depuis Google Street View** : coller une URL Street View pour importer automatiquement le panorama correspondant