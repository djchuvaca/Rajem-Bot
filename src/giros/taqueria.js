'use strict';

/**
 * Módulo de giro: Taquería
 * Fuente de verdad para item types, cortes, productos y NLU de taquería.
 * Consumido por seed.js (provisionamiento) y pedidoParser.js (NLU fallback).
 */

module.exports = {
  slug:        'taqueria',
  nombre:      'Taquería',
  emoji:       '🌮',
  descripcion: 'Tacos, tortas, quesadillas, vampiros y venta de cortes en múltiples presentaciones',

  // Config defaults para instalaciones nuevas de este giro
  configDefaults: {
    tipo_negocio: 'carnitas de puerco',
    precio_taco:  '30',
    precio_torta: '40',
    precio_100g:  '32',
    precio_salsa: '15',
  },

  // Formatos de venta (item_types en BD)
  itemTypes: [
    {
      slug: 'taco', nombre: 'taco', nombre_plural: 'tacos', emoji: '🌮',
      aliases: ['taquito', 'taquitos', 'tacito', 'tacitos'],
      soporta_gramos: true, soporta_pesos: true, precio_campo: 'precio_taco', precio_base: 30,
    },
    {
      slug: 'torta', nombre: 'torta', nombre_plural: 'tortas', emoji: '🥖',
      aliases: ['sandwich', 'sándwich', 'sándwiches'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_torta', precio_base: 45,
    },
    {
      slug: 'quesadilla', nombre: 'quesadilla', nombre_plural: 'quesadillas', emoji: '🧀',
      aliases: ['quesa', 'quesas', 'queso'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_taco', precio_base: 50,
    },
    {
      slug: 'vampiro', nombre: 'vampiro', nombre_plural: 'vampiros', emoji: '🧛',
      aliases: ['vampira', 'vampiras'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_taco', precio_base: 35,
    },
    {
      slug: 'burrito', nombre: 'burrito', nombre_plural: 'burritos', emoji: '🌯',
      aliases: ['burrita', 'burritas'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_taco', precio_base: 60,
    },
  ],

  // Cortes/ingredientes del menú (tabla cortes en BD)
  cortes: [
    // ── Tacos de asada (cortes "clásicos") ───────────────────────────────────
    { slug: 'asada',      nombre: 'Asada',       precio_base: 35,
      aliases: ['carne asada', 'res', 'bistek', 'bistec', 'bistec asado'],
      descripcion: 'Carne de res a las brasas, jugosa y con sabor intenso.' },
    { slug: 'suadero',    nombre: 'Suadero',      precio_base: 35,
      aliases: ['suaderito'],
      descripcion: 'Corte de res entre la piel y la costilla, muy suave y jugoso.' },
    { slug: 'tripa',      nombre: 'Tripa',        precio_base: 32,
      aliases: ['tripas', 'tripita', 'tripitas', 'tripas de res'],
      descripcion: 'Intestino de res frito, crujiente por fuera y tierno por dentro.' },
    { slug: 'pastor',     nombre: 'Al Pastor',    precio_base: 32,
      aliases: ['al pastor', 'adobada', 'adobado'],
      descripcion: 'Carne de cerdo marinada en achiote y especias, asada en trompo.' },
    { slug: 'longaniza',  nombre: 'Longaniza',    precio_base: 32,
      aliases: ['longanitas', 'longanisa'],
      descripcion: 'Embutido de cerdo especiado, frito a la perfección.' },
    { slug: 'chicharron', nombre: 'Chicharrón',   precio_base: 30,
      aliases: ['chicharrón', 'chicharrones', 'chicharron prensado'],
      descripcion: 'Piel y carne de cerdo frita, crujiente y sabrosa.' },
    { slug: 'chorizo',    nombre: 'Chorizo',      precio_base: 32,
      aliases: ['chorizito', 'chorizo mexicano'],
      descripcion: 'Chorizo mexicano frito, con chile y especias.' },
    { slug: 'campechano', nombre: 'Campechano',   precio_base: 35,
      aliases: ['campechana', 'mixto campechano'],
      descripcion: 'Combinación de asada y longaniza, el favorito de los indecisos.' },
    // ── Carnitas (cortes "clásicos") ──────────────────────────────────────────
    { slug: 'carne',      nombre: 'Carne/Maciza', precio_base: 30,
      aliases: ['carnitas', 'carnita', 'carne', 'maciza', 'masiza', 'maciza de puerco'],
      descripcion: 'Espaldilla, pierna y aldilla de cerdo. Fibra pura, bajo porcentaje de grasa.' },
    { slug: 'buche',      nombre: 'Buche',        precio_base: 30,
      aliases: ['buchito', 'buchon', 'buchones'],
      descripcion: 'Estómago del puerco. Textura consistente, sabor profundo.' },
    { slug: 'cuero',      nombre: 'Cuero',        precio_base: 30,
      aliases: ['cueros', 'cueritos', 'cuerito'],
      descripcion: 'Piel del puerco, textura muy suave y delicada.' },
    { slug: 'lengua',     nombre: 'Lengua',       precio_base: 30,
      aliases: ['lenguita', 'lenguitas'],
      descripcion: 'Textura cremosa, sabor intenso y limpio.' },
    { slug: 'cabeza',     nombre: 'Cabeza',       precio_base: 30,
      aliases: ['cabezita', 'carnitas de cabeza'],
      descripcion: 'Carne de cabeza de cerdo, muy tierna y jugosa.' },
    { slug: 'costilla',   nombre: 'Costilla',     precio_base: 35,
      aliases: ['costillas', 'costillita', 'costillitas', 'costilla de puerco', 'costillas de puerco', 'costilla de cerdo'],
      descripcion: 'Costilla de cerdo carnosa, dorada y jugosa, con sabor ahumado.' },
    { slug: 'surtido',    nombre: 'Surtido',      precio_base: 30,
      aliases: ['surtida', 'mixto', 'la combinacion', 'de todo', 'todos los cortes'],
      descripcion: 'Combinación de los cortes de carnitas que el local maneja. El chef decide la mezcla.' },
    { slug: 'surtido especial', nombre: 'Surtido Especial', precio_base: 30,
      aliases: ['especial', 'surtido a tu gusto', 'surtido personalizado', 'mi surtido', 'combinacion especial'],
      descripcion: 'Combinación personalizada de cortes a elección del cliente.' },
  ],

  // Productos-plantilla para provisioning (tabla business_type_products → productos)
  productos: [
    { nombre: 'surtido', categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'surtida,mixto,mixta',
      descripcion: 'El favorito de la casa. Combinación de todos los cortes: carne, buche, cuero y lengua.' },
    { nombre: 'carne',   categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'carnitas,carnita,maciza,masiza',
      descripcion: 'Espaldilla, pierna y aldilla. Fibra pura, bajo porcentaje de grasa.' },
    { nombre: 'buche',   categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'buchito,buchon,buchones',
      descripcion: 'Estómago del puerco. Textura consistente, sabor profundo.' },
    { nombre: 'cuero',   categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'cueros,cueritos,cuerito',
      descripcion: 'Piel del puerco, textura muy suave y delicada.' },
    { nombre: 'lengua',   categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'lenguita,lenguitas',
      descripcion: 'Textura cremosa, sabor intenso y limpio.' },
    { nombre: 'costilla', categoria: 'corte', precio_taco: 35, precio_torta: 45, precio_100g: 35,
      sinonimos: 'costillas,costillita,costillitas,costilla de puerco,costilla de cerdo',
      descripcion: 'Costilla de cerdo carnosa, dorada y jugosa, con sabor ahumado.' },
    { nombre: 'surtido especial', categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'especial,surtido personalizado,mi surtido',
      descripcion: 'Combinación personalizada de cortes a elección del cliente.' },
  ],

  // Mapa alias→slug de emergencia para NLU sin BD
  fallbackCortes: {
    // Tacos de asada
    asada: 'asada', 'carne asada': 'asada', res: 'asada', bistek: 'asada', bistec: 'asada',
    tripa: 'tripa', tripas: 'tripa', tripita: 'tripa', tripitas: 'tripa',
    suadero: 'suadero', suaderito: 'suadero',
    pastor: 'pastor', 'al pastor': 'pastor', adobada: 'pastor',
    longaniza: 'longaniza', longanitas: 'longaniza',
    chicharron: 'chicharron', chicharrón: 'chicharron', chicharrones: 'chicharron',
    chorizo: 'chorizo', chorizito: 'chorizo',
    campechano: 'campechano', campechana: 'campechano',
    // Carnitas
    carne: 'carne', carnes: 'carne', carner: 'carne', carnita: 'carne', carnitas: 'carne',
    maciza: 'carne', masiza: 'carne',
    buche: 'buche', buches: 'buche', buchito: 'buche', buchon: 'buche', buchones: 'buche',
    cuero: 'cuero', cueros: 'cuero', cueritos: 'cuero', cuerito: 'cuero',
    lengua: 'lengua', lenguas: 'lengua', lenguita: 'lengua', lenguitas: 'lengua',
    cabeza: 'cabeza', cabezita: 'cabeza',
    costilla: 'costilla', costillas: 'costilla', costillita: 'costilla', costillitas: 'costilla',
    'costilla de puerco': 'costilla', 'costilla de cerdo': 'costilla',
    surtido: 'surtido', surtida: 'surtido', surtidos: 'surtido', mixto: 'surtido', mixta: 'surtido',
    'surtido especial': 'surtido especial', especial: 'surtido especial',
    'surtido personalizado': 'surtido especial', 'mi surtido': 'surtido especial',
  },

  // Sin override — el prompt base genérico es suficiente para taquería
  promptOverride: null,
};
