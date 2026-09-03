# Setup — Asmodeus

Guide d'installation pour faire tourner l'app en local.

---

## Prérequis

### 1. Node.js ≥ 18

```bash
node -v  # vérifier la version
```

Si absent : https://nodejs.org ou via `nvm`.

### 2. Outils de compilation natifs

`better-sqlite3` (la base de données) se compile en binaire natif lors du `npm install`. Ça nécessite des outils système :

**Linux / WSL2 :**
```bash
sudo apt-get install build-essential python3
```

**Mac :**
```bash
xcode-select --install
```

### 3. Ollama

L'app ne fonctionne pas sans Ollama — c'est lui qui fait tourner les modèles.

- Télécharger : https://ollama.com
- Vérifier qu'il tourne : `ollama list`

**WSL2 :** installer Ollama sur Windows, pas dans WSL. L'app détecte automatiquement l'IP de la passerelle Windows.

**Linux natif / Mac :** Ollama sur la même machine, accessible sur `localhost:11434`.

### 4. Modèles Ollama

Il faut au moins un modèle pour créer des personas.

```bash
ollama pull qwen3.5:9b      # modèle par défaut de l'app
ollama pull llava:7b        # si tu veux envoyer des images
```

`qwen3.5:9b` n'est pas un simple exemple : c'est le modèle sur lequel l'app retombe quand un agent tourne sans persona associée. Sans lui, ces agents échoueront. Pour tout le reste, n'importe quel modèle listé par `ollama list` fonctionne et se choisit persona par persona.

---

## Installation

```bash
git clone <repo>
cd asmodeus

# Créer le fichier d'environnement
cp backend/.env.example backend/.env
# Éditer backend/.env si besoin (voir section Variables ci-dessous)

npm install
```

---

## Variables d'environnement

Le fichier `backend/.env` est créé à partir de `.env.example`. La config par défaut fonctionne dans la majorité des cas.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3001` | Port du backend |
| `FRONTEND_URL` | `http://localhost:5173` | Origine CORS autorisée |
| `DB_PATH` | `./asmodeus.db` | Chemin de la base SQLite (créée automatiquement) |
| `OLLAMA_URL` | auto-détecté | À décommenter si l'auto-détection échoue |
| `TAVILY_API_KEY` | — | Optionnel — active la recherche web |
| `GMAIL_REDIRECT_URI` | `http://localhost:3001/api/gmail/callback` | Optionnel — URL de callback OAuth Google |

**Si Ollama n'est pas trouvé automatiquement**, décommenter et ajuster dans `backend/.env` :
```env
OLLAMA_URL=http://localhost:11434
```

Les identifiants OAuth Google ne passent pas par le `.env` : ils se saisissent dans l'écran Paramètres de l'app et sont stockés en base.

---

## Démarrage

```bash
npm run dev
```

- Frontend : http://localhost:5173
- Backend : http://localhost:3001

La base de données SQLite est créée automatiquement au premier démarrage.

---

## Optionnel — Extraction de PDFs scannés

Pour envoyer des PDFs en mode vision (PDF image → images) :

```bash
# Linux / WSL2
sudo apt-get install poppler-utils

# Mac
brew install poppler
```

Sans ça, les PDFs texte classiques fonctionnent quand même.

---

## Optionnel — Recherche web

Créer un compte sur https://tavily.com (gratuit), récupérer une clé API et l'ajouter dans `backend/.env` :

```env
TAVILY_API_KEY=tvly-...
```

Sans cette clé, l'outil de recherche web est silencieusement désactivé, et l'agent de veille refuse de tourner en le disant explicitement.

---

## Problèmes fréquents

**`npm install` plante sur `better-sqlite3`**
→ Les outils de compilation sont absents. Voir section Prérequis #2.

**L'app démarre mais les personas ne répondent pas**
→ Ollama n'est pas joignable. Vérifier avec `ollama list` et ajuster `OLLAMA_URL` dans `.env`.

**Un agent échoue alors que le chat fonctionne**
→ L'agent n'a probablement pas de persona associée, et retombe donc sur `qwen3.5:9b`. Soit tu l'installes, soit tu associes une persona à l'agent.

**WSL2 : Ollama non trouvé automatiquement**
→ Décommenter `OLLAMA_URL=http://localhost:11434` dans `backend/.env` ou vérifier que Ollama est bien lancé côté Windows.

**Port 3001 déjà utilisé**
→ Changer `PORT` dans `backend/.env` et `FRONTEND_URL` dans le même fichier.
