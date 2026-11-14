/* Cidade Dorme: agentes (moradores controlados pelo jogo).
   Cada agente só enxerga o que um jogador naquele lugar enxergaria (a mesma visão que o anfitrião manda aos humanos).
   Com chave do Gemini, as falas e as suspeitas vêm do modelo; sem chave, de regras e falas prontas. */
(function () {
'use strict';
var CD = window.CD, S = CD.S, u = CD.u, esc = u.esc;

var PERSONAGENS = [
  { nome: 'Dona Cida', jeito: 'senhora fofoqueira e desconfiada, chama todo mundo de "meu filho" ou "minha filha"' },
  { nome: 'Seu Tião', jeito: 'aposentado calmo e analítico, pensa em voz alta e gosta de lógica' },
  { nome: 'Bia', jeito: 'jovem nervosa e exagerada, se assusta fácil e usa exclamações' },
  { nome: 'Rafa', jeito: 'piadista debochado, faz graça até sob pressão' },
  { nome: 'Zé Grilo', jeito: 'teimoso e acusador, escolhe um alvo e não larga' },
  { nome: 'Marta', jeito: 'professora educada e observadora, aponta contradições' },
  { nome: 'Juca', jeito: 'ansioso que fala demais e às vezes se enrola' },
  { nome: 'Lena', jeito: 'fria e direta, frases curtíssimas' }
];
var NOME_PAPEL = { vilao: 'Assassino', medico: 'Médico', investigador: 'Investigador', inocente: 'Inocente', vingador: 'Vingador' };

/* ---------------- falas prontas ---------------- */
var F = {
  acusar: ['Tô de olho em {X}. Quieto demais hoje.', 'Sei não... {X} tá estranho.', 'Meu voto vai pra {X}. Alguém discorda?', '{X}, explica onde você tava ontem à noite.',
    'Não confio em {X} nem um pouco.', 'Reparem como {X} muda de assunto toda vez.', 'Se não for {X}, eu como meu chapéu.'],
  defender: ['Eu? Tava dormindo, gente!', 'Para tudo, eu sou inocente!', 'Vocês tão perdendo tempo comigo enquanto o assassino ri.', 'Pode votar em mim, mas depois não chora quando descobrir.',
    'Acusar sem prova é fácil, né?', 'Olha quem fala... desconfia de quem me acusou.'],
  geral: ['Alguém viu alguma coisa ontem?', 'Quem ficou quieto até agora? Isso é suspeito.', 'Precisamos votar em alguém, não dá pra perder mais um.', 'Acho que o assassino tá falando demais.',
    'Pensem em quem morreu e quem ganhou com isso.', 'Ninguém aqui é santo, hein.'],
  reacao: ['Não acredito...', 'Era {P}! Agora complicou.', 'Isso não tá certo, gente.', 'Eu sabia que ia dar ruim.'],
  claimSaiu: ['Sou o investigador. Investiguei {X} e saiu de casa ontem à noite!', 'Vou abrir o jogo: sou investigador, e {X} saiu de casa. Votem!'],
  claimFicou: ['Investiguei {X}: ficou em casa. Pode tirar da lista.'],
  fakeClaim: ['Vou falar: sou o investigador. {X} saiu de casa ontem!', 'Investiguei {X} e saiu de casa. Tô falando sério.'],
  noiteParceiro: ['Vamos no {X} hoje?', 'Acho que {X} desconfia da gente. Vamos nele?', 'Fechado, vou no {X}.'],
  defesaOutro: ['Não me convenceu.', 'Até que faz sentido o que falou...', 'Discurso bonito, mas eu voto culpado.', 'Fiquei na dúvida agora.'],
  fim: ['Boa partida, gente.', 'Eu sabia!', 'Quero revanche.']
};
function sortear(a) { return a[Math.floor(Math.random() * a.length)]; }
function preencher(t, X, P) { return t.replace(/\{X\}/g, X || 'alguém').replace(/\{P\}/g, P || ''); }
function entre(a, b) { return a + Math.random() * (b - a); }

/* ---------------- cliente do Gemini ---------------- */
var MODELOS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
var Gem = { fila: [], ocupado: false, ultimo: 0, pausaAte: 0, modelo: 0, ok: 0 };
function limparJson(t) { t = String(t || '').trim(); var a = t.indexOf('{'), b = t.lastIndexOf('}'); return a >= 0 && b > a ? t.slice(a, b + 1) : t; }
function chamar(sistema, texto) {
  var chave = (S.iaChave || '').trim(), modelo = MODELOS[Gem.modelo] || MODELOS[0];
  var corpo = { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: texto }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 300, responseMimeType: 'application/json' } };
  if (/2\.5/.test(modelo)) corpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
  return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + encodeURIComponent(chave), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    clearTimeout(t);
    if (!r.ok) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        var msg = (j && j.error && (j.error.message + ' ' + j.error.status)) || '';
        var e = new Error('http ' + r.status); e.status = r.status;
        if (r.status === 400 && !/api key|api_key|permission|unauthenticated/i.test(msg)) e.status = 404;
        throw e;
      });
    }
    return r.json();
  }).then(function (j) {
    var p = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    var txt = (p || []).map(function (x) { return x.text || ''; }).join('');
    return JSON.parse(limparJson(txt));
  });
}
/* fila com intervalo (o plano gratuito aceita poucas chamadas por minuto); quem espera demais desiste e usa a fala pronta */
function pedirIA(sistema, texto, prazo, urgente) {
  return new Promise(function (ok) {
    if (!(S.iaChave || '').trim() || Date.now() < Gem.pausaAte || IA.status === 'chave') { ok(null); return; }
    var item = { s: sistema, t: texto, ok: ok, limite: Date.now() + (prazo || 30000) };
    if (urgente) Gem.fila.unshift(item); else Gem.fila.push(item);
    if (Gem.fila.length > 6) Gem.fila.shift().ok(null);
    proximaIA();
  });
}
function proximaIA() {
  if (Gem.ocupado || !Gem.fila.length) return;
  var espera = Math.max(0, Gem.ultimo + 4300 - Date.now());
  if (espera) { setTimeout(proximaIA, espera); return; }
  var item = Gem.fila.shift();
  if (Date.now() > item.limite) { item.ok(null); proximaIA(); return; }
  Gem.ocupado = true; Gem.ultimo = Date.now();
  chamar(item.s, item.t).then(function (r) {
    Gem.ocupado = false; Gem.ok++; definirStatus('ok'); item.ok(r); proximaIA();
  }, function (e) {
    Gem.ocupado = false;
    var st = e && e.status;
    if (st === 404 && Gem.modelo < MODELOS.length - 1) { Gem.modelo++; Gem.fila.unshift(item); proximaIA(); return; }
    if (st === 429) { Gem.pausaAte = Date.now() + 30000; definirStatus('limite'); }
    else if (st === 400 || st === 401 || st === 403) definirStatus('chave');
    else definirStatus('falha');
    item.ok(null); proximaIA();
  });
}
function definirStatus(s) {
  if (IA.status === s) return;
  IA.status = s;
  if (S.tela === 'lobby' && S.souHost) {
    var el = document.getElementById('iaStatus'); if (el) el.innerHTML = textoStatus();
  }
}
function textoStatus() {
  var st = IA.status;
  if (!(S.iaChave || '').trim()) return 'Sem chave: os agentes usam falas prontas.';
  if (st === 'ok') return '<b style="color:#5fe08a">Gemini ligado.</b> Os agentes pensam e conversam de verdade.';
  if (st === 'chave') return '<b style="color:#ff7a7a">A chave não funcionou.</b> Confira se copiou inteira.';
  if (st === 'limite') return 'O Gemini pediu uma pausa (limite do plano gratuito). Os agentes usam falas prontas por alguns segundos.';
  if (st === 'falha') return 'O Gemini não respondeu. Tente de novo; enquanto isso, falas prontas.';
  if (st === 'testando') return 'Testando a chave...';
  return 'Chave salva neste celular. Toque em Testar para conferir.';
}

/* ---------------- memória e leitura da situação ---------------- */
var timers = [];
function agendar(ms, fn) { timers.push(setTimeout(fn, CD.u && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.min(ms, 400) : ms)); }
function nomeDe(api, i) { var s = api.G().slots[i]; return s ? s.nome : ''; }
function memoria(slot) {
  if (!slot.mem || !slot.mem.susp) slot.mem = { susp: {}, inv: {}, agendado: {}, falas: 0, fezClaim: {}, fakeClaim: false, ameaca: {}, alvoParceiro: null, investigados: {} };
  return slot.mem;
}
function vivosDe(v) { return v.g.jogadores.filter(function (j) { return j.vivo; }); }
function aprender(v, mem) {
  var g = v.g;
  g.alibis.forEach(function (id) { mem.susp[id] = -10; });
  if (v.inv) {
    mem.inv[v.inv.alvo] = v.inv.r; mem.investigados[v.inv.alvo] = true;
    var medicoMorto = g.jogadores.some(function (j) { return j.papel === 'medico' && !j.vivo; });
    if (v.inv.r === 'ficou') mem.susp[v.inv.alvo] = -8;
    else mem.susp[v.inv.alvo] = Math.max(mem.susp[v.inv.alvo] || 0, medicoMorto ? 12 : 4);
  }
  if (v.carta) v.carta.forEach(function (id) { if (id !== v.me && (mem.susp[id] || 0) > -5) mem.susp[id] = (mem.susp[id] || 0) + 0.15; });
  g.jogadores.forEach(function (j) { if (!j.vivo) delete mem.susp[j.id]; });
}
function suspeito(v, mem, excluir) {
  var me = v.g.jogadores[v.me], melhor = null, val = -Infinity;
  vivosDe(v).forEach(function (j) {
    if (j.id === v.me || (excluir && excluir(j))) return;
    if (me.papel === 'vilao' && j.papel === 'vilao') return;
    var s = (mem.susp[j.id] || 0) + Math.random() * 0.35;
    if (s > val) { val = s; melhor = j.id; }
  });
  return { id: melhor, val: val };
}

/* ---------------- decisões ---------------- */
function escolherNoite(v, mem) {
  var g = v.g, me = g.jogadores[v.me], alvos = Motor.alvos(g, v.me);
  if (!alvos.length) return null;
  if (me.papel === 'vilao') {
    if (g.acoes.ataque != null && alvos.some(function (a) { return a.id === g.acoes.ataque; })) return g.acoes.ataque;
    if (mem.alvoParceiro != null && alvos.some(function (a) { return a.id === mem.alvoParceiro; })) return mem.alvoParceiro;
    var melhor = null, val = -Infinity;
    alvos.forEach(function (a) {
      var s = (mem.ameaca[a.id] || 0) * 3 + (g.alibis.indexOf(a.id) >= 0 ? 1.5 : 0) + Math.random() * 2;
      if (s > val) { val = s; melhor = a.id; }
    });
    return melhor;
  }
  if (me.papel === 'medico') {
    var protegido = null;
    Object.keys(mem.ameaca).forEach(function (k) { if (mem.ameaca[k] >= 2 && alvos.some(function (a) { return a.id === Number(k); })) protegido = Number(k); });
    if (protegido != null && Math.random() < 0.6) return protegido;
    if (alvos.some(function (a) { return a.id === v.me; }) && Math.random() < 0.35) return v.me;
    var confiaveis = alvos.slice().sort(function (a, b) { return (mem.susp[a.id] || 0) - (mem.susp[b.id] || 0); });
    return confiaveis[Math.floor(Math.random() * Math.min(3, confiaveis.length))].id;
  }
  if (me.papel === 'investigador') {
    var novos = alvos.filter(function (a) { return !mem.investigados[a.id] && g.alibis.indexOf(a.id) < 0; });
    var lista = novos.length ? novos : alvos;
    return lista.slice().sort(function (a, b) { return (mem.susp[b.id] || 0) + Math.random() - (mem.susp[a.id] || 0) - Math.random(); })[0].id;
  }
  return sortear(alvos).id;
}
function escolherAcusacao(v, mem) {
  var me = v.g.jogadores[v.me], s = suspeito(v, mem);
  if (s.id == null) return null;
  if (me.papel === 'vilao') return s.id;
  if (s.val < 0.6 && Math.random() < 0.3) return null;
  return s.id;
}
function escolherJuri(v, mem) {
  var me = v.g.jogadores[v.me], reu = v.rv.acusado, rj = v.g.jogadores[reu];
  if (me.papel === 'vilao') return rj.papel === 'vilao' ? false : Math.random() < 0.8;
  var s = mem.susp[reu] || 0;
  if (s <= -5) return false;
  if (s >= 3) return true;
  return Math.random() < 0.5 + s * 0.15;
}

/* ---------------- fala ---------------- */
function sistemaPrompt(v, slot) {
  var p = PERSONAGENS[slot.perfil] || PERSONAGENS[0], me = v.g.jogadores[v.me], mem = memoria(slot);
  var parceiro = v.g.jogadores.filter(function (j) { return j.papel === 'vilao' && j.id !== v.me; }).map(function (j) { return j.nome; }).join(' e ');
  var saber = [];
  Object.keys(mem.inv).forEach(function (k) { saber.push('Você investigou ' + v.g.jogadores[k].nome + ' e a pessoa ' + (mem.inv[k] === 'saiu' ? 'SAIU de casa (é assassino ou médico)' : 'FICOU em casa (não é assassino nem médico)') + '.'); });
  if (me.papel === 'medico' && v.g.ultimaProtecao != null) saber.push('Na última noite você protegeu ' + v.g.jogadores[v.g.ultimaProtecao].nome + '.');
  var objetivo = me.papel === 'vilao'
    ? 'Você quer que a cidade elimine inocentes. Minta com naturalidade, desvie suspeitas, jogue a culpa em outros e nunca admita ser assassino. Você pode até fingir ser o investigador. ' + (parceiro ? 'Seu parceiro assassino é ' + parceiro + ': nunca o acuse e defenda-o com sutileza.' : '')
    : 'Você quer descobrir o assassino. Use as pistas e desconfie de contradições. ' + (me.papel === 'medico' || me.papel === 'investigador' ? 'Revelar seu papel pode ajudar a cidade, mas te torna alvo; só revele se valer a pena.' : '');
  return 'Você é ' + me.nome + ', morador da cidade num jogo de dedução social chamado "Cidade Dorme", conversando por chat com pessoas reais. Personalidade: ' + p.jeito + '.\n' +
    'Regras: à noite o assassino mata alguém; o médico protege uma pessoa; o investigador descobre se alguém "saiu de casa" (assassino e médico saem, os outros ficam); o vingador leva alguém junto quando morre. ' +
    'De dia todos debatem; depois cada um acusa alguém em segredo, o mais acusado faz uma defesa e a cidade vota culpado ou inocente.\n' +
    'Seu papel SECRETO: ' + NOME_PAPEL[me.papel] + '. ' + saber.join(' ') + '\n' + objetivo + '\n' +
    'Escreva como uma pessoa brasileira num chat de celular: informal, sem emojis, no máximo 25 palavras, uma mensagem só. Nunca diga que é IA ou robô. Não repita frases suas.\n' +
    'Responda apenas com JSON: {"mensagem": "...", "suspeito": "nome exato de quem você mais suspeita agora, ou vazio"}';
}
function contexto(v, api, situacao) {
  var g = v.g, mortos = g.jogadores.filter(function (j) { return !j.vivo; });
  var linhas = api.chatVisivel(v.me, 18).filter(function (m) { return m.canal === 'cidade' || m.canal === 'assassinos'; }).map(function (m) {
    return m.sis ? '[narrador] ' + m.texto : (m.canal === 'assassinos' ? '[chat secreto dos assassinos] ' : '') + m.nome + ': ' + m.texto;
  });
  return 'Dia ' + g.dia + ', noite ' + g.noite + '.\n' +
    'Vivos: ' + vivosDe(v).map(function (j) { return j.nome; }).join(', ') + '.\n' +
    (mortos.length ? 'Mortos: ' + mortos.map(function (j) { return j.nome + (j.papel !== 'oculto' ? ' (era ' + NOME_PAPEL[j.papel] + ')' : ''); }).join(', ') + '.\n' : '') +
    (g.alibis.length ? 'Têm álibi confirmado (não são assassinos): ' + g.alibis.map(function (i) { return g.jogadores[i].nome; }).join(', ') + '.\n' : '') +
    (v.carta && g.evento === 'carta' ? 'Carta anônima de hoje: um destes três é assassino: ' + v.carta.map(function (i) { return g.jogadores[i].nome; }).join(', ') + '.\n' : '') +
    'Conversa recente:\n' + (linhas.length ? linhas.join('\n') : '(ninguém falou ainda)') + '\n\nSituação: ' + situacao + '\nEscreva sua próxima mensagem.';
}
function falaPronta(v, mem, tipo, extra) {
  var me = v.g.jogadores[v.me], g = v.g;
  if (tipo === 'defesa') return sortear(F.defender);
  if (tipo === 'reacao') return preencher(sortear(F.reacao), '', extra || '');
  if (tipo === 'defesaOutro') return sortear(F.defesaOutro);
  if (tipo === 'noite') return preencher(sortear(F.noiteParceiro), g.jogadores[extra].nome);
  if (me.papel === 'investigador') {
    for (var k in mem.inv) {
      var j = g.jogadores[k];
      if (j.vivo && !mem.fezClaim[k] && (mem.inv[k] === 'saiu' || Math.random() < 0.4)) { mem.fezClaim[k] = true; return preencher(sortear(mem.inv[k] === 'saiu' ? F.claimSaiu : F.claimFicou), j.nome); }
    }
  }
  if (me.papel === 'vilao' && !mem.fakeClaim && g.dia >= 2 && Math.random() < 0.2) {
    var alvo = suspeito(v, mem, function (x) { return g.alibis.indexOf(x.id) >= 0; }).id;
    if (alvo != null) { mem.fakeClaim = true; return preencher(sortear(F.fakeClaim), g.jogadores[alvo].nome); }
  }
  if (tipo === 'mencionado' && Math.random() < 0.6) return sortear(F.defender);
  var s = suspeito(v, mem);
  if (s.id != null && (s.val > 0.5 || Math.random() < 0.5)) return preencher(sortear(F.acusar), g.jogadores[s.id].nome);
  return sortear(F.geral);
}
var SITUACAO = {
  debate: 'O debate do dia está acontecendo. Participe: acuse, defenda alguém ou comente as pistas.',
  mencionado: 'Alguém acabou de falar de você na conversa. Responda.',
  defesa: 'Você foi o mais acusado e tem 20 segundos para se defender antes da votação de culpado ou inocente. Convença a cidade.',
  defesaOutro: 'Outra pessoa acabou de fazer sua defesa no julgamento. Diga se te convenceu.',
  reacao: 'Acabaram de revelar quem era a pessoa eliminada. Reaja.',
  noite: 'É noite e só o seu parceiro assassino lê este chat secreto. Combine em quem atacar.'
};
function falar(api, i, tipo, extra) {
  var G = api.G(); if (!G || !G.g) return;
  var slot = G.slots[i]; if (!slot || !slot.bot) return;
  var v = api.viewFor(i), mem = memoria(slot), canal = tipo === 'noite' ? 'assassinos' : 'cidade';
  if (!api.podeEscrever(i)[canal]) return;
  aprender(v, mem);
  var chaveFase = v.chave;
  var sit = SITUACAO[tipo] + (tipo === 'noite' && extra != null ? ' Sua ideia: atacar ' + v.g.jogadores[extra].nome + '.' : '');
  var barato = tipo === 'reacao' || tipo === 'defesaOutro';
  var pedido = barato ? Promise.resolve(null) : pedirIA(sistemaPrompt(v, slot), contexto(v, api, sit), { defesa: 10000, mencionado: 15000, noite: 25000 }[tipo] || 35000, tipo === 'defesa' || tipo === 'mencionado');
  pedido.then(function (r) {
    var G2 = api.G(); if (!G2 || G2 !== G || !G2.g) return;
    var v2 = api.viewFor(i);
    if (tipo === 'noite' ? G2.fase !== 'noite' : (v2.chave !== chaveFase && tipo !== 'reacao')) return;
    var texto = r && typeof r.mensagem === 'string' && r.mensagem.trim() ? r.mensagem.trim() : falaPronta(v2, mem, tipo, extra);
    if (r && r.suspeito) {
      var alvo = v2.g.jogadores.filter(function (j) { return j.nome.toLowerCase() === String(r.suspeito).toLowerCase().trim(); })[0];
      if (alvo && alvo.id !== i) mem.susp[alvo.id] = (mem.susp[alvo.id] || 0) + 1;
    }
    mem.falas++;
    api.chatEnviar(i, canal, texto);
  });
}

/* ---------------- ciclo: o anfitrião chama tick() a cada mudança ---------------- */
var IA = CD.IA = { PERSONAGENS: PERSONAGENS, status: '' };
IA.parar = function () { timers.forEach(clearTimeout); timers = []; Gem.fila.forEach(function (x) { x.ok(null); }); Gem.fila = []; };
IA.novoJogo = function (api) {
  IA.parar();
  api.G().slots.forEach(function (s) { if (s.bot) { s.mem = null; var m = memoria(s); api.G().slots.forEach(function (o, k) { m.susp[k] = Math.random() * 0.3; }); } });
};
function uma(mem, chave) { if (mem.agendado[chave]) return false; mem.agendado[chave] = true; return true; }
IA.tick = function (api) {
  var G = api.G(); if (!G || !G.g) return;
  G.slots.forEach(function (slot, i) {
    if (!slot.bot) return;
    var v = api.viewFor(i), mem = memoria(slot), me = v.g.jogadores[i], k = v.chave;
    aprender(v, mem);
    if (v.tela === 'carta' && uma(mem, k)) agendar(entre(1500, 4000), function () { api.hostAcao(i, 'pronto'); });
    else if (v.tela === 'acao' && uma(mem, k)) {
      var parceiroHumano = me.papel === 'vilao' && G.slots.some(function (s, x) { return x !== i && !s.bot && v.g.jogadores[x].papel === 'vilao' && v.g.jogadores[x].vivo; });
      var espera = parceiroHumano ? entre(9000, 14000) : entre(2500, 7000);
      if (parceiroHumano) { var ideia = escolherNoite(v, mem); if (ideia != null) agendar(entre(1500, 3500), function () { falar(api, i, 'noite', ideia); }); }
      agendar(espera, function () { var v2 = api.viewFor(i); if (v2.tela === 'acao') api.hostAcao(i, 'agir', null, escolherNoite(v2, mem)); });
    } else if (v.tela === 'investigacao' && uma(mem, k)) agendar(entre(1200, 2500), function () { api.hostAcao(i, 'visto'); });
    else if (v.tela === 'voto' && uma(mem, k)) agendar(entre(4000, 11000), function () { var v2 = api.viewFor(i); if (v2.tela === 'voto') { aprender(v2, mem); api.hostAcao(i, 'votar', null, escolherAcusacao(v2, mem)); } });
    else if (v.tela === 'juri' && uma(mem, k)) agendar(entre(3000, 8000), function () { var v2 = api.viewFor(i); if (v2.tela === 'juri') api.hostAcao(i, 'jurar', null, escolherJuri(v2, mem)); });
    else if (v.tela === 'vinganca' && uma(mem, k)) agendar(entre(3500, 6000), function () {
      var v2 = api.viewFor(i); if (v2.tela !== 'vinganca') return;
      var s = suspeito(v2, mem); api.hostAcao(i, 'vingar', null, s.id != null ? s.id : vivosDe(v2)[0].id);
    });
    if (!me.vivo) return;
    if (v.tela === 'debate' && uma(mem, k)) {
      var total = Math.max(30, v.resta || 60), t1 = entre(3000, Math.min(25000, total * 400));
      agendar(t1, function () { if (api.G().tela === 'debate') falar(api, i, 'debate'); });
      if (total > 70 && Math.random() < 0.7) agendar(t1 + entre(25000, 45000), function () { if (api.G().tela === 'debate') falar(api, i, 'debate'); });
    }
    if (v.tela === 'defesa' && uma(mem, k)) {
      if (v.rv.acusado === i) agendar(1200, function () { falar(api, i, 'defesa'); });
      else if (Math.random() < 0.3) agendar(entre(12000, 17000), function () { if (api.G().tela === 'defesa') falar(api, i, 'defesaOutro'); });
    }
    if (v.tela === 'revelacao' && v.virada && uma(mem, k + 'v') && Math.random() < 0.3) {
      var rev = v.g.jogadores[v.rev.id];
      agendar(entre(2000, 4000), function () { falar(api, i, 'reacao', NOME_PAPEL[rev.papel] ? NOME_PAPEL[rev.papel].toLowerCase() : ''); });
    }
    if (v.tela === 'fim' && uma(mem, k) && Math.random() < 0.35) agendar(entre(2500, 6000), function () { api.chatEnviar(i, 'cidade', sortear(F.fim)); });
  });
};
var ACUSA = /(assassin|suspeit|culpad|mentind|mentiros|matou|vot(o|a|em|ar)\s|desconfi|saiu de casa|foi el|é el)/i;
IA.aoChat = function (m, api) {
  var G = api.G(); if (!G || !G.g || m.sis) return;
  G.slots.forEach(function (slot, i) {
    if (!slot.bot || i === m.de) return;
    var v = api.viewFor(i), me = v.g.jogadores[i], mem = memoria(slot);
    if (v.chatCanais.indexOf(m.canal) < 0) return;
    var txt = m.texto.toLowerCase();
    if (m.canal === 'assassinos' && me.papel === 'vilao') {
      v.g.jogadores.forEach(function (j) { if (j.id !== i && j.papel !== 'vilao' && txt.indexOf(j.nome.toLowerCase()) >= 0) mem.alvoParceiro = j.id; });
      return;
    }
    if (m.canal !== 'cidade') return;
    var citou = false;
    v.g.jogadores.forEach(function (j) {
      if (!j.vivo || j.id === m.de || txt.indexOf(j.nome.toLowerCase()) < 0) return;
      if (j.id === i) citou = true;
      if (ACUSA.test(txt)) {
        if (j.id === i) { if (me.papel !== 'vilao') mem.susp[m.de] = (mem.susp[m.de] || 0) + 0.6; }
        else if (!(me.papel === 'vilao' && j.papel === 'vilao')) mem.susp[j.id] = (mem.susp[j.id] || 0) + (/investiguei|investigador/.test(txt) ? 1.5 : 0.5);
      }
      if (/investiguei|sou (o )?investigador/.test(txt) && me.papel === 'vilao') mem.ameaca[m.de] = (mem.ameaca[m.de] || 0) + 3;
      if (/investiguei|sou (o )?investigador/.test(txt) && me.papel === 'medico') mem.ameaca[m.de] = (mem.ameaca[m.de] || 0) + 2;
    });
    if (citou && !m.bot && api.podeEscrever(i).cidade && uma(mem, 'resp' + m.id)) agendar(entre(2500, 5500), function () { falar(api, i, 'mencionado'); });
  });
};
IA.testar = function () {
  if (!(S.iaChave || '').trim()) { definirStatus(''); return; }
  IA.status = 'testando'; definirStatus('testando');
  Gem.pausaAte = 0; IA.status = 'testando';
  chamar('Responda só com JSON.', 'Responda {"mensagem":"ok","suspeito":""}').then(function () { definirStatus('ok'); }, function (e) {
    var st = e && e.status;
    if (st === 404 && Gem.modelo < MODELOS.length - 1) { Gem.modelo++; IA.testar(); return; }
    definirStatus(st === 429 ? 'limite' : (st === 400 || st === 401 || st === 403) ? 'chave' : 'falha');
  });
};
IA.painel = function () {
  var tem = !!(S.iaChave || '').trim();
  return '<div class="iabox"><p class="rotulo">Inteligência dos agentes</p>' +
    (tem
      ? '<p id="iaStatus" style="margin:6px 0 10px">' + textoStatus() + '</p><div class="linha">' + btn2('iaTestar', 'Testar') + btn2('iaApagar', 'Apagar chave') + '</div>'
      : '<p style="margin:6px 0 10px">Para os agentes pensarem e conversarem com IA de verdade, cole uma chave gratuita do Gemini. Sem chave, eles usam falas prontas.</p>' +
        '<label class="campo"><span class="rotulo">Chave do Gemini</span><input type="password" autocomplete="off" spellcheck="false" data-campo="iaChave" placeholder="Cole aqui a chave"></label>' +
        '<p class="aviso" style="margin-top:8px">Pegue em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Ela fica salva só neste celular.</p>' +
        '<div class="linha" style="margin-top:8px">' + btn2('iaTestar', 'Salvar e testar') + '</div>') +
    '</div>';
};
function btn2(act, txt) { return '<button type="button" class="btn sec mini" data-act="' + act + '">' + esc(txt) + '</button>'; }
})();
