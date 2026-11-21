const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";

const GEMINI_RETRY_STATUSES = [404, 429, 500, 503];
const GROQ_RETRY_STATUSES = [404, 413, 429, 500, 503];
const GROQ_RETRY_CODES = [
  "model_decommissioned",
  "model_not_found",
  "model_not_active",
  "json_validate_failed",
];

const MAX_TEXT_LENGTH = 100000;
const GROQ_MAX_TEXT = 20000;
const MAX_SCREENS = 150;
const REQUEST_TIMEOUT_MS = 12000; // أقصى انتظار 12 ثانية لأي موديل قبل التبديل للاحتياطي
const WAIT_AFTER_NEXT_MS = 2500;

const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];
const GROQ_PREFERRED = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

const KEY_IDS = ["geminiKey1", "groqKey2", "groqJudgeKey3"];

const $ = (id) => document.getElementById(id);
const keyInputs = KEY_IDS.map((id) => $(id));
const toggleKeysBtn = $("toggleKeys");
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const statusEl = $("status");
const logEl = $("log");

let running = false;
let abortCtl = null;
const modelCache = new Map();

/* ---------- UI helpers ---------- */

function setStatus(message, type = "info") {
  if (!message) {
    statusEl.className = "";
    statusEl.textContent = "";
    return;
  }
  statusEl.className = type;
  statusEl.textContent = message;
}

function setUiRunning(isRunning) {
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
  keyInputs.forEach((i) => (i.disabled = isRunning));
}

const normText = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

function renderVerdicts(verdicts, screenNo) {
  const title = document.createElement("div");
  title.className = "screen-title";
  title.textContent = `شاشة ${screenNo}`;
  logEl.appendChild(title);

  verdicts.forEach((v, i) => {
    const card = document.createElement("div");
    card.className = "card";

    const q = document.createElement("div");
    q.className = "q";
    q.dir = "auto";
    q.textContent = `${i + 1}. ${v.question}`;

    const agree = normText(v.solver1_gemini) === normText(v.solver2_groq);

    const r1 = document.createElement("div");
    r1.className = "row";
    r1.dir = "auto";
    const l1 = document.createElement("span");
    l1.textContent = "Gemini (Solver 1): ";
    r1.append(l1, document.createTextNode(v.solver1_gemini || "—"));

    const r2 = document.createElement("div");
    r2.className = "row";
    r2.dir = "auto";
    const l2 = document.createElement("span");
    l2.textContent = "Groq #1 (Solver 2): ";
    r2.append(l2, document.createTextNode(v.solver2_groq || "—"));

    const badge = document.createElement("span");
    badge.className = "badge " + (agree ? "agree" : "disagree");
    badge.textContent = agree ? "اتفقوا" : "اختلفوا";
    r2.appendChild(badge);

    const fin = document.createElement("div");
    fin.className = "final";
    fin.dir = "auto";
    fin.textContent = `حكم الـ Judge (Groq #2): ${v.final_correct_option}`;

    const why = document.createElement("div");
    why.className = "reason";
    why.textContent = v.judge_reason;

    card.append(q, r1, r2, fin, why);
    logEl.appendChild(card);
  });

  logEl.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
}

/* ---------- Keys ---------- */

chrome.storage.local.get(KEY_IDS).then((data) => {
  KEY_IDS.forEach((id, i) => {
    if (data[id]) keyInputs[i].value = data[id];
  });
});

keyInputs.forEach((input, i) => {
  input.addEventListener("input", () => {
    chrome.storage.local.set({ [KEY_IDS[i]]: input.value.trim() });
  });
});

toggleKeysBtn.addEventListener("click", () => {
  const show = keyInputs[0].type === "password";
  keyInputs.forEach((i) => (i.type = show ? "text" : "password"));
  toggleKeysBtn.textContent = show ? "إخفاء المفاتيح" : "إظهار المفاتيح";
});

function checkKeys(keys) {
  if (keys.some((k) => !k)) {
    return {
      index: keys.findIndex((k) => !k),
      msg: "من فضلك اكتب الـ 3 API Keys الأول: Gemini للـ Solver 1، وGroq للـ Solver 2 وللـ Judge.",
    };
  }
  if (!keys[0].startsWith("AIza") && !keys[0].startsWith("AQ.")) {
    return { index: 0, msg: "مفتاح Solver 1 لازم يكون Gemini API Key (بيبدأ بـ AIza أو AQ.)." };
  }
  if (!keys[1].startsWith("gsk_")) {
    return { index: 1, msg: "مفتاح Solver 2 لازم يكون Groq API Key (بيبدأ بـ gsk_)." };
  }
  if (!keys[2].startsWith("gsk_")) {
    return { index: 2, msg: "مفتاح الـ Judge لازم يكون Groq API Key (بيبدأ بـ gsk_)." };
  }
  return null;
}

/* ---------- Utils ---------- */

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortError();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const externalSignal = options.signal;
  if (externalSignal?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new ApiError(408, "انتهت مهلة الرد من السيرفر (Timeout)", true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) throw new Error("مش لاقي تاب شغال.");
  return tab;
}

async function extractPageText(tabId) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => (document.body ? document.body.innerText : ""),
    });
  } catch {
    throw new Error(
      "مقدرتش أقرأ الصفحة دي (ممكن تكون صفحة محمية زي chrome:// أو Chrome Web Store، أو التاب اتقفل)."
    );
  }
  const seen = new Set();
  const parts = [];
  for (const r of results || []) {
    const text = (r.result || "").trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  }
  const full = parts.join("\n\n----- FRAME -----\n\n");
  return full.length > MAX_TEXT_LENGTH ? full.slice(0, MAX_TEXT_LENGTH) : full;
}

/* ---------- Shared API helpers ---------- */

class ApiError extends Error {
  constructor(status, message, retryable, code = "") {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

async function readError(res) {
  try {
    const j = await res.json();
    return {
      message: j?.error?.message || `HTTP ${res.status}`,
      code: String(j?.error?.code || ""),
    };
  } catch {
    return { message: `HTTP ${res.status}`, code: "" };
  }
}

function parseJsonText(text) {
  const clean = text.replace(/```json|```/gi, "").trim();
  return JSON.parse(clean);
}

/* ---------- Provider 1: Google Gemini (Flash Priority) ---------- */

function geminiRank(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  const version = m ? parseFloat(m[1]) : 0;
  let tier = 0;
  if (/flash/.test(name) && !/lite/.test(name)) tier = 3; // الأسرع والأدق للكويزات
  else if (/flash-lite/.test(name)) tier = 2;
  else if (/pro/.test(name)) tier = 1; // Pro في الآخر عشان مبياخدش وقت طويل في التفكير
  const stable = /preview|exp/.test(name) ? 0 : 1;
  return { version, tier, stable };
}

async function getGeminiModels(apiKey, signal) {
  const cacheKey = `gemini:${apiKey}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);

  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    { signal },
    8000
  );
  if (!res.ok) {
    const e = await readError(res);
    throw new ApiError(res.status, e.message, false, e.code);
  }

  const data = await res.json();
  const EXCLUDE = /(image|tts|audio|live|embedding|vision|robotics|computer-use|aqa|imagen|veo)/;

  const names = (data.models || [])
    .filter(
      (m) =>
        /gemini/i.test(m.name) &&
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes("generateContent")
    )
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /(pro|flash)/.test(n) && !EXCLUDE.test(n));

  names.sort((a, b) => {
    const ra = geminiRank(a);
    const rb = geminiRank(b);
    return rb.tier - ra.tier || rb.version - ra.version || rb.stable - ra.stable;
  });

  const top = names.slice(0, 5);
  if (top.length) modelCache.set(cacheKey, top);
  return top;
}

async function geminiGenerate(model, apiKey, systemPrompt, userText, validate, signal) {
  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const e = await readError(res);
    throw new ApiError(res.status, e.message, GEMINI_RETRY_STATUSES.includes(res.status), e.code);
  }

  const data = await res.json();
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new ApiError(0, `Gemini blocked the request: ${block}`, false);

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text.trim()) throw new ApiError(0, "Empty response from model", true);

  try {
    return validate(parseJsonText(text));
  } catch {
    throw new ApiError(0, "Model returned invalid JSON", true);
  }
}

async function callGemini(label, apiKey, systemPrompt, userText, validate, signal) {
  try {
    let models;
    try {
      models = await getGeminiModels(apiKey, signal);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      if (err instanceof ApiError && [400, 401, 403].includes(err.status)) throw err;
      models = [];
    }
    if (!models.length) models = GEMINI_FALLBACK_MODELS;

    let last = null;
    for (const model of models) {
      throwIfAborted(signal);
      try {
        return await geminiGenerate(model, apiKey, systemPrompt, userText, validate, signal);
      } catch (err) {
        last = err;
        if (err.name === "AbortError") throw err;
        if (err instanceof ApiError && err.retryable) continue;
        throw err;
      }
    }
    throw last || new Error("كل موديلات Gemini فشلت.");
  } catch (err) {
    if (err && typeof err === "object" && !err.agent) err.agent = label;
    throw err;
  }
}

/* ---------- Provider 2: Groq (OpenAI-compatible) ---------- */

async function getGroqModels(apiKey, signal) {
  const cacheKey = `groq:${apiKey}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);

  const res = await fetchWithTimeout(
    `${GROQ_BASE}/models`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal },
    8000
  );
  if (!res.ok) {
    const e = await readError(res);
    throw new ApiError(res.status, e.message, false, e.code);
  }

  const data = await res.json();
  const available = new Set((data.data || []).map((m) => m.id));
  const list = GROQ_PREFERRED.filter((id) => available.has(id));
  if (list.length) modelCache.set(cacheKey, list);
  return list;
}

async function groqGenerate(model, apiKey, systemPrompt, userText, validate, signal) {
  const res = await fetchWithTimeout(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!res.ok) {
    const e = await readError(res);
    const retryable =
      GROQ_RETRY_STATUSES.includes(res.status) || GROQ_RETRY_CODES.includes(e.code);
    throw new ApiError(res.status, e.message, retryable, e.code);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new ApiError(0, "Empty response from model", true);

  try {
    return validate(parseJsonText(text));
  } catch {
    throw new ApiError(0, "Model returned invalid JSON", true);
  }
}

async function callGroq(label, apiKey, systemPrompt, userText, validate, signal) {
  try {
    let models;
    try {
      models = await getGroqModels(apiKey, signal);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      if (err instanceof ApiError && [400, 401, 403].includes(err.status)) throw err;
      models = [];
    }
    if (!models.length) models = GROQ_PREFERRED;

    let last = null;
    for (const model of models) {
      throwIfAborted(signal);
      try {
        return await groqGenerate(model, apiKey, systemPrompt, userText, validate, signal);
      } catch (err) {
        last = err;
        if (err.name === "AbortError") throw err;
        if (err instanceof ApiError && err.retryable) continue;
        throw err;
      }
    }
    throw last || new Error("كل موديلات Groq فشلت.");
  } catch (err) {
    if (err && typeof err === "object" && !err.agent) err.agent = label;
    throw err;
  }
}

function friendlyError(err) {
  const prefix = err?.agent ? `[${err.agent}] ` : "";
  if (err instanceof ApiError) {
    if (err.status === 400 && /api key/i.test(err.message))
      return `${prefix}الـ API Key غلط. اتأكد منه.`;
    if (err.status === 401 || err.status === 403)
      return `${prefix}الـ API Key مش شغال أو مالوش صلاحية.`;
    if (err.status === 408)
      return `${prefix}السيرفر اتأخر في الرد (Timeout). جرب تاني.`;
    if (err.status === 413)
      return `${prefix}الصفحة كبيرة على حد الـ tokens بتاع Groq.`;
    if (err.status === 429)
      return `${prefix}وصلت للحد الأقصى للطلبات (rate limit). استنى شوية أو استخدم مفاتيح من حسابات مختلفة.`;
    if ([404, 500, 503].includes(err.status))
      return `${prefix}كل الموديلات مشغولة أو مش متاحة دلوقتي. جرب تاني بعد شوية.`;
    return `${prefix}خطأ من الـ API: ${err.message}`;
  }
  if (err instanceof TypeError) return `${prefix}مشكلة في الاتصال بالإنترنت.`;
  return prefix + (err?.message || "حصل خطأ غير متوقع.");
}

/* ---------- The 3 agents ---------- */

const SOLVER_PROMPT = `You are an expert at solving multiple-choice questions.
You receive the raw text of a web page. Find every multiple-choice question visible on it.
Think carefully and step by step about each question before choosing. Solve it independently.
Return ONLY a JSON object in this exact shape:
{"answers":[{"question":"...","reasoning":"...","chosen_option":"..."}]}
Rules:
- "question": the question text as it appears on the page.
- "reasoning": brief technical reasoning (1-2 sentences). Write it BEFORE you choose the option.
- "chosen_option": the text of the chosen option copied EXACTLY, character by character, as it appears on the page. Do not include a leading marker like "A)" or "1.".
- Skip any question whose options you cannot see.
- If there are no multiple-choice questions, return {"answers":[]}.
- No markdown, no text outside the JSON.`;

const JUDGE_PROMPT = `You are the Judge (arbiter) of two solver agents answering multiple-choice questions.
Solver 1 is Gemini. Solver 2 is Groq.
You receive: the raw page text, the answers of Solver 1 (Gemini), and the answers of Solver 2 (Groq).
For EVERY multiple-choice question on the page:
1. Solve it yourself carefully, step by step.
2. Compare with both solvers. If they agree and are correct, confirm. If they disagree or are wrong, decide the correct option.
Return ONLY a JSON object in this exact shape:
{"verdicts":[{"question":"...","solver1_gemini":"...","solver2_groq":"...","final_correct_option":"...","judge_reason":"..."}]}
Rules:
- "solver1_gemini" / "solver2_groq": what each solver chose (empty string if a solver did not answer that question).
- "final_correct_option": the correct option text copied EXACTLY, character by character, as it appears on the page. Do not include a leading marker like "A)" or "1.".
- "judge_reason": 1-2 sentences in Egyptian Arabic explaining the final decision (mention if the solvers disagreed and why you chose this one).
- If there are no multiple-choice questions, return {"verdicts":[]}.
- No markdown, no text outside the JSON.`;

function validateSolver(data) {
  if (!data || !Array.isArray(data.answers)) throw new Error("bad shape");
  return data.answers
    .filter((a) => a && typeof a.chosen_option === "string" && a.chosen_option.trim())
    .map((a) => ({
      question: String(a.question || "").trim(),
      reasoning: String(a.reasoning || "").trim(),
      chosen_option: a.chosen_option.trim(),
    }));
}

function validateJudge(data) {
  if (!data || !Array.isArray(data.verdicts)) throw new Error("bad shape");
  return data.verdicts
    .filter((v) => v && typeof v.final_correct_option === "string" && v.final_correct_option.trim())
    .map((v) => ({
      question: String(v.question || "").trim(),
      solver1_gemini: String(v.solver1_gemini || "").trim(),
      solver2_groq: String(v.solver2_groq || "").trim(),
      final_correct_option: v.final_correct_option.trim(),
      judge_reason: String(v.judge_reason || "").trim(),
    }));
}

async function runJudgePipeline(keys, pageText, signal, screenNo) {
  const geminiText = `PAGE TEXT:\n\n${pageText}`;
  const groqPage = pageText.length > GROQ_MAX_TEXT ? pageText.slice(0, GROQ_MAX_TEXT) : pageText;
  const groqText = `PAGE TEXT:\n\n${groqPage}`;

  setStatus(`شاشة ${screenNo}: Gemini و Groq #1 بيحلوا مع بعض ...`, "info");
  const [s1, s2] = await Promise.all([
    callGemini("Solver 1 (Gemini)", keys[0], SOLVER_PROMPT, geminiText, validateSolver, signal),
    callGroq("Solver 2 (Groq #1)", keys[1], SOLVER_PROMPT, groqText, validateSolver, signal),
  ]);

  if (!s1.length && !s2.length) return [];

  throwIfAborted(signal);
  setStatus(`شاشة ${screenNo}: الـ Judge (Groq #2) بيراجع الإجابتين ...`, "info");
  const judgeText =
    `${groqText}\n\n=== SOLVER 1 (GEMINI) ANSWERS ===\n${JSON.stringify(s1)}` +
    `\n\n=== SOLVER 2 (GROQ) ANSWERS ===\n${JSON.stringify(s2)}`;

  return callGroq("Judge (Groq #2)", keys[2], JUDGE_PROMPT, judgeText, validateJudge, signal);
}

/* ---------- In-page functions (self-contained) ---------- */

function applyAnswersInPage(items) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const SEL =
    'label,[role="radio"],[role="checkbox"],[role="option"],li,button,div,span,p,td,a,h3,h4';
  const BAD = /^(submit|send|finish|next|إرسال|ارسال|تسليم|إنهاء|انهاء|التالي)$/i;
  const INPUTS = "input[type=radio],input[type=checkbox]";
  const used = new Set();

  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };

  const inputFor = (el) => {
    if (el.matches(INPUTS)) return el;
    const inside = el.querySelector(INPUTS);
    if (inside) return inside;
    if (el.tagName === "LABEL" && el.control && el.control.matches(INPUTS)) return el.control;
    const lab = el.closest("label");
    if (lab && lab.control && lab.control.matches(INPUTS)) return lab.control;
    const p = el.parentElement;
    if (p) {
      const ins = p.querySelectorAll(INPUTS);
      if (ins.length === 1) return ins[0];
    }
    return null;
  };

  const score = (el) => {
    if (inputFor(el)) return 0;
    if (/radio|checkbox|option/.test(el.getAttribute("role") || "")) return 1;
    return 2;
  };

  const findIn = (root, target, afterEl) => {
    const found = [];
    for (const el of root.querySelectorAll(SEL)) {
      if (used.has(el) || !visible(el)) continue;
      if (el.matches("button[type=submit],input[type=submit]")) continue;
      if (afterEl && !(afterEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const t = norm(el.innerText || el.textContent);
      if (!t || BAD.test(t)) continue;
      const exact = t === target;
      if (exact || (t.includes(target) && t.length <= target.length + 12)) {
        found.push({ el, t, exact });
      }
    }
    if (!found.length) return null;
    if (afterEl) return found[0].el;
    found.sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        score(a.el) - score(b.el) ||
        a.t.length - b.t.length
    );
    return found[0].el;
  };

  const snippets = items.map((it) => norm(it.question).slice(0, 60));

  const findQuestionEl = (snip) => {
    if (snip.length < 8) return null;
    let best = null;
    let bestLen = Infinity;
    for (const el of document.querySelectorAll(
      "div,p,span,h1,h2,h3,h4,h5,legend,label,li,td,fieldset,section,form"
    )) {
      const t = norm(el.textContent);
      if (t.includes(snip) && t.length < bestLen) {
        best = el;
        bestLen = t.length;
      }
    }
    return best;
  };

  const locate = (idx, target) => {
    const qEl = findQuestionEl(snippets[idx]);
    if (!qEl) return findIn(document.body, target, null);

    let node = qEl;
    while (node && node !== document.documentElement) {
      const text = norm(node.textContent);
      const hasOther = snippets.some((s, j) => j !== idx && s.length >= 8 && text.includes(s));
      if (hasOther) return findIn(node, target, qEl);
      const hit = findIn(node, target, null);
      if (hit) return hit;
      node = node.parentElement;
    }
    return findIn(document.body, target, qEl);
  };

  const clickEl = (el) => {
    const input = inputFor(el);
    if (input) {
      if (!input.checked) input.click();
    } else {
      el.click();
    }
    el.style.outline = "2px solid #22c55e";
    el.style.outlineOffset = "2px";
    used.add(el);
  };

  return items.map((it, idx) => {
    const target = norm(it.correct_option);
    if (!target) return false;
    const el = locate(idx, target);
    if (!el) return false;
    clickEl(el);
    return true;
  });
}

function stepButtonInPage(mode, doClick) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };

  const FINAL_END = /(finish|end (quiz|test|exam)|submit (quiz|test|exam|all)|إنهاء|انهاء|تسليم الاختبار)/i;
  const STEP_SUBMIT = /^(submit|submit answer|check|check answer|تأكيد|تحقق)$/i;
  const NEXTS = ["next", "continue", "التالي", "التالى", "متابعة"];

  let found = null;
  let finalEndSeen = false;

  const els = document.querySelectorAll(
    'button,a,input[type=button],input[type=submit],[role="button"]'
  );

  for (const el of els) {
    if (!visible(el)) continue;
    const t = norm(el.innerText || el.value || el.getAttribute("aria-label") || el.title);
    if (!t || t.length > 30) continue;

    if (FINAL_END.test(t)) {
      finalEndSeen = true;
      continue;
    }

    const disabled =
      el.disabled ||
      el.getAttribute("aria-disabled") === "true" ||
      el.classList.contains("disabled");
    if (disabled) continue;

    if (mode === "submit" && STEP_SUBMIT.test(t)) {
      found = el;
      break;
    }
    if (mode === "next" && NEXTS.some((w) => t.includes(w))) {
      found = el;
      break;
    }
  }

  if (!found) return { found: false, finalEndSeen };
  if (doClick) {
    found.click();
    return { found: true, finalEndSeen, clicked: true };
  }
  return { found: true, finalEndSeen };
}

async function tryClickStepButton(tabId, mode) {
  const probe = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: stepButtonInPage,
    args: [mode, false],
  });
  const hit = (probe || []).find((r) => r.result && r.result.found);
  const finalEndSeen = (probe || []).some((r) => r.result && r.result.finalEndSeen);
  if (!hit) return { clicked: false, finalEndSeen };

  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [hit.frameId] },
      func: stepButtonInPage,
      args: [mode, true],
    });
    return { clicked: !!(res && res[0] && res[0].result && res[0].result.clicked), finalEndSeen };
  } catch {
    return { clicked: true, finalEndSeen };
  }
}

/* ---------- Auto-solve loop ---------- */

async function runLoop() {
  const keys = keyInputs.map((i) => i.value.trim());
  const problem = checkKeys(keys);
  if (problem) {
    setStatus(problem.msg, "error");
    keyInputs[problem.index]?.focus();
    return;
  }

  running = true;
  abortCtl = new AbortController();
  const { signal } = abortCtl;
  setUiRunning(true);
  logEl.textContent = "";

  let endMsg = null;
  let endType = "info";
  let prevText = null;
  let prevQuestions = null;
  let screenNo = 0;

  try {
    const tab = await getActiveTab();
    const tabId = tab.id;

    while (true) {
      throwIfAborted(signal);
      screenNo++;
      if (screenNo > MAX_SCREENS) {
        endMsg = `وصلت للحد الأقصى (${MAX_SCREENS} شاشة). وقفت.`;
        endType = "warn";
        break;
      }

      setStatus(`شاشة ${screenNo}: بقرأ الصفحة ...`, "info");
      const text = await extractPageText(tabId);
      if (text.length < 20) {
        endMsg = "الصفحة فاضية أو مفيهاش نص كفاية. وقفت.";
        endType = "error";
        break;
      }
      if (prevText !== null && normText(text) === normText(prevText)) {
        endMsg = "الصفحة ماتغيرتش بعد Next. وقفت علشان ماكررش نفس السؤال. راجع الصفحة بنفسك.";
        endType = "warn";
        break;
      }
      prevText = text;

      const verdicts = await runJudgePipeline(keys, text, signal, screenNo);
      if (!verdicts.length) {
        endMsg = "مالقيتش أسئلة اختيار من متعدد في الشاشة دي. وقفت.";
        endType = "warn";
        break;
      }

      const sig = verdicts.map((v) => normText(v.question)).join("|");
      if (prevQuestions !== null && sig === prevQuestions) {
        endMsg = "نفس السؤال اتحل قبل كده. وقفت علشان ماكررش. راجع الصفحة بنفسك.";
        endType = "warn";
        break;
      }
      prevQuestions = sig;

      renderVerdicts(verdicts, screenNo);

      // Mark the answers
      throwIfAborted(signal);
      setStatus(`شاشة ${screenNo}: بعلّم على الإجابات ...`, "info");
      const items = verdicts.map((v) => ({
        question: v.question,
        correct_option: v.final_correct_option,
      }));
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: applyAnswersInPage,
        args: [items],
      });
      const matched = items.map((_, i) =>
        (results || []).some((r) => Array.isArray(r.result) && r.result[i] === true)
      );
      const count = matched.filter(Boolean).length;

      if (count < items.length) {
        const missed = matched.map((m, i) => (m ? null : i + 1)).filter(Boolean).join("، ");
        endMsg = `علّمت ${count} من ${items.length} (مش لاقي السؤال رقم: ${missed}). وقفت علشان ماعديش سؤال من غير إجابة. كمّل بإيدك.`;
        endType = "error";
        break;
      }

      // 1. Click per-question Submit/Check if present
      await sleep(1000, signal);
      const stepSub = await tryClickStepButton(tabId, "submit");
      if (stepSub.clicked) {
        setStatus(`شاشة ${screenNo}: دوست Submit لتأكيد السؤال ...`, "info");
        await sleep(1500, signal);
      }

      // 2. Click Next to move to the next question
      const next = await tryClickStepButton(tabId, "next");
      if (!next.clicked) {
        endMsg = next.finalEndSeen
          ? "خلصت الكويز! راجع النتيجة ودوس Finish بإيدك."
          : "خلصت. مفيش زرار Next تاني. راجع الصفحة بنفسك.";
        endType = "success";
        break;
      }

      setStatus(`شاشة ${screenNo}: دوست Next. مستني السؤال الجاي ...`, "info");
      await sleep(WAIT_AFTER_NEXT_MS, signal);
    }
  } catch (err) {
    if (err && err.name === "AbortError") {
      endMsg = "اتوقف بإيدك.";
      endType = "warn";
    } else {
      console.error(err);
      endMsg = friendlyError(err);
      endType = "error";
    }
  } finally {
    running = false;
    abortCtl = null;
    setUiRunning(false);
    if (endMsg) setStatus(endMsg, endType);
  }
}

startBtn.addEventListener("click", () => {
  if (!running) runLoop();
});

stopBtn.addEventListener("click", () => {
  if (running && abortCtl) {
    setStatus("بوقف ...", "warn");
    abortCtl.abort();
  }
});