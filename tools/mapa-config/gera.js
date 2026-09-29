/* Configuração pública de mapas, gerada somente no artefato de publicação. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function render(value) {
  const token = String(value || '').trim();
  if (token && !/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('MAPBOX_PUBLIC_TOKEN deve ser um token público válido.');
  }
  return '/* Gerado para publicação; configuração pública do mapa. */\n' +
    '(function (r) {\n  r.MT_MAPA = r.MT_MAPA || {};\n  r.MT_MAPA.mapboxToken = ' + JSON.stringify(token) + ';\n})(self);\n';
}

module.exports = { render };
if (require.main === module) {
  try {
    const destination = process.argv[2];
    if (!destination) throw new Error('Informe o diretório do artefato.');
    const token = String(process.env.MAPBOX_PUBLIC_TOKEN || '').trim();
    if (process.env.REQUIRE_MAPBOX_PUBLIC_TOKEN === 'true' && !token) {
      throw new Error('MAPBOX_PUBLIC_TOKEN ausente; publicação bloqueada.');
    }
    const source = render(token);
    fs.writeFileSync(path.join(destination, 'assets', 'mapa-config.js'), source);
    console.log('Configuração pública Mapbox: ' + (token ? 'ativada' : 'desativada'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
