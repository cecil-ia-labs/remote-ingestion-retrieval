import { startVoiceAgent } from "../voice-agent/server.js";

startVoiceAgent().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Impossibile avviare l'assistente vocale.");
  process.exitCode = 1;
});
