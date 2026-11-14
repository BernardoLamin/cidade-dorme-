/* Cidade Dorme: conversa de voz (opcional) entre quem ligou o microfone.
   Cada par de jogadores com voz ligada abre uma chamada direta (malha). O microfone fica mudo à noite e para quem morreu. */
(function () {
'use strict';
var CD = window.CD, S = CD.S;
var Mic = CD.Mic = { quer: false, stream: null, chamadas: {}, audios: {}, vozes: [], pedindo: false };
var DIA = { amanhecer: 1, revelacao: 1, pista: 1, evento: 1, debate: 1, defesa: 1, resultadoVoto: 1, veredito: 1, vinganca: 1, fim: 1, lobby: 1 };

function suportado() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }
function disponivel() { return S.rede && (S.modo === 'host' || S.modo === 'cliente') && suportado(); }
function podeFalar() {
  if (S.fase === 'lobby' || S.tela === 'fim' || S.tela === 'lobby') return true;
  var eu = S.g && S.g.jogadores[S.me];
  if (!eu || !eu.vivo) return false;
  if (S.fase === 'voto' || S.fase === 'juri') return true;
  if (S.fase === 'noite' || S.fase === 'cartas') return false;
  return !!DIA[S.tela];
}
function aplicarRegra() {
  var ativo = Mic.quer && podeFalar();
  if (Mic.stream) Mic.stream.getAudioTracks().forEach(function (t) { t.enabled = ativo; });
  desenhar();
}
function fechar(p) {
  var c = Mic.chamadas[p]; delete Mic.chamadas[p];
  try { if (c) c.close(); } catch (e) {}
  var a = Mic.audios[p]; delete Mic.audios[p];
  if (a) { try { a.pause(); a.srcObject = null; a.remove(); } catch (e) {} }
}
function registrar(p, call) {
  if (Mic.chamadas[p] && Mic.chamadas[p] !== call) fechar(p);
  Mic.chamadas[p] = call;
  call.on('stream', function (rs) {
    var a = Mic.audios[p];
    if (!a) { a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.hidden = true; document.body.appendChild(a); Mic.audios[p] = a; }
    a.srcObject = rs;
    var q = a.play(); if (q && q.catch) q.catch(function () {});
  });
  call.on('close', function () { if (Mic.chamadas[p] === call) fechar(p); });
  call.on('error', function () { if (Mic.chamadas[p] === call) fechar(p); });
}
Mic.chamadaRecebida = function (call) {
  if (!Mic.stream) { try { call.close(); } catch (e) {} return; }
  call.answer(Mic.stream); registrar(call.peer, call);
};
Mic.sincronizar = function (v) {
  Mic.vozes = v.vozes || [];
  var eu = CD.rede && CD.rede.peerId(), peer = CD.rede && CD.rede.peer();
  if (!Mic.stream || !peer || !eu) { Object.keys(Mic.chamadas).forEach(fechar); aplicarRegra(); return; }
  var deve = {};
  Mic.vozes.forEach(function (x) {
    if (x.peer === eu) return;
    deve[x.peer] = true;
    if (!Mic.chamadas[x.peer] && eu < x.peer) { try { registrar(x.peer, peer.call(x.peer, Mic.stream)); } catch (e) {} }
  });
  Object.keys(Mic.chamadas).forEach(function (p) { if (!deve[p]) fechar(p); });
  aplicarRegra();
};
Mic.ligar = function () {
  if (Mic.pedindo || !disponivel()) return;
  Mic.pedindo = true; desenhar();
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (st) {
    Mic.pedindo = false; Mic.stream = st; Mic.quer = true;
    aplicarRegra(); CD.rede.avisarVoz(true);
  }, function () {
    Mic.pedindo = false; Mic.erro = true; desenhar();
  });
};
Mic.desligar = function () {
  var tinha = !!Mic.stream;
  Object.keys(Mic.chamadas).forEach(fechar);
  if (Mic.stream) Mic.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
  Mic.stream = null; Mic.quer = false; Mic.pedindo = false;
  if (tinha && CD.rede && S.modo !== 'local') CD.rede.avisarVoz(false);
  desenhar();
};
Mic.conectados = function () {
  return Object.keys(Mic.chamadas).filter(function (p) { var pc = Mic.chamadas[p].peerConnection; return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'); }).length;
};

function desenhar() {
  var slot = document.getElementById('micSlot');
  if (!slot) return;
  if (!disponivel()) { slot.innerHTML = ''; return; }
  var ligado = !!Mic.stream, mudo = ligado && !podeFalar(), n = Mic.vozes.length;
  var icone = ligado && !mudo
    ? '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' + (ligado ? '<path d="M4 4l16 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' : '');
  var rotulo = Mic.pedindo ? 'Pedindo o microfone...' : !ligado ? (Mic.erro ? 'Sem acesso ao microfone. Toque para tentar de novo' : 'Entrar na conversa de voz') : mudo ? 'Voz ligada, mudo agora (noite ou fora do jogo). Toque para sair da voz' : 'Voz ligada. Toque para sair da voz';
  var dica = ligado ? (mudo ? 'mudo' : n > 1 ? (n - 1) + ' na voz' : 'só você') : '';
  slot.innerHTML = '<button type="button" class="chatbtn micbtn' + (ligado && !mudo ? ' on' : '') + '" id="micBtn" aria-pressed="' + ligado + '" aria-label="' + rotulo + '" title="' + rotulo + '">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' + icone + '</svg></button>' + (dica ? '<span class="micdica">' + dica + '</span>' : '');
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('#micBtn')) return;
  CD.Som.init();
  if (Mic.stream) Mic.desligar(); else Mic.ligar();
});
var renderChatOriginal = CD.renderChat;
CD.renderChat = function (f) { renderChatOriginal(f); desenhar(); };
var posRenderOriginal = CD.posRender;
CD.posRender = function (m) { if (posRenderOriginal) posRenderOriginal(m); aplicarRegra(); };
})();
