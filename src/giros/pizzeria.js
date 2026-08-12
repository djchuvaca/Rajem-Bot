'use strict';

/**
 * Módulo de giro: Pizzería
 * Fuente de verdad para item types, sabores, productos y NLU de pizzería.
 */

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
  cortes: [
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
  ],

  // Productos-plantilla para provisioning
  productos: [
    { nombre: 'hawaiana',      categoria: 'corte', precio_taco: 120, precio_torta: 200, precio_100g: 0,
      sinonimos: 'hawaii,piña y jamon,tropical',
      descripcion: 'Piña fresca y jamón sobre salsa de tomate y queso fundido.' },
    { nombre: 'pepperoni',     categoria: 'corte', precio_taco: 130, precio_torta: 220, precio_100g: 0,
      sinonimos: 'peperoni,peperon',
      descripcion: 'Rodajas generosas de pepperoni sobre queso mozzarella.' },
    { nombre: 'mexicana',      categoria: 'corte', precio_taco: 130, precio_torta: 220, precio_100g: 0,
      sinonimos: 'con jalapeños,picante,picosa',
      descripcion: 'Jalapeños, chorizo y cebolla morada.' },
    { nombre: 'margarita',     categoria: 'corte', precio_taco: 110, precio_torta: 190, precio_100g: 0,
      sinonimos: 'margherita,marguerita',
      descripcion: 'La clásica italiana: jitomate, mozzarella y albahaca.' },
    { nombre: 'cuatro quesos', categoria: 'corte', precio_taco: 140, precio_torta: 240, precio_100g: 0,
      sinonimos: '4 quesos,quatro quesos',
      descripcion: 'Mezcla de cuatro quesos selectos.' },
    { nombre: 'carnes',        categoria: 'corte', precio_taco: 150, precio_torta: 260, precio_100g: 0,
      sinonimos: 'de carnes,carne mixta',
      descripcion: 'Pepperoni, chorizo y jamón.' },
    { nombre: 'vegetariana',   categoria: 'corte', precio_taco: 120, precio_torta: 210, precio_100g: 0,
      sinonimos: 'veggie,sin carne,vegetal',
      descripcion: 'Champiñones, pimiento, cebolla, aceituna y elote.' },
  ],

  // Mapa alias→slug de emergencia para NLU sin BD
  fallbackCortes: {
    hawaiana: 'hawaiana', hawaii: 'hawaiana', tropical: 'hawaiana',
    'piña y jamon': 'hawaiana', 'piña y jamón': 'hawaiana', 'con piña': 'hawaiana',
    pepperoni: 'pepperoni', peperoni: 'pepperoni', peperon: 'pepperoni',
    mexicana: 'mexicana', 'con jalapeños': 'mexicana', jalapeños: 'mexicana', picante: 'mexicana',
    margarita: 'margarita', margherita: 'margarita',
    'cuatro quesos': 'cuatro_quesos', '4 quesos': 'cuatro_quesos', 'quatro quesos': 'cuatro_quesos',
    carnes: 'carnes', 'de carnes': 'carnes', 'carne mixta': 'carnes',
    vegetariana: 'vegetariana', veggie: 'vegetariana', 'sin carne': 'vegetariana',
  },

  // Instrucciones específicas de pizzería para el prompt de Groq
  promptOverride: ({ negocio }) =>
    `\nNOMENCLATURA DE PIZZERÍA (${negocio}):` +
    `\n- Los "sabores" son: hawaiana, pepperoni, mexicana, margarita, cuatro quesos, carnes, vegetariana.` +
    `\n- Los "tamaños" son: individual o familiar.` +
    `\n- NUNCA uses "taco" o "torta" — usa "pizza individual" o "pizza familiar".` +
    `\n- Formato de respuesta: "1 pizza hawaiana individual — $120".` +
    `\n- Combinaciones válidas: "mitad pepperoni, mitad mexicana".` +
    `\n- Si el cliente no especifica tamaño, pregunta: "¿la quieres individual o familiar?"`,
};
