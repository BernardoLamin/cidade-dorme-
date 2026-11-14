/* Cidade Dorme: motor de regras (sem interface) */
(function (root) {
  'use strict';
  var QUEM_SAI = { vilao: true, medico: true };

  function embaralhar(a, rnd) {
    rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function novoJogo(nomes, rnd, nAssassinos, comVingador) {
    var papeis = ['medico', 'investigador'];
    for (var k = 0; k < (nAssassinos || 2); k++) papeis.push('vilao');
    if (comVingador && nomes.length - papeis.length >= 2) papeis.push('vingador');
    while (papeis.length < nomes.length) papeis.push('inocente');
    embaralhar(papeis, rnd);
    return {
      jogadores: nomes.map(function (nome, i) { return { id: i, nome: nome, papel: papeis[i], vivo: true }; }),
      noite: 0, dia: 0, ultimaProtecao: null, acoes: null, votos: null, vencedor: null, alibis: [], evento: null, ultimoEvento: null
    };
  }
  function vivos(g) { return g.jogadores.filter(function (j) { return j.vivo; }); }
  function parceiro(g, id) {
    return g.jogadores.filter(function (j) { return j.papel === 'vilao' && j.id !== id; })[0] || null;
  }
  function alvos(g, id) {
    var eu = g.jogadores[id];
    return vivos(g).filter(function (j) {
      if (eu.papel === 'vilao') return j.papel !== 'vilao';
      if (eu.papel === 'medico') return !(j.id === id && g.ultimaProtecao === id);
      return j.id !== id;
    });
  }
  var EVENTOS = ['apagao', 'tempestade', 'carta', 'furia'];
  /* eventos: a partir da 2a noite, 65% de chance; nunca o mesmo duas vezes seguidas */
  function iniciarNoite(g, rnd, comEventos) {
    rnd = rnd || Math.random;
    g.noite++; g.acoes = { ataque: null, protegido: null, investigado: null }; g.evento = null;
    if (comEventos && g.noite >= 2 && rnd() < 0.65) {
      var op = EVENTOS.filter(function (e) { return e !== g.ultimoEvento; });
      g.evento = g.ultimoEvento = op[Math.floor(rnd() * op.length)];
    }
  }
  function agir(g, id, alvo) {
    var p = g.jogadores[id].papel;
    if (p === 'vilao') g.acoes.ataque = alvo;
    else if (p === 'medico') { if (g.evento !== 'apagao') g.acoes.protegido = alvo; }
    else if (p === 'investigador') { g.acoes.investigado = alvo; return QUEM_SAI[g.jogadores[alvo].papel] ? 'saiu' : 'ficou'; }
    return null;
  }
  function checarVitoria(g) {
    var v = 0, c = 0;
    vivos(g).forEach(function (j) { if (j.papel === 'vilao') v++; else c++; });
    g.vencedor = v === 0 ? 'cidadaos' : (v >= c ? 'viloes' : null);
    return g.vencedor;
  }
  function resolverNoite(g) {
    var a = g.acoes, eliminado = null, salvo = false;
    if (a.ataque != null) {
      if (a.ataque === a.protegido) salvo = true;
      else { g.jogadores[a.ataque].vivo = false; eliminado = a.ataque; }
    }
    g.ultimaProtecao = a.protegido; g.dia++; g.votos = {};
    checarVitoria(g);
    return { eliminado: eliminado, salvo: salvo };
  }
  function votar(g, id, alvo) { g.votos[id] = alvo; }
  function apurarAcusacao(g) {
    var cont = {}, max = 0, lider = [];
    Object.keys(g.votos).forEach(function (k) {
      var a = g.votos[k]; if (a == null) return;
      cont[a] = (cont[a] || 0) + 1;
    });
    Object.keys(cont).forEach(function (k) {
      if (cont[k] > max) { max = cont[k]; lider = [Number(k)]; } else if (cont[k] === max) lider.push(Number(k));
    });
    return { contagem: cont, acusado: lider.length === 1 ? lider[0] : null, empate: lider.length > 1 };
  }
  /* julgamento: todos menos o acusado votam culpado (true) ou inocente (false); empate absolve */
  function julgar(g, acusado, votos, empateCondena) {
    var sim = 0, nao = 0;
    Object.keys(votos).forEach(function (k) { if (votos[k]) sim++; else nao++; });
    var culpado = sim > nao || (!!empateCondena && sim === nao && sim > 0);
    if (culpado) g.jogadores[acusado].vivo = false;
    checarVitoria(g);
    return { sim: sim, nao: nao, culpado: culpado };
  }
  /* pista: da um alibi publico a um vivo que nao e assassino, mantendo ao menos 2 inocentes em duvida */
  function pista(g, rnd) {
    rnd = rnd || Math.random;
    var cand = vivos(g).filter(function (j) { return j.papel !== 'vilao' && g.alibis.indexOf(j.id) < 0; });
    if (cand.length < 3) return null;
    var id = cand[Math.floor(rnd() * cand.length)].id;
    g.alibis.push(id);
    return id;
  }
  /* vinganca: o vingador eliminado leva alguem junto */
  function vingar(g, alvo) { g.jogadores[alvo].vivo = false; checarVitoria(g); }
  /* carta anonima: tres vivos, exatamente um deles assassino; null se nao der para montar */
  function cartaAnonima(g, rnd) {
    rnd = rnd || Math.random;
    var v = vivos(g), ass = v.filter(function (j) { return j.papel === 'vilao'; });
    var outros = v.filter(function (j) { return j.papel !== 'vilao' && g.alibis.indexOf(j.id) < 0; });
    if (!ass.length || outros.length < 2 || v.length < 4) return null;
    embaralhar(outros, rnd);
    return embaralhar([ass[Math.floor(rnd() * ass.length)].id, outros[0].id, outros[1].id], rnd);
  }
  var api = { novoJogo: novoJogo, vivos: vivos, parceiro: parceiro, alvos: alvos, iniciarNoite: iniciarNoite, agir: agir,
    resolverNoite: resolverNoite, votar: votar, apurarAcusacao: apurarAcusacao, julgar: julgar, pista: pista, vingar: vingar, cartaAnonima: cartaAnonima, checarVitoria: checarVitoria, embaralhar: embaralhar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Motor = api;
})(this);
