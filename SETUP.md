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

Il faut au moins un modèle pour créer des personas. Exemple :

```bash
ollama pull qwen3:8b        # bon rapport qualité/vitesse
ollama pull qwen3:14b       # plus précis, plus lent
ollama pull llava:7b        # si tu veux envoyer des images
```

N'importe quel modèle listé par `ollama list` fonctionne dans l'app.

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

**Si Ollama n'est pas trouvé automatiquement**, décommenter et ajuster dans `backend/.env` :
```env
OLLAMA_URL=http://localhost:11434
```

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

Sans cette clé, l'outil de recherche web est silencieusement désactivé.

---

## Problèmes fréquents

**`npm install` plante sur `better-sqlite3`**
→ Les outils de compilation sont absents. Voir section Prérequis #2.

**L'app démarre mais les personas ne répondent pas**
→ Ollama n'est pas joignable. Vérifier avec `ollama list` et ajuster `OLLAMA_URL` dans `.env`.

**WSL2 : Ollama non trouvé automatiquement**
→ Décommenter `OLLAMA_URL=http://localhost:11434` dans `backend/.env` ou vérifier que Ollama est bien lancé côté Windows.

**Port 3001 déjà utilisé**
→ Changer `PORT` dans `backend/.env` et `FRONTEND_URL` dans le même fichier.
