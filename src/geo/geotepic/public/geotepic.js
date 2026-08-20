async function loadMapaGeoTepic() {
  if (_gtMap) {
    setTimeout(() => _gtMap.invalidateSize(), 80);
    return;
  }

  setTimeout(async () => {
    initMapaGeoTepic();
    initCuadrantesGeoTepic();
    await _cargarColoniasGeoTepic();
    await _cargarCuadrantesGeoTepic();
    actualizarConflictos();
  }, 80);
}

async function recargarMapaGeoTepic() {
  if (!_gtMap) return;
  await _cargarColoniasGeoTepic();
}
