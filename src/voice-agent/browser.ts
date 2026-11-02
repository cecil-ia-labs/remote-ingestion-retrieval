// Browser-only module. It receives SDP and retrieved passages, never provider credentials.
export {};

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Elemento dell'interfaccia mancante: ${id}`);
  return value as T;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const startButton = element<HTMLButtonElement>("start");
const muteButton = element<HTMLButtonElement>("mute");
const stopButton = element<HTMLButtonElement>("stop");
const audio = element<HTMLAudioElement>("remote-audio");
const statusLabel = element("status");
const errorLabel = element("error");
const transcript = element("transcript");
const sources = element("sources");
const searchStatus = element("search-status");
const messages = new Map<string, HTMLDivElement>();

interface VoiceSession {
  readonly peer: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly stream: MediaStream;
  readonly controller: AbortController;
  readonly pendingTools: Map<string, AbortController>;
  readonly seenCalls: Set<string>;
  turn: number;
  toolCount: number;
  speaking: boolean;
  greetingStarted: boolean;
  activeResponseId?: string;
  connectionTimer?: number;
  expiryTimer?: number;
  disconnectTimer?: number;
}

let current: VoiceSession | undefined;
let connecting: AbortController | undefined;

function status(text: string, active = false): void {
  statusLabel.textContent = text;
  document.body.dataset.active = String(active);
}

function stop(message = "Conversazione terminata"): void {
  connecting?.abort();
  connecting = undefined;
  const session = current;
  current = undefined;
  if (session) {
    session.controller.abort();
    for (const pending of session.pendingTools.values()) pending.abort();
    window.clearTimeout(session.expiryTimer);
    window.clearTimeout(session.connectionTimer);
    window.clearTimeout(session.disconnectTimer);
    for (const track of session.stream.getTracks()) track.stop();
    session.channel.close();
    session.peer.close();
  }
  audio.pause();
  audio.srcObject = null;
  audio.controls = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  muteButton.disabled = true;
  muteButton.textContent = "Disattiva microfono";
  status(message);
}

function send(session: VoiceSession, value: unknown): void {
  if (current === session && session.channel.readyState === "open") session.channel.send(JSON.stringify(value));
}

function message(id: string, speaker: string, text: string, append: boolean): void {
  let content = messages.get(id);
  if (!content) {
    transcript.querySelector(".empty")?.remove();
    const turn = document.createElement("div");
    turn.className = "turn";
    const label = document.createElement("small");
    label.textContent = speaker;
    content = document.createElement("div");
    turn.append(label, content);
    transcript.append(turn);
    messages.set(id, content);
  }
  content.textContent = append ? content.textContent + text : text;
  transcript.scrollTop = transcript.scrollHeight;
}

async function responseError(response: Response): Promise<Error> {
  const data: unknown = await response.json().catch(() => undefined);
  return new Error(record(data) && typeof data.error === "string" ? data.error : `Il servizio ha restituito HTTP ${response.status}.`);
}

function renderSources(data: Record<string, unknown>): void {
  sources.replaceChildren();
  const results = Array.isArray(data.results) ? data.results : [];
  searchStatus.textContent = results.length ? `${results.length} passaggi recuperati nell'ultima ricerca.` : "Nessun passaggio trovato per questa domanda.";
  const shown = new Set<string>();
  for (const item of results) {
    if (!record(item) || typeof item.title !== "string" || typeof item.url !== "string") continue;
    const identity = item.url || item.title;
    if (shown.has(identity)) continue;
    shown.add(identity);
    const row = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = item.title;
    try {
      const url = new URL(item.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.title;
        row.append(link);
        const address = document.createElement("small");
        address.textContent = url.hostname + url.pathname;
        row.append(address);
      } else row.append(title);
    } catch { row.append(title); }
    sources.append(row);
  }
}

async function executeTool(session: VoiceSession, call: Record<string, unknown>, turn: number): Promise<void> {
  if (typeof call.call_id !== "string" || session.seenCalls.has(call.call_id)) return;
  session.seenCalls.add(call.call_id);
  const controller = new AbortController();
  session.pendingTools.set(call.call_id, controller);
  let output: unknown;
  try {
    if (call.name !== "search_knowledge_base" || typeof call.arguments !== "string" || call.arguments.length > 4096) throw new Error("Strumento o argomenti non validi.");
    if (++session.toolCount > 2) throw new Error("Limite di ricerche per questa domanda raggiunto. Chiedi un chiarimento all'utente.");
    const args: unknown = JSON.parse(call.arguments);
    if (!record(args) || typeof args.query !== "string" || !args.query.trim() || args.query.length > 2000) throw new Error("Ricerca non valida.");
    status("Consultazione della base di conoscenza…", true);
    searchStatus.textContent = "Ricerca delle informazioni…";
    const response = await fetch("/api/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: args.query }),
      signal: AbortSignal.any([session.controller.signal, controller.signal, AbortSignal.timeout(35_000)]),
    });
    if (!response.ok) throw await responseError(response);
    const data: unknown = await response.json();
    if (!record(data) || !Array.isArray(data.results)) throw new Error("Risposta di ricerca non valida.");
    if (current !== session || turn !== session.turn || controller.signal.aborted) throw new DOMException("Ricerca interrotta", "AbortError");
    output = data;
    renderSources(data);
  } catch (error: unknown) {
    const cancelled = controller.signal.aborted || session.controller.signal.aborted || turn !== session.turn;
    const detail = error instanceof Error ? error.message : "Impossibile consultare la base di conoscenza.";
    output = { status: cancelled ? "cancelled" : "error", results: [], message: cancelled ? "L'utente ha interrotto la domanda precedente." : detail };
    if (!cancelled && current === session) {
      errorLabel.textContent = detail;
      searchStatus.textContent = "La ricerca non è stata completata.";
      sources.replaceChildren();
    }
  } finally { session.pendingTools.delete(call.call_id); }
  send(session, { type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) } });
}

async function handleEvent(session: VoiceSession, event: Record<string, unknown>): Promise<void> {
  if (current !== session) return;
  if (event.type === "input_audio_buffer.speech_started") {
    session.turn++;
    session.toolCount = 0;
    session.speaking = true;
    if (session.pendingTools.size) searchStatus.textContent = "Ricerca precedente interrotta.";
    for (const pending of session.pendingTools.values()) pending.abort();
    errorLabel.textContent = "";
    status("Ti ascolto…", true);
  } else if (event.type === "input_audio_buffer.speech_stopped") {
    session.speaking = false;
    status("Preparazione della risposta…", true);
  } else if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string" && typeof event.item_id === "string") {
    message(event.item_id, "Tu", event.transcript, false);
  } else if ((event.type === "response.output_audio_transcript.delta" || event.type === "response.output_audio_transcript.done") && typeof event.item_id === "string") {
    const text = event.type.endsWith(".delta") ? event.delta : event.transcript;
    if (typeof text === "string") message(event.item_id, "Assistente · IA", text, event.type.endsWith(".delta"));
  } else if (event.type === "response.created" && record(event.response) && typeof event.response.id === "string") {
    session.activeResponseId = event.response.id;
  } else if (event.type === "output_audio_buffer.started") {
    status("L'assistente sta parlando…", true);
  } else if (event.type === "output_audio_buffer.stopped" || event.type === "output_audio_buffer.cleared") {
    if (!session.speaking && session.pendingTools.size === 0) status("Microfono attivo · puoi parlare", true);
  } else if (event.type === "response.done" && record(event.response)) {
    const response = event.response;
    if (response.id === session.activeResponseId) session.activeResponseId = undefined;
    if (response.status === "failed") { errorLabel.textContent = "La risposta non è stata completata. Verifica il credito e l'accesso al modello, poi riprova."; return; }
    if (response.status !== "completed" || !Array.isArray(response.output)) return;
    const calls = response.output.filter((item: unknown): item is Record<string, unknown> => record(item) && item.type === "function_call");
    if (!calls.length) return;
    const turn = session.turn;
    await Promise.all(calls.map((call) => executeTool(session, call, turn)));
    if (current === session && turn === session.turn && !session.speaking && !session.activeResponseId) {
      send(session, { type: "response.create", ...(session.toolCount >= 2 ? { response: { tool_choice: "none" } } : {}) });
    }
  } else if (event.type === "error") {
    errorLabel.textContent = record(event.error) && typeof event.error.message === "string" ? event.error.message.slice(0, 400) : "Errore nella sessione vocale.";
  }
}

async function start(): Promise<void> {
  if (current || connecting) return;
  const controller = new AbortController();
  connecting = controller;
  startButton.disabled = true;
  stopButton.disabled = false;
  errorLabel.textContent = "";
  transcript.replaceChildren();
  sources.replaceChildren();
  messages.clear();
  searchStatus.textContent = "Le fonti appariranno dopo la prima ricerca.";
  status("Connessione in corso…");
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("Usa un browser con supporto WebRTC e apri questo indirizzo su localhost.");
    const response = await fetch("/api/config", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok) throw await responseError(response);
    const config: unknown = await response.json();
    if (!record(config) || typeof config.maxSessionSeconds !== "number" || !Number.isSafeInteger(config.maxSessionSeconds) || config.maxSessionSeconds < 1 || config.maxSessionSeconds > 3600) throw new Error("Configurazione della sessione non valida.");
    const maxSessionSeconds = config.maxSessionSeconds;
    status("In attesa dell'accesso al microfono…");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (controller.signal.aborted) { stream.getTracks().forEach((track) => track.stop()); return; }
    const peer = new RTCPeerConnection();
    const channel = peer.createDataChannel("oai-events");
    const session: VoiceSession = { peer, channel, stream, controller, pendingTools: new Map(), seenCalls: new Set(), turn: 0, toolCount: 0, speaking: false, greetingStarted: false };
    current = session;
    session.connectionTimer = window.setTimeout(() => { if (current === session && channel.readyState !== "open") { stop("Connessione non riuscita"); errorLabel.textContent = "La connessione vocale ha impiegato troppo tempo. Riprova."; } }, 45_000);
    for (const track of stream.getAudioTracks()) {
      peer.addTrack(track, stream);
      track.addEventListener("ended", () => { if (current === session) stop("L'accesso al microfono è stato interrotto"); });
    }
    peer.addEventListener("track", (event) => {
      if (current !== session) return;
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => { if (current === session) { audio.controls = true; errorLabel.textContent = "Premi il pulsante di riproduzione nel lettore audio per ascoltare l'assistente."; } });
    });
    peer.addEventListener("connectionstatechange", () => {
      if (current !== session) return;
      window.clearTimeout(session.disconnectTimer);
      if (peer.connectionState === "failed") stop("Connessione vocale non riuscita. Avvia una nuova conversazione.");
      else if (peer.connectionState === "disconnected") session.disconnectTimer = window.setTimeout(() => { if (current === session) stop("Connessione persa. Avvia una nuova conversazione."); }, 8000);
    });
    channel.addEventListener("open", () => {
      if (current !== session) return;
      window.clearTimeout(session.connectionTimer);
      connecting = undefined;
      muteButton.disabled = false;
      status("Microfono attivo · puoi parlare", true);
      session.expiryTimer = window.setTimeout(() => { if (current === session) stop("Durata massima raggiunta. Avvia una nuova conversazione."); }, maxSessionSeconds * 1000);
      if (!session.greetingStarted) {
        session.greetingStarted = true;
        send(session, {
          type: "response.create",
          response: {
            tool_choice: "none",
            instructions: "Questa è l'unica presentazione della sessione. Con voce femminile madrelingua italiana, accento italiano neutro, ritmo colloquiale e intonazione naturale, pronuncia soltanto: 'Ciao! Sono l'assistente di intelligenza artificiale di Increso. Come posso aiutarti?' Considera questa presentazione già conclusa anche se l'utente la interrompe.",
          },
        });
      }
    });
    channel.addEventListener("close", () => { if (current === session) stop("Sessione terminata. Puoi avviare una nuova conversazione."); });
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      try {
        const parsed: unknown = typeof event.data === "string" ? JSON.parse(event.data) : undefined;
        if (record(parsed)) void handleEvent(session, parsed).catch(() => { if (current === session) errorLabel.textContent = "Impossibile elaborare un evento della conversazione."; });
      } catch { if (current === session) errorLabel.textContent = "Il servizio ha inviato un evento non valido."; }
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await fetch("/api/session", {
      method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
    });
    if (!answer.ok) throw await responseError(answer);
    const sdp = await answer.text();
    if (current !== session || controller.signal.aborted) return;
    await peer.setRemoteDescription({ type: "answer", sdp });
  } catch (error: unknown) {
    if (controller.signal.aborted) return;
    stop("Impossibile avviare la conversazione");
    errorLabel.textContent = error instanceof Error && error.name === "NotAllowedError" ? "Consenti l'accesso al microfono nel browser e riprova." : error instanceof Error ? error.message : "Avvio della conversazione non riuscito.";
  }
}

startButton.addEventListener("click", () => { void start(); });
stopButton.addEventListener("click", () => stop());
muteButton.addEventListener("click", () => {
  if (!current) return;
  const tracks = current.stream.getAudioTracks();
  const enable = !tracks[0]?.enabled;
  for (const track of tracks) track.enabled = enable;
  muteButton.textContent = enable ? "Disattiva microfono" : "Attiva microfono";
  muteButton.setAttribute("aria-pressed", String(!enable));
  status(enable ? "Microfono attivo · puoi parlare" : "Microfono disattivato", enable);
});
window.addEventListener("pagehide", () => stop());
