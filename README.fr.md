# Legion4me

[English version](README.md)

Legion4me est un assistant IA personnel qui tourne entièrement sur votre machine. Vous configurez des personas, des agents déclenchables à la demande et une mémoire persistante au-dessus de modèles locaux servis par Ollama. Le backend est écrit en Node et TypeScript, l'interface en Vue 3, et tout est stocké dans une base SQLite locale.

Aucune donnée ne quitte votre ordinateur, sauf les appels que vous autorisez explicitement via les outils (recherche web, Gmail, météo). Les modèles tournent sur votre propre carte graphique.

## Fonctionnalités

- Une persona est un modèle Ollama associé à un prompt système, une température, un nom et une couleur. Chaque conversation appartient à une persona, donc changer de persona change le modèle qui répond et ce dont il se souvient de vous.
- Les modes conseil et salon réunissent plusieurs personas dans la même conversation. Chaque intervenant reçoit un contexte mémoire qui lui est propre.
- La mémoire est extraite par le modèle après chaque échange. Un second appel décide si un fait vaut partout ou seulement pour une persona. Le bloc mémoire injecté dans le prompt n'a pas la même forme en tête-à-tête, en conseil et en salon.
- Les longues conversations sont compactées par paliers. Dès que plus de dix messages ne sont pas couverts, les six plus anciens sont fusionnés dans un résumé stocké par conversation, et le chat ne se bloque jamais si la génération du résumé échoue.
- Cinq types d'agents se lancent à la demande, à savoir le digest d'e-mails, le briefing matinal, la veille, le résumé de réunion et la revue hebdomadaire. Leurs prompts imposent au modèle de n'utiliser que les sources fournies et de les citer.
- Gmail se connecte en OAuth2 en lecture seule. Les identifiants du client se saisissent dans l'écran Paramètres et sont stockés en base, pas dans le code ni dans le fichier d'environnement.
- Le chat peut appeler des outils pour la recherche web, la récupération de pages, Wikipédia, les transcriptions YouTube, la date et l'heure, et l'enregistrement d'un souvenir.
- Vous pouvez joindre des images et des fichiers. Les PDF texte sont extraits, et les PDF scannés peuvent être envoyés aux modèles de vision une fois poppler installé.
- Un écran de statistiques affiche les tokens lus et générés par persona, d'après les compteurs renvoyés par Ollama.
- Plusieurs thèmes visuels sont disponibles.

## Démo

![Démo de Legion4me](docs/media/demo.gif)

La [version MP4](docs/media/demo.mp4) de la démo est aussi disponible. Elle utilise uniquement des données fictives. Les personas, les conversations et les souvenirs ont été inventés pour l'enregistrement, et les réponses viennent d'un substitut d'Ollama qui renvoie un texte fixe, donc aucun vrai compte, aucune vraie conversation et aucun vrai modèle n'y apparaissent.

## Architecture

Le dépôt est un workspace npm composé de deux paquets.

- Le backend est un serveur Express en TypeScript. Il stocke les données dans SQLite via Drizzle ORM et better-sqlite3, dialogue avec Ollama en HTTP, et diffuse les réponses du chat au navigateur sous forme d'événements serveur. En production, il sert aussi le frontend compilé.
- Le frontend est une application Vue 3 d'une seule page, construite avec Vite, avec des stores Pinia et Vue Router. En développement, Vite redirige les routes `/api` vers le backend.
- Ollama tourne en dehors du projet et sert les modèles. Sous WSL2, le backend détecte tout seul l'adresse de la passerelle Windows.
- Tavily, Open-Meteo et l'API Gmail ne sont appelés que lorsque vous utilisez l'outil ou l'agent correspondant.

## Prérequis

- Node.js 20.3 ou plus récent, car le backend utilise `AbortSignal.any`.
- Les outils de compilation pour le module natif `better-sqlite3`. Sous Linux ou WSL2, installez-les avec `sudo apt-get install build-essential python3`, et sous macOS avec `xcode-select --install`.
- [Ollama](https://ollama.com) lancé et joignable. Sous WSL2, installez-le côté Windows plutôt que dans WSL.
- Au moins un modèle téléchargé. Le modèle par défaut des agents sans persona est `qwen3.5:9b`, et `llava:7b` est utile pour les images.
- En option, `poppler-utils` pour les PDF scannés, et une clé d'API Tavily pour la recherche web.

## Installation et lancement

```bash
git clone https://github.com/MehdiZen/legion4me.git
cd legion4me
cp backend/.env.example backend/.env
npm install
ollama pull qwen3.5:9b
npm run dev
```

L'interface s'ouvre sur http://localhost:5173 et l'API écoute sur http://localhost:3001. La base SQLite est créée au premier démarrage.

Pour un lancement de type production, compilez le projet puis démarrez le backend, qui sert alors l'interface sur le port 3001.

```bash
npm run build
npm start
```

Le dépôt contient aussi un fichier `ecosystem.config.js` pour PM2, qui démarre `backend/dist/index.js` et lit `backend/.env`. Lancez `pm2 start ecosystem.config.js` après une compilation. Le guide d'installation détaillé est dans [SETUP.md](SETUP.md).

## Configuration

Le backend lit ses réglages dans `backend/.env`. Copiez `backend/.env.example` et ajustez les valeurs. Les valeurs ci-dessous sont des exemples factices.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port du backend |
| `FRONTEND_URL` | `http://localhost:5173` | Origine autorisée par le CORS |
| `OLLAMA_URL` | détecté | URL de base d'Ollama, par exemple `http://localhost:11434` |
| `OLLAMA_HOST` | non défini | Hôte et port d'Ollama, utilisés si `OLLAMA_URL` n'est pas défini |
| `DB_PATH` | `./legion4me.db` | Chemin du fichier SQLite, relatif au répertoire de travail du processus |
| `TAVILY_API_KEY` | non défini | Active la recherche web, par exemple `tvly-xxxxxxxx` |
| `GMAIL_REDIRECT_URI` | `http://localhost:3001/api/gmail/callback` | URL de retour OAuth utilisée par l'intégration Gmail |

L'identifiant et le secret du client OAuth Google ne sont pas des variables d'environnement. Ils se saisissent dans l'écran Paramètres de l'application.

## Développement

- `npm run dev` démarre le backend avec `tsx watch` et le frontend avec Vite, côte à côte.
- `npm run build` compile le backend avec `tsc` et construit le frontend après une vérification de types par `vue-tsc`.
- `npm start` lance le backend compilé.
- Le projet n'a pas encore de tests automatisés ni de linter configuré. Une vérification rapide des types du backend se fait avec `npx tsc --noEmit -p backend`, et `npx vue-tsc --noEmit` fait la même chose pour le frontend depuis le dossier `frontend`.

## Structure du dépôt

```text
backend/
  src/
    index.ts          Application Express et montage des routes
    db/               Client SQLite et schéma Drizzle
    routes/           Routes REST et routes en streaming
    services/         Client Ollama, agents, mémoire, résumés, outils, fichiers
      orchestrator/   Logique du chat, du conseil et du salon, prompts et contexte
frontend/
  src/
    views/            Chat, agents, personas, statistiques, paramètres
    components/       Composants d'interface
    stores/           Stores Pinia
    themes/           Thèmes visuels
docs/media/           Vidéo et GIF de démonstration
ecosystem.config.js   Configuration PM2
SETUP.md              Guide d'installation détaillé
```

## Licence

Copyright (c) 2026 Mehdi Zenati. Legion4me est **source disponible** sous double licence. Il est gratuit pour un usage personnel non commercial, et une licence payante est requise pour un usage commercial et professionnel. Voir [LICENSE](LICENSE) pour les termes exacts. Les bibliothèques tierces conservent leurs propres licences.
