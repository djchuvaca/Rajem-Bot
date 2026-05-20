/**
 * handlers/entrega.js
 * Detección de tipo de entrega: mostrador o domicilio.
 * Sin estado, sin BD — función pura + consulta IA como fallback.
 */

// ── PATRONES DE SCORING ───────────────────────────────────────────────────────
const _MOSTRADOR_PATRONES = [
  { re: /\bmostr(ador)?\b/,                          pts: 10 },
  { re: /\brecoger\b/,                                pts: 10 },
  { re: /\brecojo\b/,                                 pts: 10 },
  { re: /\brecogere\b/,                               pts: 10 },
  { re: /\bpaso\s*a\s*recoger\b/,                    pts: 10 },
  { re: /\bvoy\s*a\s*recoger\b/,                     pts: 10 },
  { re: /\bire\s*a\s*recoger\b/,                     pts: 10 },
  { re: /\blo\s*recojo\b/,                            pts: 10 },
  { re: /\bpara\s*recoger\b/,                         pts:  9 },
  { re: /\bpara\s*llevar\b/,                          pts:  9 },
  { re: /\bme\s*lo\s*llevo\b/,                        pts:  9 },
  { re: /\byo\s*(voy|paso|recojo)\b/,                 pts:  9 },
  { re: /\bvoy\s*por\s*(el|ella|los|ellos|tacos)?\b/, pts:  8 },
  { re: /\bpaso\s*(yo|por\s*el|por\s*ella|por\s*los)?\b/, pts: 7 },
  { re: /\bvengo\s*(yo|a\s*recoger|por\s*el)?\b/,    pts:  7 },
  { re: /\bme\s*acerco\b/,                            pts:  7 },
  { re: /\bme\s*presento\b/,                          pts:  7 },
  { re: /\b(en\s*el\s*)?local\b/,                    pts:  6 },
  { re: /\b(en\s*la\s*)?tienda\b/,                   pts:  6 },
  { re: /\ben\s*tu\s*(local|tienda|negocio)\b/,      pts:  8 },
  { re: /\bahi\s*(mismo|los\s*recojo)?\b/,           pts:  6 },
  { re: /\bvoy\s*a\s*(ir|pasar)\b/,                  pts:  6 },
  { re: /\bpaso\s*(mas\s*tarde|luego|ahorita|en\s*un\s*rato|en\s*un\s*momento)\b/, pts: 8 },
  { re: /\bahorita\s*voy\b/,                          pts:  8 },
  { re: /\bya\s*voy\b/,                               pts:  7 },
  { re: /\bvoy\s*para\s*alla\b/,                     pts:  8 },
  { re: /\bvoy\b/,                                    pts:  3 },
  { re: /\bpaso\b/,                                   pts:  3 },
];

const _DOMICILIO_PATRONES = [
  { re: /\bdomicilio\b/,                              pts: 10 },
  { re: /\bdomici\b/,                                 pts: 10 },
  { re: /\benvio\b/,                                  pts: 10 },
  { re: /\benviar\b/,                                 pts: 10 },
  { re: /\bentrega\b/,                                pts: 10 },
  { re: /\bdelivery\b/,                               pts: 10 },
  { re: /\breparto\b/,                                pts: 10 },
  { re: /\btraemelo\b/,                               pts: 10 },
  { re: /\btraemelos\b/,                              pts: 10 },
  { re: /\btraelo\b/,                                 pts: 10 },
  { re: /\bme\s*lo\s*(traes|llevas|mandan|envias|dejas)\b/, pts: 10 },
  { re: /\bme\s*los\s*(traes|llevas|mandan|envias|dejas)\b/, pts: 10 },
  { re: /\blo\s*(traes|mandas|envias)\b/,             pts:  9 },
  { re: /\blos\s*(traes|mandas|envias)\b/,            pts:  9 },
  { re: /\bpueden\s*(traer|llevar|mandar|enviar)\b/,  pts:  9 },
  { re: /\bpuede\s*(traer|llevar|mandar|enviar)\b/,   pts:  9 },
  { re: /\bque\s*(me\s*)?(traigan|lleven|manden|envien)\b/, pts: 9 },
  { re: /\ba\s*(mi\s*)?(casa|domicilio|direccion)\b/, pts: 10 },
  { re: /\ba\s*la\s*(puerta|direccion)\b/,            pts:  9 },
  { re: /\ba\s*donde\s*(estoy|vivo)\b/,               pts:  9 },
  { re: /\ba\s*mi\s*(trabajo|oficina|depa|departamento|cuarto)\b/, pts: 9 },
  { re: /\bhazlo\s*(llegar|venir)\b/,                 pts:  9 },
  { re: /\bmandamelo\b/,                              pts: 10 },
  { re: /\bmandamelos\b/,                             pts: 10 },
  { re: /\bmandalos\b/,                               pts:  9 },
  { re: /\brepartidor\b/,                             pts:  9 },
  { re: /\bcourier\b/,                                pts:  9 },
  { re: /\bmandar\b/,                                 pts:  4 },
  { re: /\bllevar\b/,                                 pts:  4 },
];

const _UMBRAL_IA = 3;

function _calcularScore(t, patrones) {
  return patrones.reduce((total, { re, pts }) => re.test(t) ? total + pts : total, 0);
}

// ── DETECTAR TIPO DE ENTREGA ──────────────────────────────────────────────────
function detectarTipoEntrega(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const scoreMostrador = _calcularScore(t, _MOSTRADOR_PATRONES);
  const scoreDomicilio = _calcularScore(t, _DOMICILIO_PATRONES);
  console.log(`[ENTREGA] score mostrador:${scoreMostrador} domicilio:${scoreDomicilio}`);

  if (scoreMostrador > 0 && scoreDomicilio === 0) return "mostrador";
  if (scoreDomicilio > 0 && scoreMostrador === 0) return "domicilio";
  if (scoreMostrador === 0 && scoreDomicilio === 0) return "ninguno";

  const diff = Math.abs(scoreMostrador - scoreDomicilio);
  if (diff >= _UMBRAL_IA) {
    const ganador = scoreMostrador > scoreDomicilio ? "mostrador" : "domicilio";
    console.log(`[ENTREGA] scoring decide: ${ganador} (diff:${diff})`);
    return ganador;
  }

  console.log(`[ENTREGA] ambiguo (diff:${diff}) — re-preguntando tipo de entrega`);
  return "ninguno";
}

module.exports = { detectarTipoEntrega };
