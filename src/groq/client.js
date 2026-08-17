'use strict';

// Cliente Groq mínimo — solo para NLU de soporte, no genera texto al cliente.
// Modelo: llama-3.1-8b-instant (10x más barato que 70b, suficiente para parseo estructurado).

const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '8000', 10);
const GROQ_MODEL = 'llama-3.1-8b-instant';

let _groqClient = null;
let _intentadoInit = false;

function _getApiKey() {
  // 1. Variable de entorno del tenant (máxima prioridad)
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  // 2. Config global del superadmin (compartida entre todos los tenants)
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

/**
 * Llama a Groq con systemPrompt + userMessage.
 * Fuerza salida JSON. Devuelve el objeto parseado o null ante cualquier error.
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
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 200,
    }, { signal: controller.signal });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function estaDisponible() { return !!_getGroq(); }

module.exports = { groqJSON, estaDisponible };
