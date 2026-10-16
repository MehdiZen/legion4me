/** Constantes partagées — évite les nombres magiques dispersés dans le code. */

// Upload / extraction de fichiers
export const MAX_FILE_UPLOAD_BYTES = 10 * 1024 * 1024  // limite du base64 entrant
export const MAX_FILE_CHARS        = 200_000           // troncature du texte injecté — voir note ci-dessous
export const MIN_PDF_TEXT_CHARS    = 100               // en dessous = PDF image
export const PDF_DPI               = 150               // rendu pdftoppm
export const PDF_TIMEOUT_MS        = 30_000
export const MAX_PDF_VISION_PAGES  = 8     // pages max converties en image (chaque page ≈ 1-2 Mo)

// MAX_FILE_CHARS n'est PAS dimensionné sur le contexte du modèle — qwen3.5:9b
// tourne avec 262 144 tokens (~1 Mo de texte), largement au-delà. C'est un
// garde-fou contre les documents pathologiques (dump de plusieurs Mo) qui
// dégraderaient la latence du premier token plus qu'ils n'apporteraient de
// contexte utile. 200k chars ≈ 50k tokens : confortable pour un PDF de taille
// normale, encore loin de saturer le contexte. À ajuster par persona si un
// modèle plus petit (contexte réduit) est utilisé pour l'extraction de fichiers.

// Outils web
export const WEB_CONTENT_CHARS  = 12_000  // troncature du contenu récupéré
export const PAGE_TIMEOUT_MS    = 20_000
export const TAVILY_TIMEOUT_MS  = 15_000
export const WIKI_TIMEOUT_MS    = 10_000

// Boucle d'outils
export const TOOL_MAX_ITER = 5

// Contexte de conversation
export const MAX_RECENT_MESSAGES = 8     // tours bruts conservés après le checkpoint
export const COUNCIL_NUM_PREDICT = 2000  // plafond de tokens par prise de parole

// Ollama
export const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000
