'use strict';

// Cliente Groq mínimo — solo para NLU de soporte, no genera texto al cliente.

const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '8000', 10);
const GROQ_MODEL = 'openai/gpt-oss-20b';

let _groqClient = null;
let _intentadoInit = false;

function _getApiKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const { getGroqApiKeyGlobal } = require('../db/admin');
    const keyGlobal = getGroqApiKeyGlobal();
    if (keyGlobal) return keyGlobal;
  } catch (_) {}
  return null;
}

function _getGroq() {
  if (_groqClient) return _groqClient;
  if (_intentadoInit) return null;
  _intentadoInit = true;

  const apiKey = _getApiKey();
  if (!apiKey) return null;

  try {
    const Groq = require('groq-sdk');
    _groqClient = new Groq({ apiKey });
    return _groqClient;
  } catch (_) {
    return null;
  }
}

// Extrae el primer objeto JSON del texto, ignorando bloques <think>...</think>
// que producen modelos de razonamiento como Qwen3.
function _extractJson(text) {
  if (!text) return null;
  const sin = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const start = sin.indexOf('{');
  const end   = sin.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  try { return JSON.parse(sin.slice(start, end + 1)); } catch (_) { return null; }
}

/**
 * Llama a Groq con systemPrompt + userMessage.
 * Devuelve el objeto JSON parseado o null ante cualquier error.
 */
async function groqJSON(systemPrompt, userMessage) {
  const groq = _getGroq();
  if (!groq) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0,
      max_tokens: 400,
    }, { signal: controller.signal });

    const raw = completion.choices[0]?.message?.content;
    return _extractJson(raw);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function estaDisponible() { return !!_getGroq(); }

module.exports = { groqJSON, estaDisponible };
