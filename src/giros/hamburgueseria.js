'use strict';

/**
 * Módulo de giro: Hamburguesería
 * Fuente de verdad para item types, variantes, productos y NLU de hamburguesería.
 */

module.exports = {
  slug:        'hamburgueseria',
  nombre:      'Hamburguesería',
  emoji:       '🍔',
  descripcion: 'Hamburguesas artesanales en tamaño sencillo y doble con variedad de sabores',

  configDefaults: {
    tipo_negocio: 'hamburguesas artesanales',
    precio_taco:  '90',   // hamburguesa sencilla
    precio_torta: '130',  // hamburguesa doble
    precio_100g:  '0',
    precio_salsa: '0',
  },

  // Formatos de venta (item_types en BD): tamaños de hamburguesa
  itemTypes: [
    {
      slug: 'hamburguesa_sencilla', nombre: 'hamburguesa sencilla', nombre_plural: 'hamburguesas sencillas', emoji: '🍔',
      aliases: ['sencilla', 'simple', 'normal', 'sen', 'hamburguesa chica', 'sencillo'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_taco', precio_base: 90,
    },
    {
      slug: 'hamburguesa_doble', nombre: 'hamburguesa doble', nombre_plural: 'hamburguesas dobles', emoji: '🍔',
      aliases: ['doble', 'double', 'extra', 'hamburguesa grande', 'dobles'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_torta', precio_base: 130,
    },
  ],

  // Variantes de hamburguesa (equivalen a "cortes" en taquería)
  cortes: [
    { slug: 'clasica',  nombre: 'Clásica',  precio_base: 90,
      aliases: ['clasica', 'original', 'normal', 'la clasica', 'la clásica', 'hamburguesa normal'],
      descripcion: 'Carne de res, queso americano, lechuga, jitomate y catsup.' },
    { slug: 'bbq',      nombre: 'BBQ',      precio_base: 100,
      aliases: ['barbecue', 'barbeque', 'a la parrilla', 'con bbq', 'salsa bbq'],
      descripcion: 'Carne de res, salsa BBQ casera, cebolla caramelizada y tocino.' },
    { slug: 'chipotle', nombre: 'Chipotle', precio_base: 100,
      aliases: ['chipotl', 'chipot', 'con chipotle', 'de chipotle'],
      descripcion: 'Carne de res, salsa chipotle, jalapeños y queso manchego.' },
    { slug: 'crispy',   nombre: 'Crispy',   precio_base: 95,
      aliases: ['crujiente', 'crunchy', 'pollo crujiente', 'pollo crispy', 'de pollo', 'pollo'],
      descripcion: 'Pechuga de pollo empanizada crujiente con mayonesa de ajo.' },
    { slug: 'especial', nombre: 'Especial', precio_base: 110,
      aliases: ['la especial', 'la de la casa', 'de la casa', 'especial de la casa', 'signature'],
      descripcion: 'Doble carne, tocino, queso derretido y salsa secreta.' },
    { slug: 'hawaiana_burger', nombre: 'Hawaiana', precio_base: 100,
      aliases: ['hawaiana burger', 'con piña', 'piña y jamon burger', 'hawaiana hamburguesa'],
      descripcion: 'Carne de res, piña a la plancha, jamón y queso manchego.' },
  ],

  // Productos-plantilla para provisioning
  productos: [
    { nombre: 'clásica',  categoria: 'corte', precio_taco: 90,  precio_torta: 130, precio_100g: 0,
      sinonimos: 'clasica,original,normal,la clasica',
      descripcion: 'Carne de res, queso americano, lechuga, jitomate y catsup.' },
    { nombre: 'BBQ',      categoria: 'corte', precio_taco: 100, precio_torta: 150, precio_100g: 0,
      sinonimos: 'bbq,barbecue,barbeque,a la parrilla',
      descripcion: 'Carne de res, salsa BBQ casera, cebolla caramelizada y tocino.' },
    { nombre: 'chipotle', categoria: 'corte', precio_taco: 100, precio_torta: 150, precio_100g: 0,
      sinonimos: 'chipotl,chipot',
      descripcion: 'Carne de res, salsa chipotle, jalapeños y queso manchego.' },
    { nombre: 'crispy',   categoria: 'corte', precio_taco: 95,  precio_torta: 140, precio_100g: 0,
      sinonimos: 'crujiente,crunchy,pollo crujiente,pollo crispy',
      descripcion: 'Pechuga de pollo empanizada crujiente con mayonesa de ajo.' },
    { nombre: 'especial', categoria: 'corte', precio_taco: 110, precio_torta: 160, precio_100g: 0,
      sinonimos: 'la especial,la de la casa,de la casa,especial de la casa',
      descripcion: 'Doble carne, tocino, queso derretido y salsa secreta.' },
  ],

  // Mapa alias→slug de emergencia para NLU sin BD
  fallbackCortes: {
    clasica: 'clasica', clásica: 'clasica', original: 'clasica', normal: 'clasica',
    bbq: 'bbq', barbecue: 'bbq', barbeque: 'bbq', 'a la parrilla': 'bbq',
    chipotle: 'chipotle', chipotl: 'chipotle',
    crispy: 'crispy', crujiente: 'crispy', 'pollo crispy': 'crispy', pollo: 'crispy',
    especial: 'especial', 'de la casa': 'especial', 'la especial': 'especial',
    hawaiana: 'hawaiana_burger', 'con piña': 'hawaiana_burger',
  },

  // Instrucciones específicas de hamburguesería para el prompt de Groq
  promptOverride: ({ negocio }) =>
    `\nNOMENCLATURA DE HAMBURGUESERÍA (${negocio}):` +
    `\n- Las "variantes" son: clásica, BBQ, chipotle, crispy, especial, hawaiana.` +
    `\n- Los "tamaños" son: sencilla o doble.` +
    `\n- NUNCA uses "taco" o "torta" — usa "hamburguesa sencilla" o "hamburguesa doble".` +
    `\n- Formato de respuesta: "1 hamburguesa BBQ sencilla — $100".` +
    `\n- Si el cliente no especifica tamaño, pregunta: "¿la quieres sencilla o doble?"`,
};
