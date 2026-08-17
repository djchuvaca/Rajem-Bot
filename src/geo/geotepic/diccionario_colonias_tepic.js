/**
 * Diccionario urbano de colonias y asentamientos de Tepic, Nayarit.
 * Generado: 2026-08-12.
 *
 * Fuentes de nombres/tipos/CP: catálogo postal urbano (SEPOMEX, consultado por
 * medio del directorio MiCodigoPostal) y registros aportados/verificados por el usuario.
 * Se priorizan los centroides de la capa DCAH 2025 de INEGI. Los registros sin
 * correspondencia en esa capa usan centros cartográficos aproximados y deben
 * revisarse antes de utilizarlos para geocercas o cobros exactos.
 */

const METADATOS_DICCIONARIO = Object.freeze({
  "nombre": "Colonias urbanas de Tepic",
  "municipio": "Tepic",
  "estado": "Nayarit",
  "pais": "México",
  "cobertura": "zona urbana de la ciudad de Tepic",
  "resumen": {
    "registrosTotales": 300,
    "registrosOriginales": 163,
    "registrosAgregados": 137,
    "registrosLocalesSinCoincidenciaPostal": 2,
    "coordenadasVerificadas": 163,
    "coordenadasAproximadas": 137,
    "coordenadasINEGI": 79,
    "coordenadasDeRespaldo": 58,
    "coordenadasPendientes": 0,
    "gruposAmbiguedad": 14
  },
  "fuentes": {
    "nombresYCodigosPostales": "Catálogo Nacional de Códigos Postales / directorio postal",
    "asentamientos": "INEGI Catálogo Único de Claves Geoestadísticas y DCAH",
    "coordenadasVerificadas": "archivo proporcionado por el usuario",
    "coordenadasNuevas": "INEGI DCAH 2025; directorio postal o búsqueda cartográfica como respaldo"
  }
});

// Registros del catálogo anterior que no se consideran colonias canónicas.
// Se conservan como trazabilidad, pero no se proyectan a tenants ni participan en tarifas.
const REGISTROS_LEGADO_NO_CANONICOS = Object.freeze([
  { nombre: "Privada Cielo 30", motivo: "desarrollo privado sin coincidencia postal canónica" },
  { nombre: "Puente Quebrado", motivo: "referencia local sin coincidencia postal canónica" },
  { nombre: "Residencial Neriqa", motivo: "desarrollo privado sin coincidencia postal canónica" },
  { nombre: "Universidad Autónoma de Nayarit", motivo: "punto de interés, no asentamiento" },
]);

const COLONIAS = Object.freeze({
  "12_de_diciembre": {
    "id": "12_de_diciembre",
    "nombre": "12 de Diciembre",
    "nombreOficial": "12 de Diciembre",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.489774911653697,
      "longitud": -104.87658950490167,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "12 de Diciembre",
      "Colonia 12 de Diciembre",
      "Col 12 de Diciembre",
      "12 de Diciembre 63170",
      "12 de Diciembre CP 63170"
    ],
    "palabrasClave": [
      "diciembre"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "15_de_mayo": {
    "id": "15_de_mayo",
    "nombre": "15 de Mayo",
    "nombreOficial": "15 de Mayo",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47828556679425,
      "longitud": -104.89005078290481,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "15 de Mayo",
      "Colonia 15 de Mayo",
      "Col 15 de Mayo",
      "15 de Mayo 63190",
      "15 de Mayo CP 63190"
    ],
    "palabrasClave": [
      "mayo"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "18_de_agosto": {
    "id": "18_de_agosto",
    "nombre": "18 de Agosto",
    "nombreOficial": "18 de Agosto",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.502739921116525,
      "longitud": -104.87804988964112,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "18 de Agosto",
      "Colonia 18 de Agosto",
      "Col 18 de Agosto",
      "18 de Agosto 63177",
      "18 de Agosto CP 63177"
    ],
    "palabrasClave": [
      "agosto"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "2_de_agosto": {
    "id": "2_de_agosto",
    "nombre": "2 de Agosto",
    "nombreOficial": "2 de Agosto",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48077906026589,
      "longitud": -104.87111848445387,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "2 de Agosto",
      "Colonia 2 de Agosto",
      "Col 2 de Agosto",
      "2 de Agosto 63175",
      "2 de Agosto CP 63175"
    ],
    "palabrasClave": [
      "agosto"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "20_de_noviembre": {
    "id": "20_de_noviembre",
    "nombre": "20 de Noviembre",
    "nombreOficial": "20 de Noviembre",
    "tipo": "colonia",
    "codigoPostal": "63100",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51618455937892,
      "longitud": -104.91094930753725,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "20 de Noviembre",
      "Colonia 20 de Noviembre",
      "Col 20 de Noviembre",
      "20 de Noviembre 63100",
      "20 de Noviembre CP 63100"
    ],
    "palabrasClave": [
      "noviembre"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "26_de_septiembre": {
    "id": "26_de_septiembre",
    "nombre": "26 de Septiembre",
    "nombreOficial": "26 de Septiembre",
    "tipo": "colonia",
    "codigoPostal": "63196",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4720236423838,
      "longitud": -104.88212671858568,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "26 de Septiembre",
      "Colonia 26 de Septiembre",
      "Col 26 de Septiembre",
      "26 de Septiembre 63196",
      "26 de Septiembre CP 63196"
    ],
    "palabrasClave": [
      "septiembre"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "3_de_julio": {
    "id": "3_de_julio",
    "nombre": "3 de Julio",
    "nombreOficial": "3 de Julio",
    "tipo": "fraccionamiento",
    "codigoPostal": "63172",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494760610590323,
      "longitud": -104.79063087682329,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "3 de Julio"
    },
    "alias": [
      "3 de Julio",
      "Fraccionamiento 3 de Julio",
      "Fracc 3 de Julio",
      "3 de Julio 63172",
      "3 de Julio CP 63172"
    ],
    "palabrasClave": [
      "julio"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "4_milpas": {
    "id": "4_milpas",
    "nombre": "4 Milpas",
    "nombreOficial": "Cuatro Milpas",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.491692448537023,
      "longitud": -104.87536510832986,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "4 Milpas",
      "Colonia 4 Milpas",
      "Col 4 Milpas",
      "4 Milpas 63174",
      "4 Milpas CP 63174",
      "Cuatro Milpas",
      "Las 4 Milpas",
      "Las Cuatro Milpas"
    ],
    "palabrasClave": [
      "milpas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "5_de_febrero": {
    "id": "5_de_febrero",
    "nombre": "5 de Febrero",
    "nombreOficial": "5 de Febrero",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.468095194296012,
      "longitud": -104.87073957710953,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "5 de Febrero",
      "Colonia 5 de Febrero",
      "Col 5 de Febrero",
      "5 de Febrero 63197",
      "5 de Febrero CP 63197"
    ],
    "palabrasClave": [
      "febrero"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "acayapan": {
    "id": "acayapan",
    "nombre": "Acayapan",
    "nombreOficial": "Acayapan",
    "tipo": "colonia",
    "codigoPostal": "63081",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.519660215786132,
      "longitud": -104.89514252134343,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Acayapan",
      "Colonia Acayapan",
      "Col Acayapan",
      "Acayapan 63081",
      "Acayapan CP 63081"
    ],
    "palabrasClave": [
      "acayapan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "adolfo_lopez_mateos": {
    "id": "adolfo_lopez_mateos",
    "nombre": "Adolfo López Mateos",
    "nombreOficial": "Adolfo López Mateos",
    "tipo": "colonia",
    "codigoPostal": "63021",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526478841562863,
      "longitud": -104.90680942548025,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Adolfo López Mateos",
      "Colonia Adolfo López Mateos",
      "Col Adolfo López Mateos",
      "Adolfo López Mateos 63021",
      "Adolfo López Mateos CP 63021"
    ],
    "palabrasClave": [
      "adolfo",
      "lopez",
      "mateos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ageuan_los_limones": {
    "id": "ageuan_los_limones",
    "nombre": "AGEUAN Los Limones",
    "nombreOficial": "AGEUAN Los Limones",
    "tipo": "fraccionamiento",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49859234480051,
      "longitud": -104.87597471289902,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Ageuan los Limones"
    },
    "alias": [
      "AGEUAN Los Limones",
      "Fraccionamiento AGEUAN Los Limones",
      "Fracc AGEUAN Los Limones",
      "AGEUAN Los Limones 63177",
      "AGEUAN Los Limones CP 63177",
      "Los Limones",
      "Fraccionamiento Los Limones",
      "AGEUAN Limones",
      "Fracc Los Limones"
    ],
    "palabrasClave": [
      "ageuan",
      "limones"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "alaska": {
    "id": "alaska",
    "nombre": "Alaska",
    "nombreOficial": "Alaska",
    "tipo": "fraccionamiento",
    "codigoPostal": "63062",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52351717743389,
      "longitud": -104.9238464115534,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Alaska",
      "Fraccionamiento Alaska",
      "Fracc Alaska",
      "Alaska 63062",
      "Alaska CP 63062"
    ],
    "palabrasClave": [
      "alaska"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "amado_nervo_colonia_63010": {
    "id": "amado_nervo_colonia_63010",
    "nombre": "Amado Nervo (Colonia)",
    "nombreOficial": "Amado Nervo",
    "tipo": "colonia",
    "codigoPostal": "63010",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51936056311773,
      "longitud": -104.89257898448878,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Amado Nervo",
      "Amado Nervo (Colonia)",
      "Colonia Amado Nervo",
      "Col Amado Nervo",
      "Amado Nervo 63010",
      "Amado Nervo CP 63010"
    ],
    "palabrasClave": [
      "amado",
      "nervo"
    ],
    "grupoAmbiguedad": "amado_nervo",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "amado_nervo_fraccionamiento_63010": {
    "id": "amado_nervo_fraccionamiento_63010",
    "nombre": "Amado Nervo (Fraccionamiento)",
    "nombreOficial": "Amado Nervo",
    "tipo": "fraccionamiento",
    "codigoPostal": "63010",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5225399,
      "longitud": -104.8914369,
      "referencia": "resultado_cartografico_con_tipo_y_cp",
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Amado Nervo",
      "Amado Nervo (Fraccionamiento)",
      "Fraccionamiento Amado Nervo",
      "Fracc Amado Nervo",
      "Amado Nervo 63010",
      "Amado Nervo CP 63010"
    ],
    "palabrasClave": [
      "amado",
      "nervo"
    ],
    "grupoAmbiguedad": "amado_nervo",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "america_manriquez": {
    "id": "america_manriquez",
    "nombre": "América Manríquez",
    "nombreOficial": "América Manríquez",
    "tipo": "colonia",
    "codigoPostal": "63068",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.525020767867538,
      "longitud": -104.91368148534733,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "América Manríquez",
      "Colonia América Manríquez",
      "Col América Manríquez",
      "América Manríquez 63068",
      "América Manríquez CP 63068"
    ],
    "palabrasClave": [
      "america",
      "manriquez"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ampliacion_el_paraiso": {
    "id": "ampliacion_el_paraiso",
    "nombre": "Ampliación El Paraíso",
    "nombreOficial": "Ampliación El Paraíso",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.536738782046857,
      "longitud": -104.86930496486958,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ampliación El Paraíso",
      "Colonia Ampliación El Paraíso",
      "Col Ampliación El Paraíso",
      "Ampliación El Paraíso 63035",
      "Ampliación El Paraíso CP 63035"
    ],
    "palabrasClave": [
      "ampliacion",
      "paraiso"
    ],
    "grupoAmbiguedad": "el_paraiso",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ampliacion_santa_teresita": {
    "id": "ampliacion_santa_teresita",
    "nombre": "Ampliación Santa Teresita",
    "nombreOficial": "Ampliación Santa Teresita",
    "tipo": "colonia",
    "codigoPostal": "63083",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.522678812881992,
      "longitud": -104.8951016835117,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ampliación Santa Teresita",
      "Colonia Ampliación Santa Teresita",
      "Col Ampliación Santa Teresita",
      "Ampliación Santa Teresita 63083",
      "Ampliación Santa Teresita CP 63083"
    ],
    "palabrasClave": [
      "ampliacion",
      "santa",
      "teresita"
    ],
    "grupoAmbiguedad": "santa_teresita",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ampliacion_tierra_y_libertad": {
    "id": "ampliacion_tierra_y_libertad",
    "nombre": "Ampliación Tierra y Libertad",
    "nombreOficial": "Ampliación Tierra y Libertad",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.504496354562985,
      "longitud": -104.87676722921434,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ampliación Tierra y Libertad",
      "Colonia Ampliación Tierra y Libertad",
      "Col Ampliación Tierra y Libertad",
      "Ampliación Tierra y Libertad 63177",
      "Ampliación Tierra y Libertad CP 63177"
    ],
    "palabrasClave": [
      "ampliacion",
      "tierra",
      "libertad"
    ],
    "grupoAmbiguedad": "tierra_y_libertad",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "antonio_echevarria_dominguez": {
    "id": "antonio_echevarria_dominguez",
    "nombre": "Antonio Echevarría Domínguez",
    "nombreOficial": "Antonio Echevarría Domínguez",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.490741607168793,
      "longitud": -104.85032788945848,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Antonio Echevarría Domínguez",
      "Colonia Antonio Echevarría Domínguez",
      "Col Antonio Echevarría Domínguez",
      "Antonio Echevarría Domínguez 63173",
      "Antonio Echevarría Domínguez CP 63173"
    ],
    "palabrasClave": [
      "antonio",
      "echevarria",
      "dominguez"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "antonio_r_laureles": {
    "id": "antonio_r_laureles",
    "nombre": "Antonio R Laureles",
    "nombreOficial": "Antonio R Laureles",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4521624,
      "longitud": -104.89794459999999,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Antonio R Laureles",
      "Colonia Antonio R Laureles",
      "Col Antonio R Laureles",
      "Antonio R Laureles 63197",
      "Antonio R Laureles CP 63197",
      "Antonio R. Laureles",
      "Antonio Laureles",
      "R Laureles"
    ],
    "palabrasClave": [
      "antonio",
      "laureles"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "aramara": {
    "id": "aramara",
    "nombre": "Aramara",
    "nombreOficial": "Aramara",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.496444356137797,
      "longitud": -104.82132676024855,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Aramara",
      "Fraccionamiento Aramara",
      "Fracc Aramara",
      "Aramara 63173",
      "Aramara CP 63173",
      "Villas Aramara",
      "Fraccionamiento Villas Aramara",
      "Villas de Aramara"
    ],
    "palabrasClave": [
      "aramara"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "arboledas": {
    "id": "arboledas",
    "nombre": "Arboledas",
    "nombreOficial": "Arboledas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53389340896135,
      "longitud": -104.8773722339332,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Arboledas",
      "Fraccionamiento Arboledas",
      "Fracc Arboledas",
      "Arboledas 63129",
      "Arboledas CP 63129"
    ],
    "palabrasClave": [
      "arboledas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "aurora": {
    "id": "aurora",
    "nombre": "Aurora",
    "nombreOficial": "Aurora",
    "tipo": "fraccionamiento",
    "codigoPostal": "63172",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49532612585795,
      "longitud": -104.80990898903956,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Aurora",
      "Fraccionamiento Aurora",
      "Fracc Aurora",
      "Aurora 63172",
      "Aurora CP 63172"
    ],
    "palabrasClave": [
      "aurora"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "aves_del_paraiso": {
    "id": "aves_del_paraiso",
    "nombre": "Aves del Paraíso",
    "nombreOficial": "Aves del Paraíso",
    "tipo": "fraccionamiento",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.505807739784622,
      "longitud": -104.91514143963101,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Aves del Paraíso",
      "Fraccionamiento Aves del Paraíso",
      "Fracc Aves del Paraíso",
      "Aves del Paraíso 63129",
      "Aves del Paraíso CP 63129",
      "Aves Paraíso"
    ],
    "palabrasClave": [
      "aves",
      "paraiso"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "aviacion": {
    "id": "aviacion",
    "nombre": "Aviación",
    "nombreOficial": "Aviación",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47413757848202,
      "longitud": -104.88132119320032,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Aviación",
      "Colonia Aviación",
      "Col Aviación",
      "Aviación 63190",
      "Aviación CP 63190"
    ],
    "palabrasClave": [
      "aviacion"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "aztlan_el_verde": {
    "id": "aztlan_el_verde",
    "nombre": "Aztlán El Verde",
    "nombreOficial": "Aztlán El Verde",
    "tipo": "colonia",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.519364244811214,
      "longitud": -104.86798335472783,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Aztlán el Verde"
    },
    "alias": [
      "Aztlán El Verde",
      "Colonia Aztlán El Verde",
      "Col Aztlán El Verde",
      "Aztlán El Verde 63039",
      "Aztlán El Verde CP 63039"
    ],
    "palabrasClave": [
      "aztlan",
      "verde"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "aztlan_solidaridad": {
    "id": "aztlan_solidaridad",
    "nombre": "Aztlán Solidaridad",
    "nombreOficial": "Aztlán Solidaridad",
    "tipo": "fraccionamiento",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52490942794132,
      "longitud": -104.93272647904094,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Aztlán Solidaridad",
      "Fraccionamiento Aztlán Solidaridad",
      "Fracc Aztlán Solidaridad",
      "Aztlán Solidaridad 63114",
      "Aztlán Solidaridad CP 63114"
    ],
    "palabrasClave": [
      "aztlan",
      "solidaridad"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "benito_juarez": {
    "id": "benito_juarez",
    "nombre": "Benito Juárez",
    "nombreOficial": "Benito Juárez",
    "tipo": "colonia",
    "codigoPostal": "63166",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.497670005950738,
      "longitud": -104.90767969479212,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Benito Juárez",
      "Colonia Benito Juárez",
      "Col Benito Juárez",
      "Benito Juárez 63166",
      "Benito Juárez CP 63166"
    ],
    "palabrasClave": [
      "benito",
      "juarez"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "benito_juarez_oriente": {
    "id": "benito_juarez_oriente",
    "nombre": "Benito Juárez Oriente",
    "nombreOficial": "Benito Juárez Oriente",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48848025468946,
      "longitud": -104.8635879523683,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Benito Juárez Oriente"
    },
    "alias": [
      "Benito Juárez Oriente",
      "Colonia Benito Juárez Oriente",
      "Col Benito Juárez Oriente",
      "Benito Juárez Oriente 63175",
      "Benito Juárez Oriente CP 63175"
    ],
    "palabrasClave": [
      "benito",
      "juarez",
      "oriente"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "bethel": {
    "id": "bethel",
    "nombre": "Bethel",
    "nombreOficial": "Bethel",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.479062097156625,
      "longitud": -104.91058346162717,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Bethel",
      "Colonia Bethel",
      "Col Bethel",
      "Bethel 63180",
      "Bethel CP 63180"
    ],
    "palabrasClave": [
      "bethel"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "biosfera_residencial": {
    "id": "biosfera_residencial",
    "nombre": "Biosfera Residencial",
    "nombreOficial": "Biosfera Residencial",
    "tipo": "fraccionamiento",
    "codigoPostal": "63165",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494315921167335,
      "longitud": -104.90685394965114,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Biosfera Residencial",
      "Fraccionamiento Biosfera Residencial",
      "Fracc Biosfera Residencial",
      "Biosfera Residencial 63165",
      "Biosfera Residencial CP 63165"
    ],
    "palabrasClave": [
      "biosfera",
      "residencial"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "bonaterra": {
    "id": "bonaterra",
    "nombre": "Bonaterra",
    "nombreOficial": "Bonaterra",
    "tipo": "fraccionamiento",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.46569420132228,
      "longitud": -104.8432806525549,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Bonaterra",
      "Fraccionamiento Bonaterra",
      "Fracc Bonaterra",
      "Bonaterra 63194",
      "Bonaterra CP 63194"
    ],
    "palabrasClave": [
      "bonaterra"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "brisas_de_san_juan": {
    "id": "brisas_de_san_juan",
    "nombre": "Brisas de San Juan",
    "nombreOficial": "Brisas de San Juan",
    "tipo": "fraccionamiento",
    "codigoPostal": "63117",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51450580432022,
      "longitud": -104.92733851802282,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Brisas de San Juan",
      "Fraccionamiento Brisas de San Juan",
      "Fracc Brisas de San Juan",
      "Brisas de San Juan 63117",
      "Brisas de San Juan CP 63117",
      "Brisas San Juan"
    ],
    "palabrasClave": [
      "brisas",
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "buenos_aires": {
    "id": "buenos_aires",
    "nombre": "Buenos Aires",
    "nombreOficial": "Buenos Aires",
    "tipo": "colonia",
    "codigoPostal": "63023",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.534018176355428,
      "longitud": -104.90519307245624,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Buenos Aires",
      "Colonia Buenos Aires",
      "Col Buenos Aires",
      "Buenos Aires 63023",
      "Buenos Aires CP 63023"
    ],
    "palabrasClave": [
      "buenos",
      "aires"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "bugambilias": {
    "id": "bugambilias",
    "nombre": "Bugambilias",
    "nombreOficial": "Bugambilias",
    "tipo": "fraccionamiento",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.478510784867755,
      "longitud": -104.87853340722658,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Bugambilias",
      "Fraccionamiento Bugambilias",
      "Fracc Bugambilias",
      "Bugambilias 63035",
      "Bugambilias CP 63035"
    ],
    "palabrasClave": [
      "bugambilias"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "burocrata_estatal": {
    "id": "burocrata_estatal",
    "nombre": "Burócrata Estatal",
    "nombreOficial": "Burócrata Estatal",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.484128317138907,
      "longitud": -104.87921544746395,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Burócrata Estatal",
      "Colonia Burócrata Estatal",
      "Col Burócrata Estatal",
      "Burócrata Estatal 63180",
      "Burócrata Estatal CP 63180"
    ],
    "palabrasClave": [
      "burocrata",
      "estatal"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "burocrata_federal": {
    "id": "burocrata_federal",
    "nombre": "Burócrata Federal",
    "nombreOficial": "Burócrata Federal",
    "tipo": "colonia",
    "codigoPostal": "63156",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48404691438413,
      "longitud": -104.87913356495005,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Burócrata Federal"
    },
    "alias": [
      "Burócrata Federal",
      "Colonia Burócrata Federal",
      "Col Burócrata Federal",
      "Burócrata Federal 63156",
      "Burócrata Federal CP 63156"
    ],
    "palabrasClave": [
      "burocrata",
      "federal"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "caja_de_agua": {
    "id": "caja_de_agua",
    "nombre": "Caja de Agua",
    "nombreOficial": "Caja de Agua",
    "tipo": "colonia",
    "codigoPostal": "63158",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.495949200989884,
      "longitud": -104.89585865244058,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Caja de Agua",
      "Colonia Caja de Agua",
      "Col Caja de Agua",
      "Caja de Agua 63158",
      "Caja de Agua CP 63158"
    ],
    "palabrasClave": [
      "caja",
      "agua"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "caminera": {
    "id": "caminera",
    "nombre": "Caminera",
    "nombreOficial": "Caminera",
    "tipo": "colonia",
    "codigoPostal": "63196",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.471971363956047,
      "longitud": -104.8858414209668,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Caminera",
      "Colonia Caminera",
      "Col Caminera",
      "Caminera 63196",
      "Caminera CP 63196"
    ],
    "palabrasClave": [
      "caminera"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "camino_real": {
    "id": "camino_real",
    "nombre": "Camino Real",
    "nombreOficial": "Camino Real",
    "tipo": "fraccionamiento",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.517528054553456,
      "longitud": -104.87192403107173,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Camino Real",
      "Fraccionamiento Camino Real",
      "Fracc Camino Real",
      "Camino Real 63039",
      "Camino Real CP 63039"
    ],
    "palabrasClave": [
      "camino",
      "real"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "cantera_del_nayar": {
    "id": "cantera_del_nayar",
    "nombre": "Cantera del Nayar",
    "nombreOficial": "Cantera del Nayar",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.485374504024985,
      "longitud": -104.8348430869083,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Cantera del Nayar"
    },
    "alias": [
      "Cantera del Nayar",
      "Fraccionamiento Cantera del Nayar",
      "Fracc Cantera del Nayar",
      "Cantera del Nayar 63173",
      "Cantera del Nayar CP 63173"
    ],
    "palabrasClave": [
      "cantera",
      "nayar"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "capitan_orozco": {
    "id": "capitan_orozco",
    "nombre": "Capitán Orozco",
    "nombreOficial": "Cáp. Orozco",
    "tipo": "fraccionamiento",
    "codigoPostal": "63176",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.496638784950854,
      "longitud": -104.88275114679436,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Capitán Orozco Ortega"
    },
    "alias": [
      "Capitán Orozco",
      "Fraccionamiento Capitán Orozco",
      "Fracc Capitán Orozco",
      "Capitán Orozco 63176",
      "Capitán Orozco CP 63176",
      "Cáp. Orozco",
      "Cap Orozco",
      "Cap. Orozco"
    ],
    "palabrasClave": [
      "capitan",
      "orozco"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "castilla": {
    "id": "castilla",
    "nombre": "Castilla",
    "nombreOficial": "Castilla",
    "tipo": "fraccionamiento",
    "codigoPostal": "63196",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.468256961829848,
      "longitud": -104.88202074688095,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Castilla",
      "Fraccionamiento Castilla",
      "Fracc Castilla",
      "Castilla 63196",
      "Castilla CP 63196"
    ],
    "palabrasClave": [
      "castilla"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "chapultepec": {
    "id": "chapultepec",
    "nombre": "Chapultepec",
    "nombreOficial": "Chapultepec",
    "tipo": "colonia",
    "codigoPostal": "63030",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.520190389255607,
      "longitud": -104.8808542119398,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Chapultepec",
      "Colonia Chapultepec",
      "Col Chapultepec",
      "Chapultepec 63030",
      "Chapultepec CP 63030"
    ],
    "palabrasClave": [
      "chapultepec"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ciudad_del_valle": {
    "id": "ciudad_del_valle",
    "nombre": "Ciudad del Valle",
    "nombreOficial": "Ciudad del Valle",
    "tipo": "fraccionamiento",
    "codigoPostal": "63157",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.490458810678255,
      "longitud": -104.885434748645,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ciudad del Valle",
      "Fraccionamiento Ciudad del Valle",
      "Fracc Ciudad del Valle",
      "Ciudad del Valle 63157",
      "Ciudad del Valle CP 63157"
    ],
    "palabrasClave": [
      "ciudad",
      "valle"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ciudad_industrial": {
    "id": "ciudad_industrial",
    "nombre": "Ciudad Industrial",
    "nombreOficial": "Ciudad Industrial",
    "tipo": "zona_industrial",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.478814997339605,
      "longitud": -104.84633817145053,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ciudad Industrial",
      "Zona Industrial Ciudad Industrial",
      "Ciudad Industrial 63173",
      "Ciudad Industrial CP 63173"
    ],
    "palabrasClave": [
      "ciudad",
      "industrial"
    ],
    "grupoAmbiguedad": "ciudad_industrial",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ciudad_industrial_microindustria": {
    "id": "ciudad_industrial_microindustria",
    "nombre": "Ciudad Industrial Microindustria",
    "nombreOficial": "Ciudad Industrial Microindustria",
    "tipo": "zona_industrial",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4735933,
      "longitud": -104.8554505,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ciudad Industrial Microindustria",
      "Zona Industrial Ciudad Industrial Microindustria",
      "Ciudad Industrial Microindustria 63173",
      "Ciudad Industrial Microindustria CP 63173"
    ],
    "palabrasClave": [
      "ciudad",
      "industrial",
      "microindustria"
    ],
    "grupoAmbiguedad": "ciudad_industrial",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "colinas_del_nayar": {
    "id": "colinas_del_nayar",
    "nombre": "Colinas del Nayar",
    "nombreOficial": "Colinas del Nayar",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52278655561747,
      "longitud": -104.93640012167788,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Colinas del Nayar"
    },
    "alias": [
      "Colinas del Nayar",
      "Colonia Colinas del Nayar",
      "Col Colinas del Nayar",
      "Colinas del Nayar 63114",
      "Colinas del Nayar CP 63114"
    ],
    "palabrasClave": [
      "colinas",
      "nayar"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "colinas_del_rey": {
    "id": "colinas_del_rey",
    "nombre": "Colinas del Rey",
    "nombreOficial": "Colinas del Rey",
    "tipo": "fraccionamiento",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.487657925437848,
      "longitud": -104.90781622968203,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Colinas del Rey",
      "Fraccionamiento Colinas del Rey",
      "Fracc Colinas del Rey",
      "Colinas del Rey 63180",
      "Colinas del Rey CP 63180"
    ],
    "palabrasClave": [
      "colinas",
      "rey"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "colinas_del_valle": {
    "id": "colinas_del_valle",
    "nombre": "Colinas del Valle",
    "nombreOficial": "Colinas del Valle",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4900428878948,
      "longitud": -104.84659518390457,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Colinas del Valle"
    },
    "alias": [
      "Colinas del Valle",
      "Fraccionamiento Colinas del Valle",
      "Fracc Colinas del Valle",
      "Colinas del Valle 63173",
      "Colinas del Valle CP 63173"
    ],
    "palabrasClave": [
      "colinas",
      "valle"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "colonial": {
    "id": "colonial",
    "nombre": "Colonial",
    "nombreOficial": "Colonial",
    "tipo": "fraccionamiento",
    "codigoPostal": "63176",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.478069539619206,
      "longitud": -104.87215605967286,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Colonial",
      "Fraccionamiento Colonial",
      "Fracc Colonial",
      "Colonial 63176",
      "Colonial CP 63176"
    ],
    "palabrasClave": [
      "colonial"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "comerciantes": {
    "id": "comerciantes",
    "nombre": "Comerciantes",
    "nombreOficial": "Comerciantes",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.484367394584467,
      "longitud": -104.8672050542759,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Comerciantes"
    },
    "alias": [
      "Comerciantes",
      "Colonia Comerciantes",
      "Col Comerciantes",
      "Comerciantes 63175",
      "Comerciantes CP 63175"
    ],
    "palabrasClave": [
      "comerciantes"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "conasupo": {
    "id": "conasupo",
    "nombre": "Conasupo",
    "nombreOficial": "Conasupo",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4764094,
      "longitud": -104.8710019,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Conasupo",
      "Colonia Conasupo",
      "Col Conasupo",
      "Conasupo 63195",
      "Conasupo CP 63195",
      "CONASUPO"
    ],
    "palabrasClave": [
      "conasupo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "cora": {
    "id": "cora",
    "nombre": "Cora",
    "nombreOficial": "Cora",
    "tipo": "colonia",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.502930926796214,
      "longitud": -104.91816096953514,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Cora",
      "Colonia Cora",
      "Col Cora",
      "Cora 63129",
      "Cora CP 63129"
    ],
    "palabrasClave": [
      "cora"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "corralon": {
    "id": "corralon",
    "nombre": "Corralón",
    "nombreOficial": "Corralón",
    "tipo": "colonia",
    "codigoPostal": "63163",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.462673941766337,
      "longitud": -104.87221596827958,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Corralón",
      "Colonia Corralón",
      "Col Corralón",
      "Corralón 63163",
      "Corralón CP 63163"
    ],
    "palabrasClave": [
      "corralon"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "cuauhtemoc": {
    "id": "cuauhtemoc",
    "nombre": "Cuauhtémoc",
    "nombreOficial": "Cuauhtémoc",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.484881758689603,
      "longitud": -104.90657273246448,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Cuauhtémoc",
      "Colonia Cuauhtémoc",
      "Col Cuauhtémoc",
      "Cuauhtémoc 63180",
      "Cuauhtémoc CP 63180"
    ],
    "palabrasClave": [
      "cuauhtemoc"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "cuba": {
    "id": "cuba",
    "nombre": "Cuba",
    "nombreOficial": "Cuba",
    "tipo": "fraccionamiento",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.518622298689163,
      "longitud": -104.86666063555612,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Social Progresivo Cuba"
    },
    "alias": [
      "Cuba",
      "Fraccionamiento Cuba",
      "Fracc Cuba",
      "Cuba 63039",
      "Cuba CP 63039"
    ],
    "palabrasClave": [
      "cuba"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "cuitlahuac": {
    "id": "cuitlahuac",
    "nombre": "Cuitlahuac",
    "nombreOficial": "Cuitlahuac",
    "tipo": "colonia",
    "codigoPostal": "63030",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51621997966642,
      "longitud": -104.88121004172919,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Cuitlahuac",
      "Colonia Cuitlahuac",
      "Col Cuitlahuac",
      "Cuitlahuac 63030",
      "Cuitlahuac CP 63030"
    ],
    "palabrasClave": [
      "cuitlahuac"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "del_bosque": {
    "id": "del_bosque",
    "nombre": "Del Bosque",
    "nombreOficial": "Del Bosque",
    "tipo": "colonia",
    "codigoPostal": "63166",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49263427787895,
      "longitud": -104.90427121377225,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Del Bosque",
      "Colonia Del Bosque",
      "Col Del Bosque",
      "Del Bosque 63166",
      "Del Bosque CP 63166"
    ],
    "palabrasClave": [
      "bosque"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "del_sol": {
    "id": "del_sol",
    "nombre": "Del Sol",
    "nombreOficial": "Del Sol",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.504652937409507,
      "longitud": -104.8697349314376,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Del Sol",
      "Colonia Del Sol",
      "Col Del Sol",
      "Del Sol 63173",
      "Del Sol CP 63173"
    ],
    "palabrasClave": [
      "sol"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "dieciseis_de_septiembre": {
    "id": "dieciseis_de_septiembre",
    "nombre": "Dieciséis de Septiembre",
    "nombreOficial": "Dieciséis de Septiembre",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5327777,
      "longitud": -104.9324999,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Dieciséis de Septiembre",
      "Colonia Dieciséis de Septiembre",
      "Col Dieciséis de Septiembre",
      "Dieciséis de Septiembre 63114",
      "Dieciséis de Septiembre CP 63114",
      "16 de Septiembre",
      "Colonia 16 de Septiembre"
    ],
    "palabrasClave": [
      "dieciseis",
      "septiembre"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "dr_ignacio_cuesta_barrios": {
    "id": "dr_ignacio_cuesta_barrios",
    "nombre": "Dr. Ignacio Cuesta Barrios",
    "nombreOficial": "Dr. Ignacio Cuesta Barrios",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48994632401204,
      "longitud": -104.8729804158211,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Dr. Ignacio Cuesta Barrios",
      "Colonia Dr. Ignacio Cuesta Barrios",
      "Col Dr. Ignacio Cuesta Barrios",
      "Dr. Ignacio Cuesta Barrios 63175",
      "Dr. Ignacio Cuesta Barrios CP 63175",
      "Ignacio Cuesta Barrios",
      "Doctor Ignacio Cuesta Barrios",
      "Dr Cuesta Barrios"
    ],
    "palabrasClave": [
      "ignacio",
      "cuesta",
      "barrios"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "dr_lucas_vallarta": {
    "id": "dr_lucas_vallarta",
    "nombre": "Dr. Lucas Vallarta",
    "nombreOficial": "Dr. Lucas Vallarta",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4924848,
      "longitud": -104.8761653,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Dr. Lucas Vallarta",
      "Colonia Dr. Lucas Vallarta",
      "Col Dr. Lucas Vallarta",
      "Dr. Lucas Vallarta 63170",
      "Dr. Lucas Vallarta CP 63170",
      "Lucas Vallarta",
      "Doctor Lucas Vallarta",
      "Dr Lucas Vallarta"
    ],
    "palabrasClave": [
      "lucas",
      "vallarta"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ecologistas": {
    "id": "ecologistas",
    "nombre": "Ecologistas",
    "nombreOficial": "Ecologistas",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5208706,
      "longitud": -104.9377902,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ecologistas",
      "Colonia Ecologistas",
      "Col Ecologistas",
      "Ecologistas 63114",
      "Ecologistas CP 63114"
    ],
    "palabrasClave": [
      "ecologistas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ejidal": {
    "id": "ejidal",
    "nombre": "Ejidal",
    "nombreOficial": "Ejidal",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49027232793564,
      "longitud": -104.83062864492258,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ejidal",
      "Colonia Ejidal",
      "Col Ejidal",
      "Ejidal 63173",
      "Ejidal CP 63173"
    ],
    "palabrasClave": [
      "ejidal"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_aguacate": {
    "id": "el_aguacate",
    "nombre": "El Aguacate",
    "nombreOficial": "El Aguacate",
    "tipo": "colonia",
    "codigoPostal": null,
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.506926591948574,
      "longitud": -104.92067132216697,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Aguacate",
      "Colonia El Aguacate",
      "Col El Aguacate",
      "Aguacate"
    ],
    "palabrasClave": [
      "aguacate"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_sin_coincidencia_postal",
    "activa": true
  },
  "el_armadillo": {
    "id": "el_armadillo",
    "nombre": "El Armadillo",
    "nombreOficial": "El Armadillo",
    "tipo": "colonia",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.46139821045422,
      "longitud": -104.84960763857204,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Armadillo",
      "Colonia El Armadillo",
      "Col El Armadillo",
      "Armadillo",
      "El Armadillo 63194",
      "El Armadillo CP 63194"
    ],
    "palabrasClave": [
      "armadillo"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_capomo": {
    "id": "el_capomo",
    "nombre": "El Capomo",
    "nombreOficial": "El Capomo",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4986166,
      "longitud": -104.8806717,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Capomo",
      "Colonia El Capomo",
      "Col El Capomo",
      "Capomo",
      "El Capomo 63177",
      "El Capomo CP 63177"
    ],
    "palabrasClave": [
      "capomo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_faisan": {
    "id": "el_faisan",
    "nombre": "El Faisán",
    "nombreOficial": "El Faisán",
    "tipo": "colonia",
    "codigoPostal": "63082",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.529957827689223,
      "longitud": -104.89109084562004,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Faisán",
      "Colonia El Faisán",
      "Col El Faisán",
      "Faisán",
      "El Faisán 63082",
      "El Faisán CP 63082"
    ],
    "palabrasClave": [
      "faisan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_limon": {
    "id": "el_limon",
    "nombre": "El Limón",
    "nombreOficial": "El Limón",
    "tipo": "colonia",
    "codigoPostal": "63059",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5117028,
      "longitud": -104.8786647,
      "referencia": "resultado_cartografico_por_nombre",
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Limón",
      "Colonia El Limón",
      "Col El Limón",
      "El Limón 63059",
      "El Limón CP 63059"
    ],
    "palabrasClave": [
      "limon"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_mirador_infonavit": {
    "id": "el_mirador_infonavit",
    "nombre": "El Mirador INFONAVIT",
    "nombreOficial": "El Mirador INFONAVIT",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.525959585935215,
      "longitud": -104.88545416071835,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Mirador INFONAVIT",
      "Unidad Habitacional El Mirador INFONAVIT",
      "UH El Mirador INFONAVIT",
      "Mirador INFONAVIT",
      "INFONAVIT El Mirador",
      "Infonavit El Mirador",
      "El Mirador",
      "El Mirador INFONAVIT 63038",
      "El Mirador INFONAVIT CP 63038"
    ],
    "palabrasClave": [
      "mirador",
      "infonavit"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_naranjal": {
    "id": "el_naranjal",
    "nombre": "El Naranjal",
    "nombreOficial": "El Naranjal",
    "tipo": "colonia",
    "codigoPostal": "63082",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.521612884741412,
      "longitud": -104.89853442640404,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "El Naranjal"
    },
    "alias": [
      "El Naranjal",
      "Colonia El Naranjal",
      "Col El Naranjal",
      "Naranjal",
      "El Naranjal 63082",
      "El Naranjal CP 63082"
    ],
    "palabrasClave": [
      "naranjal"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_ocho": {
    "id": "el_ocho",
    "nombre": "El Ocho",
    "nombreOficial": "El Ocho",
    "tipo": "fraccionamiento",
    "codigoPostal": "63185",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4792509,
      "longitud": -104.8998306,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Ocho",
      "Fraccionamiento El Ocho",
      "Fracc El Ocho",
      "El Ocho 63185",
      "El Ocho CP 63185"
    ],
    "palabrasClave": [
      "ocho"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_palomar": {
    "id": "el_palomar",
    "nombre": "El Palomar",
    "nombreOficial": "El Palomar",
    "tipo": "colonia",
    "codigoPostal": "63062",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526500500224056,
      "longitud": -104.92786953597798,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "El Palomar"
    },
    "alias": [
      "El Palomar",
      "Colonia El Palomar",
      "Col El Palomar",
      "Palomar",
      "El Palomar 63062",
      "El Palomar CP 63062"
    ],
    "palabrasClave": [
      "palomar"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_paraiso": {
    "id": "el_paraiso",
    "nombre": "El Paraíso",
    "nombreOficial": "El Paraíso",
    "tipo": "colonia",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.538068726599995,
      "longitud": -104.87261176099412,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Paraíso",
      "Colonia El Paraíso",
      "Col El Paraíso",
      "Paraíso",
      "El Paraíso 63038",
      "El Paraíso CP 63038"
    ],
    "palabrasClave": [
      "paraiso"
    ],
    "grupoAmbiguedad": "el_paraiso",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_parian": {
    "id": "el_parian",
    "nombre": "El Parían",
    "nombreOficial": "El Parían",
    "tipo": "colonia",
    "codigoPostal": "63050",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.514604143148627,
      "longitud": -104.88341771367098,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "El Parían"
    },
    "alias": [
      "El Parían",
      "Colonia El Parían",
      "Col El Parían",
      "Parían",
      "El Parían 63050",
      "El Parían CP 63050"
    ],
    "palabrasClave": [
      "parian"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "el_pedregal": {
    "id": "el_pedregal",
    "nombre": "El Pedregal",
    "nombreOficial": "El Pedregal",
    "tipo": "colonia",
    "codigoPostal": "63164",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.498480285198234,
      "longitud": -104.91785190029789,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Pedregal",
      "Colonia El Pedregal",
      "Col El Pedregal",
      "Pedregal",
      "El Pedregal 63164",
      "El Pedregal CP 63164"
    ],
    "palabrasClave": [
      "pedregal"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_puerto": {
    "id": "el_puerto",
    "nombre": "El Puerto",
    "nombreOficial": "El Puerto",
    "tipo": "colonia",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.471117347830653,
      "longitud": -104.85272875256689,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Puerto",
      "Colonia El Puerto",
      "Col El Puerto",
      "Puerto",
      "El Puerto 63194",
      "El Puerto CP 63194"
    ],
    "palabrasClave": [
      "puerto"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_punto": {
    "id": "el_punto",
    "nombre": "El Punto",
    "nombreOficial": "El Punto",
    "tipo": "colonia",
    "codigoPostal": "63018",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.536483253020485,
      "longitud": -104.89430827951031,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Punto",
      "Colonia El Punto",
      "Col El Punto",
      "El Punto 63018",
      "El Punto CP 63018"
    ],
    "palabrasClave": [
      "punto"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_rodeo": {
    "id": "el_rodeo",
    "nombre": "El Rodeo",
    "nombreOficial": "El Rodeo",
    "tipo": "colonia",
    "codigoPostal": "63060",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.521543057110872,
      "longitud": -104.91816524280651,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Rodeo",
      "Colonia El Rodeo",
      "Col El Rodeo",
      "El Rodeo 63060",
      "El Rodeo CP 63060"
    ],
    "palabrasClave": [
      "rodeo"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_rubi": {
    "id": "el_rubi",
    "nombre": "El Rubí",
    "nombreOficial": "El Rubí",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4866034977113,
      "longitud": -104.84112073143119,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Rubí",
      "Colonia El Rubí",
      "Col El Rubí",
      "El Rubí 63173",
      "El Rubí CP 63173"
    ],
    "palabrasClave": [
      "rubi"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_tecolote": {
    "id": "el_tecolote",
    "nombre": "El Tecolote",
    "nombreOficial": "El Tecolote",
    "tipo": "colonia",
    "codigoPostal": "63135",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.500543186971093,
      "longitud": -104.9086679926038,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Tecolote",
      "Colonia El Tecolote",
      "Col El Tecolote",
      "Tecolote",
      "El Tecolote 63135",
      "El Tecolote CP 63135"
    ],
    "palabrasClave": [
      "tecolote"
    ],
    "grupoAmbiguedad": "el_tecolote",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "el_tecolote_infonavit": {
    "id": "el_tecolote_infonavit",
    "nombre": "El Tecolote INFONAVIT",
    "nombreOficial": "El Tecolote INFONAVIT",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63135",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.500936353125407,
      "longitud": -104.90522416619409,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "El Tecolote INFONAVIT",
      "Unidad Habitacional El Tecolote INFONAVIT",
      "UH El Tecolote INFONAVIT",
      "Tecolote INFONAVIT",
      "INFONAVIT El Tecolote",
      "Infonavit El Tecolote",
      "El Tecolote",
      "El Tecolote INFONAVIT 63135",
      "El Tecolote INFONAVIT CP 63135"
    ],
    "palabrasClave": [
      "tecolote",
      "infonavit"
    ],
    "grupoAmbiguedad": "el_tecolote",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "electricistas": {
    "id": "electricistas",
    "nombre": "Electricistas",
    "nombreOficial": "Electricistas",
    "tipo": "colonia",
    "codigoPostal": "63160",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50011198210533,
      "longitud": -104.90274198607756,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Electricistas",
      "Colonia Electricistas",
      "Col Electricistas",
      "Electricistas 63160",
      "Electricistas CP 63160"
    ],
    "palabrasClave": [
      "electricistas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "emiliano_zapata": {
    "id": "emiliano_zapata",
    "nombre": "Emiliano Zapata",
    "nombreOficial": "Emiliano Zapata",
    "tipo": "colonia",
    "codigoPostal": "63070",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.516935786873848,
      "longitud": -104.90649156973524,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Emiliano Zapata",
      "Colonia Emiliano Zapata",
      "Col Emiliano Zapata",
      "Emiliano Zapata 63070",
      "Emiliano Zapata CP 63070"
    ],
    "palabrasClave": [
      "emiliano",
      "zapata"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "emilio_m_gonzalez": {
    "id": "emilio_m_gonzalez",
    "nombre": "Emilio M. González",
    "nombreOficial": "Emilio M. González",
    "tipo": "colonia",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5368179,
      "longitud": -104.8782998,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Emilio M. González",
      "Colonia Emilio M. González",
      "Col Emilio M. González",
      "Emilio M. González 63038",
      "Emilio M. González CP 63038",
      "Emilio M. Gonzales"
    ],
    "palabrasClave": [
      "emilio",
      "gonzalez"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "estadios": {
    "id": "estadios",
    "nombre": "Estadios",
    "nombreOficial": "Estadios",
    "tipo": "fraccionamiento",
    "codigoPostal": "63109",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.512570414857464,
      "longitud": -104.90456223210765,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Estadios",
      "Fraccionamiento Estadios",
      "Fracc Estadios",
      "Estadios 63109",
      "Estadios CP 63109"
    ],
    "palabrasClave": [
      "estadios"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "esteban_baca_calderon_fraccionamiento_63173": {
    "id": "esteban_baca_calderon_fraccionamiento_63173",
    "nombre": "Esteban Baca Calderón (Fraccionamiento)",
    "nombreOficial": "Esteban Baca Calderón",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494415,
      "longitud": -104.8231603,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Esteban Baca Calderón",
      "Esteban Baca Calderón (Fraccionamiento)",
      "Fraccionamiento Esteban Baca Calderón",
      "Fracc Esteban Baca Calderón",
      "Esteban Baca Calderón 63173",
      "Esteban Baca Calderón CP 63173"
    ],
    "palabrasClave": [
      "esteban",
      "baca",
      "calderon"
    ],
    "grupoAmbiguedad": "esteban_baca_calderon",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "esteban_baca_calderon_unidad_habitacional_63000": {
    "id": "esteban_baca_calderon_unidad_habitacional_63000",
    "nombre": "Esteban Baca Calderón (Unidad Habitacional)",
    "nombreOficial": "Esteban Baca Calderón",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63000",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.502248334736198,
      "longitud": -104.88655489433012,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Esteban Baca Calderón",
      "Esteban Baca Calderón (Unidad Habitacional)",
      "Unidad Habitacional Esteban Baca Calderón",
      "UH Esteban Baca Calderón",
      "Esteban Baca Calderón 63000",
      "Esteban Baca Calderón CP 63000"
    ],
    "palabrasClave": [
      "esteban",
      "baca",
      "calderon"
    ],
    "grupoAmbiguedad": "esteban_baca_calderon",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "extamex": {
    "id": "extamex",
    "nombre": "Extamex",
    "nombreOficial": "Extamex",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4664951,
      "longitud": -104.8680829,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Extamex",
      "Colonia Extamex",
      "Col Extamex",
      "Extamex 63195",
      "Extamex CP 63195",
      "EXTAMEX"
    ],
    "palabrasClave": [
      "extamex"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "felix_pena": {
    "id": "felix_pena",
    "nombre": "Félix Peña",
    "nombreOficial": "Félix Peña",
    "tipo": "colonia",
    "codigoPostal": "63185",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.478903743713452,
      "longitud": -104.89789289429088,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Félix Peña",
      "Colonia Félix Peña",
      "Col Félix Peña",
      "Félix Peña 63185",
      "Félix Peña CP 63185"
    ],
    "palabrasClave": [
      "felix",
      "pena"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ferrocarrilero_1a_seccion": {
    "id": "ferrocarrilero_1a_seccion",
    "nombre": "Ferrocarrilero 1a Sección",
    "nombreOficial": "Ferrocarrilero 1a Secc.",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49916820631686,
      "longitud": -104.8888349533081,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ferrocarrilero 1a Sección",
      "Colonia Ferrocarrilero 1a Sección",
      "Col Ferrocarrilero 1a Sección",
      "Ferrocarrilero 1a Sección 63177",
      "Ferrocarrilero 1a Sección CP 63177",
      "Ferrocarrilero 1a Secc.",
      "Ferrocarrilero Primera Sección",
      "Ferrocarrilero 1",
      "Ferrocarrilero Primera"
    ],
    "palabrasClave": [
      "ferrocarrilero",
      "seccion"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ferrocarrilero_2a_seccion": {
    "id": "ferrocarrilero_2a_seccion",
    "nombre": "Ferrocarrilero 2a Sección",
    "nombreOficial": "Ferrocarrilero 2a Secc.",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.501265733461356,
      "longitud": -104.87582087516783,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ferrocarrilero 2a Sección",
      "Colonia Ferrocarrilero 2a Sección",
      "Col Ferrocarrilero 2a Sección",
      "Ferrocarrilero 2a Sección 63170",
      "Ferrocarrilero 2a Sección CP 63170",
      "Ferrocarrilero 2a Secc.",
      "Ferrocarrilero Segunda Sección",
      "Ferrocarrilero 2",
      "Ferrocarrilero Segunda"
    ],
    "palabrasClave": [
      "ferrocarrilero",
      "seccion"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "flamingos": {
    "id": "flamingos",
    "nombre": "Flamingos",
    "nombreOficial": "Flamingos",
    "tipo": "fraccionamiento",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49527270266536,
      "longitud": -104.87381542160864,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Flamingos",
      "Fraccionamiento Flamingos",
      "Fracc Flamingos",
      "Flamingos 63170",
      "Flamingos CP 63170"
    ],
    "palabrasClave": [
      "flamingos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "florencia": {
    "id": "florencia",
    "nombre": "Florencia",
    "nombreOficial": "Florencia",
    "tipo": "fraccionamiento",
    "codigoPostal": "63066",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52678301555258,
      "longitud": -104.92238938808443,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Florencia",
      "Fraccionamiento Florencia",
      "Fracc Florencia",
      "Florencia 63066",
      "Florencia CP 63066"
    ],
    "palabrasClave": [
      "florencia"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "flores_magon": {
    "id": "flores_magon",
    "nombre": "Flores Magón",
    "nombreOficial": "Flores Magón",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.501473551762814,
      "longitud": -104.87225358484572,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Flores Magón",
      "Colonia Flores Magón",
      "Col Flores Magón",
      "Flores Magón 63174",
      "Flores Magón CP 63174"
    ],
    "palabrasClave": [
      "flores",
      "magon"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "fovissste_1a_etapa": {
    "id": "fovissste_1a_etapa",
    "nombre": "FOVISSSTE 1a Etapa",
    "nombreOficial": "FOVISSSTE 1a Etapa",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63119",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.515917846191225,
      "longitud": -104.91723960791154,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "FOVISSSTE 1a Etapa",
      "Unidad Habitacional FOVISSSTE 1a Etapa",
      "UH FOVISSSTE 1a Etapa",
      "FOVISSSTE 1a Etapa 63119",
      "FOVISSSTE 1a Etapa CP 63119",
      "FOVISSSTE Primera Etapa",
      "FOVISSSTE 1",
      "FOVISSTE 1a Etapa",
      "FOVISTE Primera Etapa"
    ],
    "palabrasClave": [
      "fovissste",
      "etapa"
    ],
    "grupoAmbiguedad": "fovissste",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "fovissste_2a_etapa": {
    "id": "fovissste_2a_etapa",
    "nombre": "FOVISSSTE 2a Etapa",
    "nombreOficial": "FOVISSSTE 2a Etapa",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63116",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51742995799435,
      "longitud": -104.92700214472366,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "FOVISSSTE 2a Etapa",
      "Unidad Habitacional FOVISSSTE 2a Etapa",
      "UH FOVISSSTE 2a Etapa",
      "FOVISSSTE 2a Etapa 63116",
      "FOVISSSTE 2a Etapa CP 63116",
      "FOVISSSTE Segunda Etapa",
      "FOVISSSTE 2",
      "FOVISSTE 2a Etapa",
      "FOVISTE Segunda Etapa"
    ],
    "palabrasClave": [
      "fovissste",
      "etapa"
    ],
    "grupoAmbiguedad": "fovissste",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "francisco_villa": {
    "id": "francisco_villa",
    "nombre": "Francisco Villa",
    "nombreOficial": "Francisco Villa",
    "tipo": "colonia",
    "codigoPostal": "63019",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52864454531759,
      "longitud": -104.88729985591642,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Francisco Villa",
      "Colonia Francisco Villa",
      "Col Francisco Villa",
      "Francisco Villa 63019",
      "Francisco Villa CP 63019"
    ],
    "palabrasClave": [
      "francisco",
      "villa"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "fray_junipero_serra": {
    "id": "fray_junipero_serra",
    "nombre": "Fray Junipero Serra",
    "nombreOficial": "Fray Junipero Serra",
    "tipo": "fraccionamiento",
    "codigoPostal": "63169",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.500751055009523,
      "longitud": -104.899644457813,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Fray Junípero Serra"
    },
    "alias": [
      "Fray Junipero Serra",
      "Fraccionamiento Fray Junipero Serra",
      "Fracc Fray Junipero Serra",
      "Fray Junipero Serra 63169",
      "Fray Junipero Serra CP 63169",
      "Fray Junípero Serra",
      "Junípero Serra",
      "Junipero Serra"
    ],
    "palabrasClave": [
      "fray",
      "junipero",
      "serra"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "gardenias": {
    "id": "gardenias",
    "nombre": "Gardenias",
    "nombreOficial": "Gardenias",
    "tipo": "colonia",
    "codigoPostal": null,
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.471779488580182,
      "longitud": -104.89101344135196,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Gardenias",
      "Colonia Gardenias",
      "Col Gardenias"
    ],
    "palabrasClave": [
      "gardenias"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_sin_coincidencia_postal",
    "activa": true
  },
  "genaro_vazquez": {
    "id": "genaro_vazquez",
    "nombre": "Genaro Vázquez",
    "nombreOficial": "Genaro Vázquez",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50649438290829,
      "longitud": -104.86973250155556,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Genaro Vázquez",
      "Colonia Genaro Vázquez",
      "Col Genaro Vázquez",
      "Genaro Vázquez 63174",
      "Genaro Vázquez CP 63174"
    ],
    "palabrasClave": [
      "genaro",
      "vazquez"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "gilberto_flores_munoz": {
    "id": "gilberto_flores_munoz",
    "nombre": "Gilberto Flores Muñoz",
    "nombreOficial": "Gilberto Flores Muñoz",
    "tipo": "colonia",
    "codigoPostal": "63179",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50616296255626,
      "longitud": -104.8838192458357,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Gilberto Flores Muñoz",
      "Colonia Gilberto Flores Muñoz",
      "Col Gilberto Flores Muñoz",
      "Gilberto Flores Muñoz 63179",
      "Gilberto Flores Muñoz CP 63179"
    ],
    "palabrasClave": [
      "gilberto",
      "flores",
      "munoz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "gobernadores": {
    "id": "gobernadores",
    "nombre": "Gobernadores",
    "nombreOficial": "Gobernadores",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4865662155212,
      "longitud": -104.87239249389923,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Gobernadores",
      "Colonia Gobernadores",
      "Col Gobernadores",
      "Gobernadores 63175",
      "Gobernadores CP 63175"
    ],
    "palabrasClave": [
      "gobernadores"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "gobierno_del_cambio_i": {
    "id": "gobierno_del_cambio_i",
    "nombre": "Gobierno del Cambio I",
    "nombreOficial": "Gobierno del Cambio I",
    "tipo": "fraccionamiento",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4948825,
      "longitud": -104.8737386,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Gobierno del Cambio I",
      "Fraccionamiento Gobierno del Cambio I",
      "Fracc Gobierno del Cambio I",
      "Gobierno del Cambio I 63170",
      "Gobierno del Cambio I CP 63170"
    ],
    "palabrasClave": [
      "gobierno",
      "cambio"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "guadalupe": {
    "id": "guadalupe",
    "nombre": "Guadalupe",
    "nombreOficial": "Guadalupe",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526336157133283,
      "longitud": -104.93058414778532,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Guadalupe",
      "Colonia Guadalupe",
      "Col Guadalupe",
      "Guadalupe 63114",
      "Guadalupe CP 63114"
    ],
    "palabrasClave": [
      "guadalupe"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "gustavo_diaz_ordaz": {
    "id": "gustavo_diaz_ordaz",
    "nombre": "Gustavo Díaz Ordaz",
    "nombreOficial": "Gustavo Díaz Ordaz",
    "tipo": "colonia",
    "codigoPostal": "63176",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48173098102303,
      "longitud": -104.87500208039948,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Gustavo Díaz Ordaz",
      "Colonia Gustavo Díaz Ordaz",
      "Col Gustavo Díaz Ordaz",
      "Gustavo Díaz Ordaz 63176",
      "Gustavo Díaz Ordaz CP 63176"
    ],
    "palabrasClave": [
      "gustavo",
      "diaz",
      "ordaz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "heriberto_casas": {
    "id": "heriberto_casas",
    "nombre": "Heriberto Casas",
    "nombreOficial": "Heriberto Casas",
    "tipo": "colonia",
    "codigoPostal": "63080",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.516108317841304,
      "longitud": -104.90194863611411,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Heriberto Casas",
      "Colonia Heriberto Casas",
      "Col Heriberto Casas",
      "Heriberto Casas 63080",
      "Heriberto Casas CP 63080"
    ],
    "palabrasClave": [
      "heriberto",
      "casas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "heriberto_jara": {
    "id": "heriberto_jara",
    "nombre": "Heriberto Jara",
    "nombreOficial": "Heriberto Jara",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50264123327722,
      "longitud": -104.8756983710847,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Heriberto Jara",
      "Colonia Heriberto Jara",
      "Col Heriberto Jara",
      "Heriberto Jara 63177",
      "Heriberto Jara CP 63177"
    ],
    "palabrasClave": [
      "heriberto",
      "jara"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "hermosa_provincia": {
    "id": "hermosa_provincia",
    "nombre": "Hermosa Provincia",
    "nombreOficial": "Hermosa Provincia",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48006955148632,
      "longitud": -104.88003215096278,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Hermosa Provincia",
      "Colonia Hermosa Provincia",
      "Col Hermosa Provincia",
      "Hermosa Provincia 63197",
      "Hermosa Provincia CP 63197"
    ],
    "palabrasClave": [
      "hermosa",
      "provincia"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "imss_fraccionamiento_63186": {
    "id": "imss_fraccionamiento_63186",
    "nombre": "IMSS (Fraccionamiento)",
    "nombreOficial": "IMSS",
    "tipo": "fraccionamiento",
    "codigoPostal": "63186",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4783924,
      "longitud": -104.8932616,
      "referencia": "resultado_cartografico_con_tipo_y_cp",
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "IMSS",
      "IMSS (Fraccionamiento)",
      "Fraccionamiento IMSS",
      "Fracc IMSS",
      "IMSS 63186",
      "IMSS CP 63186"
    ],
    "palabrasClave": [
      "imss"
    ],
    "grupoAmbiguedad": "imss",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "imss_unidad_habitacional_63120": {
    "id": "imss_unidad_habitacional_63120",
    "nombre": "IMSS (Unidad Habitacional)",
    "nombreOficial": "IMSS",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63120",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.514667231722164,
      "longitud": -104.91170875743342,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "IMSS",
      "IMSS (Unidad Habitacional)",
      "Unidad Habitacional IMSS",
      "UH IMSS",
      "IMSS 63120",
      "IMSS CP 63120"
    ],
    "palabrasClave": [
      "imss"
    ],
    "grupoAmbiguedad": "imss",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "indeco": {
    "id": "indeco",
    "nombre": "INDECO",
    "nombreOficial": "INDECO",
    "tipo": "colonia",
    "codigoPostal": "63022",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.528328635354143,
      "longitud": -104.90347815416159,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "INDECO",
      "Colonia INDECO",
      "Col INDECO",
      "INDECO 63022",
      "INDECO CP 63022"
    ],
    "palabrasClave": [
      "indeco"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "independencia": {
    "id": "independencia",
    "nombre": "Independencia",
    "nombreOficial": "Independencia",
    "tipo": "colonia",
    "codigoPostal": "63136",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50316430133397,
      "longitud": -104.90759736086106,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Independencia",
      "Colonia Independencia",
      "Col Independencia",
      "Independencia 63136",
      "Independencia CP 63136"
    ],
    "palabrasClave": [
      "independencia"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ingeniero_agronomo": {
    "id": "ingeniero_agronomo",
    "nombre": "Ingeniero Agrónomo",
    "nombreOficial": "Ingeniero Agrónomo",
    "tipo": "colonia",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.523281074614847,
      "longitud": -104.87831692668453,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Agrónomos"
    },
    "alias": [
      "Ingeniero Agrónomo",
      "Colonia Ingeniero Agrónomo",
      "Col Ingeniero Agrónomo",
      "Ingeniero Agrónomo 63037",
      "Ingeniero Agrónomo CP 63037"
    ],
    "palabrasClave": [
      "ingeniero",
      "agronomo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ingeniero_aguayo": {
    "id": "ingeniero_aguayo",
    "nombre": "Ingeniero Aguayo",
    "nombreOficial": "Ingeniero Aguayo",
    "tipo": "colonia",
    "codigoPostal": "63084",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.528322199999998,
      "longitud": -104.89380899999999,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ingeniero Aguayo",
      "Colonia Ingeniero Aguayo",
      "Col Ingeniero Aguayo",
      "Ingeniero Aguayo 63084",
      "Ingeniero Aguayo CP 63084"
    ],
    "palabrasClave": [
      "ingeniero",
      "aguayo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "insurgentes": {
    "id": "insurgentes",
    "nombre": "Insurgentes",
    "nombreOficial": "Insurgentes",
    "tipo": "colonia",
    "codigoPostal": "63183",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47287306251885,
      "longitud": -104.89473016846294,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Insurgentes",
      "Colonia Insurgentes",
      "Col Insurgentes",
      "Insurgentes 63183",
      "Insurgentes CP 63183"
    ],
    "palabrasClave": [
      "insurgentes"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "islas_del_paraiso": {
    "id": "islas_del_paraiso",
    "nombre": "Islas del Paraíso",
    "nombreOficial": "Islas del Paraíso",
    "tipo": "fraccionamiento",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.535659094665807,
      "longitud": -104.86725340568792,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Islas del Paraíso"
    },
    "alias": [
      "Islas del Paraíso",
      "Fraccionamiento Islas del Paraíso",
      "Fracc Islas del Paraíso",
      "Islas del Paraíso 63035",
      "Islas del Paraíso CP 63035",
      "Islas Paraíso"
    ],
    "palabrasClave": [
      "islas",
      "paraiso"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jacarandas": {
    "id": "jacarandas",
    "nombre": "Jacarandas",
    "nombreOficial": "Jacarandas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.482243238511575,
      "longitud": -104.85428227362954,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Jacarandas",
      "Fraccionamiento Jacarandas",
      "Fracc Jacarandas",
      "Jacarandas 63195",
      "Jacarandas CP 63195"
    ],
    "palabrasClave": [
      "jacarandas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "jaguey": {
    "id": "jaguey",
    "nombre": "Jagüey",
    "nombreOficial": "Jagüey",
    "tipo": "colonia",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5034332,
      "longitud": -104.9197218,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Jagüey",
      "Colonia Jagüey",
      "Col Jagüey",
      "Jagüey 63129",
      "Jagüey CP 63129",
      "El Jagüey",
      "El Jaguey"
    ],
    "palabrasClave": [
      "jaguey"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jardines_de_la_cruz": {
    "id": "jardines_de_la_cruz",
    "nombre": "Jardines de La Cruz",
    "nombreOficial": "Jardines de La Cruz",
    "tipo": "fraccionamiento",
    "codigoPostal": "63168",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.496057244211197,
      "longitud": -104.89813056068235,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Jardines de La Cruz",
      "Fraccionamiento Jardines de La Cruz",
      "Fracc Jardines de La Cruz",
      "Jardines de La Cruz 63168",
      "Jardines de La Cruz CP 63168"
    ],
    "palabrasClave": [
      "jardines",
      "cruz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "jardines_del_paraiso": {
    "id": "jardines_del_paraiso",
    "nombre": "Jardines del Paraíso",
    "nombreOficial": "Jardines del Paraíso",
    "tipo": "fraccionamiento",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53777926977656,
      "longitud": -104.86546664247663,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Social Progresivo Jardines del Paraíso"
    },
    "alias": [
      "Jardines del Paraíso",
      "Fraccionamiento Jardines del Paraíso",
      "Fracc Jardines del Paraíso",
      "Jardines del Paraíso 63035",
      "Jardines del Paraíso CP 63035",
      "Jardines Paraíso"
    ],
    "palabrasClave": [
      "jardines",
      "paraiso"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jardines_del_parque": {
    "id": "jardines_del_parque",
    "nombre": "Jardines del Parque",
    "nombreOficial": "Jardines del Parque",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.487823609668823,
      "longitud": -104.85546962428886,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Jardines del Parque"
    },
    "alias": [
      "Jardines del Parque",
      "Fraccionamiento Jardines del Parque",
      "Fracc Jardines del Parque",
      "Jardines del Parque 63173",
      "Jardines del Parque CP 63173"
    ],
    "palabrasClave": [
      "jardines",
      "parque"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jardines_del_valle": {
    "id": "jardines_del_valle",
    "nombre": "Jardines del Valle",
    "nombreOficial": "Jardines del Valle",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.531116470886893,
      "longitud": -104.87400561543735,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Jardines del Valle"
    },
    "alias": [
      "Jardines del Valle",
      "Colonia Jardines del Valle",
      "Col Jardines del Valle",
      "Jardines del Valle 63035",
      "Jardines del Valle CP 63035"
    ],
    "palabrasClave": [
      "jardines",
      "valle"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jazmines": {
    "id": "jazmines",
    "nombre": "Jazmines",
    "nombreOficial": "Jazmines",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.485993822045177,
      "longitud": -104.83277960337708,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Jazmines",
      "Colonia Jazmines",
      "Col Jazmines",
      "Jazmines 63173",
      "Jazmines CP 63173"
    ],
    "palabrasClave": [
      "jazmines"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "jesus_garcia": {
    "id": "jesus_garcia",
    "nombre": "Jesús García",
    "nombreOficial": "Jesús García",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.485210426425226,
      "longitud": -104.83883313389097,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Jesús García",
      "Colonia Jesús García",
      "Col Jesús García",
      "Jesús García 63173",
      "Jesús García CP 63173"
    ],
    "palabrasClave": [
      "jesus",
      "garcia"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "jesus_salas": {
    "id": "jesus_salas",
    "nombre": "Jesús Salas",
    "nombreOficial": "Jesús Salas",
    "tipo": "colonia",
    "codigoPostal": "63018",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53798976313995,
      "longitud": -104.89731617759153,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Jesús Salas"
    },
    "alias": [
      "Jesús Salas",
      "Colonia Jesús Salas",
      "Col Jesús Salas",
      "Jesús Salas 63018",
      "Jesús Salas CP 63018"
    ],
    "palabrasClave": [
      "jesus",
      "salas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "jose_maria_martinez_el_molino": {
    "id": "jose_maria_martinez_el_molino",
    "nombre": "José María Martínez (El Molino)",
    "nombreOficial": "José María Martínez (El Molino)",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.484908961797082,
      "longitud": -104.8863270878792,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "José María Martínez (El Molino)",
      "Colonia José María Martínez (El Molino)",
      "Col José María Martínez (El Molino)",
      "José María Martínez (El Molino) 63190",
      "José María Martínez (El Molino) CP 63190",
      "El Molino",
      "José María Martínez",
      "Jose Maria Martinez Molino"
    ],
    "palabrasClave": [
      "jose",
      "maria",
      "martinez",
      "molino"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "juan_escutia": {
    "id": "juan_escutia",
    "nombre": "Juan Escutia",
    "nombreOficial": "Juan Escutia",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.472753177142096,
      "longitud": -104.8886648905005,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Juan Escutia",
      "Colonia Juan Escutia",
      "Col Juan Escutia",
      "Juan Escutia 63190",
      "Juan Escutia CP 63190"
    ],
    "palabrasClave": [
      "juan",
      "escutia"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "justino_avila_arce": {
    "id": "justino_avila_arce",
    "nombre": "Justino Ávila Arce",
    "nombreOficial": "Justino Ávila Arce",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4874425,
      "longitud": -104.8434554,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Justino Ávila Arce",
      "Colonia Justino Ávila Arce",
      "Col Justino Ávila Arce",
      "Justino Ávila Arce 63173",
      "Justino Ávila Arce CP 63173"
    ],
    "palabrasClave": [
      "justino",
      "avila",
      "arce"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "juventud": {
    "id": "juventud",
    "nombre": "Juventud",
    "nombreOficial": "Juventud",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49364226145953,
      "longitud": -104.87721246597144,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Juventud",
      "Colonia Juventud",
      "Col Juventud",
      "Juventud 63177",
      "Juventud CP 63177"
    ],
    "palabrasClave": [
      "juventud"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "la_esperanza": {
    "id": "la_esperanza",
    "nombre": "La Esperanza",
    "nombreOficial": "La Esperanza",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.506765479765726,
      "longitud": -104.8713409974782,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "La Esperanza",
      "Colonia La Esperanza",
      "Col La Esperanza",
      "Esperanza",
      "La Esperanza 63174",
      "La Esperanza CP 63174"
    ],
    "palabrasClave": [
      "esperanza"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "la_floresta": {
    "id": "la_floresta",
    "nombre": "La Floresta",
    "nombreOficial": "La Floresta",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494627455690978,
      "longitud": -104.82914143026076,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "La Floresta"
    },
    "alias": [
      "La Floresta",
      "Fraccionamiento La Floresta",
      "Fracc La Floresta",
      "Floresta",
      "La Floresta 63173",
      "La Floresta CP 63173"
    ],
    "palabrasClave": [
      "floresta"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "la_huerta": {
    "id": "la_huerta",
    "nombre": "La Huerta",
    "nombreOficial": "La Huerta",
    "tipo": "fraccionamiento",
    "codigoPostal": "63070",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.518938879017657,
      "longitud": -104.91299997918517,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "La Huerta",
      "Fraccionamiento La Huerta",
      "Fracc La Huerta",
      "Huerta",
      "La Huerta 63070",
      "La Huerta CP 63070"
    ],
    "palabrasClave": [
      "huerta"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "la_joya": {
    "id": "la_joya",
    "nombre": "La Joya",
    "nombreOficial": "La Joya",
    "tipo": "fraccionamiento",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.475709407126473,
      "longitud": -104.8707959375292,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "La Joya",
      "Fraccionamiento La Joya",
      "Fracc La Joya",
      "La Joya 63195",
      "La Joya CP 63195"
    ],
    "palabrasClave": [
      "joya"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "la_loma": {
    "id": "la_loma",
    "nombre": "La Loma",
    "nombreOficial": "La Loma",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50384179053414,
      "longitud": -104.90466886370884,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "La Loma",
      "Fraccionamiento La Loma",
      "Fracc La Loma",
      "La Loma 63037",
      "La Loma CP 63037"
    ],
    "palabrasClave": [
      "loma"
    ],
    "grupoAmbiguedad": "la_loma",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "la_lomita": {
    "id": "la_lomita",
    "nombre": "La Lomita",
    "nombreOficial": "La Lomita",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.523433201656655,
      "longitud": -104.87458188706125,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "La Lomita",
      "Fraccionamiento La Lomita",
      "Fracc La Lomita",
      "Lomita",
      "La Lomita 63037",
      "La Lomita CP 63037"
    ],
    "palabrasClave": [
      "lomita"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "labores_de_godinez": {
    "id": "labores_de_godinez",
    "nombre": "Labores de Godínez",
    "nombreOficial": "Labores de Godínez",
    "tipo": "colonia",
    "codigoPostal": "63167",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.490123015110917,
      "longitud": -104.90103855161753,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Labores de Godínez"
    },
    "alias": [
      "Labores de Godínez",
      "Colonia Labores de Godínez",
      "Col Labores de Godínez",
      "Labores de Godínez 63167",
      "Labores de Godínez CP 63167"
    ],
    "palabrasClave": [
      "labores",
      "godinez"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ladrilleras": {
    "id": "ladrilleras",
    "nombre": "Ladrilleras",
    "nombreOficial": "Ladrilleras",
    "tipo": "colonia",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.469719340386188,
      "longitud": -104.8491464272754,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Las Ladrilleras"
    },
    "alias": [
      "Ladrilleras",
      "Colonia Ladrilleras",
      "Col Ladrilleras",
      "Ladrilleras 63194",
      "Ladrilleras CP 63194"
    ],
    "palabrasClave": [
      "ladrilleras"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lagos_de_aztlan": {
    "id": "lagos_de_aztlan",
    "nombre": "Lagos de Aztlán",
    "nombreOficial": "Lagos de Aztlán",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.495755050881694,
      "longitud": -104.87529233870514,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lagos de Aztlán"
    },
    "alias": [
      "Lagos de Aztlán",
      "Colonia Lagos de Aztlán",
      "Col Lagos de Aztlán",
      "Lagos de Aztlán 63170",
      "Lagos de Aztlán CP 63170"
    ],
    "palabrasClave": [
      "lagos",
      "aztlan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lagos_del_country": {
    "id": "lagos_del_country",
    "nombre": "Lagos del Country",
    "nombreOficial": "Lagos del Country",
    "tipo": "fraccionamiento",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48014033210326,
      "longitud": -104.86231219214804,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lagos del Country",
      "Fraccionamiento Lagos del Country",
      "Fracc Lagos del Country",
      "Lagos del Country 63175",
      "Lagos del Country CP 63175"
    ],
    "palabrasClave": [
      "lagos",
      "country"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_aves": {
    "id": "las_aves",
    "nombre": "Las Aves",
    "nombreOficial": "Las Aves",
    "tipo": "fraccionamiento",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494926571082814,
      "longitud": -104.88068432498017,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Aves",
      "Fraccionamiento Las Aves",
      "Fracc Las Aves",
      "Las Aves 63170",
      "Las Aves CP 63170"
    ],
    "palabrasClave": [
      "aves"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_brisas": {
    "id": "las_brisas",
    "nombre": "Las Brisas",
    "nombreOficial": "Las Brisas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63117",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.516862082687737,
      "longitud": -104.92250278932708,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Brisas",
      "Fraccionamiento Las Brisas",
      "Fracc Las Brisas",
      "Brisas",
      "Las Brisas 63117",
      "Las Brisas CP 63117"
    ],
    "palabrasClave": [
      "brisas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_brisas_fovissste": {
    "id": "las_brisas_fovissste",
    "nombre": "Las Brisas FOVISSSTE",
    "nombreOficial": "Las Brisas FOVISSSTE",
    "tipo": "fraccionamiento",
    "codigoPostal": "63117",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5168454,
      "longitud": -104.9261094,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Brisas FOVISSSTE",
      "Fraccionamiento Las Brisas FOVISSSTE",
      "Fracc Las Brisas FOVISSSTE",
      "Brisas FOVISSSTE",
      "Las Brisas FOVISSSTE 63117",
      "Las Brisas FOVISSSTE CP 63117"
    ],
    "palabrasClave": [
      "brisas",
      "fovissste"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "las_conchas": {
    "id": "las_conchas",
    "nombre": "Las Conchas",
    "nombreOficial": "Las Conchas",
    "tipo": "colonia",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.54072706866849,
      "longitud": -104.87379913571543,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Las Conchas"
    },
    "alias": [
      "Las Conchas",
      "Colonia Las Conchas",
      "Col Las Conchas",
      "Conchas",
      "Las Conchas 63038",
      "Las Conchas CP 63038"
    ],
    "palabrasClave": [
      "conchas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "las_cumbres": {
    "id": "las_cumbres",
    "nombre": "Las Cumbres",
    "nombreOficial": "Las Cumbres",
    "tipo": "fraccionamiento",
    "codigoPostal": "63185",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48020568401701,
      "longitud": -104.89932599350439,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Las Cumbres"
    },
    "alias": [
      "Las Cumbres",
      "Fraccionamiento Las Cumbres",
      "Fracc Las Cumbres",
      "Cumbres",
      "Las Cumbres 63185",
      "Las Cumbres CP 63185"
    ],
    "palabrasClave": [
      "cumbres"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "las_fincas": {
    "id": "las_fincas",
    "nombre": "Las Fincas",
    "nombreOficial": "Las Fincas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.497397575386767,
      "longitud": -104.85787153244019,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Fincas",
      "Fraccionamiento Las Fincas",
      "Fracc Las Fincas",
      "Fincas",
      "Las Fincas 63174",
      "Las Fincas CP 63174",
      "Residencial Las Fincas"
    ],
    "palabrasClave": [
      "fincas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "las_flores": {
    "id": "las_flores",
    "nombre": "Las Flores",
    "nombreOficial": "Las Flores",
    "tipo": "colonia",
    "codigoPostal": "63067",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526056424691784,
      "longitud": -104.918796799223,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Flores",
      "Colonia Las Flores",
      "Col Las Flores",
      "Flores",
      "Las Flores 63067",
      "Las Flores CP 63067"
    ],
    "palabrasClave": [
      "flores"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_islas": {
    "id": "las_islas",
    "nombre": "Las Islas",
    "nombreOficial": "Las Islas",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.472369428508806,
      "longitud": -104.86417268608027,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Islas",
      "Colonia Las Islas",
      "Col Las Islas",
      "Las Islas 63195",
      "Las Islas CP 63195"
    ],
    "palabrasClave": [
      "islas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_palomas": {
    "id": "las_palomas",
    "nombre": "Las Palomas",
    "nombreOficial": "Las Palomas",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.459335964388917,
      "longitud": -104.85567723478,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Palomas",
      "Colonia Las Palomas",
      "Col Las Palomas",
      "Palomas",
      "Las Palomas 63195",
      "Las Palomas CP 63195"
    ],
    "palabrasClave": [
      "palomas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "las_pares": {
    "id": "las_pares",
    "nombre": "Las Pares",
    "nombreOficial": "Las Pares",
    "tipo": "fraccionamiento",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5287539,
      "longitud": -104.8830436,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Las Pares",
      "Fraccionamiento Las Pares",
      "Fracc Las Pares",
      "Las Pares 63038",
      "Las Pares CP 63038"
    ],
    "palabrasClave": [
      "pares"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lazaro_cardenas": {
    "id": "lazaro_cardenas",
    "nombre": "Lázaro Cárdenas",
    "nombreOficial": "Lázaro Cárdenas",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.479417501346305,
      "longitud": -104.88704285277828,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lázaro Cárdenas",
      "Colonia Lázaro Cárdenas",
      "Col Lázaro Cárdenas",
      "Lázaro Cárdenas 63190",
      "Lázaro Cárdenas CP 63190"
    ],
    "palabrasClave": [
      "lazaro",
      "cardenas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "leonardo_rodriguez_alcaine": {
    "id": "leonardo_rodriguez_alcaine",
    "nombre": "Leonardo Rodríguez Alcaine",
    "nombreOficial": "Leonardo Rodríguez Alcaine",
    "tipo": "fraccionamiento",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.510,
      "longitud": -104.905,
      "referencia": "estimacion_centroide_cp63129",
      "fuente": "estimacion_cp",
      "precision": "estimacion_zona_pendiente_verificacion",
      "confianza": "alta",
      "verificada": true,
      "nota": "Coordenadas originales (-104.7918) eran de google_maps_search y quedaban ~9km al este de todas las demás colonias del CP 63129; corregidas con estimación centroide del código postal"
    },
    "alias": [
      "Leonardo Rodríguez Alcaine",
      "Fraccionamiento Leonardo Rodríguez Alcaine",
      "Fracc Leonardo Rodríguez Alcaine",
      "Leonardo Rodríguez Alcaine 63129",
      "Leonardo Rodríguez Alcaine CP 63129"
    ],
    "palabrasClave": [
      "leonardo",
      "rodriguez",
      "alcaine"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "leyva_medina": {
    "id": "leyva_medina",
    "nombre": "Leyva Medina",
    "nombreOficial": "Leyva Medina",
    "tipo": "fraccionamiento",
    "codigoPostal": "63186",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.476870675373984,
      "longitud": -104.89264541171104,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Leyva Medina",
      "Fraccionamiento Leyva Medina",
      "Fracc Leyva Medina",
      "Leyva Medina 63186",
      "Leyva Medina CP 63186"
    ],
    "palabrasClave": [
      "leyva",
      "medina"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lindavista": {
    "id": "lindavista",
    "nombre": "Lindavista",
    "nombreOficial": "Lindavista",
    "tipo": "fraccionamiento",
    "codigoPostal": "63110",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51058948784751,
      "longitud": -104.92002638029078,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lindavista",
      "Fraccionamiento Lindavista",
      "Fracc Lindavista",
      "Lindavista 63110",
      "Lindavista CP 63110"
    ],
    "palabrasClave": [
      "lindavista"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lirios": {
    "id": "lirios",
    "nombre": "Lirios",
    "nombreOficial": "Lirios",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.504988400896895,
      "longitud": -104.87906558696561,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lirios",
      "Colonia Lirios",
      "Col Lirios",
      "Lirios 63177",
      "Lirios CP 63177"
    ],
    "palabrasClave": [
      "lirios"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "loma_hermosa": {
    "id": "loma_hermosa",
    "nombre": "Loma Hermosa",
    "nombreOficial": "Loma Hermosa",
    "tipo": "colonia",
    "codigoPostal": "63019",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.534611655521097,
      "longitud": -104.89052591670048,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Loma Hermosa",
      "Colonia Loma Hermosa",
      "Col Loma Hermosa",
      "Loma Hermosa 63019",
      "Loma Hermosa CP 63019"
    ],
    "palabrasClave": [
      "loma",
      "hermosa"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lomas_altas": {
    "id": "lomas_altas",
    "nombre": "Lomas Altas",
    "nombreOficial": "Lomas Altas",
    "tipo": "colonia",
    "codigoPostal": "63061",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.522561424661387,
      "longitud": -104.9110039687957,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas Altas"
    },
    "alias": [
      "Lomas Altas",
      "Colonia Lomas Altas",
      "Col Lomas Altas",
      "Lomas Altas 63061",
      "Lomas Altas CP 63061"
    ],
    "palabrasClave": [
      "lomas",
      "altas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_bonitas": {
    "id": "lomas_bonitas",
    "nombre": "Lomas Bonitas",
    "nombreOficial": "Lomas Bonitas",
    "tipo": "colonia",
    "codigoPostal": "63062",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526794488676327,
      "longitud": -104.92410319527124,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lomas Bonitas",
      "Colonia Lomas Bonitas",
      "Col Lomas Bonitas",
      "Lomas Bonitas 63062",
      "Lomas Bonitas CP 63062"
    ],
    "palabrasClave": [
      "lomas",
      "bonitas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lomas_de_cortez": {
    "id": "lomas_de_cortez",
    "nombre": "Lomas de Cortez",
    "nombreOficial": "Lomas de Cortez",
    "tipo": "colonia",
    "codigoPostal": "63059",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51516462451541,
      "longitud": -104.88155805828656,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas de Cortéz"
    },
    "alias": [
      "Lomas de Cortez",
      "Colonia Lomas de Cortez",
      "Col Lomas de Cortez",
      "Lomas de Cortez 63059",
      "Lomas de Cortez CP 63059"
    ],
    "palabrasClave": [
      "lomas",
      "cortez"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_de_la_cruz": {
    "id": "lomas_de_la_cruz",
    "nombre": "Lomas de La Cruz",
    "nombreOficial": "Lomas de La Cruz",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52332974266508,
      "longitud": -104.88300616946546,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lomas de La Cruz",
      "Fraccionamiento Lomas de La Cruz",
      "Fracc Lomas de La Cruz",
      "Lomas de La Cruz 63037",
      "Lomas de La Cruz CP 63037"
    ],
    "palabrasClave": [
      "lomas",
      "cruz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lomas_de_la_cruz_sutse": {
    "id": "lomas_de_la_cruz_sutse",
    "nombre": "Lomas de La Cruz Sutse",
    "nombreOficial": "Lomas de La Cruz Sutse",
    "tipo": "fraccionamiento",
    "codigoPostal": "63030",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.520720416078838,
      "longitud": -104.87855420327266,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas de la Cruz (Sutsem)"
    },
    "alias": [
      "Lomas de La Cruz Sutse",
      "Fraccionamiento Lomas de La Cruz Sutse",
      "Fracc Lomas de La Cruz Sutse",
      "Lomas de La Cruz Sutse 63030",
      "Lomas de La Cruz Sutse CP 63030"
    ],
    "palabrasClave": [
      "lomas",
      "cruz",
      "sutse"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_de_la_laguna": {
    "id": "lomas_de_la_laguna",
    "nombre": "Lomas de La Laguna",
    "nombreOficial": "Lomas de La Laguna",
    "tipo": "colonia",
    "codigoPostal": "63059",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5139969602791,
      "longitud": -104.873258769452,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas de la Laguna"
    },
    "alias": [
      "Lomas de La Laguna",
      "Colonia Lomas de La Laguna",
      "Col Lomas de La Laguna",
      "Lomas de La Laguna 63059",
      "Lomas de La Laguna CP 63059"
    ],
    "palabrasClave": [
      "lomas",
      "laguna"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_de_lindavista": {
    "id": "lomas_de_lindavista",
    "nombre": "Lomas de Lindavista",
    "nombreOficial": "Lomas de Lindavista",
    "tipo": "fraccionamiento",
    "codigoPostal": "63115",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.514329824509094,
      "longitud": -104.91657418224919,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas de Lindavista"
    },
    "alias": [
      "Lomas de Lindavista",
      "Fraccionamiento Lomas de Lindavista",
      "Fracc Lomas de Lindavista",
      "Lomas de Lindavista 63115",
      "Lomas de Lindavista CP 63115",
      "Lomas Lindavista"
    ],
    "palabrasClave": [
      "lomas",
      "lindavista"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_de_san_juan": {
    "id": "lomas_de_san_juan",
    "nombre": "Lomas de San Juan",
    "nombreOficial": "Lomas de San Juan",
    "tipo": "colonia",
    "codigoPostal": "63128",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50244901907581,
      "longitud": -104.9213109410473,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lomas de San Juan",
      "Colonia Lomas de San Juan",
      "Col Lomas de San Juan",
      "Lomas de San Juan 63128",
      "Lomas de San Juan CP 63128",
      "Lomas San Juan"
    ],
    "palabrasClave": [
      "lomas",
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "lomas_del_encanto": {
    "id": "lomas_del_encanto",
    "nombre": "Lomas del Encanto",
    "nombreOficial": "Lomas del Encanto",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.492727335013697,
      "longitud": -104.85687820261249,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Lomas del Encanto"
    },
    "alias": [
      "Lomas del Encanto",
      "Fraccionamiento Lomas del Encanto",
      "Fracc Lomas del Encanto",
      "Lomas del Encanto 63173",
      "Lomas del Encanto CP 63173"
    ],
    "palabrasClave": [
      "lomas",
      "encanto"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "lomas_del_valle": {
    "id": "lomas_del_valle",
    "nombre": "Lomas del Valle",
    "nombreOficial": "Lomas del Valle",
    "tipo": "colonia",
    "codigoPostal": "63066",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.528843571935614,
      "longitud": -104.9225386143343,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Lomas del Valle",
      "Colonia Lomas del Valle",
      "Col Lomas del Valle",
      "Lomas del Valle 63066",
      "Lomas del Valle CP 63066"
    ],
    "palabrasClave": [
      "lomas",
      "valle"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_alamos": {
    "id": "los_alamos",
    "nombre": "Los Álamos",
    "nombreOficial": "Los Álamos",
    "tipo": "fraccionamiento",
    "codigoPostal": "63172",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49193705846296,
      "longitud": -104.81129497289659,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Álamos",
      "Fraccionamiento Los Álamos",
      "Fracc Los Álamos",
      "Álamos",
      "Los Álamos 63172",
      "Los Álamos CP 63172"
    ],
    "palabrasClave": [
      "alamos"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "los_arcos": {
    "id": "los_arcos",
    "nombre": "Los Arcos",
    "nombreOficial": "Los Arcos",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.527896369657533,
      "longitud": -104.87591854219889,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Arcos",
      "Fraccionamiento Los Arcos",
      "Fracc Los Arcos",
      "Los Arcos 63037",
      "Los Arcos CP 63037"
    ],
    "palabrasClave": [
      "arcos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_ciruelos": {
    "id": "los_ciruelos",
    "nombre": "Los Ciruelos",
    "nombreOficial": "Los Ciruelos",
    "tipo": "fraccionamiento",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4827107,
      "longitud": -104.8694933,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Ciruelos",
      "Fraccionamiento Los Ciruelos",
      "Fracc Los Ciruelos",
      "Ciruelos",
      "Los Ciruelos 63195",
      "Los Ciruelos CP 63195"
    ],
    "palabrasClave": [
      "ciruelos"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "los_colomos": {
    "id": "los_colomos",
    "nombre": "Los Colomos",
    "nombreOficial": "Los Colomos",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.500368028154323,
      "longitud": -104.87968093776288,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Colomos",
      "Colonia Los Colomos",
      "Col Los Colomos",
      "Colomos",
      "Los Colomos 63177",
      "Los Colomos CP 63177"
    ],
    "palabrasClave": [
      "colomos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_fresnos": {
    "id": "los_fresnos",
    "nombre": "Los Fresnos",
    "nombreOficial": "Los Fresnos",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.485025353505407,
      "longitud": -104.89148305964078,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Fresnos",
      "Unidad Habitacional Los Fresnos",
      "UH Los Fresnos",
      "Fresnos",
      "Los Fresnos 63197",
      "Los Fresnos CP 63197",
      "Los Fresnos INFONAVIT",
      "INFONAVIT Los Fresnos",
      "Fresnos INFONAVIT"
    ],
    "palabrasClave": [
      "fresnos"
    ],
    "grupoAmbiguedad": "los_fresnos",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_fresnos_oriente": {
    "id": "los_fresnos_oriente",
    "nombre": "Los Fresnos Oriente",
    "nombreOficial": "Los Fresnos Oriente",
    "tipo": "colonia",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4840762,
      "longitud": -104.890707,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Fresnos Oriente",
      "Colonia Los Fresnos Oriente",
      "Col Los Fresnos Oriente",
      "Fresnos Oriente",
      "Los Fresnos Oriente 63190",
      "Los Fresnos Oriente CP 63190"
    ],
    "palabrasClave": [
      "fresnos",
      "oriente"
    ],
    "grupoAmbiguedad": "los_fresnos",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "los_fresnos_poniente": {
    "id": "los_fresnos_poniente",
    "nombre": "Los Fresnos Poniente",
    "nombreOficial": "Los Fresnos Poniente",
    "tipo": "colonia",
    "codigoPostal": "63185",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.481167660469346,
      "longitud": -104.89557527382607,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Los Fresnos Poniente"
    },
    "alias": [
      "Los Fresnos Poniente",
      "Colonia Los Fresnos Poniente",
      "Col Los Fresnos Poniente",
      "Fresnos Poniente",
      "Los Fresnos Poniente 63185",
      "Los Fresnos Poniente CP 63185"
    ],
    "palabrasClave": [
      "fresnos",
      "poniente"
    ],
    "grupoAmbiguedad": "los_fresnos",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "los_llanitos": {
    "id": "los_llanitos",
    "nombre": "Los Llanitos",
    "nombreOficial": "Los Llanitos",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.492085494726453,
      "longitud": -104.87884997755795,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Llanitos",
      "Colonia Los Llanitos",
      "Col Los Llanitos",
      "Llanitos",
      "Los Llanitos 63170",
      "Los Llanitos CP 63170"
    ],
    "palabrasClave": [
      "llanitos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_manantiales": {
    "id": "los_manantiales",
    "nombre": "Los Manantiales",
    "nombreOficial": "Los Manantiales",
    "tipo": "fraccionamiento",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5058351,
      "longitud": -104.87971329999999,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Manantiales",
      "Fraccionamiento Los Manantiales",
      "Fracc Los Manantiales",
      "Manantiales",
      "Los Manantiales 63177",
      "Los Manantiales CP 63177"
    ],
    "palabrasClave": [
      "manantiales"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "los_pinos": {
    "id": "los_pinos",
    "nombre": "Los Pinos",
    "nombreOficial": "Los Pinos",
    "tipo": "colonia",
    "codigoPostal": "63084",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.530801943133746,
      "longitud": -104.89318164591468,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Pinos",
      "Colonia Los Pinos",
      "Col Los Pinos",
      "Los Pinos 63084",
      "Los Pinos CP 63084"
    ],
    "palabrasClave": [
      "pinos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_sauces": {
    "id": "los_sauces",
    "nombre": "Los Sauces",
    "nombreOficial": "Los Sauces",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.470041096034024,
      "longitud": -104.87683008278944,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Sauces",
      "Colonia Los Sauces",
      "Col Los Sauces",
      "Sauces",
      "Los Sauces 63197",
      "Los Sauces CP 63197"
    ],
    "palabrasClave": [
      "sauces"
    ],
    "grupoAmbiguedad": "los_sauces",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_sauces_infonavit": {
    "id": "los_sauces_infonavit",
    "nombre": "Los Sauces INFONAVIT",
    "nombreOficial": "Los Sauces INFONAVIT",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.470912418896997,
      "longitud": -104.87539987489824,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Los Sauces INFONAVIT",
      "Unidad Habitacional Los Sauces INFONAVIT",
      "UH Los Sauces INFONAVIT",
      "Sauces INFONAVIT",
      "INFONAVIT Los Sauces",
      "Infonavit Los Sauces",
      "Los Sauces",
      "Los Sauces INFONAVIT 63195",
      "Los Sauces INFONAVIT CP 63195"
    ],
    "palabrasClave": [
      "sauces",
      "infonavit"
    ],
    "grupoAmbiguedad": "los_sauces",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "los_viveros": {
    "id": "los_viveros",
    "nombre": "Los Viveros",
    "nombreOficial": "Los Viveros",
    "tipo": "colonia",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52662298370076,
      "longitud": -104.87866977371887,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Los Viveros"
    },
    "alias": [
      "Los Viveros",
      "Colonia Los Viveros",
      "Col Los Viveros",
      "Viveros",
      "Los Viveros 63037",
      "Los Viveros CP 63037"
    ],
    "palabrasClave": [
      "viveros"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "luis_donaldo_colosio": {
    "id": "luis_donaldo_colosio",
    "nombre": "Luis Donaldo Colosio",
    "nombreOficial": "Luis Donaldo Colosio",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63178",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50977023270726,
      "longitud": -104.88147903638739,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Luis Donaldo Colosio",
      "Unidad Habitacional Luis Donaldo Colosio",
      "UH Luis Donaldo Colosio",
      "Luis Donaldo Colosio 63178",
      "Luis Donaldo Colosio CP 63178"
    ],
    "palabrasClave": [
      "luis",
      "donaldo",
      "colosio"
    ],
    "grupoAmbiguedad": "luis_donaldo_colosio",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "luis_donaldo_colosio_murrieta": {
    "id": "luis_donaldo_colosio_murrieta",
    "nombre": "Luis Donaldo Colosio Murrieta",
    "nombreOficial": "Luis Donaldo Colosio Murrieta",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48693383678135,
      "longitud": -104.86080169951099,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Luis Donaldo Colosio Murrieta",
      "Unidad Habitacional Luis Donaldo Colosio Murrieta",
      "UH Luis Donaldo Colosio Murrieta",
      "Luis Donaldo Colosio Murrieta 63175",
      "Luis Donaldo Colosio Murrieta CP 63175"
    ],
    "palabrasClave": [
      "luis",
      "donaldo",
      "colosio",
      "murrieta"
    ],
    "grupoAmbiguedad": "luis_donaldo_colosio",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "luis_echeverria_a": {
    "id": "luis_echeverria_a",
    "nombre": "Luis Echeverría A.",
    "nombreOficial": "Luis Echeverría A.",
    "tipo": "colonia",
    "codigoPostal": "63068",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5290088,
      "longitud": -104.9162543,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Luis Echeverría A.",
      "Colonia Luis Echeverría A.",
      "Col Luis Echeverría A.",
      "Luis Echeverría A. 63068",
      "Luis Echeverría A. CP 63068",
      "Luis Echeverría Álvarez",
      "Luis Echeverria Alvarez",
      "Luis Echeverria"
    ],
    "palabrasClave": [
      "luis",
      "echeverria"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "magisterial": {
    "id": "magisterial",
    "nombre": "Magisterial",
    "nombreOficial": "Magisterial",
    "tipo": "colonia",
    "codigoPostal": "63040",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.517897494360348,
      "longitud": -104.88310475772754,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Magisterial"
    },
    "alias": [
      "Magisterial",
      "Colonia Magisterial",
      "Col Magisterial",
      "Magisterial 63040",
      "Magisterial CP 63040"
    ],
    "palabrasClave": [
      "magisterial"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "marco_antonio_fernandez": {
    "id": "marco_antonio_fernandez",
    "nombre": "Marco Antonio Fernández",
    "nombreOficial": "Marco Antonio Fernández",
    "tipo": "fraccionamiento",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.469334129534502,
      "longitud": -104.86940771341324,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Marco Antonio Fernández",
      "Fraccionamiento Marco Antonio Fernández",
      "Fracc Marco Antonio Fernández",
      "Marco Antonio Fernández 63195",
      "Marco Antonio Fernández CP 63195"
    ],
    "palabrasClave": [
      "marco",
      "antonio",
      "fernandez"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "menchaca": {
    "id": "menchaca",
    "nombre": "Menchaca",
    "nombreOficial": "Menchaca",
    "tipo": "colonia",
    "codigoPostal": "63150",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4979549,
      "longitud": -104.8899772,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Menchaca",
      "Colonia Menchaca",
      "Col Menchaca",
      "Menchaca 63150",
      "Menchaca CP 63150"
    ],
    "palabrasClave": [
      "menchaca"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "mexico": {
    "id": "mexico",
    "nombre": "México",
    "nombreOficial": "México",
    "tipo": "colonia",
    "codigoPostal": "63170",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49103618106805,
      "longitud": -104.87434886108339,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "México",
      "Colonia México",
      "Col México",
      "México 63170",
      "México CP 63170"
    ],
    "palabrasClave": [
      "mexico"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "miguel_angel_paredes": {
    "id": "miguel_angel_paredes",
    "nombre": "Miguel Ángel Paredes",
    "nombreOficial": "Miguel Ángel Paredes",
    "tipo": "colonia",
    "codigoPostal": "63050",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51927041033871,
      "longitud": -104.89067615771462,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Miguel Ángel Paredes"
    },
    "alias": [
      "Miguel Ángel Paredes",
      "Colonia Miguel Ángel Paredes",
      "Col Miguel Ángel Paredes",
      "Miguel Ángel Paredes 63050",
      "Miguel Ángel Paredes CP 63050"
    ],
    "palabrasClave": [
      "miguel",
      "angel",
      "paredes"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "miguel_hidalgo": {
    "id": "miguel_hidalgo",
    "nombre": "Miguel Hidalgo",
    "nombreOficial": "Miguel Hidalgo",
    "tipo": "colonia",
    "codigoPostal": "63193",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.471574025693833,
      "longitud": -104.86100264678299,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Miguel Hidalgo",
      "Colonia Miguel Hidalgo",
      "Col Miguel Hidalgo",
      "Miguel Hidalgo 63193",
      "Miguel Hidalgo CP 63193"
    ],
    "palabrasClave": [
      "miguel",
      "hidalgo"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "miravalles": {
    "id": "miravalles",
    "nombre": "Miravalles",
    "nombreOficial": "Miravalles",
    "tipo": "colonia",
    "codigoPostal": "63184",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47452702735179,
      "longitud": -104.89150957393237,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Miravalles",
      "Colonia Miravalles",
      "Col Miravalles",
      "Miravalles 63184",
      "Miravalles CP 63184"
    ],
    "palabrasClave": [
      "miravalles"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "moctezuma": {
    "id": "moctezuma",
    "nombre": "Moctezuma",
    "nombreOficial": "Moctezuma",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48721919230847,
      "longitud": -104.89727081193003,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Moctezuma",
      "Colonia Moctezuma",
      "Col Moctezuma",
      "Moctezuma 63180",
      "Moctezuma CP 63180"
    ],
    "palabrasClave": [
      "moctezuma"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "molinos_del_rey": {
    "id": "molinos_del_rey",
    "nombre": "Molinos del Rey",
    "nombreOficial": "Molinos del Rey",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49087145714268,
      "longitud": -104.84816891077922,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Molinos del Rey",
      "Fraccionamiento Molinos del Rey",
      "Fracc Molinos del Rey",
      "Molinos del Rey 63173",
      "Molinos del Rey CP 63173"
    ],
    "palabrasClave": [
      "molinos",
      "rey"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "mololoa": {
    "id": "mololoa",
    "nombre": "Mololoa",
    "nombreOficial": "Mololoa",
    "tipo": "colonia",
    "codigoPostal": "63050",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51709947837223,
      "longitud": -104.88724134751007,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Mololoa",
      "Colonia Mololoa",
      "Col Mololoa",
      "Mololoa 63050",
      "Mololoa CP 63050"
    ],
    "palabrasClave": [
      "mololoa"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "morelos": {
    "id": "morelos",
    "nombre": "Morelos",
    "nombreOficial": "Morelos",
    "tipo": "colonia",
    "codigoPostal": "63160",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49623046148686,
      "longitud": -104.90240662865816,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Morelos",
      "Colonia Morelos",
      "Col Morelos",
      "Morelos 63160",
      "Morelos CP 63160"
    ],
    "palabrasClave": [
      "morelos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "nayarabastos": {
    "id": "nayarabastos",
    "nombre": "Nayarabastos",
    "nombreOficial": "Nayarabastos",
    "tipo": "zona_comercial",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47511063017659,
      "longitud": -104.85856360112172,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Nayarabastos"
    },
    "alias": [
      "Nayarabastos",
      "Zona Comercial Nayarabastos",
      "Nayarabastos 63173",
      "Nayarabastos CP 63173"
    ],
    "palabrasClave": [
      "nayarabastos"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ninos_heroes": {
    "id": "ninos_heroes",
    "nombre": "Niños Héroes",
    "nombreOficial": "Niños Héroes",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.468599477347947,
      "longitud": -104.87235641273283,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Niños Héroes",
      "Colonia Niños Héroes",
      "Col Niños Héroes",
      "Niños Héroes 63197",
      "Niños Héroes CP 63197"
    ],
    "palabrasClave": [
      "ninos",
      "heroes"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "nueva_alemania": {
    "id": "nueva_alemania",
    "nombre": "Nueva Alemania",
    "nombreOficial": "Nueva Alemania",
    "tipo": "colonia",
    "codigoPostal": "63164",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49770651437621,
      "longitud": -104.91063593045368,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Nueva Alemania",
      "Colonia Nueva Alemania",
      "Col Nueva Alemania",
      "Nueva Alemania 63164",
      "Nueva Alemania CP 63164"
    ],
    "palabrasClave": [
      "nueva",
      "alemania"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "nueva_aviacion": {
    "id": "nueva_aviacion",
    "nombre": "Nueva Aviación",
    "nombreOficial": "Nueva Aviación",
    "tipo": "colonia",
    "codigoPostal": "63196",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.475732380470532,
      "longitud": -104.88293585069464,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Nueva Aviación"
    },
    "alias": [
      "Nueva Aviación",
      "Colonia Nueva Aviación",
      "Col Nueva Aviación",
      "Nueva Aviación 63196",
      "Nueva Aviación CP 63196"
    ],
    "palabrasClave": [
      "nueva",
      "aviacion"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "nuevas_delicias": {
    "id": "nuevas_delicias",
    "nombre": "Nuevas Delicias",
    "nombreOficial": "Nuevas Delicias",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.523012691647654,
      "longitud": -104.9382125066764,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Nuevas Delicias",
      "Colonia Nuevas Delicias",
      "Col Nuevas Delicias",
      "Nuevas Delicias 63114",
      "Nuevas Delicias CP 63114"
    ],
    "palabrasClave": [
      "nuevas",
      "delicias"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "nuevas_palomas": {
    "id": "nuevas_palomas",
    "nombre": "Nuevas Palomas",
    "nombreOficial": "Nuevas Palomas",
    "tipo": "colonia",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.468124924824476,
      "longitud": -104.8577526677122,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Nuevas Palomas",
      "Colonia Nuevas Palomas",
      "Col Nuevas Palomas",
      "Nuevas Palomas 63194",
      "Nuevas Palomas CP 63194"
    ],
    "palabrasClave": [
      "nuevas",
      "palomas"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "nuevo_progreso": {
    "id": "nuevo_progreso",
    "nombre": "Nuevo Progreso",
    "nombreOficial": "Nuevo Progreso",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5428144,
      "longitud": -104.8638718,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Nuevo Progreso",
      "Colonia Nuevo Progreso",
      "Col Nuevo Progreso",
      "Nuevo Progreso 63035",
      "Nuevo Progreso CP 63035"
    ],
    "palabrasClave": [
      "nuevo",
      "progreso"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "obrera_ctm": {
    "id": "obrera_ctm",
    "nombre": "Obrera CTM",
    "nombreOficial": "Obrera CTM",
    "tipo": "colonia",
    "codigoPostal": "63120",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51208647955168,
      "longitud": -104.91121688866859,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Obrera CTM"
    },
    "alias": [
      "Obrera CTM",
      "Colonia Obrera CTM",
      "Col Obrera CTM",
      "Obrera CTM 63120",
      "Obrera CTM CP 63120"
    ],
    "palabrasClave": [
      "obrera",
      "ctm"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "ojo_de_agua": {
    "id": "ojo_de_agua",
    "nombre": "Ojo de Agua",
    "nombreOficial": "Ojo de Agua",
    "tipo": "colonia",
    "codigoPostal": "63023",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53176726503445,
      "longitud": -104.90183024193759,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Ojo de Agua",
      "Colonia Ojo de Agua",
      "Col Ojo de Agua",
      "Ojo de Agua 63023",
      "Ojo de Agua CP 63023"
    ],
    "palabrasClave": [
      "ojo",
      "agua"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "olimpo": {
    "id": "olimpo",
    "nombre": "Olimpo",
    "nombreOficial": "Olimpo",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49060933324888,
      "longitud": -104.83369946479797,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Olimpo",
      "Fraccionamiento Olimpo",
      "Fracc Olimpo",
      "Olimpo 63173",
      "Olimpo CP 63173"
    ],
    "palabrasClave": [
      "olimpo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "oriental": {
    "id": "oriental",
    "nombre": "Oriental",
    "nombreOficial": "Oriental",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.488530557835222,
      "longitud": -104.87007958251759,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Oriental",
      "Colonia Oriental",
      "Col Oriental",
      "Oriental 63175",
      "Oriental CP 63175"
    ],
    "palabrasClave": [
      "oriental"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "paraiso_residencial": {
    "id": "paraiso_residencial",
    "nombre": "Paraíso Residencial",
    "nombreOficial": "Paraíso Residencial",
    "tipo": "fraccionamiento",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4608773,
      "longitud": -104.8547139,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Paraíso Residencial",
      "Fraccionamiento Paraíso Residencial",
      "Fracc Paraíso Residencial",
      "Paraíso Residencial 63194",
      "Paraíso Residencial CP 63194"
    ],
    "palabrasClave": [
      "paraiso",
      "residencial"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "parque_ecologico": {
    "id": "parque_ecologico",
    "nombre": "Parque Ecológico",
    "nombreOficial": "Parque Ecológico",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.481833032801358,
      "longitud": -104.85798647816473,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Parque Ecológico",
      "Fraccionamiento Parque Ecológico",
      "Fracc Parque Ecológico",
      "Parque Ecológico 63173",
      "Parque Ecológico CP 63173"
    ],
    "palabrasClave": [
      "parque",
      "ecologico"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "paseo_de_la_constitucion": {
    "id": "paseo_de_la_constitucion",
    "nombre": "Paseo de La Constitución",
    "nombreOficial": "Paseo de La Constitución",
    "tipo": "fraccionamiento",
    "codigoPostal": "63010",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.518349904374936,
      "longitud": -104.89126294690506,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Paseo de la Constitución"
    },
    "alias": [
      "Paseo de La Constitución",
      "Fraccionamiento Paseo de La Constitución",
      "Fracc Paseo de La Constitución",
      "Paseo de La Constitución 63010",
      "Paseo de La Constitución CP 63010"
    ],
    "palabrasClave": [
      "paseo",
      "constitucion"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "paseo_del_valle_real": {
    "id": "paseo_del_valle_real",
    "nombre": "Paseo del Valle Real",
    "nombreOficial": "Paseo del Valle Real",
    "tipo": "fraccionamiento",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.462716155168742,
      "longitud": -104.86232075868647,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Paseo del Valle Real",
      "Fraccionamiento Paseo del Valle Real",
      "Fracc Paseo del Valle Real",
      "Paseo del Valle Real 63195",
      "Paseo del Valle Real CP 63195"
    ],
    "palabrasClave": [
      "paseo",
      "valle",
      "real"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "pedregal_de_san_juan": {
    "id": "pedregal_de_san_juan",
    "nombre": "Pedregal de San Juan",
    "nombreOficial": "Pedregal de San Juan",
    "tipo": "colonia",
    "codigoPostal": "63164",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.496956267774245,
      "longitud": -104.91784693329087,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Pedregal de San Juan"
    },
    "alias": [
      "Pedregal de San Juan",
      "Colonia Pedregal de San Juan",
      "Col Pedregal de San Juan",
      "Pedregal de San Juan 63164",
      "Pedregal de San Juan CP 63164",
      "Pedregal San Juan"
    ],
    "palabrasClave": [
      "pedregal",
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "penita": {
    "id": "penita",
    "nombre": "Peñita",
    "nombreOficial": "Peñita",
    "tipo": "colonia",
    "codigoPostal": "63167",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.492554059755353,
      "longitud": -104.89865596160428,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Peñita"
    },
    "alias": [
      "Peñita",
      "Colonia Peñita",
      "Col Peñita",
      "Peñita 63167",
      "Peñita CP 63167"
    ],
    "palabrasClave": [
      "penita"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "periodistas": {
    "id": "periodistas",
    "nombre": "Periodistas",
    "nombreOficial": "Periodistas",
    "tipo": "colonia",
    "codigoPostal": "63196",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.475116324349845,
      "longitud": -104.88626108300578,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Periodistas"
    },
    "alias": [
      "Periodistas",
      "Colonia Periodistas",
      "Col Periodistas",
      "Periodistas 63196",
      "Periodistas CP 63196"
    ],
    "palabrasClave": [
      "periodistas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "plan_de_ayala": {
    "id": "plan_de_ayala",
    "nombre": "Plan de Ayala",
    "nombreOficial": "Plan de Ayala",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.466375688898914,
      "longitud": -104.87693721400674,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Plan de Ayala",
      "Colonia Plan de Ayala",
      "Col Plan de Ayala",
      "Plan de Ayala 63197",
      "Plan de Ayala CP 63197"
    ],
    "palabrasClave": [
      "plan",
      "ayala"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "porta_alta": {
    "id": "porta_alta",
    "nombre": "Porta Alta",
    "nombreOficial": "Porta Alta",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.495011234785217,
      "longitud": -104.85194744751695,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Porta Alta"
    },
    "alias": [
      "Porta Alta",
      "Fraccionamiento Porta Alta",
      "Fracc Porta Alta",
      "Porta Alta 63173",
      "Porta Alta CP 63173"
    ],
    "palabrasClave": [
      "porta",
      "alta"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "prieto_crispin": {
    "id": "prieto_crispin",
    "nombre": "Prieto Crispín",
    "nombreOficial": "Prieto Crispín",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4792613,
      "longitud": -104.8703993,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Prieto Crispín",
      "Colonia Prieto Crispín",
      "Col Prieto Crispín",
      "Prieto Crispín 63174",
      "Prieto Crispín CP 63174"
    ],
    "palabrasClave": [
      "prieto",
      "crispin"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "primero_de_mayo": {
    "id": "primero_de_mayo",
    "nombre": "Primero de Mayo",
    "nombreOficial": "Primero de Mayo",
    "tipo": "colonia",
    "codigoPostal": "63069",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5299049,
      "longitud": -104.9222958,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Primero de Mayo",
      "Colonia Primero de Mayo",
      "Col Primero de Mayo",
      "Primero de Mayo 63069",
      "Primero de Mayo CP 63069",
      "1 de Mayo",
      "Primero Mayo"
    ],
    "palabrasClave": [
      "primero",
      "mayo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "puente_de_san_cayetano": {
    "id": "puente_de_san_cayetano",
    "nombre": "Puente de San Cayetano",
    "nombreOficial": "Puente de San Cayetano",
    "tipo": "colonia",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.46989961820942,
      "longitud": -104.8543539811257,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Puente de San Cayetano",
      "Colonia Puente de San Cayetano",
      "Col Puente de San Cayetano",
      "Puente de San Cayetano 63194",
      "Puente de San Cayetano CP 63194"
    ],
    "palabrasClave": [
      "puente",
      "san",
      "cayetano"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "puerta_de_la_laguna": {
    "id": "puerta_de_la_laguna",
    "nombre": "Puerta de La Laguna",
    "nombreOficial": "Puerta de La Laguna",
    "tipo": "colonia",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.517731490002472,
      "longitud": -104.87698122447618,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Puerta de la Laguna"
    },
    "alias": [
      "Puerta de La Laguna",
      "Colonia Puerta de La Laguna",
      "Col Puerta de La Laguna",
      "Puerta de La Laguna 63039",
      "Puerta de La Laguna CP 63039"
    ],
    "palabrasClave": [
      "puerta",
      "laguna"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "puerta_encanto": {
    "id": "puerta_encanto",
    "nombre": "Puerta Encanto",
    "nombreOficial": "Puerta Encanto",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48656650726913,
      "longitud": -104.8441383901154,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Puerta Encanto",
      "Fraccionamiento Puerta Encanto",
      "Fracc Puerta Encanto",
      "Puerta Encanto 63173",
      "Puerta Encanto CP 63173"
    ],
    "palabrasClave": [
      "puerta",
      "encanto"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "puerta_jardin": {
    "id": "puerta_jardin",
    "nombre": "Puerta Jardín",
    "nombreOficial": "Puerta Jardín",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494124812080823,
      "longitud": -104.84169019535327,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Puerta Jardín"
    },
    "alias": [
      "Puerta Jardín",
      "Fraccionamiento Puerta Jardín",
      "Fracc Puerta Jardín",
      "Puerta Jardín 63173",
      "Puerta Jardín CP 63173"
    ],
    "palabrasClave": [
      "puerta",
      "jardin"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "puerta_paraiso": {
    "id": "puerta_paraiso",
    "nombre": "Puerta Paraíso",
    "nombreOficial": "Puerta Paraíso",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.495128485579958,
      "longitud": -104.83360635769687,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Puerta Paraíso"
    },
    "alias": [
      "Puerta Paraíso",
      "Fraccionamiento Puerta Paraíso",
      "Fracc Puerta Paraíso",
      "Puerta Paraíso 63173",
      "Puerta Paraíso CP 63173"
    ],
    "palabrasClave": [
      "puerta",
      "paraiso"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "puesta_del_sol": {
    "id": "puesta_del_sol",
    "nombre": "Puesta del Sol",
    "nombreOficial": "Puesta del Sol",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48451162488018,
      "longitud": -104.83676361978726,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Puesta del Sol",
      "Fraccionamiento Puesta del Sol",
      "Fracc Puesta del Sol",
      "Puesta del Sol 63173",
      "Puesta del Sol CP 63173"
    ],
    "palabrasClave": [
      "puesta",
      "sol"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "quinta_los_lirios": {
    "id": "quinta_los_lirios",
    "nombre": "Quinta Los Lirios",
    "nombreOficial": "Quinta Los Lirios",
    "tipo": "fraccionamiento",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4835468,
      "longitud": -104.8644341,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Quinta Los Lirios",
      "Fraccionamiento Quinta Los Lirios",
      "Fracc Quinta Los Lirios",
      "Quinta Los Lirios 63175",
      "Quinta Los Lirios CP 63175"
    ],
    "palabrasClave": [
      "quinta",
      "lirios"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "rancho_las_cruces": {
    "id": "rancho_las_cruces",
    "nombre": "Rancho las Cruces",
    "nombreOficial": "Rancho las Cruces",
    "tipo": "fraccionamiento",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53499746411789,
      "longitud": -104.87687187046194,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Rancho Las Cruces"
    },
    "alias": [
      "Rancho las Cruces",
      "Fraccionamiento Rancho las Cruces",
      "Fracc Rancho las Cruces",
      "Rancho las Cruces 63038",
      "Rancho las Cruces CP 63038"
    ],
    "palabrasClave": [
      "rancho",
      "cruces"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "real_de_la_noria": {
    "id": "real_de_la_noria",
    "nombre": "Real de la Noria",
    "nombreOficial": "Real de la Noria",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49393209332918,
      "longitud": -104.86022234444393,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Real de la Noria"
    },
    "alias": [
      "Real de la Noria",
      "Fraccionamiento Real de la Noria",
      "Fracc Real de la Noria",
      "Real de la Noria 63173",
      "Real de la Noria CP 63173"
    ],
    "palabrasClave": [
      "real",
      "noria"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "real_de_lozada": {
    "id": "real_de_lozada",
    "nombre": "Real de Lozada",
    "nombreOficial": "Real de Lozada",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.494672135244194,
      "longitud": -104.8404730344587,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Real de Lozada",
      "Colonia Real de Lozada",
      "Col Real de Lozada",
      "Real de Lozada 63173",
      "Real de Lozada CP 63173"
    ],
    "palabrasClave": [
      "real",
      "lozada"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "real_montecarlo": {
    "id": "real_montecarlo",
    "nombre": "Real Montecarlo",
    "nombreOficial": "Real Montecarlo",
    "tipo": "fraccionamiento",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51317478778482,
      "longitud": -104.86651061957946,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Real Montecarlo"
    },
    "alias": [
      "Real Montecarlo",
      "Fraccionamiento Real Montecarlo",
      "Fracc Real Montecarlo",
      "Real Montecarlo 63039",
      "Real Montecarlo CP 63039"
    ],
    "palabrasClave": [
      "real",
      "montecarlo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "reforma": {
    "id": "reforma",
    "nombre": "Reforma",
    "nombreOficial": "Reforma",
    "tipo": "colonia",
    "codigoPostal": "63038",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.531995896994154,
      "longitud": -104.87867279986888,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Reforma",
      "Colonia Reforma",
      "Col Reforma",
      "Reforma 63038",
      "Reforma CP 63038"
    ],
    "palabrasClave": [
      "reforma"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "residencial_la_esmeralda": {
    "id": "residencial_la_esmeralda",
    "nombre": "Residencial La Esmeralda",
    "nombreOficial": "Residencial La Esmeralda",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.525790814250602,
      "longitud": -104.87823218107225,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Residencial La Esmeralda",
      "Fraccionamiento Residencial La Esmeralda",
      "Fracc Residencial La Esmeralda",
      "Residencial La Esmeralda 63037",
      "Residencial La Esmeralda CP 63037"
    ],
    "palabrasClave": [
      "residencial",
      "esmeralda"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "residencial_la_loma": {
    "id": "residencial_la_loma",
    "nombre": "Residencial La Loma",
    "nombreOficial": "Residencial La Loma",
    "tipo": "fraccionamiento",
    "codigoPostal": "63137",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.503963713790064,
      "longitud": -104.90462010833275,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Residencial La Loma",
      "Fraccionamiento Residencial La Loma",
      "Fracc Residencial La Loma",
      "Residencial La Loma 63137",
      "Residencial La Loma CP 63137"
    ],
    "palabrasClave": [
      "residencial",
      "loma"
    ],
    "grupoAmbiguedad": "la_loma",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "residencial_los_olivos": {
    "id": "residencial_los_olivos",
    "nombre": "Residencial los Olivos",
    "nombreOficial": "Residencial los Olivos",
    "tipo": "fraccionamiento",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.525782974725207,
      "longitud": -104.93297270202139,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Residencial los Olivos"
    },
    "alias": [
      "Residencial los Olivos",
      "Fraccionamiento Residencial los Olivos",
      "Fracc Residencial los Olivos",
      "Residencial los Olivos 63114",
      "Residencial los Olivos CP 63114"
    ],
    "palabrasClave": [
      "residencial",
      "olivos"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "responsabilidad_social_comunitaria": {
    "id": "responsabilidad_social_comunitaria",
    "nombre": "Responsabilidad Social Comunitaria",
    "nombreOficial": "Responsabilidad Social Comunitaria",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49275720781831,
      "longitud": -104.83594680849644,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Responsabilidad Social Comunitaria"
    },
    "alias": [
      "Responsabilidad Social Comunitaria",
      "Fraccionamiento Responsabilidad Social Comunitaria",
      "Fracc Responsabilidad Social Comunitaria",
      "Responsabilidad Social Comunitaria 63173",
      "Responsabilidad Social Comunitaria CP 63173"
    ],
    "palabrasClave": [
      "responsabilidad",
      "social",
      "comunitaria"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "revolucion": {
    "id": "revolucion",
    "nombre": "Revolución",
    "nombreOficial": "Revolución",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.488538838704798,
      "longitud": -104.82193820823036,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Revolución",
      "Fraccionamiento Revolución",
      "Fracc Revolución",
      "Revolución 63173",
      "Revolución CP 63173"
    ],
    "palabrasClave": [
      "revolucion"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "rey_nayar": {
    "id": "rey_nayar",
    "nombre": "Rey Nayar",
    "nombreOficial": "Rey Nayar",
    "tipo": "colonia",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.505530949063772,
      "longitud": -104.9194874481267,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Rey Nayar",
      "Colonia Rey Nayar",
      "Col Rey Nayar",
      "Rey Nayar 63129",
      "Rey Nayar CP 63129"
    ],
    "palabrasClave": [
      "rey",
      "nayar"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "rincon_de_san_juan": {
    "id": "rincon_de_san_juan",
    "nombre": "Rincón de San Juan",
    "nombreOficial": "Rincón de San Juan",
    "tipo": "colonia",
    "codigoPostal": "63138",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.502218389058914,
      "longitud": -104.91336655954443,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Rincón de San Juan",
      "Colonia Rincón de San Juan",
      "Col Rincón de San Juan",
      "Rincón de San Juan 63138",
      "Rincón de San Juan CP 63138",
      "Rincón San Juan",
      "Rincon San Juan"
    ],
    "palabrasClave": [
      "rincon",
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "rinconada_residencial": {
    "id": "rinconada_residencial",
    "nombre": "Rinconada Residencial",
    "nombreOficial": "Rinconada Residencial",
    "tipo": "fraccionamiento",
    "codigoPostal": "63062",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.523403790875054,
      "longitud": -104.91497536976699,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Rinconada Residencial",
      "Fraccionamiento Rinconada Residencial",
      "Fracc Rinconada Residencial",
      "Rinconada Residencial 63062",
      "Rinconada Residencial CP 63062"
    ],
    "palabrasClave": [
      "rinconada",
      "residencial"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "rivas_allende": {
    "id": "rivas_allende",
    "nombre": "Rivas Allende",
    "nombreOficial": "Rivas Allende",
    "tipo": "colonia",
    "codigoPostal": "63058",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.512532296968768,
      "longitud": -104.88313080280402,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Rivas Allende",
      "Colonia Rivas Allende",
      "Col Rivas Allende",
      "Rivas Allende 63058",
      "Rivas Allende CP 63058"
    ],
    "palabrasClave": [
      "rivas",
      "allende"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "riveras_de_la_laguna": {
    "id": "riveras_de_la_laguna",
    "nombre": "Riveras de La Laguna",
    "nombreOficial": "Riveras de La Laguna",
    "tipo": "fraccionamiento",
    "codigoPostal": "63039",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51695449038747,
      "longitud": -104.8708386333562,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Riveras de la Laguna"
    },
    "alias": [
      "Riveras de La Laguna",
      "Fraccionamiento Riveras de La Laguna",
      "Fracc Riveras de La Laguna",
      "Riveras de La Laguna 63039",
      "Riveras de La Laguna CP 63039"
    ],
    "palabrasClave": [
      "riveras",
      "laguna"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "rodeo_de_la_punta": {
    "id": "rodeo_de_la_punta",
    "nombre": "Rodeo de La Punta",
    "nombreOficial": "Rodeo de La Punta",
    "tipo": "fraccionamiento",
    "codigoPostal": "63110",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.519558968051314,
      "longitud": -104.9251612493746,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Rodeo de La Punta",
      "Fraccionamiento Rodeo de La Punta",
      "Fracc Rodeo de La Punta",
      "Rodeo de La Punta 63110",
      "Rodeo de La Punta CP 63110"
    ],
    "palabrasClave": [
      "rodeo",
      "punta"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "ruinas_de_jauja": {
    "id": "ruinas_de_jauja",
    "nombre": "Ruinas de Jauja",
    "nombreOficial": "Ruinas de Jauja",
    "tipo": "colonia",
    "codigoPostal": "63083",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526739527215007,
      "longitud": -104.89150000563639,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Ruinas de Jauja"
    },
    "alias": [
      "Ruinas de Jauja",
      "Colonia Ruinas de Jauja",
      "Col Ruinas de Jauja",
      "Ruinas de Jauja 63083",
      "Ruinas de Jauja CP 63083"
    ],
    "palabrasClave": [
      "ruinas",
      "jauja"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "sacristan": {
    "id": "sacristan",
    "nombre": "Sacristán",
    "nombreOficial": "Sacristán",
    "tipo": "colonia",
    "codigoPostal": "63010",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.520454484746505,
      "longitud": -104.89234645930529,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Sacristán"
    },
    "alias": [
      "Sacristán",
      "Colonia Sacristán",
      "Col Sacristán",
      "Sacristán 63010",
      "Sacristán CP 63010"
    ],
    "palabrasClave": [
      "sacristan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "san_angel": {
    "id": "san_angel",
    "nombre": "San Ángel",
    "nombreOficial": "San Ángel",
    "tipo": "fraccionamiento",
    "codigoPostal": "63120",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5163729,
      "longitud": -104.9133196,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San Ángel",
      "Fraccionamiento San Ángel",
      "Fracc San Ángel",
      "San Ángel 63120",
      "San Ángel CP 63120"
    ],
    "palabrasClave": [
      "san",
      "angel"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "san_antonio": {
    "id": "san_antonio",
    "nombre": "San Antonio",
    "nombreOficial": "San Antonio",
    "tipo": "colonia",
    "codigoPostal": "63159",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.501317751012532,
      "longitud": -104.89381632478442,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San Antonio",
      "Colonia San Antonio",
      "Col San Antonio",
      "San Antonio 63159",
      "San Antonio CP 63159"
    ],
    "palabrasClave": [
      "san",
      "antonio"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "san_jose": {
    "id": "san_jose",
    "nombre": "San José",
    "nombreOficial": "San José",
    "tipo": "colonia",
    "codigoPostal": "63030",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52161373755133,
      "longitud": -104.88787311216846,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San José",
      "Colonia San José",
      "Col San José",
      "San José 63030",
      "San José CP 63030"
    ],
    "palabrasClave": [
      "san",
      "jose"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "san_juan": {
    "id": "san_juan",
    "nombre": "San Juan",
    "nombreOficial": "San Juan",
    "tipo": "colonia",
    "codigoPostal": "63130",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50954780675665,
      "longitud": -104.90763138487331,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San Juan",
      "Colonia San Juan",
      "Col San Juan",
      "San Juan 63130",
      "San Juan CP 63130"
    ],
    "palabrasClave": [
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "san_juanito": {
    "id": "san_juanito",
    "nombre": "San Juanito",
    "nombreOficial": "San Juanito",
    "tipo": "colonia",
    "codigoPostal": "63059",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51342106187347,
      "longitud": -104.86856037550825,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San Juanito",
      "Colonia San Juanito",
      "Col San Juanito",
      "San Juanito 63059",
      "San Juanito CP 63059"
    ],
    "palabrasClave": [
      "san",
      "juanito"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "san_martin": {
    "id": "san_martin",
    "nombre": "San Martín",
    "nombreOficial": "San Martín",
    "tipo": "fraccionamiento",
    "codigoPostal": "63186",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.480011599999997,
      "longitud": -104.893444,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "San Martín",
      "Fraccionamiento San Martín",
      "Fracc San Martín",
      "San Martín 63186",
      "San Martín CP 63186"
    ],
    "palabrasClave": [
      "san",
      "martin"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "sanchez_ibarra": {
    "id": "sanchez_ibarra",
    "nombre": "Sánchez Ibarra",
    "nombreOficial": "Sánchez Ibarra",
    "tipo": "fraccionamiento",
    "codigoPostal": "63058",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.513407025360486,
      "longitud": -104.88565761829608,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Doctor Sánchez Ibarra"
    },
    "alias": [
      "Sánchez Ibarra",
      "Fraccionamiento Sánchez Ibarra",
      "Fracc Sánchez Ibarra",
      "Sánchez Ibarra 63058",
      "Sánchez Ibarra CP 63058"
    ],
    "palabrasClave": [
      "sanchez",
      "ibarra"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "sandino": {
    "id": "sandino",
    "nombre": "Sandino",
    "nombreOficial": "Sandino",
    "tipo": "colonia",
    "codigoPostal": "63058",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.510502504707397,
      "longitud": -104.88367643576079,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Sandino",
      "Colonia Sandino",
      "Col Sandino",
      "Sandino 63058",
      "Sandino CP 63058"
    ],
    "palabrasClave": [
      "sandino"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "santa_cecilia": {
    "id": "santa_cecilia",
    "nombre": "Santa Cecilia",
    "nombreOficial": "Santa Cecilia",
    "tipo": "colonia",
    "codigoPostal": "63089",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.530023994117872,
      "longitud": -104.89650120122444,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Santa Cecilia",
      "Colonia Santa Cecilia",
      "Col Santa Cecilia",
      "Santa Cecilia 63089",
      "Santa Cecilia CP 63089"
    ],
    "palabrasClave": [
      "santa",
      "cecilia"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "santa_fe": {
    "id": "santa_fe",
    "nombre": "Santa Fe",
    "nombreOficial": "Santa Fe",
    "tipo": "colonia",
    "codigoPostal": "63088",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5372768,
      "longitud": -104.8952687,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Santa Fe",
      "Colonia Santa Fe",
      "Col Santa Fe",
      "Santa Fe 63088",
      "Santa Fe CP 63088"
    ],
    "palabrasClave": [
      "santa"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "santa_teresita": {
    "id": "santa_teresita",
    "nombre": "Santa Teresita",
    "nombreOficial": "Santa Teresita",
    "tipo": "colonia",
    "codigoPostal": "63020",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.523723878522574,
      "longitud": -104.89981046369124,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Santa Teresita",
      "Colonia Santa Teresita",
      "Col Santa Teresita",
      "Santa Teresita 63020",
      "Santa Teresita CP 63020"
    ],
    "palabrasClave": [
      "santa",
      "teresita"
    ],
    "grupoAmbiguedad": "santa_teresita",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "senderos_del_monte": {
    "id": "senderos_del_monte",
    "nombre": "Senderos del Monte",
    "nombreOficial": "Senderos del Monte",
    "tipo": "fraccionamiento",
    "codigoPostal": "63023",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53625397655864,
      "longitud": -104.90103121913326,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Senderos del Monte"
    },
    "alias": [
      "Senderos del Monte",
      "Fraccionamiento Senderos del Monte",
      "Fracc Senderos del Monte",
      "Senderos del Monte 63023",
      "Senderos del Monte CP 63023"
    ],
    "palabrasClave": [
      "senderos",
      "monte"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "severiano_ocegueda": {
    "id": "severiano_ocegueda",
    "nombre": "Severiano Ocegueda",
    "nombreOficial": "Severiano Ocegueda",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4772066167296,
      "longitud": -104.85149592161179,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Severiano Ocegueda",
      "Colonia Severiano Ocegueda",
      "Col Severiano Ocegueda",
      "Severiano Ocegueda 63195",
      "Severiano Ocegueda CP 63195"
    ],
    "palabrasClave": [
      "severiano",
      "ocegueda"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "simancas": {
    "id": "simancas",
    "nombre": "Simancas",
    "nombreOficial": "Simancas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5018797954511,
      "longitud": -104.88210479214368,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Simancas"
    },
    "alias": [
      "Simancas",
      "Fraccionamiento Simancas",
      "Fracc Simancas",
      "Simancas 63177",
      "Simancas CP 63177"
    ],
    "palabrasClave": [
      "simancas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "sindicalistas": {
    "id": "sindicalistas",
    "nombre": "Sindicalistas",
    "nombreOficial": "Sindicalistas",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.524034200142832,
      "longitud": -104.88008848570516,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Sindicalistas"
    },
    "alias": [
      "Sindicalistas",
      "Fraccionamiento Sindicalistas",
      "Fracc Sindicalistas",
      "Sindicalistas 63037",
      "Sindicalistas CP 63037"
    ],
    "palabrasClave": [
      "sindicalistas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "solidaridad_infonavit": {
    "id": "solidaridad_infonavit",
    "nombre": "Solidaridad INFONAVIT",
    "nombreOficial": "Solidaridad INFONAVIT",
    "tipo": "unidad_habitacional",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5217969,
      "longitud": -104.9356,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Solidaridad INFONAVIT",
      "Unidad Habitacional Solidaridad INFONAVIT",
      "UH Solidaridad INFONAVIT",
      "INFONAVIT Solidaridad",
      "Infonavit Solidaridad",
      "Solidaridad",
      "Solidaridad INFONAVIT 63114",
      "Solidaridad INFONAVIT CP 63114"
    ],
    "palabrasClave": [
      "solidaridad",
      "infonavit"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "solidaridad_primavera": {
    "id": "solidaridad_primavera",
    "nombre": "Solidaridad Primavera",
    "nombreOficial": "Solidaridad Primavera",
    "tipo": "colonia",
    "codigoPostal": "63114",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52431261544407,
      "longitud": -104.93046920675118,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Solidaridad Primavera"
    },
    "alias": [
      "Solidaridad Primavera",
      "Colonia Solidaridad Primavera",
      "Col Solidaridad Primavera",
      "Solidaridad Primavera 63114",
      "Solidaridad Primavera CP 63114"
    ],
    "palabrasClave": [
      "solidaridad",
      "primavera"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "spauan": {
    "id": "spauan",
    "nombre": "SPAUAN",
    "nombreOficial": "SPAUAN",
    "tipo": "fraccionamiento",
    "codigoPostal": "63115",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5131492,
      "longitud": -104.9147944,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "SPAUAN",
      "Fraccionamiento SPAUAN",
      "Fracc SPAUAN",
      "SPAUAN 63115",
      "SPAUAN CP 63115"
    ],
    "palabrasClave": [
      "spauan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "sutsem_21_de_mayo": {
    "id": "sutsem_21_de_mayo",
    "nombre": "SUTSEM 21 de Mayo",
    "nombreOficial": "SUTSEM 21 de Mayo",
    "tipo": "colonia",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49009954449309,
      "longitud": -104.852328243036,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Sutsem 21 de Mayo"
    },
    "alias": [
      "SUTSEM 21 de Mayo",
      "Colonia SUTSEM 21 de Mayo",
      "Col SUTSEM 21 de Mayo",
      "SUTSEM 21 de Mayo 63173",
      "SUTSEM 21 de Mayo CP 63173",
      "SUTSEM Veintiuno de Mayo",
      "SUTSEM 21 Mayo",
      "21 de Mayo SUTSEM"
    ],
    "palabrasClave": [
      "sutsem",
      "mayo"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "tepic_centro": {
    "id": "tepic_centro",
    "nombre": "Tepic Centro",
    "nombreOficial": "Tepic Centro",
    "tipo": "colonia",
    "codigoPostal": "63000",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51043411892842,
      "longitud": -104.89224137779881,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Tepic Centro",
      "Colonia Tepic Centro",
      "Col Tepic Centro",
      "Tepic Centro 63000",
      "Tepic Centro CP 63000",
      "Centro",
      "Centro de Tepic",
      "Zona Centro",
      "El Centro"
    ],
    "palabrasClave": [
      "tepic",
      "centro"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "tierra_y_libertad": {
    "id": "tierra_y_libertad",
    "nombre": "Tierra y Libertad",
    "nombreOficial": "Tierra y Libertad",
    "tipo": "colonia",
    "codigoPostal": "63178",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.506718358666085,
      "longitud": -104.88054217053076,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Tierra y Libertad",
      "Colonia Tierra y Libertad",
      "Col Tierra y Libertad",
      "Tierra y Libertad 63178",
      "Tierra y Libertad CP 63178"
    ],
    "palabrasClave": [
      "tierra",
      "libertad"
    ],
    "grupoAmbiguedad": "tierra_y_libertad",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "tio_baltazar": {
    "id": "tio_baltazar",
    "nombre": "Tío Baltazar",
    "nombreOficial": "Tío Baltazar",
    "tipo": "fraccionamiento",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50839040499176,
      "longitud": -104.91170368689812,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Tío Baltazar"
    },
    "alias": [
      "Tío Baltazar",
      "Fraccionamiento Tío Baltazar",
      "Fracc Tío Baltazar",
      "Tío Baltazar 63129",
      "Tío Baltazar CP 63129"
    ],
    "palabrasClave": [
      "tio",
      "baltazar"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "tulipanes": {
    "id": "tulipanes",
    "nombre": "Tulipanes",
    "nombreOficial": "Tulipanes",
    "tipo": "fraccionamiento",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.529663499999998,
      "longitud": -104.8713092,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Tulipanes",
      "Fraccionamiento Tulipanes",
      "Fracc Tulipanes",
      "Tulipanes 63035",
      "Tulipanes CP 63035"
    ],
    "palabrasClave": [
      "tulipanes"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "unidad_deportiva_santa_teresita": {
    "id": "unidad_deportiva_santa_teresita",
    "nombre": "Unidad Deportiva Santa Teresita",
    "nombreOficial": "Unidad Deportiva Santa Teresita",
    "tipo": "colonia",
    "codigoPostal": "63020",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52686891533514,
      "longitud": -104.89738484495763,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Unidad Deportiva Santa Teresita"
    },
    "alias": [
      "Unidad Deportiva Santa Teresita",
      "Colonia Unidad Deportiva Santa Teresita",
      "Col Unidad Deportiva Santa Teresita",
      "Unidad Deportiva Santa Teresita 63020",
      "Unidad Deportiva Santa Teresita CP 63020"
    ],
    "palabrasClave": [
      "unidad",
      "deportiva",
      "santa",
      "teresita"
    ],
    "grupoAmbiguedad": "santa_teresita",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "unidad_obrera": {
    "id": "unidad_obrera",
    "nombre": "Unidad Obrera",
    "nombreOficial": "Unidad Obrera",
    "tipo": "colonia",
    "codigoPostal": "63069",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52929349435482,
      "longitud": -104.91976969513286,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Unidad Obrera"
    },
    "alias": [
      "Unidad Obrera",
      "Colonia Unidad Obrera",
      "Col Unidad Obrera",
      "Unidad Obrera 63069",
      "Unidad Obrera CP 63069"
    ],
    "palabrasClave": [
      "unidad",
      "obrera"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "unidos_por_tu_tranquilidad": {
    "id": "unidos_por_tu_tranquilidad",
    "nombre": "Unidos por tu Tranquilidad",
    "nombreOficial": "Unidos por tu Tranquilidad",
    "tipo": "fraccionamiento",
    "codigoPostal": "63172",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.495429491965744,
      "longitud": -104.81084517196325,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Unidos por Tu Tranquilidad"
    },
    "alias": [
      "Unidos por tu Tranquilidad",
      "Fraccionamiento Unidos por tu Tranquilidad",
      "Fracc Unidos por tu Tranquilidad",
      "Unidos por tu Tranquilidad 63172",
      "Unidos por tu Tranquilidad CP 63172"
    ],
    "palabrasClave": [
      "unidos",
      "por",
      "tranquilidad"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "union_popular": {
    "id": "union_popular",
    "nombre": "Unión Popular",
    "nombreOficial": "Unión Popular",
    "tipo": "colonia",
    "codigoPostal": "63197",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4677518,
      "longitud": -104.8762929,
      "referencia": "resultado_cartografico_por_nombre",
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Unión Popular",
      "Colonia Unión Popular",
      "Col Unión Popular",
      "Unión Popular 63197",
      "Unión Popular CP 63197"
    ],
    "palabrasClave": [
      "union",
      "popular"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "valle_de_la_cruz": {
    "id": "valle_de_la_cruz",
    "nombre": "Valle de La Cruz",
    "nombreOficial": "Valle de La Cruz",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.533072107058725,
      "longitud": -104.86742047625856,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle de La Cruz",
      "Colonia Valle de La Cruz",
      "Col Valle de La Cruz",
      "Valle de La Cruz 63035",
      "Valle de La Cruz CP 63035"
    ],
    "palabrasClave": [
      "valle",
      "cruz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_de_matatipac": {
    "id": "valle_de_matatipac",
    "nombre": "Valle de Matatipac",
    "nombreOficial": "Valle de Matatipac",
    "tipo": "colonia",
    "codigoPostal": "63195",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.473727653753553,
      "longitud": -104.86832550673317,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle de Matatipac",
      "Valles de Matatipac",
      "Colonia Valle de Matatipac",
      "Col Valle de Matatipac",
      "Valle de Matatipac 63195",
      "Valle de Matatipac CP 63195"
    ],
    "palabrasClave": [
      "valle",
      "matatipac"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_de_nayarit": {
    "id": "valle_de_nayarit",
    "nombre": "Valle de Nayarit",
    "nombreOficial": "Valle de Nayarit",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.47854072239635,
      "longitud": -104.90863666114467,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle de Nayarit",
      "Colonia Valle de Nayarit",
      "Col Valle de Nayarit",
      "Valle de Nayarit 63180",
      "Valle de Nayarit CP 63180"
    ],
    "palabrasClave": [
      "valle",
      "nayarit"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_de_zaragoza": {
    "id": "valle_de_zaragoza",
    "nombre": "Valle de Zaragoza",
    "nombreOficial": "Valle de Zaragoza",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.53431806820959,
      "longitud": -104.86802377593462,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle de Zaragoza",
      "Colonia Valle de Zaragoza",
      "Col Valle de Zaragoza",
      "Valle de Zaragoza 63035",
      "Valle de Zaragoza CP 63035"
    ],
    "palabrasClave": [
      "valle",
      "zaragoza"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_del_country": {
    "id": "valle_del_country",
    "nombre": "Valle del Country",
    "nombreOficial": "Valle del Country",
    "tipo": "colonia",
    "codigoPostal": "63175",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48417806346254,
      "longitud": -104.86358131304719,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle del Country",
      "Colonia Valle del Country",
      "Col Valle del Country",
      "Valle del Country 63175",
      "Valle del Country CP 63175"
    ],
    "palabrasClave": [
      "valle",
      "country"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_dorado": {
    "id": "valle_dorado",
    "nombre": "Valle Dorado",
    "nombreOficial": "Valle Dorado",
    "tipo": "colonia",
    "codigoPostal": "63180",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48469049998398,
      "longitud": -104.90350032338661,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle Dorado",
      "Colonia Valle Dorado",
      "Col Valle Dorado",
      "Valle Dorado 63180",
      "Valle Dorado CP 63180"
    ],
    "palabrasClave": [
      "valle",
      "dorado"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_magno": {
    "id": "valle_magno",
    "nombre": "Valle Magno",
    "nombreOficial": "Valle Magno",
    "tipo": "fraccionamiento",
    "codigoPostal": "63194",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4601395162676,
      "longitud": -104.8537609655313,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Valle Magno"
    },
    "alias": [
      "Valle Magno",
      "Fraccionamiento Valle Magno",
      "Fracc Valle Magno",
      "Valle Magno 63194",
      "Valle Magno CP 63194"
    ],
    "palabrasClave": [
      "valle",
      "magno"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "valle_verde_conalep": {
    "id": "valle_verde_conalep",
    "nombre": "Valle Verde Conalep",
    "nombreOficial": "Valle Verde Conalep",
    "tipo": "colonia",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.525695176614278,
      "longitud": -104.87599871949843,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Valle Verde Conalep",
      "Colonia Valle Verde Conalep",
      "Col Valle Verde Conalep",
      "Valle Verde Conalep 63037",
      "Valle Verde Conalep CP 63037",
      "Valle Verde",
      "Valle Verde CONALEP",
      "Valle Verde del Conalep"
    ],
    "palabrasClave": [
      "valle",
      "verde",
      "conalep"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "valle_verde_de_matatipac": {
    "id": "valle_verde_de_matatipac",
    "nombre": "Valle Verde de Matatipac",
    "nombreOficial": "Valle Verde de Matatipac",
    "tipo": "colonia",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5307119398551,
      "longitud": -104.86904078893252,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Valle Verde de Matatipac Sección 1"
    },
    "alias": [
      "Valle Verde de Matatipac",
      "Colonia Valle Verde de Matatipac",
      "Col Valle Verde de Matatipac",
      "Valle Verde de Matatipac 63035",
      "Valle Verde de Matatipac CP 63035",
      "Valle Verde Matatipac"
    ],
    "palabrasClave": [
      "valle",
      "verde",
      "matatipac"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "venceremos": {
    "id": "venceremos",
    "nombre": "Venceremos",
    "nombreOficial": "Venceremos",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.508542139714702,
      "longitud": -104.8739979768291,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Venceremos",
      "Colonia Venceremos",
      "Col Venceremos",
      "Venceremos 63174",
      "Venceremos CP 63174"
    ],
    "palabrasClave": [
      "venceremos"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "versalles": {
    "id": "versalles",
    "nombre": "Versalles",
    "nombreOficial": "Versalles",
    "tipo": "fraccionamiento",
    "codigoPostal": "63139",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.506984179979288,
      "longitud": -104.90509450435638,
      "fuente": "directorio_postal",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Versalles",
      "Fraccionamiento Versalles",
      "Fracc Versalles",
      "Versalles 63139",
      "Versalles CP 63139"
    ],
    "palabrasClave": [
      "versalles"
    ],
    "grupoAmbiguedad": "versalles",
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "versalles_sur": {
    "id": "versalles_sur",
    "nombre": "Versalles Sur",
    "nombreOficial": "Versalles Sur",
    "tipo": "fraccionamiento",
    "codigoPostal": "63138",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.504983609737376,
      "longitud": -104.91062186466269,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Versalles Sur",
      "Fraccionamiento Versalles Sur",
      "Fracc Versalles Sur",
      "Versalles Sur 63138",
      "Versalles Sur CP 63138"
    ],
    "palabrasClave": [
      "versalles",
      "sur"
    ],
    "grupoAmbiguedad": "versalles",
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villa_las_rosas": {
    "id": "villa_las_rosas",
    "nombre": "Villa las Rosas",
    "nombreOficial": "Villa las Rosas",
    "tipo": "colonia",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.508754830189698,
      "longitud": -104.8781441589492,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villa Las Rosas"
    },
    "alias": [
      "Villa las Rosas",
      "Colonia Villa las Rosas",
      "Col Villa las Rosas",
      "Villa las Rosas 63177",
      "Villa las Rosas CP 63177"
    ],
    "palabrasClave": [
      "villa",
      "rosas"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villa_san_angel": {
    "id": "villa_san_angel",
    "nombre": "Villa San Ángel",
    "nombreOficial": "Villa San Ángel",
    "tipo": "colonia",
    "codigoPostal": "63120",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5132831,
      "longitud": -104.90931959999999,
      "fuente": "google_maps_search",
      "precision": "centro_aproximado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villa San Ángel",
      "Colonia Villa San Ángel",
      "Col Villa San Ángel",
      "Villa San Ángel 63120",
      "Villa San Ángel CP 63120"
    ],
    "palabrasClave": [
      "villa",
      "san",
      "angel"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_arana": {
    "id": "villas_arana",
    "nombre": "Villas Arana",
    "nombreOficial": "Villas Arana",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526528932843085,
      "longitud": -104.86951563338644,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas Arana"
    },
    "alias": [
      "Villas Arana",
      "Fraccionamiento Villas Arana",
      "Fracc Villas Arana",
      "Villas Arana 63037",
      "Villas Arana CP 63037"
    ],
    "palabrasClave": [
      "villas",
      "arana"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_de_aztlan": {
    "id": "villas_de_aztlan",
    "nombre": "Villas de Aztlan",
    "nombreOficial": "Villas de Aztlan",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.5248680142332,
      "longitud": -104.86881353815507,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Social Progresivo Villas de Aztlán"
    },
    "alias": [
      "Villas de Aztlan",
      "Fraccionamiento Villas de Aztlan",
      "Fracc Villas de Aztlan",
      "Villas de Aztlan 63037",
      "Villas de Aztlan CP 63037",
      "Villas de Aztlán",
      "Villas Aztlán",
      "Villas Aztlan"
    ],
    "palabrasClave": [
      "villas",
      "aztlan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_de_la_cantera": {
    "id": "villas_de_la_cantera",
    "nombre": "Villas de La Cantera",
    "nombreOficial": "Villas de La Cantera",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.489341837128023,
      "longitud": -104.84047709752696,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villas de La Cantera",
      "Fraccionamiento Villas de La Cantera",
      "Fracc Villas de La Cantera",
      "Villas de La Cantera 63173",
      "Villas de La Cantera CP 63173"
    ],
    "palabrasClave": [
      "villas",
      "cantera"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villas_de_la_cruz": {
    "id": "villas_de_la_cruz",
    "nombre": "Villas de la Cruz",
    "nombreOficial": "Villas de la Cruz",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52327442067352,
      "longitud": -104.87697358930296,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas de la Cruz"
    },
    "alias": [
      "Villas de la Cruz",
      "Fraccionamiento Villas de la Cruz",
      "Fracc Villas de la Cruz",
      "Villas de la Cruz 63037",
      "Villas de la Cruz CP 63037"
    ],
    "palabrasClave": [
      "villas",
      "cruz"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_de_la_laguna": {
    "id": "villas_de_la_laguna",
    "nombre": "Villas de la Laguna",
    "nombreOficial": "Villas de la Laguna",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.52313115521472,
      "longitud": -104.87032906820838,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas de la Laguna"
    },
    "alias": [
      "Villas de la Laguna",
      "Fraccionamiento Villas de la Laguna",
      "Fracc Villas de la Laguna",
      "Villas de la Laguna 63037",
      "Villas de la Laguna CP 63037"
    ],
    "palabrasClave": [
      "villas",
      "laguna"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_de_la_paz": {
    "id": "villas_de_la_paz",
    "nombre": "Villas de La Paz",
    "nombreOficial": "Villas de La Paz",
    "tipo": "fraccionamiento",
    "codigoPostal": "63190",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.48169176835435,
      "longitud": -104.8904018305404,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villas de La Paz",
      "Fraccionamiento Villas de La Paz",
      "Fracc Villas de La Paz",
      "Villas de La Paz 63190",
      "Villas de La Paz CP 63190"
    ],
    "palabrasClave": [
      "villas",
      "paz"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villas_de_matatipac": {
    "id": "villas_de_matatipac",
    "nombre": "Villas de Matatipac",
    "nombreOficial": "Villas de Matatipac",
    "tipo": "colonia",
    "codigoPostal": "63059",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.51438360997122,
      "longitud": -104.87891122390442,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas de Matatipac"
    },
    "alias": [
      "Villas de Matatipac",
      "Colonia Villas de Matatipac",
      "Col Villas de Matatipac",
      "Villas de Matatipac 63059",
      "Villas de Matatipac CP 63059"
    ],
    "palabrasClave": [
      "villas",
      "matatipac"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_de_san_juan": {
    "id": "villas_de_san_juan",
    "nombre": "Villas de San Juan",
    "nombreOficial": "Villas de San Juan",
    "tipo": "fraccionamiento",
    "codigoPostal": "63129",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50301555798608,
      "longitud": -104.91894276364866,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villas de San Juan",
      "Fraccionamiento Villas de San Juan",
      "Fracc Villas de San Juan",
      "Villas de San Juan 63129",
      "Villas de San Juan CP 63129",
      "Villas San Juan"
    ],
    "palabrasClave": [
      "villas",
      "san",
      "juan"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villas_de_zapopan": {
    "id": "villas_de_zapopan",
    "nombre": "Villas de Zapopan",
    "nombreOficial": "Villas de Zapopan",
    "tipo": "fraccionamiento",
    "codigoPostal": "63037",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.526485340322008,
      "longitud": -104.87602997183679,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas de Zapopan"
    },
    "alias": [
      "Villas de Zapopan",
      "Fraccionamiento Villas de Zapopan",
      "Fracc Villas de Zapopan",
      "Villas de Zapopan 63037",
      "Villas de Zapopan CP 63037"
    ],
    "palabrasClave": [
      "villas",
      "zapopan"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_del_molino": {
    "id": "villas_del_molino",
    "nombre": "Villas del Molino",
    "nombreOficial": "Villas del Molino",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.488578339027256,
      "longitud": -104.84518549649354,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villas del Molino",
      "Fraccionamiento Villas del Molino",
      "Fracc Villas del Molino",
      "Villas del Molino 63173",
      "Villas del Molino CP 63173"
    ],
    "palabrasClave": [
      "villas",
      "molino"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villas_del_nayar": {
    "id": "villas_del_nayar",
    "nombre": "Villas del Nayar",
    "nombreOficial": "Villas del Nayar",
    "tipo": "fraccionamiento",
    "codigoPostal": "63177",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49559963548577,
      "longitud": -104.87671143702345,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas del Nayar"
    },
    "alias": [
      "Villas del Nayar",
      "Fraccionamiento Villas del Nayar",
      "Fracc Villas del Nayar",
      "Villas del Nayar 63177",
      "Villas del Nayar CP 63177"
    ],
    "palabrasClave": [
      "villas",
      "nayar"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_del_paraiso": {
    "id": "villas_del_paraiso",
    "nombre": "Villas del Paraíso",
    "nombreOficial": "Villas del Paraíso",
    "tipo": "fraccionamiento",
    "codigoPostal": "63035",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.54101092943648,
      "longitud": -104.86418901185331,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas del Paraíso"
    },
    "alias": [
      "Villas del Paraíso",
      "Fraccionamiento Villas del Paraíso",
      "Fracc Villas del Paraíso",
      "Villas del Paraíso 63035",
      "Villas del Paraíso CP 63035",
      "Villas Paraíso"
    ],
    "palabrasClave": [
      "villas",
      "paraiso"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_del_parque": {
    "id": "villas_del_parque",
    "nombre": "Villas del Parque",
    "nombreOficial": "Villas del Parque",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.4911759003916,
      "longitud": -104.85532862707649,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Villas del Parque",
      "Fraccionamiento Villas del Parque",
      "Fracc Villas del Parque",
      "Villas del Parque 63173",
      "Villas del Parque CP 63173"
    ],
    "palabrasClave": [
      "villas",
      "parque"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "villas_del_prado": {
    "id": "villas_del_prado",
    "nombre": "Villas del Prado",
    "nombreOficial": "Villas del Prado",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49282268287497,
      "longitud": -104.81660579148136,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas del Prado"
    },
    "alias": [
      "Villas del Prado",
      "Fraccionamiento Villas del Prado",
      "Fracc Villas del Prado",
      "Villas del Prado 63173",
      "Villas del Prado CP 63173"
    ],
    "palabrasClave": [
      "villas",
      "prado"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "villas_del_roble": {
    "id": "villas_del_roble",
    "nombre": "Villas del Roble",
    "nombreOficial": "Villas del Roble",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49327581759747,
      "longitud": -104.82166737760318,
      "fuente": "inegi_dcah_2025",
      "precision": "centroide_asentamiento",
      "confianza": "alta",
      "verificada": true,
      "nombreFuente": "Villas del Roble"
    },
    "alias": [
      "Villas del Roble",
      "Fraccionamiento Villas del Roble",
      "Fracc Villas del Roble",
      "Villas del Roble 63173",
      "Villas del Roble CP 63173"
    ],
    "palabrasClave": [
      "villas",
      "roble"
    ],
    "grupoAmbiguedad": null,
    "origen": "catalogo_urbano_agregado",
    "activa": true
  },
  "vistas_de_la_cantera": {
    "id": "vistas_de_la_cantera",
    "nombre": "Vistas de La Cantera",
    "nombreOficial": "Vistas de La Cantera",
    "tipo": "fraccionamiento",
    "codigoPostal": "63173",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.49149344976705,
      "longitud": -104.82998260825234,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Vistas de La Cantera",
      "Fraccionamiento Vistas de La Cantera",
      "Fracc Vistas de La Cantera",
      "Vistas de La Cantera 63173",
      "Vistas de La Cantera CP 63173"
    ],
    "palabrasClave": [
      "vistas",
      "cantera"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  },
  "zitacua": {
    "id": "zitacua",
    "nombre": "Zitácua",
    "nombreOficial": "Zitácua",
    "tipo": "colonia",
    "codigoPostal": "63174",
    "municipio": "Tepic",
    "ciudad": "Tepic",
    "zona": "urbana",
    "coordenadas": {
      "latitud": 21.50523744811259,
      "longitud": -104.8698264860915,
      "fuente": "usuario_verificada",
      "precision": "punto_referencia_verificado",
      "confianza": "alta",
      "verificada": true
    },
    "alias": [
      "Zitácua",
      "Colonia Zitácua",
      "Col Zitácua",
      "Zitácua 63174",
      "Zitácua CP 63174",
      "Zitacua"
    ],
    "palabrasClave": [
      "zitacua"
    ],
    "grupoAmbiguedad": null,
    "origen": "archivo_verificado_enriquecido",
    "activa": true
  }
});

const GRUPOS_AMBIGUEDAD = Object.freeze({
  "amado_nervo": {
    "id": "amado_nervo",
    "aliasRaiz": "Amado Nervo",
    "colonias": [
      "amado_nervo_colonia_63010",
      "amado_nervo_fraccionamiento_63010"
    ],
    "pregunta": "¿A cuál Amado Nervo te refieres?"
  },
  "ciudad_industrial": {
    "id": "ciudad_industrial",
    "aliasRaiz": "Ciudad Industrial",
    "colonias": [
      "ciudad_industrial",
      "ciudad_industrial_microindustria"
    ],
    "pregunta": "¿A cuál Ciudad Industrial te refieres?"
  },
  "el_paraiso": {
    "id": "el_paraiso",
    "aliasRaiz": "El Paraíso",
    "colonias": [
      "ampliacion_el_paraiso",
      "el_paraiso"
    ],
    "pregunta": "¿A cuál El Paraíso te refieres?"
  },
  "el_tecolote": {
    "id": "el_tecolote",
    "aliasRaiz": "El Tecolote",
    "colonias": [
      "el_tecolote",
      "el_tecolote_infonavit"
    ],
    "pregunta": "¿A cuál El Tecolote te refieres?"
  },
  "esteban_baca_calderon": {
    "id": "esteban_baca_calderon",
    "aliasRaiz": "Esteban Baca Calderón",
    "colonias": [
      "esteban_baca_calderon_fraccionamiento_63173",
      "esteban_baca_calderon_unidad_habitacional_63000"
    ],
    "pregunta": "¿A cuál Esteban Baca Calderón te refieres?"
  },
  "fovissste": {
    "id": "fovissste",
    "aliasRaiz": "FOVISSSTE",
    "colonias": [
      "fovissste_1a_etapa",
      "fovissste_2a_etapa"
    ],
    "pregunta": "¿A cuál FOVISSSTE te refieres?"
  },
  "imss": {
    "id": "imss",
    "aliasRaiz": "IMSS",
    "colonias": [
      "imss_fraccionamiento_63186",
      "imss_unidad_habitacional_63120"
    ],
    "pregunta": "¿A cuál IMSS te refieres?"
  },
  "la_loma": {
    "id": "la_loma",
    "aliasRaiz": "La Loma",
    "colonias": [
      "la_loma",
      "residencial_la_loma"
    ],
    "pregunta": "¿A cuál La Loma te refieres?"
  },
  "los_fresnos": {
    "id": "los_fresnos",
    "aliasRaiz": "Los Fresnos",
    "colonias": [
      "los_fresnos",
      "los_fresnos_oriente",
      "los_fresnos_poniente"
    ],
    "pregunta": "¿A cuál Los Fresnos te refieres?"
  },
  "los_sauces": {
    "id": "los_sauces",
    "aliasRaiz": "Los Sauces",
    "colonias": [
      "los_sauces",
      "los_sauces_infonavit"
    ],
    "pregunta": "¿A cuál Los Sauces te refieres?"
  },
  "luis_donaldo_colosio": {
    "id": "luis_donaldo_colosio",
    "aliasRaiz": "Luis Donaldo Colosio",
    "colonias": [
      "luis_donaldo_colosio",
      "luis_donaldo_colosio_murrieta"
    ],
    "pregunta": "¿A cuál Luis Donaldo Colosio te refieres?"
  },
  "santa_teresita": {
    "id": "santa_teresita",
    "aliasRaiz": "Santa Teresita",
    "colonias": [
      "ampliacion_santa_teresita",
      "santa_teresita",
      "unidad_deportiva_santa_teresita"
    ],
    "pregunta": "¿A cuál Santa Teresita te refieres?"
  },
  "tierra_y_libertad": {
    "id": "tierra_y_libertad",
    "aliasRaiz": "Tierra y Libertad",
    "colonias": [
      "ampliacion_tierra_y_libertad",
      "tierra_y_libertad"
    ],
    "pregunta": "¿A cuál Tierra y Libertad te refieres?"
  },
  "versalles": {
    "id": "versalles",
    "aliasRaiz": "Versalles",
    "colonias": [
      "versalles",
      "versalles_sur"
    ],
    "pregunta": "¿A cuál Versalles te refieres?"
  }
});

function normalizarTexto(texto = "") {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bcol[.]?(?=\s)/g, "colonia")
    .replace(/\bfracc[.]?(?=\s)/g, "fraccionamiento")
    .replace(/\bu[.]?h[.]?(?=\s)/g, "unidad habitacional")
    .replace(/\bfovis{1,3}te\b/g, "fovissste")
    .replace(/\bprimera\b|\b1(?:ra|era|a)\b/g, "1")
    .replace(/\bsegunda\b|\b2(?:da|nda|a)\b/g, "2")
    .replace(/\btercera\b|\b3(?:ra|era|a)\b/g, "3")
    .replace(/\bsecc[.]?\b/g, "seccion")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:colonia|fraccionamiento|unidad habitacional)\s+/, "")
    .trim();
}

function agregarAlIndice(indice, texto, id) {
  const clave = normalizarTexto(texto);
  if (!clave) return;
  if (!indice.has(clave)) indice.set(clave, new Set());
  indice.get(clave).add(id);
}

function construirIndiceColonias() {
  const indice = new Map();
  for (const colonia of Object.values(COLONIAS)) {
    agregarAlIndice(indice, colonia.nombre, colonia.id);
    for (const alias of colonia.alias) agregarAlIndice(indice, alias, colonia.id);
  }
  for (const grupo of Object.values(GRUPOS_AMBIGUEDAD)) {
    for (const id of grupo.colonias) agregarAlIndice(indice, grupo.aliasRaiz, id);
  }
  return new Map([...indice].map(([clave, ids]) => [clave, [...ids]]));
}

const INDICE_COLONIAS = construirIndiceColonias();

function contieneExpresion(texto, expresion) {
  return (` ${texto} `).includes(` ${expresion} `);
}

function distanciaLevenshtein(a, b) {
  const anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  const actual = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    actual[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      actual[j] = Math.min(
        actual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j += 1) anterior[j] = actual[j];
  }
  return anterior[b.length];
}

function similitud(a, b) {
  const mayor = Math.max(a.length, b.length);
  return mayor ? 1 - distanciaLevenshtein(a, b) / mayor : 1;
}

function mejorSimilitudEnMensaje(mensaje, alias) {
  const palabrasMensaje = mensaje.split(" ");
  const palabrasAlias = alias.split(" ");
  let mejor = 0;
  for (let largo = Math.max(1, palabrasAlias.length - 1); largo <= palabrasAlias.length + 1; largo += 1) {
    for (let inicio = 0; inicio + largo <= palabrasMensaje.length; inicio += 1) {
      mejor = Math.max(mejor, similitud(palabrasMensaje.slice(inicio, inicio + largo).join(" "), alias));
    }
  }
  return mejor;
}

function opciones(ids) {
  return [...new Set(ids)].map((id) => {
    const colonia = COLONIAS[id];
    return {
      id,
      nombre: colonia.nombre,
      tipo: colonia.tipo,
      codigoPostal: colonia.codigoPostal,
    };
  });
}

function _detectarTipoEnTexto(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\bfracc(?:ionamiento)?\b/.test(t)) return "fraccionamiento";
  if (/\bu\.?\s*h\.?\b|\bunidad\s+habitacional\b/.test(t)) return "unidad_habitacional";
  if (/\bcol(?:onia)?\b/.test(t)) return "colonia";
  return null;
}

function _desambiguarPorTipo(ids, tipoDetectado) {
  if (!tipoDetectado || !ids.length) return null;
  const filtrados = ids.filter(id => COLONIAS[id]?.tipo === tipoDetectado);
  return filtrados.length === 1 ? filtrados[0] : null;
}

function buscarColonia(texto, { permitirAproximada = true } = {}) {
  const consulta = normalizarTexto(texto);
  if (!consulta) return { estado: "no_encontrada", confianza: 0, textoDetectado: consulta };
  const tipoDetectado = _detectarTipoEnTexto(texto);

  const exactas = INDICE_COLONIAS.get(consulta) ?? [];
  if (exactas.length === 1) {
    return { estado: "encontrada", colonia: COLONIAS[exactas[0]], confianza: 1, metodo: "alias_exacto", textoDetectado: consulta };
  }
  if (exactas.length > 1) {
    const porTipo = _desambiguarPorTipo(exactas, tipoDetectado);
    if (porTipo) return { estado: "encontrada", colonia: COLONIAS[porTipo], confianza: 0.98, metodo: "alias_exacto_tipo", textoDetectado: consulta };
    return { estado: "ambigua", confianza: 1, metodo: "alias_exacto_ambiguo", textoDetectado: consulta, opciones: opciones(exactas) };
  }

  const contenidas = [];
  for (const [alias, ids] of INDICE_COLONIAS) {
    if (alias.length >= 4 && contieneExpresion(consulta, alias)) {
      for (const id of ids) contenidas.push({ id, alias, especificidad: alias.split(" ").length * 100 + alias.length });
    }
  }
  if (contenidas.length) {
    const maxima = Math.max(...contenidas.map((r) => r.especificidad));
    const mejores = [...new Set(contenidas.filter((r) => r.especificidad === maxima).map((r) => r.id))];
    if (mejores.length === 1) {
      return { estado: "encontrada", colonia: COLONIAS[mejores[0]], confianza: 0.97, metodo: "alias_en_mensaje", textoDetectado: consulta };
    }
    const porTipo = _desambiguarPorTipo(mejores, tipoDetectado);
    if (porTipo) return { estado: "encontrada", colonia: COLONIAS[porTipo], confianza: 0.96, metodo: "alias_en_mensaje_tipo", textoDetectado: consulta };
    return { estado: "ambigua", confianza: 0.97, metodo: "alias_en_mensaje_ambiguo", textoDetectado: consulta, opciones: opciones(mejores) };
  }

  // Coincidencia por palabras significativas: "vistas cantera" reconoce
  // "Vistas de La Cantera" sin convertir expresiones genéricas en falsos positivos.
  const stopwords = new Set(["de", "del", "la", "las", "el", "los", "y", "en"]);
  const palabrasConsulta = consulta.split(" ").filter(p => p.length > 2 && !stopwords.has(p));
  if (palabrasConsulta.length >= 2) {
    const coincidencias = [];
    for (const [alias, ids] of INDICE_COLONIAS) {
      const palabrasAlias = new Set(alias.split(" ").filter(p => p.length > 2 && !stopwords.has(p)));
      if (palabrasConsulta.every(p => palabrasAlias.has(p))) {
        for (const id of ids) coincidencias.push(id);
      }
    }
    const unicas = [...new Set(coincidencias)];
    if (unicas.length === 1)
      return { estado: "encontrada", colonia: COLONIAS[unicas[0]], confianza: 0.95, metodo: "palabras_significativas", textoDetectado: consulta };
    if (unicas.length > 1)
      return { estado: "ambigua", confianza: 0.95, metodo: "palabras_significativas_ambiguas", textoDetectado: consulta, opciones: opciones(unicas) };
  }

  if (!permitirAproximada) return { estado: "no_encontrada", confianza: 0, textoDetectado: consulta };

  const porId = new Map();
  for (const [alias, ids] of INDICE_COLONIAS) {
    if (alias.length < 5) continue;
    const puntuacion = mejorSimilitudEnMensaje(consulta, alias);
    for (const id of ids) {
      if (puntuacion > (porId.get(id)?.puntuacion ?? 0)) porId.set(id, { id, alias, puntuacion });
    }
  }
  const candidatas = [...porId.values()].sort((a, b) => b.puntuacion - a.puntuacion);
  const primera = candidatas[0];
  const segunda = candidatas[1];
  if (primera && primera.puntuacion >= 0.92 && (!segunda || primera.puntuacion - segunda.puntuacion >= 0.08)) {
    return { estado: "encontrada", colonia: COLONIAS[primera.id], confianza: Number(primera.puntuacion.toFixed(3)), metodo: "aproximada_segura", textoDetectado: consulta };
  }
  const sugerencias = candidatas.filter((c) => c.puntuacion >= 0.78).slice(0, 5);
  if (sugerencias.length) {
    return { estado: "ambigua", confianza: Number(sugerencias[0].puntuacion.toFixed(3)), metodo: "aproximada_requiere_confirmacion", textoDetectado: consulta, opciones: opciones(sugerencias.map((s) => s.id)) };
  }
  return { estado: "no_encontrada", confianza: 0, textoDetectado: consulta };
}

module.exports = {
  METADATOS_DICCIONARIO,
  REGISTROS_LEGADO_NO_CANONICOS,
  COLONIAS,
  GRUPOS_AMBIGUEDAD,
  INDICE_COLONIAS,
  normalizarTexto,
  construirIndiceColonias,
  buscarColonia,
};
