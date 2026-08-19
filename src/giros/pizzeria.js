'use strict';

/**
 * Módulo de giro: Pizzería
 * Fuente de verdad para item types, sabores, productos y NLU de pizzería.
 */

function _buildFallbackCortes(cortes) {
  const map = {};
  for (const c of cortes) {
    map[c.slug] = c.slug;
    for (const parte of c.nombre.toLowerCase().split('/').map(s => s.trim()).filter(Boolean)) map[parte] = c.slug;
    for (const alias of (c.aliases || [])) map[alias.toLowerCase()] = c.slug;
  }
  return map;
}

const _cortes = [
    { slug: 'hawaiana',      nombre: 'Hawaiana',       precio_base: 120,
      aliases: ['hawaii', 'piña y jamon', 'piña jamon', 'tropical', 'piña y jamón', 'con piña'],
      descripcion: 'Piña fresca y jamón sobre salsa de tomate y queso fundido.' },
    { slug: 'pepperoni',     nombre: 'Pepperoni',      precio_base: 130,
      aliases: ['peperoni', 'peperon', 'pepperon'],
      descripcion: 'Rodajas generosas de pepperoni sobre queso mozzarella.' },
    { slug: 'mexicana',      nombre: 'Mexicana',       precio_base: 130,
      aliases: ['con jalapeños', 'picante', 'picosa', 'jalapeños', 'mexicano'],
      descripcion: 'Jalapeños, chorizo y cebolla morada. Para los amantes del picante.' },
    { slug: 'margarita',     nombre: 'Margarita',      precio_base: 110,
      aliases: ['margherita', 'marguerita', 'queso y jitomate', 'jitomate y queso', 'margarita pizza'],
      descripcion: 'La clásica italiana: jitomate fresco, mozzarella y albahaca.' },
    { slug: 'cuatro_quesos', nombre: 'Cuatro Quesos',  precio_base: 140,
      aliases: ['4 quesos', 'quatro quesos', 'de quesos', 'cuatro quesos'],
      descripcion: 'Mezcla de mozzarella, manchego, gouda y parmesano.' },
    { slug: 'carnes',        nombre: 'Especial de Carnes', precio_base: 150,
      aliases: ['de carnes', 'carne mixta', 'mixta de carnes', 'especial carnes'],
      descripcion: 'Pepperoni, chorizo y jamón sobre queso mozzarella.' },
    { slug: 'vegetariana',   nombre: 'Vegetariana',    precio_base: 120,
      aliases: ['veggie', 'sin carne', 'vegetal', 'vegetariana pizza'],
      descripcion: 'Champiñones, pimiento, cebolla, aceituna y elote.' },
];

module.exports = {
  slug:        'pizzeria',
  nombre:      'Pizzería',
  emoji:       '🍕',
  descripcion: 'Pizzas artesanales en tamaño individual y familiar con variedad de sabores',

  configDefaults: {
    tipo_negocio: 'pizzas artesanales',
    precio_taco:  '120',  // pizza individual
    precio_torta: '200',  // pizza familiar
    precio_100g:  '0',
    precio_salsa: '20',
  },

  // Formatos de venta (item_types en BD): tamaños de pizza
  itemTypes: [
    {
      slug: 'pizza_individual', nombre: 'pizza individual', nombre_plural: 'pizzas individuales', emoji: '🍕',
      aliases: ['individual', 'pizza chica', 'chica', 'pequeña', 'chiquita', 'pizza ind'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_taco', precio_base: 120,
    },
    {
      slug: 'pizza_familiar', nombre: 'pizza familiar', nombre_plural: 'pizzas familiares', emoji: '🍕',
      aliases: ['familiar', 'pizza grande', 'grande', 'tamaño grande', 'pizza fam'],
      soporta_gramos: false, soporta_pesos: false, precio_campo: 'precio_torta', precio_base: 200,
    },
  ],

  // Sabores de pizza (equivalen a "cortes" en otros giros)
  cortes: _cortes,

  vocabulario: {
    corte:         'sabor',
    cortes:        'sabores',
    preguntaCorte: '¿Qué sabor de pizza quieres? %desc%',
    preguntaPresentacion: '¿En qué tamaño quieres %cantidad% de %producto%? Opciones: %opciones%',
    surtidoSlug:   null,
  },

  comportamiento: {
    soportaVentaPorPeso:  false,
    soportaMitadMitad:    false,
    soportaTodoMenosX:    false,
    soportaPorcionado:    false,
    tarjetaSoloMostrador: false,
  },

  // Mapa alias→slug generado automáticamente desde _cortes — no editar a mano
  fallbackCortes: _buildFallbackCortes(_cortes),

};
