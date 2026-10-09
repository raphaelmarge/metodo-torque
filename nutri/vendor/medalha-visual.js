// Renderizador visual original do Torque Personal, adaptado apenas para export ES module.
export function runtimeMedalhaVisual() {
    'use strict';
    function esc(v) {
      return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function cor(v, alternativa) {
      v = String(v || '').trim();
      return /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/deg]+\)|white|black|transparent)$/i.test(v) ? v : alternativa;
    }
    function paleta(marca, nivel, bloqueada) {
      marca = marca || {};
      var base = {
        cor: cor(marca.cor, '#8053c4'),
        clara: cor(marca.clara, '#c8b3e8'),
        escura: cor(marca.escura, '#3e285e')
      };
      var graus = [
        ['#79818c', '#c5cbd3', '#3c444e'],
        ['#aa7a54', '#dfbea0', '#553b29'],
        ['#9ba7b6', '#e3e8ee', '#465260'],
        ['#b59a51', '#e4d29a', '#605027'],
        ['#8aa99f', '#d4e2dc', '#3b5b50'],
        ['#8caabd', '#d7e7ef', '#3c566d']
      ];
      var indice = bloqueada || nivel === 0 ? 0 : (typeof nivel === 'number' && nivel >= 1 && nivel < 6 ? Math.floor(nivel) : -1);
      if (indice >= 0) base = { cor: graus[indice][0], clara: graus[indice][1], escura: graus[indice][2] };
      return base;
    }
    // O catálogo fornece traços de SVG, nunca imagens ou links. A lista permite só geometria.
    function traco(fonte) {
      var tags = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g'];
      var numericos = ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'stroke-width', 'opacity'];
      var saida = '', grupos = 0;
      String(fonte || '').slice(0, 12000).replace(/<\s*(\/?)\s*([a-z][\w:-]*)\b([^<>]*?)(\/?)\s*>/gi, function (_, fechar, tag, atributos) {
        tag = tag.toLowerCase();
        if (tags.indexOf(tag) < 0) return '';
        if (fechar) { if (tag === 'g' && grupos) { saida += '</g>'; grupos--; } return ''; }
        var attrs = '';
        atributos.replace(/([a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi, function (_, nome, aspas, valor) {
          var valido = false;
          if (numericos.indexOf(nome) >= 0) valido = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?%?$/i.test(valor.trim());
          else if (nome === 'd') valido = /^[MmLlHhVvCcSsQqTtAaZz\d\s.,eE+\-]+$/.test(valor);
          else if (nome === 'points') valido = /^[\d\s.,eE+\-]+$/.test(valor);
          else if (nome === 'transform') valido = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s.,eE+\-]+\)\s*)+$/.test(valor);
          else if (nome === 'fill' || nome === 'stroke') valido = /^(?:none|currentColor|white|#fff|#ffffff)$/i.test(valor);
          else if (nome === 'stroke-linecap') valido = /^(?:butt|round|square)$/.test(valor);
          else if (nome === 'stroke-linejoin') valido = /^(?:miter|round|bevel)$/.test(valor);
          else if (nome === 'fill-rule' || nome === 'clip-rule') valido = /^(?:nonzero|evenodd)$/.test(valor);
          if (valido) attrs += ' ' + nome + '="' + esc(valor) + '"';
          return '';
        });
        saida += '<' + tag + attrs + (tag === 'g' ? '>' : '/>');
        if (tag === 'g') grupos++;
        return '';
      });
      while (grupos-- > 0) saida += '</g>';
      return saida || '<circle cx="12" cy="9" r="5"/><path d="m9 13-2 8 5-2 5 2-2-8"/>';
    }
    function svg(args) {
      args = args || {};
      var cores = paleta(args.cores, null, !!args.bloqueada), c = esc(cores.cor), l = esc(cores.clara), d = esc(cores.escura);
      var nome = String(args.n || 'Medalha').slice(0, 160);
      var miolo = args.bloqueada
        ? '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
        : traco(args.p);
      var simbolo = args.emo && !args.bloqueada
        ? '<text x="140" y="156" text-anchor="middle" font-size="76" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif" fill="#f4f5f6">' + esc(String(args.p || args.emo).slice(0, 30)) + '</text>'
        : '<g transform="translate(86 78) scale(4.5)" fill="none" stroke="#f1f2f3" color="#f1f2f3" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' + miolo + '</g>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280" role="img" aria-label="' + esc(nome) + '">' +
      '<title id="mv-title">' + esc(nome) + '</title><defs>' +
        '<linearGradient id="mv-rim" x1=".18" y1="0" x2=".82" y2="1" gradientUnits="objectBoundingBox">' +
        '<stop stop-color="' + d + '"/><stop offset=".17" stop-color="' + l + '"/><stop offset=".34" stop-color="' + c + '"/><stop offset=".55" stop-color="' + l + '"/><stop offset=".78" stop-color="' + c + '"/><stop offset="1" stop-color="' + d + '"/></linearGradient>' +
        '<linearGradient id="mv-face" x1=".15" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="' + c + '"/><stop offset=".35" stop-color="' + l + '"/><stop offset=".53" stop-color="' + c + '"/><stop offset="1" stop-color="' + d + '"/></linearGradient>' +
        '<linearGradient id="mv-bevel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="' + d + '"/><stop offset=".6" stop-color="' + c + '"/><stop offset="1" stop-color="' + l + '"/></linearGradient>' +
        '<radialGradient id="mv-light" cx=".32" cy=".23" r=".83"><stop stop-color="#fff" stop-opacity=".16"/><stop offset=".56" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".13"/></radialGradient>' +
        '<pattern id="mv-brush" width="280" height="7" patternUnits="userSpaceOnUse"><path d="M0 .7H280M0 4.5H280" stroke="#fff" stroke-opacity=".10" stroke-width=".55"/><path d="M0 2.2H280M0 6.2H280" stroke="#000" stroke-opacity=".09" stroke-width=".45"/><path d="M0 3.3H280" stroke="#fff" stroke-opacity=".035" stroke-width=".5" stroke-dasharray="37 23 71 11 46 32"/></pattern>' +
        '<filter id="mv-shadow" x="-40%" y="-60%" width="180%" height="230%"><feGaussianBlur stdDeviation="5"/></filter>' +
        '<filter id="mv-relief" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="1.4" stdDeviation=".6" flood-color="#14202a" flood-opacity=".58"/></filter>' +
        '</defs>' +
        '<ellipse cx="140" cy="247" rx="83" ry="10" fill="#000" opacity=".35" filter="url(#mv-shadow)"/>' +
        '<circle cx="140" cy="138" r="111" fill="' + d + '" stroke="' + d + '" stroke-width="2"/>' +
        '<circle cx="140" cy="132" r="112" fill="url(#mv-rim)" stroke="' + d + '" stroke-width="1.2"/>' +
        '<circle cx="140" cy="132" r="110" fill="none" stroke="' + l + '" stroke-opacity=".52" stroke-width=".8"/>' +
        '<circle cx="140" cy="132" r="103" fill="none" stroke="' + d + '" stroke-opacity=".55" stroke-width=".8"/>' +
        '<circle cx="140" cy="132" r="97" fill="url(#mv-bevel)"/>' +
        '<circle cx="140" cy="132" r="93" fill="url(#mv-face)" stroke="' + d + '" stroke-opacity=".6" stroke-width=".8"/>' +
        '<circle cx="140" cy="132" r="112" fill="url(#mv-brush)"/>' +
        '<circle cx="140" cy="132" r="92.5" fill="url(#mv-light)"/>' +
        '<path d="M67 74a94 94 0 0 1 119-17" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width=".7"/>' +
        '<g filter="url(#mv-relief)">' + simbolo + '</g></svg>';
    }
    function url(args) {
      var bytes = new TextEncoder().encode(svg(args)), binario = '';
      for (var i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
      return 'data:image/svg+xml;base64,' + btoa(binario);
    }
    return { svg: svg, paleta: paleta, url: url };
  }
