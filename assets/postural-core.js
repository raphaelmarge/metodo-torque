/* Geometria 2D da avaliação postural. Não contém classificação clínica ou IA. */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  var TYPES = { horizontal: 2, vertical: 2, angle: 3, note: 1 };
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') { var out={}; Object.keys(value).sort().forEach(function(k){out[k]=canonical(value[k]);}); return out; }
    return value;
  }
  function equal(a,b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function uuid() {
    if (root.crypto.randomUUID) return root.crypto.randomUUID();
    var b = root.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function create(image) {
    return { version: 1, image: image, rotation: 0, mirrored: false,
      grid: { visible: true, columns: 12, opacity: 0.35 },
      plumb: { visible: true, x: 0.5 }, marks: [] };
  }
  // Coordenadas das marcações são frações da imagem CANÔNICA, nunca da tela.
  function world(point, doc) {
    var x = (point.x - 0.5) * doc.image.width * (doc.mirrored ? -1 : 1);
    var y = (point.y - 0.5) * doc.image.height, a = doc.rotation * RAD;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }
  function original(point, doc) {
    var a = -doc.rotation * RAD;
    var x = point.x * Math.cos(a) - point.y * Math.sin(a);
    var y = point.x * Math.sin(a) + point.y * Math.cos(a);
    return { x: x * (doc.mirrored ? -1 : 1) / doc.image.width + 0.5, y: y / doc.image.height + 0.5 };
  }
  function bounds(doc) {
    var a = doc.rotation * RAD, w = doc.image.width, h = doc.image.height;
    return { width: Math.abs(w*Math.cos(a)) + Math.abs(h*Math.sin(a)),
      height: Math.abs(w*Math.sin(a)) + Math.abs(h*Math.cos(a)) };
  }
  function distance(a, b) { return Math.hypot(a.x-b.x, a.y-b.y); }
  function inside(p) { return finite(p.x) && finite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1; }
  function measure(mark, doc) {
    if (!mark || mark.type === 'note' || !TYPES[mark.type] || mark.points.length !== TYPES[mark.type]) return null;
    var p = mark.points.map(function (x) { return world(x, doc); });
    if (distance(p[0],p[1]) < 2) return null;
    if (mark.type === 'angle') {
      if (distance(p[1],p[2]) < 2) return null;
      var ax=p[0].x-p[1].x, ay=p[0].y-p[1].y, bx=p[2].x-p[1].x, by=p[2].y-p[1].y;
      return Math.acos(clamp((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)),-1,1))/RAD;
    }
    var angle = Math.atan2(Math.abs(p[1].y-p[0].y), Math.abs(p[1].x-p[0].x))/RAD;
    return mark.type === 'vertical' ? 90-angle : angle;
  }
  function validate(doc) {
    var image = doc && doc.image;
    if (!doc || doc.version !== 1 || !image || !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      image.width < 1 || image.height < 1 || image.width > 1600 || image.height > 1600 ||
      typeof image.data !== 'string' || image.data.length > 750000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.data))
      throw new Error('Foto inválida. Importe novamente uma imagem JPEG, PNG ou WebP.');
    if (!finite(doc.rotation) || Math.abs(doc.rotation) > 180 || typeof doc.mirrored !== 'boolean' ||
      !doc.grid || typeof doc.grid.visible !== 'boolean' || !finite(doc.grid.columns) || doc.grid.columns < 4 || doc.grid.columns > 30 ||
      !finite(doc.grid.opacity) || doc.grid.opacity < 0.1 || doc.grid.opacity > 0.8 ||
      !doc.plumb || typeof doc.plumb.visible !== 'boolean' || !finite(doc.plumb.x) || doc.plumb.x < 0 || doc.plumb.x > 1 ||
      !Array.isArray(doc.marks) || doc.marks.length > 60) throw new Error('A avaliação contém ajustes inválidos.');
    var seen = new Set();
    doc.marks.forEach(function (m) {
      if (!m || !Object.hasOwn(TYPES,m.type) || typeof m.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(m.id) || seen.has(m.id) ||
        typeof m.text !== 'string' || m.text.length > 2000 || !Array.isArray(m.points) || m.points.length !== TYPES[m.type] ||
        !m.points.every(inside)) throw new Error('Uma marcação está inválida.');
      seen.add(m.id);
    });
    return doc;
  }
  var api={create:create,clone:clone,equal:equal,uuid:uuid,clamp:clamp,world:world,original:original,bounds:bounds,measure:measure,
    distance:distance,inside:inside,validate:validate,types:TYPES};
  root.MT_POSTURAL_CORE=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof self !== 'undefined' ? self : globalThis);
