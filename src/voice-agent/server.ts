import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createVoiceKnowledgeSearch, realtimeSession, voiceAgentConfiguration } from "./knowledge.js";
import { voiceAgentPage } from "./page.js";

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function body(request: IncomingMessage, limit: number): Promise<string> {
  const buffers: Buffer[] = [];
  let length = 0;
  for await (const value of request) {
    const chunk: unknown = value;
    if (!Buffer.isBuffer(chunk)) throw new RequestError(400, "Corpo della richiesta non valido.");
    length += chunk.length;
    if (length > limit) throw new RequestError(413, "La richiesta supera la dimensione consentita.");
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString("utf8");
}

function send(response: ServerResponse, status: number, value: unknown, contentType = "application/json"): void {
  response.writeHead(status, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(contentType === "application/json" ? JSON.stringify(value) : value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Explicit local runner: importing the package never starts this server. */
export async function startVoiceAgent(): Promise<void> {
  const configuration = voiceAgentConfiguration(process.env);
  const search = await createVoiceKnowledgeSearch(configuration, process.env);
  const browserModule = await readFile(new URL("./browser.js", import.meta.url), "utf8");
  const hosts = new Set([`127.0.0.1:${configuration.port}`, `localhost:${configuration.port}`]);
  let activeRequests = 0;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
    const cancellation = new AbortController();
    request.once("aborted", () => cancellation.abort());
    response.once("close", () => { if (!response.writableEnded) cancellation.abort(); });
    const handle = async (): Promise<void> => {
      if (!request.headers.host || !hosts.has(request.headers.host)) throw new RequestError(403, "L'accesso è consentito soltanto tramite l'indirizzo locale dell'assistente.");
      const path = request.url;
      if (request.method === "GET" && path === "/") { send(response, 200, voiceAgentPage, "text/html"); return; }
      if (request.method === "GET" && path === "/client.js") { send(response, 200, browserModule, "text/javascript"); return; }
      if (request.method === "GET" && path === "/api/config") {
        send(response, 200, { maxSessionSeconds: configuration.maxSessionSeconds }); return;
      }
      if (request.method !== "POST" || (path !== "/api/session" && path !== "/api/search")) throw new RequestError(404, "Risorsa non trovata.");
      if (request.headers.origin !== `http://${request.headers.host}`) throw new RequestError(403, "Origine della richiesta non consentita.");
      if (activeRequests >= 4) throw new RequestError(429, "Troppe richieste in corso. Riprova tra poco.");
      activeRequests++;
      try {
        if (path === "/api/search") {
          if (!request.headers["content-type"]?.startsWith("application/json")) throw new RequestError(415, "Invia una ricerca in formato JSON.");
          let data: unknown;
          try { data = JSON.parse(await body(request, 12_000)); }
          catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, "JSON non valido."); }
          if (!record(data) || typeof data.query !== "string" || !data.query.trim() || data.query.length > 2000 || Object.keys(data).some((key) => key !== "query")) {
            throw new RequestError(400, "Invia soltanto query, con una lunghezza da 1 a 2000 caratteri.");
          }
          send(response, 200, await search(data.query.trim(), cancellation.signal)); return;
        }
        if (!request.headers["content-type"]?.startsWith("application/sdp")) throw new RequestError(415, "Invia l'offerta WebRTC come application/sdp.");
        const sdp = await body(request, 65_536);
        if (!sdp.startsWith("v=0") || !sdp.includes("m=audio")) throw new RequestError(400, "Offerta audio WebRTC non valida.");
        const form = new FormData();
        form.set("sdp", sdp);
        form.set("session", JSON.stringify(realtimeSession(configuration)));
        const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST", redirect: "error",
          headers: { Authorization: `Bearer ${configuration.apiKey}` },
          body: form,
          signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(30_000)]),
        });
        if (!upstream.ok) {
          await upstream.body?.cancel();
          throw new RequestError(502, `OpenAI ha rifiutato la sessione (HTTP ${upstream.status}). Verifica l'accesso al modello Realtime, la chiave e il credito disponibile.`);
        }
        send(response, 200, await upstream.text(), "application/sdp");
      } finally { activeRequests--; }
    };
    void handle().catch((error: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      if (error instanceof RequestError) send(response, error.status, { error: error.message });
      else send(response, 502, { error: "Impossibile consultare il servizio. Verifica la connessione e la configurazione di Qdrant/OpenAI." });
    });
  });
  server.requestTimeout = 40_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(configuration.port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  console.log(`Assistente vocale: http://localhost:${configuration.port}`);
  console.log(`KB Qdrant: ${configuration.collection} / ${configuration.namespace}`);
  console.log("Apri il browser e consenti l'accesso al microfono. Premi Ctrl+C per arrestare il server locale.");
  const shutdown = (): void => { server.close(); server.closeAllConnections(); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
