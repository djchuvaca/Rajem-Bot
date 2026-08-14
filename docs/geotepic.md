# GeoTepic

El catálogo canónico vive en `src/geo/geotepic/diccionario_colonias_tepic.js` y contiene 300 asentamientos urbanos. `admin.db` conserva una proyección administrable; cada tenant de Tepic conserva únicamente su activación y una copia de los datos necesarios para consulta y tarifas.

## Arranque y migración

Al iniciar el superadmin:

1. Se agregan de forma aditiva las columnas enriquecidas que falten.
2. Se genera un respaldo diario en `data/backups/geotepic/` si ya existe catálogo.
3. Se sincroniza el diccionario canónico sin duplicar registros.
4. Se respetan activaciones, modificaciones administrativas y exclusiones.
5. Cada tenant recibe activas por defecto todas las colonias disponibles. La inicialización ocurre una sola vez y no borra decisiones manuales posteriores.

## Coordenadas

Las coordenadas verificadas pueden utilizarse para zonas y tarifas. Las aproximadas son consultables y activables, pero por defecto utilizan la tarifa plana y devuelven `requiereVerificacion`. El tenant puede habilitar excepcionalmente su cálculo configurando `geo_tarifa_aproximada=1`.

## Cobertura individual del tenant

El tenant puede guardar `geo_radio_cobertura_km` desde su panel. Al aplicarlo, se calcula la distancia en línea recta desde `negocio_lat`/`negocio_lon` y se activan únicamente las colonias dentro del radio. Las demás se desactivan solo en su propia base; el catálogo maestro y los otros tenants no cambian.

Mientras exista un radio configurado, el panel impide reactivar manualmente una colonia que esté fuera del límite. Las colonias que se agreguen posteriormente al catálogo maestro también respetan el radio al sincronizarse.

## Administración

Editar una colonia crea un override persistente. Eliminar una colonia canónica la excluye sin borrar su trazabilidad. La opción **Mostrar excluidas** permite restaurarla. Las acciones quedan registradas en `geo_tepic_auditoria`.

## Ambigüedades en WhatsApp

Cuando un nombre corresponde a varios asentamientos, el bot conserva las opciones en la sesión. El cliente puede responder con número, ordinal, nombre completo, tipo o código postal.

## Recuperación

Para recuperar el catálogo, restaure el respaldo JSON más reciente en una copia de `admin.db` o vuelva a iniciar con una base sin catálogo para reconstruirlo desde el diccionario. Nunca sustituya la base en producción sin detener antes `superadmin` y los procesos que la utilizan.
