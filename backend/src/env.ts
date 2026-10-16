import dotenv from 'dotenv'
import path from 'path'

// DOIT être importé avant tout autre module applicatif : db/index.ts et
// ollama.ts lisent process.env au chargement. Les imports ES étant hoistés,
// tout dotenv.config() placé après les imports de routes s'exécute trop tard.
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })
