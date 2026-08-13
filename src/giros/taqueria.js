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
    tipo_negocio: '',
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
    {
      slug: 'gramos', nombre: 'grameado', nombre_plural: 'grameados', emoji: '⚖️',
      aliases: ['por gr', 'por gr.', 'por gramo', 'por gramos', 'gramo', 'gramos', 'gr', 'kilo', 'kilos', 'medio kilo', 'cuarto kilo', 'tres cuartos', 'por kilo'],
      soporta_gramos: true, soporta_pesos: false, precio_campo: 'precio_100g', precio_base: 32,
    },
    {
      slug: 'por_pesos', nombre: 'por cantidad', nombre_plural: 'por cantidad en $', emoji: '💵',
      aliases: ['por pesos', 'por cantidad', 'en pesos', 'tengo para', 'con cuanto', 'con cuánto', 'cuanto tengo', 'cuánto tengo', 'dame para', 'ponme para'],
      soporta_gramos: false, soporta_pesos: true, precio_campo: 'precio_100g', precio_base: 0,
    },
  ],

  // Cortes/ingredientes del menú (tabla cortes en BD)
  // seccion: 'asada' | 'carnitas'  — usado por seccion_taqueria para filtrar NLU
  // subclase: categoría interna del corte — permite filtros más finos en el futuro
  //   res | cerdo | cerdo_adobado | viscera | piel | hueso | magra | mixto
  cortes: [
    // ── Tacos de asada ────────────────────────────────────────────────────────
    { slug: 'asada',      nombre: 'Asada',       precio_base: 35, seccion: 'asada',    subclase: 'res',
      aliases: ['carne asada', 'res', 'bistek', 'bistec', 'bistec asado'],
      descripcion: 'Carne de res a las brasas, jugosa y con sabor intenso.' },
    { slug: 'suadero',    nombre: 'Suadero',      precio_base: 35, seccion: 'asada',    subclase: 'res',
      aliases: ['suaderito'],
      descripcion: 'Corte de res entre la piel y la costilla, muy suave y jugoso.' },
    { slug: 'tripa',      nombre: 'Tripa',        precio_base: 32, seccion: 'asada',    subclase: 'res',
      aliases: ['tripas', 'tripita', 'tripitas', 'tripas de res'],
      descripcion: 'Intestino de res frito, crujiente por fuera y tierno por dentro.' },
    { slug: 'pastor',     nombre: 'Al Pastor',    precio_base: 32, seccion: 'asada',    subclase: 'cerdo_adobado',
      aliases: ['al pastor', 'adobada', 'adobado'],
      descripcion: 'Carne de cerdo marinada en achiote y especias, asada en trompo.' },
    { slug: 'longaniza',  nombre: 'Longaniza',    precio_base: 32, seccion: 'asada',    subclase: 'cerdo',
      aliases: ['longanitas', 'longanisa'],
      descripcion: 'Embutido de cerdo especiado, frito a la perfección.' },
    { slug: 'chicharron', nombre: 'Chicharrón',   precio_base: 30, seccion: 'asada',    subclase: 'cerdo',
      aliases: ['chicharrón', 'chicharrones', 'chicharron prensado'],
      descripcion: 'Piel y carne de cerdo frita, crujiente y sabrosa.' },
    { slug: 'chorizo',    nombre: 'Chorizo',      precio_base: 32, seccion: 'asada',    subclase: 'cerdo',
      aliases: ['chorizito', 'chorizo mexicano'],
      descripcion: 'Chorizo mexicano frito, con chile y especias.' },
    { slug: 'campechano', nombre: 'Campechano',   precio_base: 35, seccion: 'asada',    subclase: 'mixto',
      aliases: ['campechana', 'mixto campechano'],
      descripcion: 'Combinación de asada y longaniza, el favorito de los indecisos.' },
    // ── Carnitas ──────────────────────────────────────────────────────────────
    { slug: 'carne',      nombre: 'Carne/Maciza', precio_base: 30, seccion: 'carnitas', subclase: 'magra',
      aliases: ['carnitas', 'carnita', 'carne', 'maciza', 'masiza', 'maciza de puerco'],
      descripcion: 'Espaldilla, pierna y aldilla de cerdo. Fibra pura, bajo porcentaje de grasa.' },
    { slug: 'buche',      nombre: 'Buche',        precio_base: 30, seccion: 'carnitas', subclase: 'viscera',
      aliases: ['buchito', 'buchon', 'buchones'],
      descripcion: 'Estómago del puerco. Textura consistente, sabor profundo.' },
    { slug: 'cuero',      nombre: 'Cuero',        precio_base: 30, seccion: 'carnitas', subclase: 'piel',
      aliases: ['cueros', 'cueritos', 'cuerito'],
      descripcion: 'Piel del puerco, textura muy suave y delicada.' },
    { slug: 'lengua',     nombre: 'Lengua',       precio_base: 30, seccion: 'carnitas', subclase: 'viscera',
      aliases: ['lenguita', 'lenguitas'],
      descripcion: 'Textura cremosa, sabor intenso y limpio.' },
    { slug: 'cabeza',     nombre: 'Cabeza',       precio_base: 30, seccion: 'carnitas', subclase: 'viscera',
      aliases: ['cabezita', 'carnitas de cabeza'],
      descripcion: 'Carne de cabeza de cerdo, muy tierna y jugosa.' },
    { slug: 'costilla',   nombre: 'Costilla',     precio_base: 35, seccion: 'carnitas', subclase: 'hueso',
      aliases: ['costillas', 'costillita', 'costillitas', 'costilla de puerco', 'costillas de puerco', 'costilla de cerdo'],
      descripcion: 'Costilla de cerdo carnosa, dorada y jugosa, con sabor ahumado.' },
    { slug: 'surtido',    nombre: 'Surtido',      precio_base: 30, seccion: 'carnitas', subclase: 'mixto',
      aliases: ['surtida', 'mixto', 'la combinacion', 'de todo', 'todos los cortes'],
      descripcion: 'Combinación de los cortes de carnitas que el local maneja. El chef decide la mezcla.' },
    { slug: 'surtido especial', nombre: 'Surtido Especial', precio_base: 30, seccion: 'carnitas', subclase: 'mixto',
      aliases: ['especial', 'surtido a tu gusto', 'surtido personalizado', 'mi surtido', 'combinacion especial'],
      descripcion: 'Combinación personalizada de cortes a elección del cliente.' },
  ],

  // Productos-plantilla para provisioning (tabla productos). Fuente de verdad para nuevos tenants.
  // Para tenants existentes: INSERT OR IGNORE (los precios customizados del tenant no se sobreescriben).
  productos: [
    // ── Carnitas ─────────────────────────────────────────────────────────────
    { nombre: 'surtido',          categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'surtida,mixto,mixta',
      descripcion: 'El favorito de la casa. Combinación de todos los cortes: carne, buche, cuero y lengua.' },
    { nombre: 'surtido especial', categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'especial,surtido personalizado,mi surtido',
      descripcion: 'Combinación personalizada de cortes a elección del cliente.' },
    { nombre: 'carne',            categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'carnitas,carnita,maciza,masiza',
      descripcion: 'Espaldilla, pierna y aldilla. Fibra pura, bajo porcentaje de grasa.' },
    { nombre: 'buche',            categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'buchito,buchon,buchones',
      descripcion: 'Estómago del puerco. Textura consistente, sabor profundo.' },
    { nombre: 'cuero',            categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'cueros,cueritos,cuerito',
      descripcion: 'Piel del puerco, textura muy suave y delicada.' },
    { nombre: 'lengua',           categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'lenguita,lenguitas',
      descripcion: 'Textura cremosa, sabor intenso y limpio.' },
    { nombre: 'cabeza',           categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 32,
      sinonimos: 'cabezita,carnitas de cabeza',
      descripcion: 'Carne de cabeza de cerdo, muy tierna y jugosa.' },
    { nombre: 'costilla',         categoria: 'corte', precio_taco: 35, precio_torta: 45, precio_100g: 35,
      sinonimos: 'costillas,costillita,costillitas,costilla de puerco,costilla de cerdo',
      descripcion: 'Costilla de cerdo carnosa, dorada y jugosa, con sabor ahumado.' },
    // ── Tacos de asada ────────────────────────────────────────────────────────
    { nombre: 'asada',            categoria: 'corte', precio_taco: 35, precio_torta: 45, precio_100g: 35,
      sinonimos: 'carne asada,res,bistek,bistec',
      descripcion: 'Carne de res a las brasas, jugosa y con sabor intenso.' },
    { nombre: 'suadero',          categoria: 'corte', precio_taco: 35, precio_torta: 45, precio_100g: 35,
      sinonimos: 'suaderito',
      descripcion: 'Corte de res entre la piel y la costilla, muy suave y jugoso.' },
    { nombre: 'tripa',            categoria: 'corte', precio_taco: 32, precio_torta: 40, precio_100g: 32,
      sinonimos: 'tripas,tripita,tripitas,tripas de res',
      descripcion: 'Intestino de res frito, crujiente por fuera y tierno por dentro.' },
    { nombre: 'al pastor',        categoria: 'corte', precio_taco: 32, precio_torta: 40, precio_100g: 32,
      sinonimos: 'pastor,adobada,adobado',
      descripcion: 'Carne de cerdo marinada en achiote y especias, asada en trompo.' },
    { nombre: 'longaniza',        categoria: 'corte', precio_taco: 32, precio_torta: 40, precio_100g: 32,
      sinonimos: 'longanitas,longanisa',
      descripcion: 'Embutido de cerdo especiado, frito a la perfección.' },
    { nombre: 'chicharron',       categoria: 'corte', precio_taco: 30, precio_torta: 40, precio_100g: 30,
      sinonimos: 'chicharrón,chicharrones,chicharron prensado',
      descripcion: 'Piel y carne de cerdo frita, crujiente y sabrosa.' },
    { nombre: 'chorizo',          categoria: 'corte', precio_taco: 32, precio_torta: 40, precio_100g: 32,
      sinonimos: 'chorizito,chorizo mexicano',
      descripcion: 'Chorizo mexicano frito, con chile y especias.' },
    { nombre: 'campechano',       categoria: 'corte', precio_taco: 35, precio_torta: 45, precio_100g: 35,
      sinonimos: 'campechana,mixto campechano',
      descripcion: 'Combinación de asada y longaniza, el favorito de los indecisos.' },
  ],

  // Bebidas-plantilla (nuevos tenants). Cada refresco: { nombre, precio, sinonimos, descripcion }
  refrescos: [
    { nombre: 'coca cola', precio: 20, sinonimos: 'coca,coke,cola,coca-cola',
      descripcion: 'Refresco Coca-Cola bien frío 🥤' },
    { nombre: 'fanta',     precio: 20, sinonimos: 'fanta,naranja',
      descripcion: 'Refresco Fanta bien frío 🥤' },
    { nombre: 'sprite',    precio: 20, sinonimos: 'sprite,limon,limón',
      descripcion: 'Refresco Sprite bien frío 🥤' },
  ],

  // Salsas / acompañamientos-plantilla. { nombre, precio, sinonimos, descripcion }
  salsas: [
    { nombre: 'picada',  precio: 0, sinonimos: 'picante,salsa picada',
      descripcion: 'Salsa picada de la casa 🌶️' },
    { nombre: 'suave',   precio: 0, sinonimos: 'salsa suave,verde',
      descripcion: 'Salsa suave de tomatillo 🌿' },
    { nombre: 'roja',    precio: 0, sinonimos: 'salsa roja',
      descripcion: 'Salsa roja casera 🔴' },
    { nombre: 'cebolla', precio: 0, sinonimos: 'cebollas,cebollita,cebollitas,cebolla rallada',
      descripcion: 'Cebolla fresca 🧅' },
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

  // Vocabulario de dominio — sustituye strings hardcodeados en flujos y prompts
  vocabulario: {
    corte:         'corte',
    cortes:        'cortes',
    preguntaCorte: '¿De qué corte quieres %desc%?',
    surtidoSlug:   'surtido',
  },

  // Mensajes del bot específicos de este giro — fuente de verdad para mensajes_bot
  mensajesDefaults: {
    // Bienvenida y pedido
    saludo:               '¡Bienvenido a *{negocio}*! 🌮🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?',
    confirmacion_pedido:  'Listo! Tu pedido fue recibido y está en espera de confirmación de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._',
    cancelacion_enviada:  'Tu solicitud de cancelación fue enviada a nuestro equipo.\nEn breve se comunicarán contigo para confirmarte. Disculpa los inconvenientes!',
    comprobante_recibido: '¡Gracias! Recibimos tu comprobante 📸\nTu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\nEn breve te avisamos 🙏',
    // Fuera de horario
    fuera_horario_antes:   '⏰ Por el momento nos encontramos fuera de servicio.\nIniciamos atención a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?',
    fuera_horario_despues: '⏰ Por el momento nos encontramos fuera de servicio.\nNuestro horario es de *{hora_inicio} a {hora_fin}* 🌮\n\nMañana iniciamos a las *{hora_inicio}*\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?',
    fuera_horario_lunes:   '⏰ Por el momento nos encontramos fuera de servicio.\nHoy es nuestro día de descanso 😴\n\nRetomamos el servicio mañana a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?',
    // Menú
    menu_taco_nota:        '_(combinaciones al gusto)_',
    menu_gramos_nota:      'Cualquier pieza o combinación\n_Incluye tortillas y salsas_',
    menu_salsas_nota:      '_(Los tacos y tortas ya incluyen salsas gratis)_',
    menu_por_cantidad:     'Tú decides cuánto gastar, nosotros pesamos\n_Incluye tortillas y salsas_',
    menu_pie_salsas:       '🟢 Todos los tacos y tortas incluyen salsas',
    menu_nota_precios:     '_Los precios incluyen tortillas y salsas_ 😊',
    menu_domicilio_nota:   '🛵 Domicilio: _precio según distancia a tu colonia_ 📍',
  },

  // Flags de comportamiento — activan/desactivan lógica en parsers y prompts
  comportamiento: {
    soportaVentaPorPeso:  true,
    soportaMitadMitad:    true,
    soportaTodoMenosX:    true,
    tarjetaSoloMostrador: true,
  },

};
