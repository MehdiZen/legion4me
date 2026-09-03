# Asmodeus

Assistant IA personnel qui tourne **entièrement en local**. Personas configurables, agents
programmables, mémoire persistante. **Node/TypeScript · Vue 3 · Drizzle/SQLite · Ollama**.

Aucune donnée ne quitte la machine, sauf les appels explicites aux outils (recherche web,
Gmail, météo). Les modèles tournent sur ta propre carte graphique.

---

## Personas

Une persona, c'est un modèle Ollama, un prompt système, une température, un nom et une couleur.
Chaque conversation en désigne une. Changer de persona ne change pas que le ton : ça change le
modèle qui répond et ce qu'il se souvient de toi.

Le **salon** met plusieurs personas dans la même conversation. La table `conversations` porte le
mode et la liste des participants, et chaque intervenant reçoit un contexte mémoire qui lui est
propre (voir plus bas).

---

## La mémoire

C'est la partie la plus travaillée du projet, et celle qui change vraiment l'usage au fil des
semaines.

**Extraction.** À la fin d'un échange, un premier appel au modèle lit la conversation et en
extrait des faits sous forme de tableau JSON. Le prompt reçoit **les mémoires déjà stockées**,
avec pour consigne de ne rien retenir qu'elles couvrent déjà : sans ça, la base se remplit de
dix reformulations du même fait. La consigne cadre aussi ce qui mérite d'être retenu, à savoir
préférences techniques, projets en cours, décisions et leur raison, contraintes, et ce qui ne
le mérite pas, à savoir les généralités, l'éphémère, et le contenu des réponses de l'assistant
lui-même.

**Classification.** Chaque fait extrait repart dans un second appel qui tranche une seule
question : ce fait vaut-il dans tous les contextes, ou seulement dans celui-ci ? La réponse
décide s'il est stocké en `global` ou rattaché à la persona. Deux appels au lieu d'un, parce
qu'un modèle local qui doit à la fois extraire et classer fait mal les deux.

**Trois portées de lecture.** Le bloc mémoire injecté dans le prompt n'a pas la même forme
selon le contexte. En tête-à-tête, la persona voit le global plus ses propres souvenirs. En
conseil, tous les participants partagent le même bloc. En salon, chaque intervenant voit le
global, ses souvenirs à lui, et séparément ce que chacun des autres participants sait — ce qui
lui permet de s'adresser aux autres en connaissance de cause sans confondre leurs souvenirs
avec les siens.

---

## Compaction du contexte

Une conversation longue finit par dépasser la fenêtre du modèle. Plutôt que de tronquer,
Asmodeus résume par paliers.

Un checkpoint est stocké par conversation : le résumé, et l'identifiant du dernier message
qu'il couvre. Au-delà de dix messages non couverts, les six plus anciens sont absorbés dans le
résumé, qui est réécrit en fusionnant l'ancien et les nouveaux échanges en un seul bloc. Le
checkpoint avance d'autant.

Deux détails qui comptent : les messages porteurs d'appels d'outils sont exclus du calcul,
parce qu'ils gonflent le compte sans porter de conversation. Et si la génération du résumé
échoue, l'ancien est renvoyé tel quel plutôt que de bloquer le chat.

---

## Agents

Cinq types, chacun avec sa config typée, déclenchables à la demande. Chaque agent peut porter
une persona, qui détermine le modèle utilisé.

| Agent | Ce qu'il fait |
|---|---|
| **Digest email** | Récupère les emails de un ou plusieurs comptes Gmail sur une période, filtre promotions et réseaux sociaux, et en produit une synthèse courte ou détaillée avec les actions à traiter |
| **Briefing matinal** | Météo réelle de ta ville plus une recherche web par sujet suivi, synthétisés en un briefing |
| **Veille** | Recherche par sujet, avec restriction possible à des sites précis, et sortie sourcée |
| **Résumé de réunion** | Transcription en entrée, sections configurables (décisions, actions, participants, points ouverts) ou template libre |
| **Revue hebdo** | Relit tes propres messages sur 7 ou 30 jours et en dégage thèmes, patterns et points récurrents |

**Les prompts sont écrits contre l'hallucination.** Ceux du briefing et de la veille imposent
de ne se servir que des sources fournies, de citer chaque fait avec son URL, et de dire
explicitement quand les sources ne contiennent rien de récent sur un sujet. La température
descend à 0.2 sur la veille. Un modèle local à qui on demande « les actualités du jour » sans
ces garde-fous invente des articles plausibles avec des dates crédibles.

Les runs partent en tâche de fond et écrivent leur statut en base (`running`, `done`, `error`),
donc l'interface n'attend jamais. Seuls les six derniers runs par agent sont conservés.

---

## Intégration Gmail

OAuth2 en lecture seule. Les identifiants client ne vivent ni dans le code ni dans le `.env`
mais en base, saisis depuis l'écran Paramètres. Le refresh de token est branché sur l'événement
`tokens` du client Google et réécrit l'access token en base à chaque renouvellement, donc
l'autorisation ne se redemande pas.

L'extraction du corps parcourt récursivement l'arbre MIME en cherchant d'abord une partie
`text/plain`, avec repli sur n'importe quelle partie décodable. Les URLs sont retirées et les
espaces normalisés avant d'envoyer au modèle : un email HTML brut, c'est des milliers de tokens
de balises pour trois phrases utiles.

---

## Stack

| | |
|---|---|
| Backend | Node · TypeScript · Express |
| Base | SQLite (better-sqlite3) via Drizzle ORM |
| Frontend | Vue 3 · Vite · Pinia |
| Modèles | Ollama en local — n'importe quel modèle installé |
| Outils | Tavily (recherche web) · Open-Meteo (météo) · Gmail API |
| Runtime | PM2 |

Le comptage de tokens de chaque message est stocké depuis les `prompt_eval_count` et
`eval_count` renvoyés par Ollama, ce qui permet de voir ce que coûte réellement une
conversation en contexte.

---

## Installation

Voir **[SETUP.md](SETUP.md)** : prérequis, Ollama, variables d'environnement, et les cas WSL2.

```bash
cp backend/.env.example backend/.env
npm install
npm run dev
```

---

## État

Projet personnel. Fonctionnel de bout en bout : chat, salon, personas, mémoire, compaction,
les cinq agents, Gmail.

Pas de tests automatisés à ce jour. Pas d'ordonnanceur non plus : les agents se déclenchent à
la main, il n'y a pas encore de cron qui pose le briefing du matin dans ta boîte à 7h.
