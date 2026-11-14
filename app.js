/* Cidade Dorme: interface e modo de um celular só. online.js, ia.js e voz.js se ligam pelo objeto CD */
(function () {
'use strict';
var A = 'assets/';
var PAPEIS = {
  vilao: { nome: 'Assassino', cor: '#ff7a7a', chip: ['#b3141c', '#fff'], carta: 'carta_vilao.jpg' },
  medico: { nome: 'Médico', titulo: 'Você é o Médico', era: 'era o Médico', cor: '#5fe08a', chip: ['#5fe08a', '#15131f'], carta: 'carta_medico.jpg',
    desc: 'Toda noite, escolha alguém para proteger do ataque. Você pode se proteger, mas não duas noites seguidas.' },
  investigador: { nome: 'Investigador', titulo: 'Você é o Investigador', era: 'era o Investigador', cor: '#9db4ff', chip: ['#3d4a73', '#fff'], carta: 'carta_investigador.jpg',
    desc: 'Toda noite, investigue alguém e descubra se a pessoa saiu de casa. Quem sai, agiu: é assassino ou médico.' },
  inocente: { nome: 'Inocente', titulo: 'Você é Inocente', era: 'era Inocente', cor: '#ffc22e', chip: ['#ffc22e', '#15131f'], carta: 'carta_inocente.jpg',
    desc: 'Você não age à noite. De dia, observe, debata e vote para descobrir quem mata.' },
  vingador: { nome: 'Vingador', titulo: 'Você é o Vingador', era: 'era o Vingador', cor: '#ff9a3d', chip: ['#c2410c', '#fff'], carta: 'carta_vingador.jpg',
    desc: 'Você não age à noite. Mas, se for eliminado, escolhe alguém para cair junto com você.' }
};
var EVENTOS = {
  apagao: ['Apagão', 'A cidade está sem luz. O médico não consegue sair de casa esta noite.'],
  tempestade: ['Tempestade chegando', 'O céu fechou. O debate de hoje dura metade do tempo.'],
  furia: ['Dia de fúria', 'A cidade perdeu a paciência. Hoje, empate no julgamento condena.'],
  carta: ['Carta anônima', 'Alguém deixou um bilhete na praça: um destes três mata à noite.']
};
var NARRA_NOITE = [
  'As luzes se apagam uma a uma. Alguém nesta roda não pretende dormir.',
  'A cidade está menor esta noite. E o perigo, mais perto.',
  'Ninguém confia em mais ninguém. Tranquem as portas.',
  'Poucas janelas ainda estão acesas. Talvez esta seja a última noite.'
];
var NARRA_ATAQUE = [
  ['Passos no escuro.', 'Uma porta range. Ninguém viu nada.'],
  ['Uma sombra atravessa a rua.', 'Um grito abafado. Depois, silêncio.'],
  ['Alguém bate a uma porta.', 'Era a porta errada. Ou a porta certa.'],
  ['O vento apaga a última vela.', 'A escolha já foi feita.']
];
var NARRA_PISTA = [
  'Testemunhas confirmam: a luz da casa ficou acesa a noite inteira.',
  'As pegadas na lama não batem com os sapatos.',
  'O vigia da praça jura que essa pessoa não saiu de casa.',
  'Um vizinho ouviu essa pessoa roncando na hora do crime.'
];
var app = document.getElementById('app');
function lerLS(k, pad) { try { var v = localStorage.getItem('cd_' + k); return v == null ? pad : v; } catch (e) { return pad; } }
function gravarLS(k, v) { try { localStorage.setItem('cd_' + k, v); } catch (e) {} }
/* link de configuração: abrir o jogo com #chave=... salva a chave do Gemini neste aparelho e limpa o endereço */
try { var hm = /[#&]chave=([^&]+)/.exec(location.hash); if (hm) { gravarLS('iachave', decodeURIComponent(hm[1]).trim()); history.replaceState(null, '', location.pathname + location.search); } } catch (e) {}
var tokenSalvo = lerLS('token', '');
if (!tokenSalvo) { tokenSalvo = Math.random().toString(36).slice(2) + Date.now().toString(36); gravarLS('token', tokenSalvo); }
var salaUrl = ''; try { salaUrl = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4); } catch (e) {}
var S = { tela: 'menu', modo: 'local', souHost: false, me: 0, lobby: [], esperando: [], chat: [], chatCanais: [], chatPode: {}, nomeOnline: lerLS('nome', ''), codigo: salaUrl, token: tokenSalvo, iaChave: lerLS('iachave', ''), nBots: 5, erro: '', n: 6, nA: 1, vingador: true, eventos: true, voz: false, nomes: ['', '', '', '', '', '', '', ''], minutos: 2, g: null, fase: null, fila: [], idx: 0, sel: undefined, virada: false };
var relogio = null, esperas = [], batimento = null;
var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function um() { return S.nA === 1; }
function online() { return S.modo !== 'local'; }

/* ---------- som (sintetizado, sem arquivos) ---------- */
var Som = {
  ctx: null, ligado: true,
  init: function () {
    if (!this.ligado) return;
    try {
      if (!this.ctx) { var C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); }
      if (this.ctx && this.ctx.state === 'suspended') { var p = this.ctx.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) {}
  },
  tom: function (f, dur, tipo, vol, atraso, fFim) {
    if (!this.ligado || !this.ctx) return;
    try {
      var c = this.ctx, t = c.currentTime + (atraso || 0), o = c.createOscillator(), g = c.createGain();
      o.type = tipo || 'sine'; o.frequency.setValueAtTime(f, t);
      if (fFim) o.frequency.exponentialRampToValueAtTime(fFim, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  },
  batida: function () { this.tom(150, 0.16, 'triangle', 0.5, 0, 70); this.tom(125, 0.2, 'triangle', 0.4, 0.26, 60); },
  susto: function () { this.tom(233, 0.9, 'sawtooth', 0.2, 0, 58); this.tom(220, 0.9, 'sawtooth', 0.2, 0, 55); this.tom(180, 1.1, 'triangle', 0.45, 0, 60); },
  sino: function () { this.tom(784, 1.2, 'sine', 0.25); this.tom(1175, 1.4, 'sine', 0.15, 0.12); },
  tique: function () { this.tom(900, 0.06, 'square', 0.1); },
  apagar: function () { this.tom(240, 1.4, 'sawtooth', 0.16, 0, 35); this.tom(120, 0.08, 'square', 0.2, 0.5); this.tom(120, 0.08, 'square', 0.2, 1.1); },
  apito: function () { this.tom(196, 0.5, 'square', 0.14); this.tom(147, 0.7, 'square', 0.14, 0.3); },
  martelo: function () { this.tom(300, 0.12, 'square', 0.3, 0, 120); this.tom(300, 0.12, 'square', 0.3, 0.3, 120); },
  vitoria: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { s.tom(f, 0.5, 'triangle', 0.25, i * 0.16); }); },
  derrota: function () { var s = this; [330, 277, 233, 165].forEach(function (f, i) { s.tom(f, 0.8, 'sawtooth', 0.16, i * 0.3); }); }
};
function vibrar(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* narrador: sem voz sintética; entra aqui quando houver gravações */
var Voz = { ligar: function () {}, falar: function () {}, calar: function () {} };
function somRevelacao() { if (J(S.rev.id).papel === 'vilao') Som.vitoria(); else { Som.susto(); vibrar(300); } }
function eraTexto(j) { return j.papel === 'vilao' ? (um() ? 'era o Assassino!' : 'era um Assassino!') : PAPEIS[j.papel].era; }

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function av(id, cls) { return '<img class="av ' + (cls || '') + '" src="' + A + 'avatar_' + (id + 1) + '.jpg" alt="">'; }
function J(id) { return S.g.jogadores[id]; }
function atual() { return J(S.fila[S.idx]); }
function temAlibi(id) { return S.g.alibis.indexOf(id) >= 0; }
function cena(src, cls) { return '<img class="cena ' + (cls || '') + '" src="' + A + src + '" alt="">'; }
function video(src, poster, cls, attrs) { return '<video class="cena ' + (cls || '') + '" src="' + A + src + '" poster="' + A + poster + '" autoplay muted playsinline ' + (attrs || '') + '></video>'; }
/* toca o vídeo; os que têm data-som tentam tocar com áudio (só funciona após um toque na tela). semSom roda quando o áudio do vídeo não sai */
function tocarVideo(v, semSom) {
  var comSom = v.hasAttribute('data-som') && Som.ligado, p;
  v.muted = !comSom;
  try { p = v.play(); } catch (e) { p = null; }
  if (!comSom) { if (p && p.catch) p.catch(function () {}); if (semSom) semSom(); return; }
  if (p && p.catch) p.catch(function () {
    v.muted = true; var q = v.play(); if (q && q.catch) q.catch(function () {});
    if (semSom) semSom();
  });
}
function btn(act, txt, extra) { return '<button type="button" class="btn ' + (extra || '') + '" data-act="' + act + '">' + txt + '</button>'; }
function depois(ms, fn) { esperas.push(setTimeout(fn, calmo ? Math.min(ms, 300) : ms)); }
function limpar() {
  esperas.forEach(clearTimeout); esperas = [];
  if (relogio) { clearInterval(relogio); relogio = null; }
  if (batimento) { clearInterval(batimento); batimento = null; }
}
function coracao(ms) { Som.batida(); batimento = setInterval(function () { Som.batida(); }, ms || 900); }
function pararCoracao() { if (batimento) { clearInterval(batimento); batimento = null; } }
function clarao() { var d = document.createElement('div'); d.className = 'clarao'; app.appendChild(d); setTimeout(function () { d.remove(); }, 800); }
function mostrar() { app.querySelectorAll('.revela').forEach(function (e) { e.classList.add('mostra'); }); }
function texto(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
function botaoSom() {
  var corpo = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' + (Som.ligado
    ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
  return '<button type="button" class="som" data-act="som" aria-pressed="' + Som.ligado + '" aria-label="Som"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' + corpo + '</svg></button>';
}
function opcoes(lista) {
  return lista.map(function (a) {
    return '<button type="button" class="op" data-act="sel" data-v="' + a.id + '" aria-pressed="' + (S.sel === a.id) + '">' + av(a.id) + '<span>' + esc(a.nome) + (S.fase === 'voto' && temAlibi(a.id) ? '<small class="tag">álibi</small>' : '') + '</span></button>';
  }).join('');
}

/* ---------- fluxo ---------- */
function comecar() {
  var nomes = S.nomes.slice(0, S.n).map(function (x, i) { return x.trim() || 'Jogador ' + (i + 1); });
  S.g = Motor.novoJogo(nomes, null, S.nA, S.vingador); S.vingou = false;
  S.fase = 'revelar'; S.fila = S.g.jogadores.map(function (j) { return j.id; }); S.idx = 0; S.tela = 'passar';
}
function abrirNoite() {
  Motor.iniciarNoite(S.g, null, S.eventos);
  S.fase = 'noite'; S.fila = Motor.vivos(S.g).map(function (j) { return j.id; }); S.idx = 0; S.tela = 'noiteIntro';
}
function abrirDebate() { S.total = S.resta = Math.round(S.minutos * 60 * (S.g.evento === 'tempestade' ? 0.5 : 1)); S.tela = 'debate'; }
function vingancaPendente() { return J(S.rev.id).papel === 'vingador' && !S.vingou && Motor.vivos(S.g).length > 0; }
function montarManha() {
  var g = S.g; S.manha = [];
  if (S.rn.eliminado != null) { S.pista = Motor.pista(g); if (S.pista != null) S.manha.push('pista'); }
  if (g.evento === 'carta') { S.carta = Motor.cartaAnonima(g); if (!S.carta) g.evento = null; }
  if (g.evento && g.evento !== 'apagao') S.manha.push('evento');
  avancarManha();
}
function avancarManha() { var t = S.manha.shift(); if (t) S.tela = t; else abrirDebate(); }
function proximo() {
  S.idx++; S.sel = undefined; S.virada = false;
  if (S.idx < S.fila.length) { S.tela = 'passar'; return; }
  if (S.fase === 'revelar') abrirNoite();
  else if (S.fase === 'noite') { S.rn = Motor.resolverNoite(S.g); S.tela = 'ataque'; }
  else if (S.fase === 'voto') { S.rv = Motor.apurarAcusacao(S.g); S.tela = 'resultadoVoto'; }
  else { S.rj = Motor.julgar(S.g, S.rv.acusado, S.juri, S.g.evento === 'furia'); S.tela = 'veredito'; }
}
var ACOES = {
  n: function (v) { S.n = Number(v); S.nA = S.n === 6 ? 1 : 2; },
  nA: function (v) { S.nA = Number(v); },
  min: function (v) { S.minutos = Number(v); },
  comecar: comecar,
  souEu: function () {
    S.sel = undefined; S.virada = false;
    if (S.fase === 'revelar') S.tela = 'carta';
    else if (S.fase === 'noite') {
      S.tela = 'acao';
      if (atual().papel === 'vilao' && S.g.acoes.ataque != null) S.sel = S.g.acoes.ataque;
    } else S.tela = S.fase === 'voto' ? 'voto' : 'juri';
  },
  virar: function () { S.virada = true; S.animar = true; },
  proximo: proximo,
  iniciarNoite: function () { S.tela = 'passar'; },
  sel: function (v) { S.sel = v === 'nenhum' ? null : Number(v); },
  selJ: function (v) { S.sel = v === 'sim'; },
  agir: function () {
    var r = Motor.agir(S.g, atual().id, S.sel);
    if (r) { S.inv = { alvo: S.sel, r: r }; S.tela = 'investigacao'; } else proximo();
  },
  votar: function () { Motor.votar(S.g, atual().id, S.sel); proximo(); },
  jurar: function () { S.juri[atual().id] = S.sel; proximo(); },
  aposAtaque: function () { S.tela = 'amanhecer'; },
  aposAmanhecer: function () {
    if (S.rn.eliminado != null) { S.rev = { id: S.rn.eliminado, origem: 'noite' }; S.virada = false; S.tela = 'revelacao'; }
    else montarManha();
  },
  virarRev: function () { S.virada = true; S.animar = true; somRevelacao(); },
  aposRev: function () {
    S.virada = false;
    if (vingancaPendente()) { S.vingou = true; S.sel = undefined; S.tela = 'vinganca'; return; }
    if (S.g.vencedor) { S.tela = 'fim'; return; }
    if (S.rev.origem === 'voto') { abrirNoite(); return; }
    montarManha();
  },
  vingar: function () { Motor.vingar(S.g, S.sel); S.rev = { id: S.sel, origem: S.rev.origem, vinganca: true }; S.sel = undefined; S.virada = false; S.tela = 'revelacao'; },
  aposPista: avancarManha,
  aposEvento: avancarManha,
  tog: function (v) { S[v] = !S[v]; },
  irVotar: function () { S.fase = 'voto'; S.fila = Motor.vivos(S.g).map(function (j) { return j.id; }); S.idx = 0; S.tela = 'passar'; },
  defesa: function () { S.total = S.resta = 20; S.tela = 'defesa'; },
  irJulgar: function () {
    S.fase = 'juri'; S.juri = {};
    S.fila = Motor.vivos(S.g).filter(function (j) { return j.id !== S.rv.acusado; }).map(function (j) { return j.id; });
    S.idx = 0; S.sel = undefined; S.tela = 'passar';
  },
  aposVeredito: function () {
    if (S.rj.culpado) { S.rev = { id: S.rv.acusado, origem: 'voto' }; S.virada = false; S.tela = 'revelacao'; }
    else abrirNoite();
  },
  anoitecer: abrirNoite,
  denovo: comecar,
  trocar: function () { S.tela = 'inicio'; S.g = null; },
  jogarLocal: function () { S.erro = ''; S.tela = 'inicio'; },
  menu: function () { S.erro = ''; S.tela = 'menu'; }
};
app.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  if (b.dataset.act === 'som') { Som.ligado = !Som.ligado; Som.init(); if (!Som.ligado) Voz.calar(); b.outerHTML = botaoSom(); var vv = app.querySelector('video'); if (vv) vv.muted = !Som.ligado || !vv.hasAttribute('data-som'); return; }
  Som.init(); Voz.ligar();
  if (CD.interceptar && CD.interceptar(b.dataset.act, b)) return;
  var antes = S.tela;
  if (!ACOES[b.dataset.act]) return;
  ACOES[b.dataset.act](b.dataset.v);
  render(antes !== S.tela);
});
app.addEventListener('input', function (e) {
  if (e.target.dataset.nome != null) S.nomes[Number(e.target.dataset.nome)] = e.target.value;
  var campo = e.target.dataset.campo;
  if (campo) { S[campo] = e.target.value; if (campo === 'nomeOnline') gravarLS('nome', e.target.value); if (campo === 'iaChave') gravarLS('iachave', e.target.value.trim()); }
});

/* ---------- telas ---------- */
var TELAS = {
  menu: function () {
    return ['noite', cena('noite.jpg') + '<div class="corpo">' +
      '<div><h1 class="titulo" tabindex="-1">CIDADE DORME</h1><p style="margin-top:8px">Alguém entre vocês mata à noite. Descubra quem antes que seja tarde.</p></div>' +
      (S.erro ? '<p class="erro" role="alert">' + esc(S.erro) + '</p>' : '') +
      '<label class="campo"><span class="rotulo">Seu nome</span><input type="text" maxlength="12" autocomplete="off" data-campo="nomeOnline" value="' + esc(S.nomeOnline) + '" placeholder="Como te chamam?"></label>' +
      btn('criarSala', 'Criar sala online') +
      '<div class="ou"><span>ou entre numa sala</span></div>' +
      '<div class="linha" style="align-items:flex-end"><label class="campo" style="flex:1"><span class="rotulo">Código da sala</span><input type="text" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" data-campo="codigo" value="' + esc(S.codigo) + '" placeholder="Ex.: LUA7" class="codigo"></label>' +
      '<button type="button" class="btn sec" data-act="entrarSala" style="width:auto;min-height:56px;padding:0 22px">Entrar</button></div>' +
      '<div class="ou"><span>sem internet ou sem amigos</span></div>' +
      btn('solo', 'Jogar sozinho contra a IA', 'sec') + btn('jogarLocal', 'Um celular só, passando de mão em mão', 'sec') + '</div>'];
  },
  inicio: function () {
    var campos = '';
    for (var i = 0; i < S.n; i++) campos += '<label class="nome">' + av(i) + '<input type="text" maxlength="12" autocomplete="off" data-nome="' + i + '" value="' + esc(S.nomes[i]) + '" placeholder="Jogador ' + (i + 1) + '" aria-label="Nome do jogador ' + (i + 1) + '"></label>';
    function seg(act, v, atualV, txt) { return '<button type="button" class="seg" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (v === atualV) + '">' + txt + '</button>'; }
    function tog(v, txt) { return '<button type="button" class="seg" data-act="tog" data-v="' + v + '" aria-pressed="' + S[v] + '">' + txt + '</button>'; }
    var temV = S.vingador && S.n - 2 - S.nA >= 2;
    function grupo(rot, bts) { return '<div><p class="rotulo" style="margin-bottom:8px">' + rot + '</p><div class="linha">' + bts + '</div></div>'; }
    return ['noite', cena('noite.jpg') + '<div class="corpo">' +
      '<div><h1 class="titulo" tabindex="-1">CIDADE DORME</h1><p style="margin-top:8px">Alguém entre vocês mata à noite. Um celular só: passem o aparelho de mão em mão.</p></div>' +
      grupo('Jogadores', seg('n', 6, S.n, '6') + seg('n', 7, S.n, '7') + seg('n', 8, S.n, '8')) +
      '<div class="nomes">' + campos + '</div>' +
      grupo('Assassinos', seg('nA', 1, S.nA, '1 (longa)') + seg('nA', 2, S.nA, '2 (curta)')) +
      grupo('Tempo de debate', seg('min', 1, S.minutos, '1 min') + seg('min', 2, S.minutos, '2 min') + seg('min', 3, S.minutos, '3 min')) +
      grupo('Extras', tog('vingador', 'Vingador') + tog('eventos', 'Eventos')) +
      '<p class="aviso">Nesta partida: ' + (um() ? '1 assassino' : '2 assassinos') + ', 1 médico, 1 investigador' + (temV ? ', 1 vingador' : '') + ' e ' + (S.n - 2 - S.nA - (temV ? 1 : 0)) + ' inocentes.' + (S.eventos ? ' A partir da segunda noite, eventos podem mudar as regras.' : '') + '</p>' +
      '<div class="cresce"></div>' + btn('comecar', 'Sortear os papéis') + btn('menu', 'Voltar', 'sec') + '</div>'];
  },
  passar: function () {
    var j = atual(), dia = S.fase === 'voto' || S.fase === 'juri', pos = ' · ' + (S.idx + 1) + ' de ' + S.fila.length;
    var rot = { revelar: 'Cartas', noite: 'Noite ' + S.g.noite, voto: 'Acusação', juri: 'Julgamento' }[S.fase] + pos;
    var txt = S.fase === 'revelar' ? 'Só esta pessoa pode ver a próxima tela.' : S.fase === 'noite' ? 'Todo mundo faz uma escolha à noite, para ninguém descobrir quem é quem.' : 'O voto é secreto.';
    return [dia ? 'dia' : 'noite', cena(dia ? 'dia.jpg' : 'noite.jpg', 'baixa') + '<div class="corpo centro">' +
      '<p class="rotulo">' + rot + '</p><h1 tabindex="-1">Passe o celular para</h1>' + av(j.id, 'g') +
      '<h2 style="font-size:40px">' + esc(j.nome) + '</h2><p>' + txt + '</p><div class="cresce"></div>' +
      btn('souEu', 'Sou eu') + '</div>'];
  },
  carta: function () {
    var j = atual(), p = PAPEIS[j.papel], par = j.papel === 'vilao' ? Motor.parceiro(S.g, j.id) : null;
    var titulo = j.papel === 'vilao' ? (um() ? 'Você é o Assassino' : 'Você é um Assassino') : p.titulo;
    var desc = j.papel === 'vilao' ? (um() ? 'Toda noite, você escolhe a próxima vítima. De dia, finja inocência e não seja pego.' : 'Toda noite, você e seu parceiro escolhem a próxima vítima. De dia, finjam inocência.') : p.desc;
    var info = S.virada
      ? '<h2 style="color:' + p.cor + '">' + titulo + '</h2><p>' + desc + '</p>' + (par ? '<p style="color:var(--fg)">Seu parceiro é ' + esc(par.nome) + '.</p>' : '') + '<div class="cresce"></div>' + btn('proximo', online() ? 'Pronto, escondi' : 'Esconder e passar')
      : '<h2>Toque na carta para virar</h2><p>Confira se ninguém está olhando.</p>';
    return ['noite', '<div class="corpo centro" style="padding-top:34px"><p class="rotulo">Só ' + esc(j.nome) + ' vê esta tela</p><h1 tabindex="-1">Sua carta</h1>' +
      '<button type="button" class="carta-btn" data-act="virar" aria-label="Virar a carta"' + (S.virada ? ' disabled' : '') + '><div class="carta' + (S.virada ? ' virada' : '') + '">' +
      '<img src="' + A + 'carta_verso.jpg" alt=""><img class="frente" src="' + A + p.carta + '" alt=""></div></button>' + info + '</div>'];
  },
  noiteIntro: function () {
    var fala = NARRA_NOITE[Math.min(S.g.noite, NARRA_NOITE.length) - 1];
    return ['noite', (S.g.evento === 'apagao' ? video('apagao.mp4', 'noite.jpg', 'apagao', 'data-som') : video('anoitecer.mp4', 'noite.jpg')) + '<div class="corpo centro"><p class="rotulo">Noite ' + S.g.noite + '</p><h1 tabindex="-1">A cidade dorme</h1>' +
      '<p style="color:var(--fg);font-size:18px">' + fala + '</p>' +
      (S.g.evento === 'apagao' ? '<div class="cartao" style="padding:14px 16px;gap:4px"><h2 style="font-size:24px;color:#b3141c">' + EVENTOS.apagao[0] + '</h2><p>' + EVENTOS.apagao[1] + '</p></div>' : '') +
      '<p>' + (online() ? 'Cada um faz sua escolha no próprio celular. Não deixe ninguém ver a sua tela.' : 'Cada jogador recebe o celular e faz sua escolha em segredo. Os outros olham para o lado.') + '</p><div class="cresce"></div>' + btn('iniciarNoite', 'Começar a noite') + '</div>'];
  },
  acao: function () {
    var j = atual(), g = S.g, par, titulo, dica, rotulo;
    if (j.papel === 'vilao') {
      par = Motor.parceiro(g, j.id); titulo = 'Quem será a vítima desta noite?';
      dica = g.acoes.ataque != null ? esc(par.nome) + ' já escolheu ' + esc(J(g.acoes.ataque).nome) + '. Confirme ou troque: vale a última escolha.' : (par && par.vivo ? (online() ? 'Seu parceiro é ' + esc(par.nome) + '. Se escolherem pessoas diferentes, vale a última escolha. Combinem no chat dos assassinos.' : 'Seu parceiro ' + esc(par.nome) + ' joga depois e pode confirmar ou trocar.') : 'Você age sozinho. Escolha bem.');
      rotulo = 'Atacar';
    } else if (j.papel === 'medico') {
      titulo = 'Quem você protege?'; rotulo = 'Proteger';
      dica = g.ultimaProtecao === j.id ? 'Você se protegeu na noite passada, então hoje precisa escolher outra pessoa.' : 'Se essa pessoa for atacada esta noite, ela sobrevive.';
      if (g.evento === 'apagao') { titulo = 'Apagão: você não pode agir'; rotulo = 'Confirmar'; dica = 'Sem luz, você não consegue sair de casa. Escolha alguém só para disfarçar.'; }
    } else if (j.papel === 'investigador') {
      titulo = 'Quem você investiga?'; rotulo = 'Investigar'; dica = 'Você descobre se a pessoa saiu de casa esta noite.';
    } else {
      titulo = 'Quem parece suspeito?'; rotulo = 'Confirmar'; dica = j.papel === 'vingador' ? 'Você não age à noite. Sua escolha não muda nada: serve só para disfarçar. Sua hora chega se tentarem te eliminar.' : 'Você é inocente e não age à noite. Sua escolha não muda nada: serve só para disfarçar.';
    }
    var alvo = S.sel != null ? ' ' + esc(J(S.sel).nome) : '';
    return ['noite', '<div class="corpo" style="padding-top:30px"><p class="rotulo">Noite ' + g.noite + ' · só ' + esc(j.nome) + ' vê</p><h1 tabindex="-1">' + titulo + '</h1><p>' + dica + '</p>' +
      '<div class="grade">' + opcoes(Motor.alvos(g, j.id)) + '</div><div class="cresce"></div>' +
      '<button type="button" class="btn" data-act="agir"' + (S.sel == null ? ' disabled' : '') + '>' + (rotulo === 'Confirmar' ? 'Confirmar' : rotulo + alvo) + '</button></div>'];
  },
  investigacao: function () {
    var a = J(S.inv.alvo), saiu = S.inv.r === 'saiu';
    return ['noite', '<div class="corpo centro" style="padding-top:30px"><p class="rotulo">Noite ' + S.g.noite + ' · só o investigador vê</p><h1 tabindex="-1">Sua investigação</h1>' +
      '<div class="cartao"><img class="ico" src="' + A + (saiu ? 'saiu_de_casa.svg' : 'ficou_em_casa.svg') + '" alt="">' +
      '<h2>' + esc(a.nome) + (saiu ? ' saiu de casa' : ' ficou em casa') + '</h2>' +
      '<p>' + (saiu ? 'Quem sai de casa agiu durante a noite: é assassino ou médico.' : 'Quem fica em casa não agiu durante a noite: não é assassino nem médico.') + '</p></div>' +
      '<div class="cresce"></div>' + btn('proximo', online() ? 'Guardar segredo' : 'Guardar segredo e passar') + '</div>'];
  },
  ataque: function () {
    var fala = NARRA_ATAQUE[(S.g.noite - 1) % NARRA_ATAQUE.length];
    return ['noite', video('ataque.mp4', 'ataque_poster.jpg', 'alta', 'loop data-som') + '<div class="corpo centro"><p class="rotulo">Noite ' + S.g.noite + '</p><h1 tabindex="-1" style="color:#ff7a7a">' + (um() ? 'O assassino saiu às ruas' : 'Os assassinos saíram às ruas') + '</h1>' +
      '<p class="pulsa" id="fala" style="color:var(--fg);font-size:19px;min-height:48px">' + fala[0] + '</p><div class="cresce"></div>' + btn('aposAtaque', 'Amanhecer', 'sec') + '</div>'];
  },
  amanhecer: function () {
    var r = S.rn, n = Motor.vivos(S.g).length, card;
    if (r.eliminado != null) card = '<div class="cartao revela" id="laudo">' + av(r.eliminado, 'g fora') + '<h2 style="color:#b3141c">' + esc(J(r.eliminado).nome) + ' foi a vítima desta noite</h2><p>Mas quem era essa pessoa, afinal?</p></div>';
    else card = '<div class="cartao revela" id="laudo"><img class="ico" src="' + A + 'protegido.svg" alt=""><h2 style="color:#146b34">Ninguém morreu esta noite</h2><p>Houve um ataque, mas o médico chegou a tempo.</p></div>';
    return ['dia', video('amanhecer.mp4', 'dia.jpg') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + '</p><h1 tabindex="-1">A cidade acorda</h1>' +
      '<p class="pulsa" id="sus" style="color:var(--fg);font-size:19px">Todos abrem os olhos...</p>' + card +
      '<p class="revela">Restam ' + n + ' jogadores.</p><div class="cresce"></div>' +
      '<button type="button" class="btn revela" data-act="aposAmanhecer">' + (r.eliminado != null ? 'Descobrir quem era' : 'Ir para o debate') + '</button></div>'];
  },
  revelacao: function () {
    var j = J(S.rev.id), p = PAPEIS[j.papel], voto = S.rev.origem === 'voto', era, linha;
    era = eraTexto(j);
    if (j.papel === 'vilao') linha = voto ? 'A cidade acertou.' : '';
    else {
      linha = j.papel === 'medico' ? 'A cidade perdeu quem a protegia.' : j.papel === 'investigador' ? 'A cidade perdeu quem buscava a verdade.' : (voto ? 'A cidade condenou um inocente. Quem mata continua à solta.' : 'Mais um inocente se foi.');
    }
    if (S.rev.vinganca) linha = j.papel === 'vilao' ? 'O Vingador acertou em cheio.' : 'O Vingador levou alguém do lado errado.';
    if (j.papel === 'vingador') linha = 'E o Vingador nunca cai sozinho.';
    var pend = S.virada && vingancaPendente();
    var info = S.virada
      ? '<h2 style="color:' + p.cor + ';font-size:34px">' + esc(j.nome) + ' ' + era + '</h2><p style="color:var(--fg);font-size:18px">' + linha + '</p><div class="cresce"></div>' + btn('aposRev', pend ? (online() ? 'A vez de ' + esc(j.nome) : 'Entregar o celular a ' + esc(j.nome)) : (S.g.vencedor ? 'Ver o resultado' : (voto ? 'Anoitecer' : 'Continuar')))
      : '<h2 class="pulsa">' + (S.modo === 'cliente' ? esc(S.hostNome) + ' vai revelar a carta' : 'Toque na carta para revelar') + '</h2>';
    return ['noite', '<div class="corpo centro" style="padding-top:34px"><p class="rotulo">' + 'Dia ' + S.g.dia + (S.rev.vinganca ? ' · a vingança' : (voto ? ' · sentença cumprida' : ' · a vítima')) + '</p><h1 tabindex="-1">Quem era ' + esc(j.nome) + '?</h1>' +
      '<button type="button" class="carta-btn" data-act="virarRev" aria-label="Revelar a carta"' + (S.virada ? ' disabled' : '') + '><div class="carta' + (S.virada ? ' virada' : '') + '">' +
      '<img src="' + A + 'carta_verso.jpg" alt=""><img class="frente" src="' + A + p.carta + '" alt=""></div></button>' + info + '</div>'];
  },
  vinganca: function () {
    var j = J(S.rev.id), alvo = S.sel != null ? ' ' + esc(J(S.sel).nome) : '';
    return ['noite', cena('vitoria_viloes.jpg', 'baixa') + '<div class="corpo"><p class="rotulo">Dia ' + S.g.dia + ' · a vingança</p><h1 tabindex="-1" style="color:#ff9a3d">' + esc(j.nome) + ' não vai sozinho</h1>' +
      '<p>' + (online() ? 'Escolha quem cai junto com você. Todos vão ver.' : esc(j.nome) + ', o celular é seu. Escolha, na frente de todos, quem cai com você.') + '</p>' +
      '<div class="grade">' + opcoes(Motor.vivos(S.g)) + '</div><div class="cresce"></div>' +
      '<button type="button" class="btn" data-act="vingar"' + (S.sel == null ? ' disabled' : '') + '>Levar' + alvo + '</button></div>'];
  },
  evento: function () {
    var e = EVENTOS[S.g.evento], extra = '';
    if (S.g.evento === 'carta') extra = '<div class="fichas" style="margin-top:6px">' + S.carta.map(function (id) { return '<div class="ficha" style="width:84px;font-size:14px;color:#15131f">' + av(id) + esc(J(id).nome) + '</div>'; }).join('') + '</div>';
    return ['dia', (S.g.evento === 'tempestade' ? video('tempestade.mp4', 'tempestade_poster.jpg', '', 'data-som') : cena('dia.jpg', 'baixa')) + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · evento</p><h1 tabindex="-1">Algo mudou na cidade</h1>' +
      '<p class="pulsa" id="sus" style="color:var(--fg);font-size:19px">Os sinos da praça tocam fora de hora...</p>' +
      '<div class="cartao revela" id="laudo" style="background:#fff"><h2 style="color:#7a55c7;font-size:32px">' + e[0] + '</h2><p>' + e[1] + '</p>' + extra + '</div>' +
      '<div class="cresce"></div>' + btn('aposEvento', 'Ir para o debate', 'revela') + '</div>'];
  },
  pista: function () {
    var j = J(S.pista), fala = NARRA_PISTA[(S.g.dia - 1) % NARRA_PISTA.length];
    return ['dia', cena('dia.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · pista do crime</p><h1 tabindex="-1">Acharam uma pista</h1>' +
      '<p class="pulsa" id="sus" style="color:var(--fg);font-size:19px">Os moradores vasculham a cena do crime...</p>' +
      '<div class="cartao revela" id="laudo" style="background:#fff">' + av(j.id, 'g') + '<h2 style="color:#146b34">' + esc(j.nome) + ' tem um álibi</h2><p>' + fala + ' ' + esc(j.nome) + ' não matou ninguém.</p></div>' +
      '<div class="cresce"></div>' + btn('aposPista', 'Ir para o debate', 'revela') + '</div>'];
  },
  debate: function () {
    var fichas = S.g.jogadores.map(function (j) { return '<div class="ficha' + (j.vivo ? '' : ' fora') + '">' + av(j.id, j.vivo ? '' : 'fora') + esc(j.nome) + (j.vivo && temAlibi(j.id) ? '<small class="tag">álibi</small>' : '') + '</div>'; }).join('');
    return ['dia', cena('dia.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · debate</p><h1 tabindex="-1" id="chamada">Quem parece suspeito?</h1>' +
      '<div class="cartao" style="background:#fff"><div style="display:flex;align-items:center;gap:12px"><img src="' + A + 'tempo.svg" alt="" width="60" height="60"><span class="relogio" id="relogio" role="timer"></span></div>' +
      '<div class="barra"><i id="barra"></i></div></div>' +
      '<p>Acusem, defendam-se, mintam se for preciso. Depois, cada um acusa alguém em segredo.</p><div class="fichas">' + fichas + '</div><div class="cresce"></div>' + btn('irVotar', 'Ir para a acusação') + '</div>'];
  },
  voto: function () {
    var j = atual();
    var ops = opcoes(Motor.vivos(S.g).filter(function (a) { return a.id !== j.id; })) + '<button type="button" class="op larga" data-act="sel" data-v="nenhum" aria-pressed="' + (S.sel === null) + '">Não acusar ninguém</button>';
    return ['dia', '<div class="corpo" style="padding-top:30px"><p class="rotulo">Dia ' + S.g.dia + ' · acusação secreta de ' + esc(j.nome) + '</p><h1 tabindex="-1">Quem você acusa?</h1>' +
      '<div class="grade">' + ops + '</div><div class="cresce"></div><p class="aviso" style="text-align:center">O mais acusado vai a julgamento. Se der empate, ninguém é julgado.</p>' +
      '<button type="button" class="btn" data-act="votar"' + (S.sel === undefined ? ' disabled' : '') + '>Confirmar acusação</button></div>'];
  },
  resultadoVoto: function () {
    var r = S.rv, total = S.fila.length, linhas = '', brancos = 0;
    S.fila.forEach(function (id) { if (S.g.votos[id] == null) brancos++; });
    S.fila.forEach(function (id) {
      var c = r.contagem[id] || 0;
      linhas += '<div class="voto" data-c="' + c + '" data-w="' + Math.round(c / total * 100) + '">' + av(id) + '<b>' + esc(J(id).nome) + '</b><div class="t"><i></i></div><span class="c"></span></div>';
    });
    return ['dia', cena('dia.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · acusações</p><h1 tabindex="-1" id="veredito" class="pulsa">Contando as acusações...</h1>' +
      '<div class="votos">' + linhas + '</div><p class="aviso revela">Não acusaram ninguém: ' + brancos + '</p><div class="cresce"></div>' +
      (r.acusado != null ? btn('defesa', 'Ouvir a defesa', 'revela') : btn('anoitecer', 'Anoitecer', 'revela')) + '</div>'];
  },
  defesa: function () {
    var j = J(S.rv.acusado);
    return ['dia', cena('dia.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · julgamento</p><h1 tabindex="-1" id="chamada">A defesa de ' + esc(j.nome) + '</h1>' + av(j.id, 'g') +
      '<span class="relogio" id="relogio" role="timer" style="color:var(--fg)"></span><div class="barra"><i id="barra"></i></div>' +
      '<p>' + esc(j.nome) + ' tem 20 segundos para convencer a cidade. Ninguém interrompe.</p><div class="cresce"></div>' + btn('irJulgar', 'Votar a sentença') + '</div>'];
  },
  juri: function () {
    var j = atual(), reu = J(S.rv.acusado);
    function op(v, txt, cor) { return '<button type="button" class="op jop" data-act="selJ" data-v="' + v + '" aria-pressed="' + (S.sel === (v === 'sim')) + '" style="--cor:' + cor + '">' + txt + '</button>'; }
    return ['dia', '<div class="corpo centro" style="padding-top:30px"><p class="rotulo">Dia ' + S.g.dia + ' · voto secreto de ' + esc(j.nome) + '</p><h1 tabindex="-1">' + esc(reu.nome) + ' deve sair da cidade?</h1>' + av(reu.id, 'g') +
      '<div class="grade" style="width:100%">' + op('sim', 'Culpado', '#b3141c') + op('nao', 'Inocente', '#146b34') + '</div><div class="cresce"></div>' +
      '<p class="aviso">' + (S.g.evento === 'furia' ? 'Dia de fúria: hoje, empate condena.' : 'Só sai se a maioria votar culpado. Empate absolve.') + '</p>' +
      '<button type="button" class="btn" data-act="jurar"' + (S.sel === undefined ? ' disabled' : '') + '>Confirmar voto</button></div>'];
  },
  veredito: function () {
    var reu = J(S.rv.acusado), r = S.rj;
    return ['dia', cena('dia.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Dia ' + S.g.dia + ' · sentença</p><h1 tabindex="-1" id="veredito" class="pulsa">A cidade decide...</h1>' +
      '<div id="reu">' + av(reu.id, 'g') + '</div>' +
      '<div class="placar"><div style="--cor:#b3141c"><b id="pSim">0</b>Culpado</div><div style="--cor:#146b34"><b id="pNao">0</b>Inocente</div></div>' +
      '<p class="revela" style="color:var(--fg);font-size:18px">' + (r.culpado ? esc(reu.nome) + ' vai sair da cidade.' : esc(reu.nome) + ' fica. Mas a dúvida também.') + '</p><div class="cresce"></div>' +
      (r.culpado ? btn('aposVeredito', 'Descobrir quem era', 'revela') : btn('aposVeredito', 'Anoitecer', 'revela')) + '</div>'];
  },
  fim: function () {
    var c = S.g.vencedor === 'cidadaos';
    var lista = S.g.jogadores.map(function (j) {
      var p = PAPEIS[j.papel];
      return '<div class="papel">' + av(j.id, j.vivo ? '' : 'fora') + '<div>' + esc(j.nome) + '<span class="chip" style="background:' + p.chip[0] + ';color:' + p.chip[1] + '">' + p.nome + '</span></div></div>';
    }).join('');
    var frase = c ? (um() ? 'O assassino foi descoberto.' : 'Todos os assassinos foram descobertos.') : (um() ? 'Não sobrou gente bastante para detê-lo.' : 'Não sobrou gente bastante para detê-los.');
    return [c ? 'dia' : 'noite', (c ? video('confete.mp4', 'vitoria_cidadaos.jpg', '', 'loop') : video('ataque.mp4', 'ataque_poster.jpg', '', 'loop data-som')) + '<div class="corpo"><div><p class="rotulo">Fim de jogo · ' + S.g.noite + (S.g.noite === 1 ? ' noite' : ' noites') + '</p>' +
      '<h1 tabindex="-1" style="font-size:40px;color:' + (c ? '#146b34' : '#ff7a7a') + '">' + (c ? 'A cidade venceu!' : (um() ? 'O assassino venceu!' : 'Os assassinos venceram!')) + '</h1>' +
      '<p style="margin-top:6px">' + frase + ' Veja quem era quem:</p></div>' +
      '<div class="grade">' + lista + '</div><div class="cresce"></div>' + btn('denovo', 'Jogar de novo') + btn('trocar', online() ? 'Voltar para a sala' : 'Trocar jogadores', 'sec') + '</div>'];
  }
};

/* ---------- efeitos ao entrar em cada tela ---------- */
function tique(soa) {
  var el = document.getElementById('relogio'), barra = document.getElementById('barra'); if (!el) return;
  var s = Math.max(0, S.resta);
  el.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  barra.style.width = Math.round(s / S.total * 100) + '%';
  if (s <= 10 && S.total > 20) el.classList.add('tenso');
  if (s <= 5) el.classList.add('tenso');
  if (!soa) return;
  if (s > 0 && s <= (S.total > 20 ? 10 : 5)) Som.tique();
  if (s === 0) { Som.apito(); vibrar(400); el.classList.remove('tenso'); texto('chamada', 'Tempo esgotado!'); }
}
function ligarRelogio() {
  tique(false);
  relogio = setInterval(function () { if (S.resta > 0) { S.resta--; tique(true); } }, 1000);
}
function suspense(ms, fim) {
  coracao();
  depois(ms, function () { pararCoracao(); var s = document.getElementById('sus'); if (s) s.remove(); mostrar(); fim(); });
}
/* o que tocar quando o vídeo não sai com áudio */
var SEM_SOM = {
  ataque: function () { coracao(900); },
  fim: function () { if (S.g.vencedor !== 'cidadaos') Som.derrota(); }
};
var AO_ENTRAR = {
  ataque: function () {
    var fala = NARRA_ATAQUE[(S.g.noite - 1) % NARRA_ATAQUE.length];
    Voz.falar(fala[0] + ' ' + fala[1]);
    depois(4200, function () { texto('fala', fala[1]); if (batimento) { pararCoracao(); coracao(600); } });
    depois(9500, function () {
      if (!online()) { S.tela = 'amanhecer'; render(true); }
      else if (S.souHost && CD.hostAcao) CD.hostAcao(0, 'aposAtaque');
    });
  },
  amanhecer: function () {
    Voz.falar('A cidade acorda. Todos abrem os olhos... será que todos?');
    depois(2400, function () { texto('sus', '...será que todos?'); });
    suspense(5000, function () {
      if (S.rn.eliminado != null) { Som.susto(); vibrar(300); clarao(); document.getElementById('laudo').classList.add('tremor'); Voz.falar(J(S.rn.eliminado).nome + ' foi a vítima desta noite.'); }
      else { Som.sino(); Voz.falar('Ninguém morreu esta noite. O médico chegou a tempo.'); }
    });
  },
  revelacao: function () { coracao(700); },
  pista: function () { suspense(3000, function () { Som.sino(); Voz.falar('Acharam uma pista. ' + J(S.pista).nome + ' tem um álibi.'); }); },
  evento: function () { suspense(2600, function () { Som.martelo(); Voz.falar(EVENTOS[S.g.evento][0] + '. ' + EVENTOS[S.g.evento][1]); }); },
  vinganca: function () { coracao(600); Voz.falar(J(S.rev.id).nome + ' não vai sozinho. Escolha quem cai com você.'); },
  noiteIntro: function () { if (S.g.evento === 'apagao') { Som.apagar(); vibrar([80, 120, 80]); } Voz.falar('Noite ' + S.g.noite + '. A cidade dorme. ' + NARRA_NOITE[Math.min(S.g.noite, NARRA_NOITE.length) - 1] + (S.g.evento === 'apagao' ? ' Apagão. ' + EVENTOS.apagao[1] : '')); },
  debate: ligarRelogio,
  defesa: ligarRelogio,
  resultadoVoto: function () {
    var linhas = app.querySelectorAll('.voto'), r = S.rv;
    linhas.forEach(function (l, i) {
      depois(900 + i * 700, function () { l.querySelector('i').style.width = l.dataset.w + '%'; l.querySelector('.c').textContent = l.dataset.c; Som.tique(); });
    });
    depois(900 + linhas.length * 700 + 1200, function () {
      var h = document.getElementById('veredito'); h.classList.remove('pulsa');
      h.textContent = r.acusado != null ? J(r.acusado).nome + ' vai a julgamento' : (r.empate ? 'Empate: ninguém é julgado' : 'Ninguém foi acusado');
      mostrar();
      if (r.acusado != null) Som.martelo(); else Som.apito();
      Voz.falar(h.textContent);
    });
  },
  veredito: function () {
    var r = S.rj, ordem = [], i, t = 1200;
    for (i = 0; i < Math.max(r.sim, r.nao); i++) { if (i < r.sim) ordem.push('pSim'); if (i < r.nao) ordem.push('pNao'); }
    coracao(700);
    ordem.forEach(function (id) {
      depois(t, function () { var e = document.getElementById(id); e.textContent = Number(e.textContent) + 1; Som.tique(); });
      t += 900;
    });
    depois(t + 900, function () {
      pararCoracao();
      var h = document.getElementById('veredito'); h.classList.remove('pulsa');
      h.textContent = r.culpado ? 'Culpado!' : 'Absolvido!'; h.style.color = r.culpado ? '#b3141c' : '#146b34'; h.style.fontSize = '44px';
      mostrar();
      if (r.culpado) { Som.martelo(); vibrar(300); clarao(); document.getElementById('reu').classList.add('tremor'); } else Som.sino();
      Voz.falar(r.culpado ? 'Culpado!' : 'Absolvido.');
    });
  },
  fim: function () { if (S.g.vencedor === 'cidadaos') Som.vitoria(); Voz.falar(S.g.vencedor === 'cidadaos' ? 'A cidade venceu!' : (um() ? 'O assassino venceu.' : 'Os assassinos venceram.')); }
};
function render(mudou) {
  limpar();
  var r = TELAS[S.tela]();
  document.body.className = r[0];
  app.innerHTML = r[1] + botaoSom();
  if (CD.posRender) CD.posRender(mudou);
  if (S.animar) { S.animar = false; var c = app.querySelector('.carta'); if (c) { c.classList.remove('virada'); void c.offsetWidth; c.classList.add('virada'); } }
  if (mudou) {
    window.scrollTo(0, 0);
    var h = app.querySelector('h1'); if (h) h.focus({ preventScroll: true });
    var v = app.querySelector('video'); if (v) tocarVideo(v, SEM_SOM[S.tela]);
    if (AO_ENTRAR[S.tela]) AO_ENTRAR[S.tela]();
  }
}
var CD = window.CD = {
  S: S, render: render, TELAS: TELAS, ACOES: ACOES, AO_ENTRAR: AO_ENTRAR, SEM_SOM: SEM_SOM, Som: Som,
  PAPEIS: PAPEIS, EVENTOS: EVENTOS, NARRA_NOITE: NARRA_NOITE, NARRA_PISTA: NARRA_PISTA,
  u: { esc: esc, av: av, cena: cena, video: video, btn: btn, J: J, depois: depois, coracao: coracao, pararCoracao: pararCoracao,
    mostrar: mostrar, texto: texto, vibrar: vibrar, somRevelacao: somRevelacao, eraTexto: eraTexto, lerLS: lerLS, gravarLS: gravarLS, online: online, um: um, limpar: limpar }
};
window.__S = S;
CD.iniciar = function () { render(false); };
})();
