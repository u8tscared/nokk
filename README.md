# Nokk

L’app des tournées de calendriers des sapeurs-pompiers. Une app web installable (PWA), en français, qui marche hors ligne.

**Ouvrir l’app :** https://nokkapp.fr/

**Présentation (landing) :** https://nokkapp.fr/decouvrir/ (fichiers statiques dans `public/decouvrir/`)

**Mise en ligne :** Cloudflare (Worker `nokk`, fichiers statiques de `dist/`) reconstruit et publie le site à chaque push sur `main`. Les tests GitHub se lancent à la main (Actions > Tests > Run workflow).

Sur iPhone : Safari → Partager → « Sur l’écran d’accueil ». Sur Android : Chrome → « Installer l’application ».

## Essayer en 1 minute

1. Ouvrir le lien, toucher **Essayer la démo** (vraies rues de Rezé, une équipe de 6, une soirée déjà commencée).
2. Le gros bouton rouge au centre ouvre la **porte suivante** : Absent / Refus / Déjà pris en un geste, ou un montant + moyen de paiement, puis Valider. La fenêtre passe seule à la porte d’après.
3. **Caisse** : compter les billets, voir l’écart, remettre au trésorier (reçu PDF).
4. **Plus → Comptes / Exports** : bilan, bordereau de chèques, tableur.

En vrai : **Créer mon équipe**, puis tracer un secteur sur la carte ou « autour de moi » : les portes et les rues viennent d’OpenStreetMap, le parcours à pied est calculé tout seul.

## Ce qu’il y a dedans

- Carte fluide (MapLibre + OpenFreeMap), position en direct, rues colorées : faite, équipe dessus, à repasser, pas faite.
- Secteurs partout en France : tracer, autour de moi, liste d’adresses (Base Adresse Nationale), photo du plan.
- Parcours optimisé : zigzag dans les petites rues, un trottoir puis l’autre dans les grandes.
- Saisie porte à porte en 1 à 3 touches, immeubles et appartements, repassages, annulation.
- Comptabilité complète : caisse par binôme, comptage des billets, écarts, remises signées, comptes par secteur / équipier / jour / moyen, comparaison avec l’an dernier, stock de calendriers.
- Exports : rapport PDF, bordereau de remise de chèques, tableur CSV, sauvegarde complète.
- Équipe : rôles (chef, pompier, trésorier), écrans masquables, binômes du soir, fichier d’équipe à partager.
- Hors ligne, mode sombre, sons et vibrations, formation intégrée par écran.
- Bientôt : paiement carte SumUp, synchro en direct entre téléphones.

## Développer

```bash
npm ci
npm run dev        # http://localhost:5173
npx vitest run     # tests unitaires
npm run build && npx playwright test   # parcours complets sur téléphone, tablette, ordinateur
```

Chaque push sur `main` lance les tests et publie `dist/` sur la branche `gh-pages`.
