/* Cidade Dorme: modo online (anfitrião + jogadores conectados por PeerJS), jogo solo contra agentes e chat.
   O celular do anfitrião guarda o estado verdadeiro (G) e manda para cada jogador só o que ele pode ver. */
(function () {
'use strict';
var CD = window.CD, S = CD.S, u = CD.u, esc = u.esc, av = u.av, btn = u.btn, cena = u.cena;
var MAX = 8, MIN = 5;
var SO_HOST = { comecar: 1, iniciarNoite: 1, aposAtaque: 1, aposAmanhecer: 1, virarRev: 1, aposRev: 1, aposPista: 1, aposEvento: 1, irVotar: 1,
  defesa: 1, irJulgar: 1, aposVeredito: 1, anoitecer: 1, denovo: 1, trocar: 1, nA: 1, min: 1, tog: 1, addBot: 1, rmBot: 1, pular: 1 };
var TELAS_DIA = { amanhecer: 1, revelacao: 1, pista: 1, evento: 1, debate: 1, defesa: 1, resultadoVoto: 1, veredito: 1, vinganca: 1, fim: 1, lobby: 1 };
var G = null;
var Rede = { peer: null, conn: null };

/* ================= rede ================= */
function opcoesPeer() {
  var q = null; try { q = new URLSearchParams(location.search).get('peer'); } catch (e) {}
  if (q) { var p = q.split(':'); return { host: p[0], port: Number(p[1]) || 9000, path: '/', secure: false, debug: 0 }; }
  return { debug: 0 };
}
function idSala(c) { return 'cidadedorme-v1-' + c.toLowerCase(); }
function gerarCodigo() { var L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c = ''; for (var i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; return c; }
function limparNome(n) { return String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'Jogador'; }
function nomeUnico(n) {
  var base = n, k = 2;
  while (G.slots.some(function (s) { return s.nome.toLowerCase() === n.toLowerCase(); })) n = base.slice(0, 10) + ' ' + (k++);
  return n;
}
function encerrarRede() {
  if (CD.Mic) CD.Mic.desligar();
  try { if (Rede.conn) Rede.conn.close(); } catch (e) {}
  try { if (Rede.peer) Rede.peer.destroy(); } catch (e) {}
  Rede.peer = null; Rede.conn = null;
}
function falha(msg) {
  encerrarRede(); if (CD.IA) CD.IA.parar();
  G = null; S.modo = 'local'; S.souHost = false; S.rede = false; S.erro = msg; S.tela = 'menu'; S.chat = []; S.chave = '';
  CD.render(true); renderChat();
}
var trava = null;
function acordar() {
  try { if (navigator.wakeLock && !trava) navigator.wakeLock.request('screen').then(function (t) { trava = t; t.addEventListener('release', function () { trava = null; }); }).catch(function () {}); } catch (e) {}
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.modo !== 'local') acordar(); });
function exigirNome() {
  S.nomeOnline = limparNome(S.nomeOnline === 'Jogador' ? '' : S.nomeOnline);
  if (!S.nomeOnline || S.nomeOnline === 'Jogador') { S.erro = 'Digite seu nome antes.'; S.tela = 'menu'; CD.render(true); return false; }
  u.gravarLS('nome', S.nomeOnline); return true;
}

function criarSala(tent) {
  if (!exigirNome()) return;
  if (typeof Peer === 'undefined') return falha('Não foi possível carregar a conexão. Verifique a internet.');
  tent = tent || 0;
  var codigo = gerarCodigo(), peer;
  S.tela = 'conectando'; S.conectandoMsg = 'Criando a sala...'; CD.render(true);
  try { peer = new Peer(idSala(codigo), opcoesPeer()); } catch (e) { return falha('Não foi possível criar a sala aqui.'); }
  Rede.peer = peer;
  var timer = setTimeout(function () { if (S.modo !== 'host') falha('O servidor de salas não respondeu. Tente de novo.'); }, 15000);
  peer.on('open', function () {
    clearTimeout(timer);
    G = novoG(true); G.codigo = codigo; G.slots.push(slotHost());
    S.modo = 'host'; S.souHost = true; S.chat = []; S.erro = ''; S.chave = '';
    acordar(); transmitir(); renderChat();
  });
  peer.on('connection', function (conn) {
    conn.on('data', function (d) { hostMsg(conn, d); });
    conn.on('close', function () { hostCaiu(conn); });
    conn.on('error', function () { hostCaiu(conn); });
  });
  peer.on('call', function (call) { if (CD.Mic) CD.Mic.chamadaRecebida(call); else call.close(); });
  peer.on('disconnected', function () { if (!peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
  peer.on('error', function (e) {
    var tipo = e && e.type;
    if (S.modo === 'host') return;
    clearTimeout(timer);
    if (tipo === 'unavailable-id' && tent < 3) { try { peer.destroy(); } catch (x) {} criarSala(tent + 1); return; }
    falha('Não foi possível criar a sala. Verifique a internet.');
  });
}

function entrarSala() {
  if (!exigirNome()) return;
  var codigo = String(S.codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(codigo)) { S.erro = 'O código da sala tem 4 letras ou números.'; CD.render(true); return; }
  if (typeof Peer === 'undefined') return falha('Não foi possível carregar a conexão. Verifique a internet.');
  S.codigo = codigo; S.tela = 'conectando'; S.conectandoMsg = 'Entrando na sala ' + codigo + '...'; CD.render(true);
  var peer;
  try { peer = new Peer(opcoesPeer()); } catch (e) { return falha('Não foi possível conectar daqui.'); }
  Rede.peer = peer;
  var timer = setTimeout(function () { if (S.modo !== 'cliente') falha('A sala ' + codigo + ' não respondeu. Confira o código.'); }, 15000);
  peer.on('open', function () {
    var conn = peer.connect(idSala(codigo), { reliable: true });
    Rede.conn = conn;
    conn.on('open', function () {
      clearTimeout(timer);
      S.modo = 'cliente'; S.souHost = false; S.rede = true; S.chat = []; S.erro = ''; S.chave = '';
      conn.send({ t: 'entrar', nome: S.nomeOnline, token: S.token });
      acordar();
    });
    conn.on('data', clienteMsg);
    conn.on('close', function () { if (S.modo === 'cliente' && Rede.conn === conn) falha('A conexão com a sala caiu. Toque em Entrar para voltar à partida.'); });
  });
  peer.on('call', function (call) { if (CD.Mic) CD.Mic.chamadaRecebida(call); else call.close(); });
  peer.on('disconnected', function () { if (!peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
  peer.on('error', function (e) {
    if (S.modo === 'cliente') return;
    clearTimeout(timer);
    falha(e && e.type === 'peer-unavailable' ? 'Sala ' + codigo + ' não encontrada. Confira o código.' : 'Não foi possível conectar. Verifique a internet.');
  });
}

function clienteMsg(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'view') aplicarView(d.v);
  else if (d.t === 'msg') receberMsg(d.m);
  else if (d.t === 'chatfull') { S.chat = Array.isArray(d.lista) ? d.lista : []; renderChat(); }
  else if (d.t === 'erro') falha(String(d.msg || 'A sala recusou a entrada.'));
}

/* ================= anfitrião ================= */
function novoG(rede) {
  return { rede: rede, codigo: '', fase: 'lobby', tela: 'lobby', slots: [], nA: 1, minutos: 2, vingador: true, eventos: true, g: null,
    prontos: {}, feitos: {}, invs: {}, juri: {}, pulados: {}, revelados: {}, chat: [], chatSeq: 0, seq: 0, virada: false, vingou: false, manha: [] };
}
function slotHost() { return { nome: S.nomeOnline || 'Você', token: S.token, local: true, online: true, bot: false }; }
function slotDaConn(conn) { for (var i = 0; i < G.slots.length; i++) if (G.slots[i].conn === conn) return i; return -1; }
function hostMsg(conn, d) {
  if (!G || !d || typeof d !== 'object') return;
  if (d.t === 'entrar') { hostEntrar(conn, d); return; }
  var pid = slotDaConn(conn); if (pid < 0) return;
  if (d.t === 'acao') hostAcao(pid, String(d.act || ''), d.v, d.sel);
  else if (d.t === 'chat') chatEnviar(pid, String(d.canal || ''), String(d.texto || ''));
  else if (d.t === 'voz') { G.slots[pid].voz = !!d.on; transmitir(); }
}
function negar(conn, msg) { try { conn.send({ t: 'erro', msg: msg }); } catch (e) {} setTimeout(function () { try { conn.close(); } catch (e) {} }, 600); }
function hostEntrar(conn, d) {
  var token = String(d.token || '').slice(0, 64), nome = limparNome(d.nome), i, s;
  for (i = 0; i < G.slots.length; i++) {
    s = G.slots[i];
    if (!s.bot && !s.local && s.token === token) {
      if (s.conn && s.conn !== conn) { try { s.conn.close(); } catch (e) {} }
      s.conn = conn; s.online = true; s.peerId = conn.peer; s.voz = false; s.chatSig = '';
      transmitir(); return;
    }
  }
  if (G.fase !== 'lobby') { negar(conn, 'A partida já começou. Espere a próxima rodada.'); return; }
  if (G.slots.length >= MAX) {
    var b = ultimoBot(); if (b < 0) { negar(conn, 'A sala está cheia (8 jogadores).'); return; }
    G.slots.splice(b, 1);
  }
  G.slots.push({ nome: nomeUnico(nome), token: token, conn: conn, peerId: conn.peer, online: true, bot: false, local: false });
  chatSistema('cidade', G.slots[G.slots.length - 1].nome + ' entrou na sala.');
  transmitir();
}
function hostCaiu(conn) {
  if (!G) return;
  var pid = slotDaConn(conn); if (pid < 0) return;
  var s = G.slots[pid];
  s.online = false; s.conn = null; s.voz = false;
  if (G.fase === 'lobby') { G.slots.splice(pid, 1); chatSistema('cidade', s.nome + ' saiu da sala.'); }
  else chatSistema('cidade', s.nome + ' perdeu a conexão.');
  transmitir();
}
function ultimoBot() { for (var i = G.slots.length - 1; i > 0; i--) if (G.slots[i].bot) return i; return -1; }
function adicionarBot() {
  var usados = G.slots.map(function (s) { return s.nome; });
  var lista = (CD.IA && CD.IA.PERSONAGENS) || [{ nome: 'Agente' }];
  for (var i = 0; i < lista.length; i++) {
    if (usados.indexOf(lista[i].nome) < 0) { G.slots.push({ nome: lista[i].nome, bot: true, online: true, perfil: i, mem: {} }); return; }
  }
}
function vivo(pid) { return !!(G.g && G.g.jogadores[pid] && G.g.jogadores[pid].vivo); }

function transmitir() {
  if (!G) return;
  G.seq++;
  for (var i = 0; i < G.slots.length; i++) {
    var s = G.slots[i];
    if (s.bot) continue;
    var sig = canaisVisiveis(i).join(',');
    if (s.chatSig !== sig) { s.chatSig = sig; enviarChatCompleto(i); }
    var v = viewFor(i);
    if (s.local) aplicarView(v);
    else if (s.conn && s.online) { try { s.conn.send({ t: 'view', v: v }); } catch (e) {} }
  }
  if (CD.IA) CD.IA.tick(api);
}

function pendentes() {
  var r = [], g = G.g;
  if (!g) return r;
  if (G.fase === 'cartas') G.slots.forEach(function (s, i) { if (!G.prontos[i]) r.push(i); });
  else if (G.fase === 'noite' || G.fase === 'voto') Motor.vivos(g).forEach(function (j) { if (!G.feitos[j.id]) r.push(j.id); });
  else if (G.fase === 'juri') Motor.vivos(g).forEach(function (j) { if (j.id !== G.rv.acusado && !(j.id in G.juri) && !G.pulados[j.id]) r.push(j.id); });
  else if (G.tela === 'vinganca') r.push(G.rev.id);
  return r;
}
function sanitizar(pid) {
  var g = JSON.parse(JSON.stringify(G.g)), me = g.jogadores[pid], fim = G.tela === 'fim';
  g.jogadores.forEach(function (j) {
    var conhecido = fim || j.id === pid || G.revelados[j.id] || (G.tela === 'revelacao' && G.rev && G.rev.id === j.id) || (me.papel === 'vilao' && j.papel === 'vilao');
    if (!conhecido) j.papel = 'oculto';
  });
  g.acoes = me.papel === 'vilao' && g.acoes ? { ataque: g.acoes.ataque, protegido: null, investigado: null } : { ataque: null, protegido: null, investigado: null };
  if (g.votos) Object.keys(g.votos).forEach(function (k) { g.votos[k] = g.votos[k] == null ? null : -1; });
  if (me.papel !== 'medico') g.ultimaProtecao = null;
  return g;
}
function canaisVisiveis(pid) {
  var c = ['cidade'], j = G.g && G.g.jogadores[pid];
  if (j && j.papel === 'vilao') c.push('assassinos');
  if (j && !j.vivo) c.push('mortos');
  return c;
}
function diaAberto() {
  return G.fase === 'lobby' || G.fase === 'voto' || G.fase === 'juri' || (G.fase === 'publico' && !!TELAS_DIA[G.tela]);
}
function podeEscrever(pid) {
  var j = G.g && G.g.jogadores[pid];
  if (!j || G.tela === 'fim') return { cidade: true, assassinos: !!(j && j.papel === 'vilao'), mortos: !!(j && !j.vivo) };
  return { cidade: j.vivo && diaAberto(), assassinos: j.papel === 'vilao' && j.vivo, mortos: !j.vivo };
}
function restante() {
  if (G.tela !== 'debate' && G.tela !== 'defesa') return G.total || 0;
  return Math.max(0, G.total - Math.floor((Date.now() - G.inicio) / 1000));
}
function viewFor(pid) {
  var g = G.g, me = g ? g.jogadores[pid] : null, tela = G.tela, msg = '';
  if (g && me) {
    if (G.fase === 'cartas') { msg = 'cartas'; tela = G.prontos[pid] ? 'aguarde' : 'carta'; }
    else if (G.fase === 'noite') { msg = 'noite'; tela = !me.vivo ? 'espera' : (G.invs[pid] && !G.invs[pid].visto) ? 'investigacao' : G.feitos[pid] ? 'aguarde' : 'acao'; }
    else if (G.fase === 'voto') { msg = 'voto'; tela = !me.vivo ? 'espera' : G.feitos[pid] ? 'aguarde' : 'voto'; }
    else if (G.fase === 'juri') {
      msg = pid === G.rv.acusado ? 'reu' : 'juri';
      tela = !me.vivo ? 'espera' : (pid === G.rv.acusado || (pid in G.juri) || G.pulados[pid]) ? 'aguarde' : 'juri';
    } else if (G.tela === 'vinganca') { msg = 'vinganca'; tela = pid === G.rev.id ? 'vinganca' : 'aguarde'; }
  }
  var pend = pendentes();
  var hostPeer = Rede.peer && Rede.peer.id;
  return {
    seq: G.seq, me: pid, tela: tela, fase: G.fase, aguardeMsg: msg, esperando: pend,
    offlinePend: pend.filter(function (i) { var s = G.slots[i]; return s && !s.bot && !s.local && !s.online; }).length,
    chave: [tela, msg, g ? g.noite : 0, g ? g.dia : 0, G.rev ? G.rev.id + ':' + (G.rev.vinganca ? 1 : 0) + ':' + G.rev.origem : ''].join('|'),
    codigo: G.codigo, rede: G.rede, hostNome: G.slots[0].nome,
    lobby: G.slots.map(function (s) { return { nome: s.nome, online: !!(s.bot || s.local || s.online), bot: !!s.bot }; }),
    nA: G.nA, minutos: G.minutos, vingador: G.vingador, eventos: G.eventos,
    g: g ? sanitizar(pid) : null, rn: G.rn || null, rv: G.rv || null, rj: G.rj || null, rev: G.rev || null, pista: G.pista, carta: G.carta || null,
    inv: G.invs[pid] || null, virada: G.virada, vingou: G.vingou, fila: G.fila || null,
    total: G.total || 0, resta: restante(), chatCanais: canaisVisiveis(pid), chatPode: podeEscrever(pid),
    vozes: G.rede ? G.slots.map(function (s, i) { var p = s.local ? hostPeer : s.peerId; return s.voz && p && (s.local || s.online) ? { pid: i, peer: p } : null; }).filter(Boolean) : []
  };
}

/* ---------- fluxo da partida ---------- */
function comecarJogo() {
  G.g = Motor.novoJogo(G.slots.map(function (s) { return s.nome; }), null, G.nA, G.vingador);
  G.fase = 'cartas'; G.tela = 'cartas';
  G.prontos = {}; G.feitos = {}; G.invs = {}; G.juri = {}; G.pulados = {}; G.revelados = {};
  G.rn = G.rv = G.rj = G.rev = null; G.pista = null; G.carta = null; G.fila = null; G.virada = false; G.vingou = false; G.manha = [];
  G.chat = []; G.chatSeq = 0;
  G.slots.forEach(function (s) { s.chatSig = ''; });
  if (CD.IA) CD.IA.novoJogo(api);
}
function abrirNoite() {
  Motor.iniciarNoite(G.g, null, G.eventos);
  G.fase = 'publico'; G.tela = 'noiteIntro'; G.feitos = {}; G.invs = {};
  chatSistema('cidade', 'A noite ' + G.g.noite + ' caiu. O chat da cidade fecha até o amanhecer.');
}
function revelar(id, origem) { G.rev = { id: id, origem: origem }; G.virada = false; G.fase = 'publico'; G.tela = 'revelacao'; }
function montarManha() {
  var g = G.g; G.manha = [];
  if (G.rn && G.rn.eliminado != null && G.rev && G.rev.origem === 'noite') { G.pista = Motor.pista(g); if (G.pista != null) G.manha.push('pista'); }
  if (g.evento === 'carta') { G.carta = Motor.cartaAnonima(g); if (!G.carta) g.evento = null; }
  if (g.evento && g.evento !== 'apagao') G.manha.push('evento');
  avancarManha();
}
function avancarManha() { var t = G.manha.shift(); if (t) { G.tela = t; G.fase = 'publico'; } else abrirDebate(); }
function abrirDebate() {
  G.total = Math.round(G.minutos * 60 * (G.g.evento === 'tempestade' ? 0.5 : 1)); G.inicio = Date.now();
  G.fase = 'publico'; G.tela = 'debate';
}
function aposRev() {
  G.virada = false;
  var j = G.g.jogadores[G.rev.id];
  if (j.papel === 'vingador' && !G.vingou && Motor.vivos(G.g).length > 0) { G.vingou = true; G.tela = 'vinganca'; return; }
  if (G.g.vencedor) { G.tela = 'fim'; return; }
  if (G.rev.origem === 'voto') { abrirNoite(); return; }
  montarManha();
}
function checarFase() {
  if (pendentes().length) return;
  if (G.fase === 'cartas') abrirNoite();
  else if (G.fase === 'noite') {
    G.rn = Motor.resolverNoite(G.g); G.fase = 'publico'; G.tela = 'ataque';
  } else if (G.fase === 'voto') {
    G.fila = Motor.vivos(G.g).map(function (j) { return j.id; });
    G.rv = Motor.apurarAcusacao(G.g); G.fase = 'publico'; G.tela = 'resultadoVoto';
  } else if (G.fase === 'juri') {
    G.rj = Motor.julgar(G.g, G.rv.acusado, G.juri, G.g.evento === 'furia'); G.fase = 'publico'; G.tela = 'veredito';
  }
}
function alvoValido(pid, sel) { return Motor.alvos(G.g, pid).some(function (a) { return a.id === sel; }); }
function pularOffline() {
  pendentes().forEach(function (i) {
    var s = G.slots[i];
    if (!s || s.bot || s.local || s.online) return;
    if (G.fase === 'cartas') G.prontos[i] = true;
    else if (G.fase === 'noite') { G.feitos[i] = true; if (G.invs[i]) G.invs[i].visto = true; }
    else if (G.fase === 'voto') { Motor.votar(G.g, i, null); G.feitos[i] = true; }
    else if (G.fase === 'juri') G.pulados[i] = true;
    else if (G.tela === 'vinganca') {
      var vivos = Motor.vivos(G.g);
      if (vivos.length) { var alvo = vivos[Math.floor(Math.random() * vivos.length)].id; Motor.vingar(G.g, alvo); G.rev = { id: alvo, origem: G.rev.origem, vinganca: true }; G.virada = false; G.tela = 'revelacao'; }
    }
  });
  checarFase();
}

function hostAcao(pid, act, v, sel) {
  if (!G) return;
  if (SO_HOST[act] && pid !== 0) return;
  var g = G.g, ok = true, num = sel == null || sel === 'nenhum' ? null : Number(sel);
  switch (act) {
    case 'nA': if (G.fase === 'lobby') G.nA = Number(v) === 2 ? 2 : 1; break;
    case 'min': if (G.fase === 'lobby') G.minutos = [1, 2, 3].indexOf(Number(v)) >= 0 ? Number(v) : 2; break;
    case 'tog': if (G.fase === 'lobby' && (v === 'vingador' || v === 'eventos')) G[v] = !G[v]; break;
    case 'addBot': if (G.fase === 'lobby' && G.slots.length < MAX) adicionarBot(); break;
    case 'rmBot': if (G.fase === 'lobby') { var b = ultimoBot(); if (b > 0) G.slots.splice(b, 1); } break;
    case 'comecar': if (G.fase === 'lobby' && G.slots.length >= MIN) comecarJogo(); else ok = false; break;
    case 'denovo': if (G.tela === 'fim') comecarJogo(); break;
    case 'trocar':
      if (G.tela === 'fim') {
        G.slots = G.slots.filter(function (s) { return s.bot || s.local || s.online; });
        G.fase = 'lobby'; G.tela = 'lobby'; G.g = null; G.slots.forEach(function (s) { s.chatSig = ''; });
      }
      break;
    case 'pronto': if (G.fase === 'cartas' && !G.prontos[pid]) { G.prontos[pid] = true; checarFase(); } break;
    case 'iniciarNoite': if (G.tela === 'noiteIntro') { G.fase = 'noite'; G.tela = 'noite'; G.feitos = {}; G.invs = {}; } break;
    case 'agir':
      if (G.fase === 'noite' && vivo(pid) && !G.feitos[pid] && !G.invs[pid] && num != null && alvoValido(pid, num)) {
        var r = Motor.agir(g, pid, num);
        if (r) G.invs[pid] = { alvo: num, r: r, visto: false }; else G.feitos[pid] = true;
        checarFase();
      }
      break;
    case 'visto': if (G.fase === 'noite' && G.invs[pid] && !G.invs[pid].visto) { G.invs[pid].visto = true; G.feitos[pid] = true; checarFase(); } break;
    case 'aposAtaque':
      if (G.tela === 'ataque') { G.tela = 'amanhecer'; chatSistema('cidade', 'Amanheceu. A cidade pode falar de novo.'); }
      break;
    case 'aposAmanhecer':
      if (G.tela === 'amanhecer') { if (G.rn.eliminado != null) revelar(G.rn.eliminado, 'noite'); else { G.rev = null; montarManha(); } }
      break;
    case 'virarRev':
      if (G.tela === 'revelacao' && !G.virada) {
        G.virada = true; G.revelados[G.rev.id] = true;
        var jr = g.jogadores[G.rev.id];
        chatSistema('cidade', jr.nome + ' ' + u.eraTexto(jr).replace('!', '') + '.');
      }
      break;
    case 'aposRev': if (G.tela === 'revelacao' && G.virada) aposRev(); break;
    case 'vingar':
      if (G.tela === 'vinganca' && pid === G.rev.id && num != null && vivo(num)) {
        Motor.vingar(g, num); G.rev = { id: num, origem: G.rev.origem, vinganca: true }; G.virada = false; G.tela = 'revelacao';
      }
      break;
    case 'aposPista': if (G.tela === 'pista') avancarManha(); break;
    case 'aposEvento': if (G.tela === 'evento') avancarManha(); break;
    case 'irVotar': if (G.tela === 'debate') { G.fase = 'voto'; G.feitos = {}; g.votos = {}; } break;
    case 'votar':
      if (G.fase === 'voto' && vivo(pid) && !G.feitos[pid] && (num == null || (num !== pid && vivo(num)))) {
        Motor.votar(g, pid, num); G.feitos[pid] = true; checarFase();
      }
      break;
    case 'defesa': if (G.tela === 'resultadoVoto' && G.rv.acusado != null) { G.total = 20; G.inicio = Date.now(); G.tela = 'defesa'; } break;
    case 'irJulgar': if (G.tela === 'defesa') { G.fase = 'juri'; G.juri = {}; G.pulados = {}; } break;
    case 'jurar':
      if (G.fase === 'juri' && vivo(pid) && pid !== G.rv.acusado && !(pid in G.juri) && typeof sel === 'boolean') { G.juri[pid] = sel; checarFase(); }
      break;
    case 'aposVeredito': if (G.tela === 'veredito') { if (G.rj.culpado) revelar(G.rv.acusado, 'voto'); else abrirNoite(); } break;
    case 'anoitecer': if (G.tela === 'resultadoVoto' && G.rv.acusado == null) abrirNoite(); break;
    case 'pular': pularOffline(); break;
    default: ok = false;
  }
  if (ok) transmitir();
}

/* ================= chat ================= */
function chatEnviar(pid, canal, texto, sistema) {
  if (!G) return;
  texto = String(texto).replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!texto || ['cidade', 'assassinos', 'mortos'].indexOf(canal) < 0) return;
  if (!sistema && !podeEscrever(pid)[canal]) return;
  var s = sistema ? null : G.slots[pid];
  var m = { id: ++G.chatSeq, canal: canal, de: sistema ? -1 : pid, nome: s ? s.nome : '', texto: texto, bot: !!(s && s.bot), sis: !!sistema };
  G.chat.push(m); if (G.chat.length > 300) G.chat.shift();
  G.slots.forEach(function (sl, i) { if (!sl.bot && canaisVisiveis(i).indexOf(canal) >= 0) enviarPara(i, { t: 'msg', m: m }); });
  if (CD.IA) CD.IA.aoChat(m, api);
}
function chatSistema(canal, texto) { chatEnviar(-1, canal, texto, true); }
function enviarPara(i, msg) {
  var s = G.slots[i];
  if (s.local) clienteMsg(msg);
  else if (s.conn && s.online) { try { s.conn.send(msg); } catch (e) {} }
}
function enviarChatCompleto(i) {
  var vis = canaisVisiveis(i);
  enviarPara(i, { t: 'chatfull', lista: G.chat.filter(function (m) { return vis.indexOf(m.canal) >= 0; }).slice(-120) });
}
function chatVisivel(pid, n) {
  var vis = canaisVisiveis(pid);
  return G.chat.filter(function (m) { return vis.indexOf(m.canal) >= 0; }).slice(-(n || 30));
}

/* ================= aplicar o que o anfitrião mandou ================= */
var ATUALIZA = { lobby: 1, aguarde: 1, espera: 1, acao: 1, voto: 1, juri: 1, vinganca: 1, investigacao: 1 };
function aplicarView(v) {
  var mudou = v.chave !== S.chave || v.tela !== S.tela;
  var vira = !mudou && v.tela === 'revelacao' && v.virada && !S.virada;
  S.me = v.me; S.codigo = v.codigo || S.codigo; S.hostNome = v.hostNome; S.lobby = v.lobby; S.rede = v.rede;
  S.nA = v.nA; S.minutos = v.minutos; S.vingador = v.vingador; S.eventos = v.eventos;
  S.g = v.g; S.rn = v.rn; S.rv = v.rv; S.rj = v.rj; S.rev = v.rev; S.pista = v.pista; S.carta = v.carta; S.inv = v.inv;
  S.vingou = v.vingou; S.total = v.total; S.resta = v.resta; S.esperando = v.esperando; S.offlinePend = v.offlinePend; S.aguardeMsg = v.aguardeMsg;
  S.fase = v.fase; S.fila = v.tela === 'resultadoVoto' && v.fila ? v.fila : [v.me]; S.idx = 0;
  S.chatCanais = v.chatCanais; S.chatPode = v.chatPode; S.chave = v.chave;
  if (CD.Mic) CD.Mic.sincronizar(v);
  var eu = S.g && S.g.jogadores[v.me];
  if (mudou) {
    S.tela = v.tela; S.sel = undefined; S.virada = v.tela === 'revelacao' ? !!v.virada : false; S.renderPendente = false;
    if (v.tela === 'acao' && eu && eu.papel === 'vilao' && S.g.acoes.ataque != null) S.sel = S.g.acoes.ataque;
    CD.render(true);
  } else if (vira) {
    S.virada = true; S.animar = true; u.somRevelacao(); CD.render(false);
  } else if (ATUALIZA[v.tela]) {
    if (v.tela === 'acao' && S.sel === undefined && eu && eu.papel === 'vilao' && S.g.acoes.ataque != null) S.sel = S.g.acoes.ataque;
    var foco = document.activeElement;
    if (foco && foco.tagName === 'INPUT' && document.getElementById('app').contains(foco)) S.renderPendente = true;
    else CD.render(false);
  }
  renderChat();
}
document.addEventListener('focusout', function () {
  setTimeout(function () {
    var f = document.activeElement;
    if (S.renderPendente && !(f && f.tagName === 'INPUT')) { S.renderPendente = false; CD.render(false); }
  }, 50);
});

/* ================= telas novas ================= */
function seg(act, v, atual, txt, travado) { return '<button type="button" class="seg" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (v === atual) + '"' + (travado ? ' disabled' : '') + '>' + txt + '</button>'; }
function grupo(rot, bts) { return '<div><p class="rotulo" style="margin-bottom:8px">' + rot + '</p><div class="linha">' + bts + '</div></div>'; }
function fichaJog(i, extra, cls) {
  var p = S.lobby[i] || { nome: '' };
  return '<div class="ficha ' + (cls || '') + (p.online ? '' : ' fora') + '" style="width:78px;font-size:13px">' + av(i) + esc(p.nome) + (extra || '') + '</div>';
}
function tag(txt, cor, fg) { return '<small class="tag" style="background:' + cor + ';color:' + (fg || '#fff') + '">' + txt + '</small>'; }
var T = CD.TELAS;
T.conectando = function () {
  return ['noite', cena('noite.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Conexão</p><h1 tabindex="-1" class="pulsa">' + esc(S.conectandoMsg || 'Conectando...') + '</h1>' +
    '<p>Isso leva poucos segundos.</p><div class="cresce"></div>' + btn('sair', 'Cancelar', 'sec') + '</div>'];
};
T.lobby = function () {
  var host = S.souHost, n = S.lobby.length, bots = S.lobby.filter(function (p) { return p.bot; }).length;
  var lista = S.lobby.map(function (p, i) {
    return fichaJog(i, (i === 0 && S.rede ? tag('anfitrião', '#7a55c7') : '') + (p.bot ? tag('agente', '#3d4a73') : '') + (i === S.me ? tag('você', '#ffc22e', '#15131f') : ''));
  }).join('');
  var temV = S.vingador && n - 2 - S.nA >= 2;
  var resumo = (S.nA === 1 ? '1 assassino' : '2 assassinos') + ', 1 médico, 1 investigador' + (temV ? ', 1 vingador' : '') + ' e ' + Math.max(0, n - 2 - S.nA - (temV ? 1 : 0)) + ' inocentes.';
  var topo = S.rede
    ? '<div class="sala"><div><span class="rotulo">Código da sala</span><b>' + esc(S.codigo) + '</b></div>' + btn('copiar', 'Copiar convite', 'sec mini') + '</div>' +
      '<p>' + (host ? 'Cada jogador abre o jogo no próprio celular e entra com este código. Faltou gente? Complete com agentes.' : 'Você está na sala. ' + esc(S.hostNome) + ' começa a partida quando todos chegarem.') + '</p>'
    : '<div><p class="rotulo">Jogo solo</p><h1 tabindex="-1" style="margin-top:4px">Você contra a cidade</h1><p style="margin-top:6px">Os outros moradores são agentes de IA. Eles mentem, desconfiam e votam. Converse com eles pelo chat.</p></div>';
  var ia = '';
  if (host && bots > 0 && CD.IA) ia = CD.IA.painel();
  return ['noite', cena('noite.jpg', 'baixa') + '<div class="corpo">' + topo +
    '<div><p class="rotulo" style="margin-bottom:8px">Jogadores (' + n + ' de 8)</p><div class="fichas" style="justify-content:flex-start">' + lista + '</div></div>' +
    (host ? '<div class="linha">' + btn('addBot', 'Adicionar agente', 'sec mini') + btn('rmBot', 'Remover agente', 'sec mini') + '</div>' : '') +
    ia +
    grupo('Assassinos', seg('nA', 1, S.nA, '1 (longa)', !host) + seg('nA', 2, S.nA, '2 (curta)', !host)) +
    grupo('Tempo de debate', seg('min', 1, S.minutos, '1 min', !host) + seg('min', 2, S.minutos, '2 min', !host) + seg('min', 3, S.minutos, '3 min', !host)) +
    grupo('Extras', '<button type="button" class="seg" data-act="tog" data-v="vingador" aria-pressed="' + S.vingador + '"' + (host ? '' : ' disabled') + '>Vingador</button>' +
      '<button type="button" class="seg" data-act="tog" data-v="eventos" aria-pressed="' + S.eventos + '"' + (host ? '' : ' disabled') + '>Eventos</button>') +
    '<p class="aviso">' + (n >= MIN ? 'Nesta partida: ' + resumo : 'Faltam ' + (MIN - n) + ' jogadores para começar (mínimo ' + MIN + ').') + '</p>' +
    '<div class="cresce"></div>' +
    (host ? '<button type="button" class="btn" data-act="comecar"' + (n < MIN ? ' disabled' : '') + '>Começar com ' + n + ' jogadores</button>' : '') +
    btn('sair', S.rede ? 'Sair da sala' : 'Voltar', 'sec') + '</div>'];
};
function nomeDe(i) { return S.lobby[i] ? S.lobby[i].nome : ''; }
function rodapeHost() { return S.souHost && S.offlinePend ? btn('pular', 'Seguir sem quem caiu (' + S.offlinePend + ')', 'sec') : ''; }
function listaEspera() {
  if (!S.esperando || !S.esperando.length) return '';
  return '<p class="rotulo">Esperando</p><div class="fichas">' + S.esperando.map(function (i) {
    var p = S.lobby[i] || {};
    return fichaJog(i, p.online ? '' : tag('sem conexão', '#b3141c'), 'pulsa');
  }).join('') + '</div>';
}
T.aguarde = function () {
  var m = S.aguardeMsg, n = S.g ? S.g.noite : 0, rev = S.rev ? nomeDe(S.rev.id) : '';
  var M = {
    cartas: ['Carta guardada', 'Esperando todos verem suas cartas.', 0, 'Cartas'],
    noite: ['Escolha feita', 'Agora é esperar. A noite continua para os outros.', 0, 'Noite ' + n],
    voto: ['Acusação enviada', 'Esperando as outras acusações.', 1, 'Dia ' + (S.g ? S.g.dia : '')],
    juri: ['Voto enviado', 'Esperando o resto da cidade decidir.', 1, 'Julgamento'],
    reu: ['A cidade decide seu destino', 'Você não vota no próprio julgamento. Respire fundo.', 1, 'Julgamento'],
    vinganca: [esc(rev) + ' não vai sozinho', esc(rev) + ' está escolhendo quem cai junto...', 0, 'A vingança']
  }[m] || ['Aguarde', 'Esperando os outros jogadores.', 0, ''];
  return [m && M[2] ? 'dia' : 'noite', cena(M[2] ? 'dia.jpg' : 'noite.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">' + M[3] + '</p><h1 tabindex="-1">' + M[0] + '</h1><p>' + M[1] + '</p>' +
    listaEspera() + '<div class="cresce"></div>' + rodapeHost() + '</div>'];
};
T.espera = function () {
  var dia = S.fase === 'voto' || S.fase === 'juri';
  return [dia ? 'dia' : 'noite', cena(dia ? 'dia.jpg' : 'noite.jpg', 'baixa') + '<div class="corpo centro"><p class="rotulo">Você está fora</p><h1 tabindex="-1">Os vivos ainda estão jogando</h1>' +
    '<p>Assista em silêncio e não dê dicas. No chat dos mortos você pode conversar com quem já caiu.</p>' + listaEspera() + '<div class="cresce"></div>' + rodapeHost() + '</div>'];
};

/* ================= ganchos no app ================= */
var MENU = {
  criarSala: function () { criarSala(0); },
  entrarSala: entrarSala,
  solo: function () {
    S.nomeOnline = limparNome(S.nomeOnline); if (S.nomeOnline === 'Jogador') S.nomeOnline = 'Você';
    G = novoG(false); G.slots.push(slotHost());
    for (var i = 0; i < 5; i++) adicionarBot();
    S.modo = 'host'; S.souHost = true; S.rede = false; S.chat = []; S.erro = ''; S.chave = '';
    transmitir(); renderChat();
  },
  sair: function () {
    if (S.souHost && G && G.rede && G.slots.length > 1) G.slots.forEach(function (s, i) { if (!s.local && !s.bot) enviarPara(i, { t: 'erro', msg: 'O anfitrião encerrou a sala.' }); });
    encerrarRede(); if (CD.IA) CD.IA.parar();
    G = null; S.modo = 'local'; S.souHost = false; S.rede = false; S.erro = ''; S.tela = 'menu'; S.chat = []; S.chave = ''; S.chatAberto = false;
    CD.render(true); renderChat();
  },
  copiar: function (v, b) {
    var link = location.origin + location.pathname + '?sala=' + S.codigo;
    var ok = function () { b.textContent = 'Copiado!'; setTimeout(function () { if (b.isConnected) b.textContent = 'Copiar convite'; }, 2000); };
    try { navigator.clipboard.writeText('Bora jogar Cidade Dorme! Sala ' + S.codigo + ': ' + link).then(ok, function () { b.textContent = S.codigo; }); } catch (e) { b.textContent = S.codigo; }
  },
  iaTestar: function () { if (CD.IA) CD.IA.testar(); CD.render(false); },
  iaApagar: function () { S.iaChave = ''; u.gravarLS('iachave', ''); if (CD.IA) CD.IA.status = ''; CD.render(false); }
};
CD.interceptar = function (act, b) {
  if (MENU[act]) { MENU[act](b.dataset.v, b); return true; }
  if (!u.online()) return false;
  if (act === 'sel' || act === 'selJ' || act === 'virar') return false;
  var a = act;
  if (act === 'proximo') a = S.tela === 'carta' ? 'pronto' : 'visto';
  var sel = S.sel === undefined ? null : S.sel;
  if (S.souHost) hostAcao(0, a, b.dataset.v, sel);
  else if (Rede.conn) {
    try { Rede.conn.send({ t: 'acao', act: a, v: b.dataset.v, sel: sel }); } catch (e) {}
    if (b.classList.contains('btn')) b.disabled = true;
  }
  return true;
};
CD.posRender = function () {
  if (S.modo !== 'cliente') return;
  document.querySelectorAll('#app [data-act]').forEach(function (b) {
    if (!SO_HOST[b.dataset.act]) return;
    if (b.classList.contains('btn')) {
      var p = document.createElement('p');
      p.className = 'aviso aguardando' + (b.classList.contains('revela') ? ' revela' : '');
      p.textContent = 'Aguardando ' + S.hostNome + '...';
      b.replaceWith(p);
    } else b.disabled = true;
  });
};
CD.hostAcao = function (pid, act, v, sel) { hostAcao(pid, act, v, sel); };
CD.rede = {
  peer: function () { return Rede.peer; },
  peerId: function () { return Rede.peer && Rede.peer.id; },
  avisarVoz: function (on) { if (S.souHost && G) { G.slots[0].voz = on; transmitir(); } else if (Rede.conn) { try { Rede.conn.send({ t: 'voz', on: on }); } catch (e) {} } }
};
var api = {
  G: function () { return G; }, viewFor: viewFor, hostAcao: hostAcao, chatEnviar: chatEnviar, chatVisivel: chatVisivel,
  podeEscrever: podeEscrever
};
CD.api = api;

/* ================= interface do chat ================= */
var CANAIS = { cidade: 'Cidade', assassinos: 'Assassinos', mortos: 'Mortos' };
var chat = null;
function montarChat() {
  if (chat) return;
  var root = document.createElement('div'); root.id = 'chatRoot';
  root.innerHTML =
    '<div class="topoesq"><button type="button" class="chatbtn" id="chatBtn" aria-label="Abrir o chat" aria-expanded="false">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg><span class="badge" hidden></span></button>' +
    '<span id="micSlot"></span></div>' +
    '<div class="chattoast" id="chatToast" aria-live="polite"></div>' +
    '<div class="chatpainel" id="chatPainel" role="dialog" aria-label="Chat" hidden>' +
    '<div class="chatcab"><div class="chattabs" id="chatTabs" role="tablist"></div><button type="button" class="chatfechar" id="chatFechar" aria-label="Fechar o chat">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>' +
    '<div class="msgs" id="chatMsgs" role="log" aria-live="polite"></div>' +
    '<form class="chatform" id="chatForm"><label class="sr" for="chatInput">Mensagem</label><input id="chatInput" type="text" maxlength="200" autocomplete="off" placeholder="Escreva...">' +
    '<button type="submit" class="chatenviar" aria-label="Enviar"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z" fill="currentColor"/></svg></button></form></div>';
  document.body.appendChild(root);
  chat = { root: root, btn: root.querySelector('#chatBtn'), badge: root.querySelector('.badge'), painel: root.querySelector('#chatPainel'), tabs: root.querySelector('#chatTabs'),
    msgs: root.querySelector('#chatMsgs'), form: root.querySelector('#chatForm'), input: root.querySelector('#chatInput'), toast: root.querySelector('#chatToast') };
  chat.btn.addEventListener('click', function () { CD.Som.init(); abrirChat(!S.chatAberto); });
  root.querySelector('#chatFechar').addEventListener('click', function () { abrirChat(false); });
  chat.tabs.addEventListener('click', function (e) { var t = e.target.closest('[data-canal]'); if (t) { S.chatCanal = t.dataset.canal; renderChat(true); } });
  chat.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var txt = chat.input.value.trim(); if (!txt) return;
    var canal = S.chatCanal || 'cidade';
    if (!S.chatPode || !S.chatPode[canal]) return;
    chat.input.value = '';
    if (S.souHost) chatEnviar(0, canal, txt);
    else if (Rede.conn) { try { Rede.conn.send({ t: 'chat', canal: canal, texto: txt }); } catch (x) {} }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.chatAberto) { abrirChat(false); chat.btn.focus(); } });
}
function abrirChat(on) {
  S.chatAberto = on; if (on) S.naoLidas = 0;
  renderChat(true);
  if (on) setTimeout(function () { if (!chat.input.disabled) chat.input.focus(); }, 30);
}
function motivo(canal) {
  var eu = S.g && S.g.jogadores[S.me];
  if (canal === 'cidade' && eu && !eu.vivo) return 'Mortos não falam com os vivos. Use o chat dos mortos.';
  if (canal === 'cidade') return 'A cidade dorme. O chat volta de manhã.';
  return 'Você não pode escrever aqui agora.';
}
function renderChat(forcar) {
  montarChat();
  var ativo = u.online() && S.tela !== 'menu' && S.tela !== 'conectando';
  chat.root.hidden = !ativo;
  if (!ativo) return;
  var canais = S.chatCanais && S.chatCanais.length ? S.chatCanais : ['cidade'];
  if (canais.indexOf(S.chatCanal) < 0) S.chatCanal = canais[0];
  chat.badge.hidden = !S.naoLidas; chat.badge.textContent = S.naoLidas > 9 ? '9+' : (S.naoLidas || '');
  chat.btn.setAttribute('aria-expanded', String(!!S.chatAberto));
  chat.painel.hidden = !S.chatAberto;
  if (!S.chatAberto && !forcar) return;
  chat.tabs.innerHTML = canais.map(function (c) { return '<button type="button" role="tab" data-canal="' + c + '" aria-selected="' + (c === S.chatCanal) + '">' + CANAIS[c] + '</button>'; }).join('');
  var lista = (S.chat || []).filter(function (m) { return m.canal === S.chatCanal; }).slice(-120);
  chat.msgs.innerHTML = lista.length ? lista.map(function (m) {
    if (m.sis) return '<p class="msg sis">' + esc(m.texto) + '</p>';
    var minha = m.de === S.me;
    return '<div class="msg' + (minha ? ' minha' : '') + '">' + (minha ? '' : '<b>' + esc(m.nome) + (m.bot ? ' <i>agente</i>' : '') + '</b>') + '<span>' + esc(m.texto) + '</span></div>';
  }).join('') : '<p class="msg sis">Nenhuma mensagem ainda.</p>';
  chat.msgs.scrollTop = chat.msgs.scrollHeight;
  var pode = S.chatPode && S.chatPode[S.chatCanal];
  chat.input.disabled = !pode; chat.form.querySelector('button').disabled = !pode;
  chat.input.placeholder = pode ? (S.chatCanal === 'assassinos' ? 'Só seu parceiro lê isto...' : 'Escreva...') : motivo(S.chatCanal);
}
var toastT = null;
function receberMsg(m) {
  if (!m) return;
  S.chat = (S.chat || []).concat([m]).slice(-200);
  if (m.de !== S.me && !m.sis && !(S.chatAberto && S.chatCanal === m.canal)) {
    S.naoLidas = (S.naoLidas || 0) + 1;
    if (!S.chatAberto) {
      chat.toast.innerHTML = '<b>' + esc(m.nome) + (m.canal !== 'cidade' ? ' (' + CANAIS[m.canal] + ')' : '') + '</b> ' + esc(m.texto);
      chat.toast.classList.add('on'); clearTimeout(toastT);
      toastT = setTimeout(function () { chat.toast.classList.remove('on'); }, 4200);
      CD.Som.tom(1320, 0.07, 'sine', 0.08);
    }
  }
  renderChat(S.chatAberto);
}
CD.renderChat = renderChat;
})();
