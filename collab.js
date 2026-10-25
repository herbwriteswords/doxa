/* Doxa collaboration.
   Free path: Firebase Auth (email + password) and Firestore on the Spark plan.
   No Cloud Functions. If config.js is still empty, songs stay on this device.
   DOXA_CLOUD.useDemo() is an on-device preview for two tabs on one computer. */
(function (root) {
  'use strict';
  var PALETTE = ['#c96442', '#2f6f4e', '#315f8c', '#8a4b2f', '#6d4b8a', '#1c6e86', '#a33d4a', '#a07912'];
  var STALE = 25000;
  var HEARTBEAT = 10000;
  var STORE = 'doxa-cloud-demo-v1';
  var SESSION = 'doxa-demo-session';
  var JOIN_KEY = 'doxa-join';

  function copyLine(l) {
    var o = {
      id: String(l && l.id || ''),
      html: String(l && l.html || '').slice(0, 4000),
      by: String(l && l.by || ''),
      name: String(l && l.name || '').slice(0, 40),
      color: /^#[0-9a-fA-F]{6}$/.test(l && l.color || '') ? l.color : '',
      at: Number(l && l.at) || 0
    };
    if (l && l.deleted) o.deleted = true;
    return o;
  }
  function liveLines(lines) {
    return (lines || []).filter(function (l) { return l && !l.deleted; });
  }
  function newer(a, b) {
    if (!a) return b;
    if (!b) return a;
    return (Number(a.at) || 0) > (Number(b.at) || 0) ? a : b;
  }
  function mergeLines(local, remote, prefer) {
    var preferSet = prefer ? (prefer instanceof Set ? prefer : new Set(prefer)) : new Set();
    var remoteMap = new Map();
    (remote || []).forEach(function (line) { if (line && line.id) remoteMap.set(line.id, line); });
    var out = [];
    var seen = new Set();
    function push(line) {
      if (!line || !line.id || seen.has(line.id)) return;
      seen.add(line.id);
      out.push(copyLine(line));
    }
    (local || []).forEach(function (line) {
      if (!line || !line.id || seen.has(line.id)) return;
      var other = remoteMap.get(line.id);
      if (preferSet.has(line.id)) {
        var chosen = copyLine(line);
        chosen.at = Math.max(Number(line.at) || 0, other ? Number(other.at) || 0 : 0) + 1;
        if (line.deleted) chosen.deleted = true;
        push(chosen);
        return;
      }
      push(newer(other, line));
    });
    (remote || []).forEach(function (line) { push(line); });
    return out;
  }
  function pickColor(seed, used) {
    var h = 0;
    var s = String(seed || '');
    for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    var start = h % PALETTE.length;
    var taken = used || new Set();
    for (var n = 0; n < PALETTE.length; n++) {
      var c = PALETTE[(start + n) % PALETTE.length];
      if (!taken.has(c) && !taken.has(c.toLowerCase())) return c;
    }
    return PALETTE[start];
  }
  function safeColor(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#8a8073';
  }

  root.DOXA_MERGE = {mergeLines: mergeLines, liveLines: liveLines, pickColor: pickColor, copyLine: copyLine, PALETTE: PALETTE};
  if (typeof document === 'undefined') return;

  var DOXA = root.DOXA;
  var $ = function (s) { return document.querySelector(s); };
  var api = null;
  var demoApi = null;
  var demoForced = false;
  var readyFlag = false;
  var apiError = '';
  var meUser = null;
  var cloudSongs = [];
  var indexUnsub = null;
  var songUnsub = null;
  var metaUnsubs = new Map();
  var dirty = new Map();
  var pendingCreate = new Set();
  var pendingDelete = new Set();
  var flushTimers = new Map();
  var orderDirty = false;
  var metaTimer = null;
  var presenceTimer = null;
  var lastSplit = 0;
  var leaving = false;
  var goneFor = '';
  var afterAuth = '';
  var autoJoinStarted = false;
  var joinPrompted = false;
  var lastReconcile = '';
  var authFormNote = '';

  function configured() {
    var c = root.DOXA_CONFIG && root.DOXA_CONFIG.firebase;
    return !!(c && c.apiKey && c.authDomain && c.projectId && c.appId && c.apiKey !== 'demo');
  }
  function isDemoConfig() {
    var c = root.DOXA_CONFIG && root.DOXA_CONFIG.firebase;
    return demoForced || !!(c && c.apiKey === 'demo');
  }
  function cloudOn() { return !!(api && (configured() || isDemoConfig() || (api && api.mode === 'demo'))); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function cleanName(s) {
    return String(s || '').replace(/[<>\n\r]/g, '').trim().slice(0, 40);
  }
  function niceError(e) {
    var c = (e && (e.code || e.message)) || '';
    if (/email-already-in-use/.test(c)) return 'That email already has an account. Sign in instead.';
    if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'That email and password don’t match.';
    if (/weak-password/.test(c)) return 'Use at least 6 characters.';
    if (/invalid-email/.test(c)) return 'That email doesn’t look right.';
    if (/doxa\/name/.test(c)) return 'Add your name so the team can see who wrote a line.';
    if (/doxa\/not-found/.test(c)) return 'That code doesn’t match a song.';
    if (/doxa\/reset-demo/.test(c)) return 'Password reset emails start working after Firebase is connected.';
    if (/network|unavailable|offline|failed to fetch/i.test(c)) return 'Can’t reach the server. Songs on this device still work.';
    if (/permission-denied/.test(c)) return 'You don’t have access to that song.';
    if (/api-key|app\/|configuration|invalid-api/.test(c)) return 'Check the web config in config.js.';
    return 'Something went wrong. Try again.';
  }
  function firstName(name) {
    var p = String(name || '').trim().split(/\s+/)[0] || '';
    return p.length > 12 ? p.slice(0, 11) + '…' : p;
  }
  function labelFor(name) {
    var first = firstName(name);
    var cur = DOXA.getCur();
    var members = (cur && cur.members) || [];
    var same = members.filter(function (m) { return firstName(m.name) === first; });
    if (same.length < 2) return first;
    var bits = String(name || '').trim().split(/\s+/);
    return bits[1] ? first + ' ' + bits[1].slice(0, 1) : first;
  }
  function myColor() {
    var me = api && api.user();
    var cur = DOXA.getCur();
    if (me && cur && cur.members) {
      var mine = cur.members.find(function (m) { return m.uid === me.uid; });
      if (mine && mine.color) return mine.color;
    }
    return (me && me.color) || PALETTE[0];
  }
  function previewOf(song) {
    var secs = (song && song.secs) || [];
    for (var i = 0; i < secs.length; i++) {
      var lines = liveLines(secs[i].lines);
      for (var j = 0; j < lines.length; j++) {
        var t = DOXA.sectionPlain(lines[j].html).replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 80);
      }
    }
    return '';
  }
  function metaFrom(song) {
    var me = api && api.user();
    return {
      title: song.title || '',
      key: song.key || '',
      preview: previewOf(song),
      order: (song.secs || []).map(function (s) { return s.id; }),
      updatedAt: Date.now(),
      ownerId: song.ownerId || (me && me.uid) || '',
      inviteCode: song.inviteCode || '',
      color: myColor()
    };
  }
  function sectionById(id) {
    var cur = DOXA.getCur();
    if (!cur || !cur.secs) return null;
    for (var i = 0; i < cur.secs.length; i++) if (cur.secs[i].id === id) return cur.secs[i];
    return null;
  }
  function emptyLine() {
    return {id: DOXA.uid(), html: '', by: '', name: '', color: '', at: Date.now()};
  }
  function stamp(line) {
    var me = api && api.user();
    line.at = Date.now();
    if (!me || !DOXA.sectionPlain(line.html).replace(/\u00a0/g, ' ').trim()) return;
    line.by = me.uid;
    line.name = me.name;
    line.color = myColor();
  }
  function touchLine(sec, line) {
    if (!dirty.has(sec.id)) dirty.set(sec.id, new Set());
    dirty.get(sec.id).add(line.id);
    sec._gen = (sec._gen || 0) + 1;
  }
  function htmlToLines(html, me) {
    var parts = String(html || '').split(/<br\s*\/?>/i);
    var now = Date.now();
    var lines = parts.map(function (part) {
      var h = DOXA.clean(part);
      var has = DOXA.sectionPlain(h).replace(/\u00a0/g, ' ').trim();
      return {id: DOXA.uid(), html: h, by: has ? me.uid : '', name: has ? me.name : '', color: has ? me.color : '', at: now};
    });
    while (lines.length > 1 && !DOXA.sectionPlain(lines[lines.length - 1].html).trim()) lines.pop();
    if (!lines.length) lines.push(emptyLine());
    return lines;
  }
  function setSave(text) {
    var node = $('#saveState');
    if (!node) return;
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud) { node.classList.add('hidden'); node.textContent = ''; return; }
    node.classList.remove('hidden');
    node.textContent = text || '';
  }
  function shareUrl(code) {
    var u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('join', code);
    return u.toString();
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    var i = document.createElement('textarea');
    i.value = text;
    i.setAttribute('readonly', '');
    i.style.position = 'fixed';
    i.style.left = '-999px';
    document.body.appendChild(i);
    i.select();
    try { document.execCommand('copy'); } catch (e) {}
    i.remove();
  }
  function randomId(len) {
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    var buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    var s = '';
    for (var i = 0; i < buf.length; i++) s += alphabet[buf[i] % alphabet.length];
    return s;
  }
  function inviteCode() { return randomId(10); }
  function cloudId() { return randomId(12); }

  function paintAccount() {
    var b = $('#accountBtn');
    if (!b) return;
    b.innerHTML = '';
    if (!cloudOn() && !configured() && !isDemoConfig()) { b.textContent = 'Account'; return; }
    if (!meUser) { b.textContent = configured() || isDemoConfig() ? 'Sign in' : 'Account'; return; }
    var dot = el('span', 'dot');
    dot.style.background = safeColor(meUser.color);
    b.appendChild(dot);
    b.appendChild(document.createTextNode(firstName(meUser.name) || 'Account'));
  }
  function rememberList(song) {
    var row = {
      id: song.id,
      title: song.title || '',
      key: song.key || '',
      preview: song.preview || previewOf(song),
      updatedAt: song.updatedAt || song.t || Date.now(),
      ownerId: song.ownerId || '',
      color: song.color || myColor(),
      inviteCode: song.inviteCode || ''
    };
    var i = -1;
    for (var n = 0; n < cloudSongs.length; n++) if (cloudSongs[n].id === row.id) i = n;
    if (i >= 0) cloudSongs[i] = Object.assign({}, cloudSongs[i], row);
    else cloudSongs.unshift(row);
    cloudSongs.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    if (!$('#library').classList.contains('hidden')) paintCloudList();
  }
  function paintCloudList() {
    document.querySelectorAll('#songList .cloudsong, #songList .liblabel').forEach(function (n) { n.remove(); });
    var localCount = DOXA.st.songs.length;
    var empty = $('#empty');
    if (empty) empty.classList.toggle('hidden', localCount + cloudSongs.length > 0);
    if (!cloudSongs.length) return;
    var list = $('#songList');
    if (localCount) list.prepend(el('li', 'liblabel', 'On this device'));
    list.appendChild(el('li', 'liblabel', 'Shared'));
    cloudSongs.forEach(function (entry) {
      var li = el('li', 'song cloudsong');
      var dot = el('span', 'dot');
      dot.style.background = safeColor(entry.color || '#8a8073');
      var grow = el('div', 'grow');
      var title = el('div', 't', entry.title || 'Untitled song');
      var bits = ['Shared'];
      if (entry.key) bits.push(entry.key);
      if (entry.preview) bits.push(entry.preview);
      var meta = el('div', 'd', bits.join(' · '));
      grow.appendChild(title);
      grow.appendChild(meta);
      grow.onclick = function () { openCloud(entry.id).catch(function (err) { window.alert(niceError(err)); }); };
      var more = el('button', 'ghost', '⋯');
      more.type = 'button';
      more.onclick = function (e) { e.stopPropagation(); cloudMenu(entry); };
      li.appendChild(dot);
      li.appendChild(grow);
      li.appendChild(more);
      list.appendChild(li);
    });
  }
  function cloudMenu(entry) {
    var me = api && api.user();
    var owner = me && entry.ownerId === me.uid;
    DOXA.menu([
      ['Open', function () { openCloud(entry.id).catch(function (err) { window.alert(niceError(err)); }); }],
      ['Share song', function () { shareFromList(entry); }],
      [owner ? 'Delete shared song' : 'Leave song', function () { owner ? removeSong(entry.id) : leaveSong(entry.id); }, 'red']
    ]);
  }
  function watchSongMetas(entries) {
    var want = new Set(entries.map(function (e) { return e.id; }));
    metaUnsubs.forEach(function (unsub, id) {
      if (!want.has(id)) { unsub(); metaUnsubs.delete(id); }
    });
    entries.forEach(function (entry) {
      if (metaUnsubs.has(entry.id) || !api.listenMeta) return;
      metaUnsubs.set(entry.id, api.listenMeta(entry.id, function (song) {
        if (!song) {
          cloudSongs = cloudSongs.filter(function (s) { return s.id !== entry.id; });
          if (api.dropIndex) api.dropIndex(entry.id).catch(function () {});
          var cur = DOXA.getCur();
          if (cur && cur.cloud && cur.id === entry.id) gone(entry.id);
        } else {
          var row = null;
          for (var i = 0; i < cloudSongs.length; i++) if (cloudSongs[i].id === entry.id) row = cloudSongs[i];
          if (row) {
            row.title = song.title || '';
            row.key = song.key || '';
            row.preview = song.preview || '';
            row.updatedAt = song.updatedAt || row.updatedAt;
            row.inviteCode = song.inviteCode || row.inviteCode;
            row.ownerId = song.ownerId || row.ownerId;
          }
        }
        if (!$('#library').classList.contains('hidden')) paintCloudList();
      }));
    });
  }
  function startIndex(uid) {
    stopIndex();
    if (!api) return;
    indexUnsub = api.listenIndex(uid, function (entries) {
      cloudSongs = entries.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      watchSongMetas(cloudSongs);
      if (!$('#library').classList.contains('hidden')) paintCloudList();
    });
  }
  function stopIndex() {
    if (indexUnsub) indexUnsub();
    indexUnsub = null;
    metaUnsubs.forEach(function (u) { u(); });
    metaUnsubs.clear();
  }
  function handleAuth(user) {
    var prev = meUser;
    meUser = user || null;
    stopIndex();
    if (meUser) startIndex(meUser.uid);
    else cloudSongs = [];
    paintAccount();
    var libraryOpen = !$('#library').classList.contains('hidden');
    var editingCloud = !!(DOXA.getCur() && DOXA.getCur().cloud && !libraryOpen);
    if (meUser && !prev) DOXA.closeSheets();
    if (meUser && !prev && afterAuth === 'share') {
      afterAuth = '';
      shareCopy();
      return;
    }
    if (!meUser && editingCloud) DOXA.lib();
    else if (libraryOpen) DOXA.lib();
    if (meUser) maybeAutoJoin();
    else if (sessionStorage.getItem(JOIN_KEY) && !joinPrompted) {
      joinPrompted = true;
      openAccount('Sign in, and we’ll open the song you were invited to.');
    }
  }
  function stashJoin() {
    try {
      var q = new URLSearchParams(location.search).get('join');
      if (q) sessionStorage.setItem(JOIN_KEY, q.trim().toLowerCase());
    } catch (e) {}
  }
  function maybeAutoJoin() {
    var code = sessionStorage.getItem(JOIN_KEY);
    if (!code || !api || !api.user()) return;
    if (autoJoinStarted) return;
    autoJoinStarted = true;
    api.join(code).then(function (id) {
      sessionStorage.removeItem(JOIN_KEY);
      try {
        var u = new URL(location.href);
        u.searchParams.delete('join');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e) {}
      DOXA.closeSheets();
      return openCloud(id);
    }).catch(function (err) {
      autoJoinStarted = false;
      openAccount(niceError(err));
    });
  }

  function cloneSec(s) {
    return {id: s.id, type: s.type || 'Verse', typeAt: s.typeAt || 0, lines: (s.lines || []).map(copyLine), _gen: s._gen || 0};
  }
  function applySections(remoteSecs, order) {
    var cur = DOXA.getCur();
    var remoteOrdered = (remoteSecs || []).map(cloneSec).sort(function (a, b) {
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 10000 : ia) - (ib < 0 ? 10000 : ib);
    });
    var remoteById = new Map();
    remoteOrdered.forEach(function (s) { remoteById.set(s.id, s); });
    var localDirty = orderDirty || pendingCreate.size || pendingDelete.size || cur.secs.some(function (s) {
      return dirty.get(s.id) && dirty.get(s.id).size;
    });
    if (!localDirty) {
      cur.secs = remoteOrdered.filter(function (s) { return !pendingDelete.has(s.id); });
      return;
    }
    var next = [];
    var seen = new Set();
    cur.secs.forEach(function (ls) {
      if (pendingDelete.has(ls.id)) return;
      seen.add(ls.id);
      var rs = remoteById.get(ls.id);
      if (!rs) {
        if (pendingCreate.has(ls.id) || (dirty.get(ls.id) && dirty.get(ls.id).size)) next.push(ls);
        return;
      }
      var prefer = dirty.get(ls.id);
      if (prefer && prefer.size) ls.lines = mergeLines(ls.lines, rs.lines, prefer);
      else ls.lines = rs.lines.map(copyLine);
      if ((rs.typeAt || 0) > (ls.typeAt || 0)) { ls.type = rs.type; ls.typeAt = rs.typeAt; }
      next.push(ls);
    });
    remoteOrdered.forEach(function (rs) {
      if (seen.has(rs.id) || pendingDelete.has(rs.id)) return;
      next.push(rs);
    });
    if (!orderDirty) {
      var ordered = [];
      remoteOrdered.forEach(function (rs) {
        if (pendingDelete.has(rs.id)) return;
        var found = null;
        for (var i = 0; i < next.length; i++) if (next[i].id === rs.id) found = next[i];
        if (found) ordered.push(found);
      });
      next.forEach(function (s) { if (ordered.indexOf(s) < 0) ordered.push(s); });
      cur.secs = ordered;
      return;
    }
    cur.secs = next;
  }
  function sectionSig(secs) {
    return (secs || []).map(function (s) {
      return s.id + '~' + s.type + '~' + liveLines(s.lines).map(function (l) {
        return l.id + '@' + l.at + '@' + l.html + '@' + (l.color || '');
      }).join('/');
    }).join('|');
  }
  function domMatches(song) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('#sections .sec'));
    if (nodes.length !== song.secs.length) return false;
    for (var i = 0; i < song.secs.length; i++) {
      if (nodes[i].dataset.id !== song.secs[i].id) return false;
      var chip = nodes[i].querySelector('.chip');
      if (!chip || chip.textContent !== song.secs[i].type) return false;
      var rows = nodes[i].querySelectorAll('.linerow');
      var live = liveLines(song.secs[i].lines);
      if (rows.length !== live.length) return false;
      for (var j = 0; j < live.length; j++) if (rows[j].dataset.line !== live[j].id) return false;
    }
    return true;
  }
  function keySheetOpen() {
    var menu = $('#menu');
    return menu && !menu.classList.contains('hidden') && menu.querySelector('.keyopt');
  }
  function captureFocus() {
    var node = document.activeElement;
    if (!node || !node.classList || !node.classList.contains('line')) return null;
    return {lineId: node.dataset.line, pos: caretOffset(node)};
  }
  function restoreFocus(info) {
    if (!info) return;
    var node = document.querySelector('.line[data-line="' + info.lineId + '"]');
    if (!node) return;
    node.focus();
    setCaret(node, info.pos || 0);
  }
  function paintWho(row, line) {
    if (!row) return;
    var g = row.querySelector('.gutter');
    var who = row.querySelector('.who');
    var text = DOXA.sectionPlain(line.html).replace(/\u00a0/g, ' ').trim();
    var show = !!(text && line.name);
    var color = show ? safeColor(line.color) : '';
    g.style.background = color;
    g.style.backgroundColor = color;
    who.textContent = show ? labelFor(line.name) : '';
    who.style.color = color;
    who.setAttribute('aria-label', show ? 'Last edited by ' + line.name : '');
    g.title = show ? 'Last edited by ' + line.name : '';
    row.dataset.by = line.by || '';
  }
  function patchLines() {
    var cur = DOXA.getCur();
    if (!cur) return;
    cur.secs.forEach(function (sec) {
      var root = document.querySelector('.sec[data-id="' + sec.id + '"]');
      if (!root) return;
      liveLines(sec.lines).forEach(function (line) {
        var row = root.querySelector('.linerow[data-line="' + line.id + '"]');
        if (!row) return;
        var body = row.querySelector('.body');
        paintWho(row, line);
        if (document.activeElement === body) return;
        var next = line.html || '';
        if ((body.dataset.src || '') !== next) {
          body.innerHTML = next;
          body.dataset.src = next;
        }
      });
    });
  }
  function applyRemote(state) {
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud || !state || !state.song || state.song.id !== cur.id) return;
    var before = sectionSig(cur.secs);
    cur.members = state.members || [];
    cur.presence = state.presence || [];
    cur.ownerId = state.song.ownerId || cur.ownerId;
    cur.inviteCode = state.song.inviteCode || cur.inviteCode;
    cur.t = state.song.updatedAt || cur.t;
    if (document.activeElement !== $('#title')) {
      if ((state.song.title || '') !== (cur.title || '')) {
        cur.title = state.song.title || '';
        $('#title').value = cur.title;
      }
    }
    if (!keySheetOpen()) {
      cur.key = state.song.key || '';
      DOXA.paintKey();
    }
    applySections(state.sections || [], state.song.order || []);
    var after = sectionSig(cur.secs);
    if (before !== after || !domMatches(cur)) {
      if (domMatches(cur)) patchLines();
      else {
        var focus = captureFocus();
        renderCloud();
        restoreFocus(focus);
      }
    }
    paintPeople();
    paintCarets();
    rememberList(cur);
    reconcileColor();
  }
  function gone(id) {
    if (leaving || goneFor === id) return;
    goneFor = id;
    cloudSongs = cloudSongs.filter(function (s) { return s.id !== id; });
    if (api && api.dropIndex) api.dropIndex(id).catch(function () {});
    window.alert('That shared song is no longer available.');
    DOXA.lib();
  }
  function openCloud(id) {
    if (!api || !api.user()) { openAccount('Sign in to open a shared song.'); return Promise.reject(new Error('auth')); }
    onLeave();
    $('#library').classList.add('hidden');
    $('#editor').classList.remove('hidden');
    setSave('Opening…');
    return new Promise(function (resolve, reject) {
      var settled = false;
      songUnsub = api.listenSong(id, function (state) {
        if (!state || !state.song) {
          if (!settled) {
            settled = true;
            if (songUnsub) { songUnsub(); songUnsub = null; }
            DOXA.lib();
            reject(Object.assign(new Error('missing'), {code: 'doxa/not-found'}));
          } else gone(id);
          return;
        }
        state.song.id = id;
        if (!settled) {
          settled = true;
          var song = {
            id: id,
            title: state.song.title || '',
            key: state.song.key || '',
            t: state.song.updatedAt || Date.now(),
            cloud: true,
            ownerId: state.song.ownerId || '',
            inviteCode: state.song.inviteCode || '',
            secs: [],
            members: state.members || [],
            presence: state.presence || []
          };
          DOXA.setCur(song);
          applySections(state.sections || [], state.song.order || []);
          if (!song.secs.length) song.secs.push({id: DOXA.uid(), type: 'Verse 1', typeAt: Date.now(), lines: [emptyLine()]});
          document.body.dataset.cloud = 'on';
          $('#title').value = song.title;
          renderCloud();
          setSave('Saved');
          rememberList(song);
          reconcileColor();
          writePresence();
          resolve(id);
        } else applyRemote(state);
      });
    });
  }
  function onLeave() {
    var cur = DOXA.getCur();
    flushTimers.forEach(function (t) { clearTimeout(t); });
    flushTimers.clear();
    clearTimeout(metaTimer);
    clearTimeout(presenceTimer);
    if (cur && cur.cloud && api && api.user()) {
      var songId = cur.id;
      cur.secs.forEach(function (sec) {
        if (!(dirty.get(sec.id) && dirty.get(sec.id).size) && !pendingCreate.has(sec.id)) return;
        var prefer = new Set(dirty.get(sec.id) || []);
        api.saveSection(songId, {id: sec.id, type: sec.type, typeAt: sec.typeAt || 0, lines: sec.lines.map(copyLine)}, prefer).catch(function () {});
      });
      api.saveMeta(songId, metaFrom(cur)).catch(function () {});
      api.clearPresence(songId).catch(function () {});
    }
    if (songUnsub) { songUnsub(); songUnsub = null; }
    dirty.clear();
    pendingCreate.clear();
    pendingDelete.clear();
    orderDirty = false;
  }
  function flushSoon(secId) {
    clearTimeout(flushTimers.get(secId));
    flushTimers.set(secId, setTimeout(function () { flushSection(secId); }, 500));
  }
  function flushSection(secId) {
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud || !api) return;
    var sec = null;
    for (var i = 0; i < cur.secs.length; i++) if (cur.secs[i].id === secId) sec = cur.secs[i];
    if (!sec) return;
    var songId = cur.id;
    var genAtStart = sec._gen || 0;
    var prefer = new Set(dirty.get(secId) || []);
    var payload = {id: sec.id, type: sec.type, typeAt: sec.typeAt || 0, lines: sec.lines.map(copyLine)};
    setSave('Saving…');
    api.saveSection(songId, payload, prefer).then(function (merged) {
      var now = DOXA.getCur();
      if (!now || now.id !== songId) return;
      var live = null;
      for (var k = 0; k < now.secs.length; k++) if (now.secs[k].id === secId) live = now.secs[k];
      if (!live) return;
      if ((live._gen || 0) !== genAtStart) {
        live.lines = mergeLines(live.lines, merged, dirty.get(secId));
        flushSoon(secId);
        return;
      }
      dirty.delete(secId);
      pendingCreate.delete(secId);
      live.lines = merged;
      if (domMatches(now)) patchLines();
      else {
        var focus = captureFocus();
        renderCloud();
        restoreFocus(focus);
      }
      return api.saveMeta(songId, metaFrom(now)).then(function () {
        orderDirty = false;
        rememberList(now);
        setSave(navigator.onLine ? 'Saved' : 'Offline');
      });
    }).catch(function (err) {
      console.warn(err);
      setSave('Not saved');
    });
  }
  function onTouch() {
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud) return;
    orderDirty = true;
    clearTimeout(metaTimer);
    metaTimer = setTimeout(function () {
      var song = DOXA.getCur();
      if (!song || !song.cloud || !api) return;
      setSave('Saving…');
      api.saveMeta(song.id, metaFrom(song)).then(function () {
        orderDirty = false;
        rememberList(song);
        setSave(navigator.onLine ? 'Saved' : 'Offline');
      }).catch(function (err) {
        console.warn(err);
        setSave('Not saved');
      });
    }, 400);
  }
  function onSection(secId) {
    var sec = sectionById(secId);
    if (!sec) return;
    pendingCreate.add(secId);
    sec._gen = (sec._gen || 0) + 1;
    flushSoon(secId);
  }
  function reconcileColor() {
    var me = api && api.user();
    var cur = DOXA.getCur();
    if (!me || !cur || !cur.members) return;
    var mine = null;
    cur.members.forEach(function (m) { if (m.uid === me.uid) mine = m; });
    if (!mine) return;
    var used = new Set();
    cur.members.forEach(function (m) { if (m.uid !== me.uid && m.color) used.add(String(m.color).toLowerCase()); });
    var key = cur.id + ':' + (mine.color || '') + ':' + Array.from(used).sort().join();
    if (key === lastReconcile) return;
    if (!used.has(String(mine.color || '').toLowerCase())) { lastReconcile = key; return; }
    var next = pickColor(me.uid + ':' + cur.id, used);
    lastReconcile = cur.id + ':' + next + ':' + Array.from(used).sort().join();
    mine.color = next;
    api.setMemberColor(cur.id, next).catch(function (err) { console.warn(err); });
    paintPeople();
  }

  function renderCloud() {
    var cur = DOXA.getCur();
    if (!cur) return;
    document.body.dataset.cloud = 'on';
    var box = $('#sections');
    box.innerHTML = '';
    cur.secs.forEach(function (sec, i) {
      var d = el('div', 'sec');
      d.dataset.id = sec.id;
      var head = el('div', 'sechead');
      var chip = el('button', 'chip', sec.type);
      chip.type = 'button';
      chip.onclick = function () { DOXA.typeMenu(sectionById(sec.id) || sec); };
      var ctl = el('div', 'ctl');
      function small(label, title, fn) {
        var b = el('button', '', label);
        b.type = 'button';
        b.title = title;
        b.onclick = fn;
        return b;
      }
      ctl.appendChild(small('↑', 'Move up', function () { moveSec(sec.id, -1); }));
      ctl.appendChild(small('↓', 'Move down', function () { moveSec(sec.id, 1); }));
      ctl.appendChild(small('⋯', 'Section menu', function () { sectionMenu(sec.id); }));
      head.appendChild(chip);
      head.appendChild(ctl);
      d.appendChild(head);
      var lines = liveLines(sec.lines);
      if (!lines.length) {
        var blank = emptyLine();
        sec.lines.push(blank);
        touchLine(sec, blank);
        lines = [blank];
        flushSoon(sec.id);
      }
      lines.forEach(function (line, idx) {
        d.appendChild(buildRow(sec, line, lines.length === 1 && idx === 0 && !DOXA.sectionPlain(line.html).trim()));
      });
      d.appendChild(el('div', 'hints'));
      box.appendChild(d);
    });
    if (DOXA.fillAddRow) DOXA.fillAddRow();
    DOXA.paintKey();
    DOXA.syncHintUi();
    var save = $('#saveState');
    if (save) save.classList.remove('hidden');
    paintPeople();
    paintCarets();
  }
  function buildRow(sec, line, placeholder) {
    var row = el('div', 'linerow');
    row.dataset.line = line.id;
    var gutter = el('div', 'gutter');
    var who = el('div', 'who');
    var body = document.createElement('div');
    body.className = 'body line';
    body.contentEditable = 'true';
    body.spellcheck = true;
    body.dataset.line = line.id;
    body.innerHTML = line.html || '';
    body.dataset.src = line.html || '';
    if (placeholder) body.dataset.ph = 'Write ' + String(sec.type || 'line').toLowerCase() + '…';
    var remote = el('div', 'remote');
    row.appendChild(gutter);
    row.appendChild(who);
    row.appendChild(body);
    row.appendChild(remote);
    paintWho(row, line);
    bindLine(body, sec.id, line.id);
    return row;
  }
  function bindLine(body, secId, lineId) {
    body.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault();
        requestSplit(body);
      } else if (e.inputType === 'deleteContentBackward' && atStart(body)) {
        e.preventDefault();
        requestMerge(body);
      }
    });
    body.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); requestSplit(body); }
      else if (e.key === 'Backspace' && atStart(body)) { e.preventDefault(); requestMerge(body); }
      else if (e.key === 'ArrowUp' && atStart(body)) { e.preventDefault(); focusSibling(body, -1); }
      else if (e.key === 'ArrowDown' && atEnd(body)) { e.preventDefault(); focusSibling(body, 1); }
    });
    body.addEventListener('input', function () { onLineInput(body, secId, lineId); });
    body.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      if (text.indexOf('\n') < 0 && text.indexOf('\r') < 0) return;
      e.preventDefault();
      pasteLines(body, text);
    });
    body.addEventListener('focus', function () { schedulePresence(); });
  }
  function onLineInput(body, secId, lineId) {
    var sec = sectionById(secId);
    if (!sec) return;
    var line = null;
    for (var i = 0; i < sec.lines.length; i++) if (sec.lines[i].id === lineId) line = sec.lines[i];
    if (!line) return;
    line.html = DOXA.clean(body.innerHTML);
    body.dataset.src = line.html;
    stamp(line);
    touchLine(sec, line);
    paintWho(body.closest('.linerow'), line);
    flushSoon(sec.id);
    hintSoonSec(sec);
    schedulePresence();
  }
  function requestSplit(el) {
    var now = Date.now();
    if (now - lastSplit < 40) return;
    lastSplit = now;
    splitLine(el);
  }
  function requestMerge(el) {
    var now = Date.now();
    if (now - lastSplit < 40) return;
    lastSplit = now;
    mergeUp(el);
  }
  function idsOf(el) {
    var sec = el.closest('.sec');
    return {secId: sec && sec.dataset.id, lineId: el.dataset.line};
  }
  function htmlAroundCaret(node) {
    var sel = getSelection();
    if (!sel.rangeCount || !node.contains(sel.getRangeAt(0).startContainer)) {
      return {before: DOXA.clean(node.innerHTML), after: ''};
    }
    var r = sel.getRangeAt(0);
    var beforeR = document.createRange();
    beforeR.selectNodeContents(node);
    beforeR.setEnd(r.startContainer, r.startOffset);
    var afterR = document.createRange();
    afterR.selectNodeContents(node);
    afterR.setStart(r.endContainer, r.endOffset);
    var b = document.createElement('div');
    var a = document.createElement('div');
    b.appendChild(beforeR.cloneContents());
    a.appendChild(afterR.cloneContents());
    return {before: DOXA.clean(b.innerHTML), after: DOXA.clean(a.innerHTML)};
  }
  function insertAfter(sec, lineId, line) {
    var idx = -1;
    for (var i = 0; i < sec.lines.length; i++) if (sec.lines[i].id === lineId) idx = i;
    sec.lines.splice(idx + 1, 0, line);
  }
  function splitLine(node) {
    var ids = idsOf(node);
    var sec = sectionById(ids.secId);
    if (!sec) return;
    var line = null;
    for (var i = 0; i < sec.lines.length; i++) if (sec.lines[i].id === ids.lineId) line = sec.lines[i];
    if (!line) return;
    var parts = htmlAroundCaret(node);
    line.html = parts.before;
    stamp(line);
    touchLine(sec, line);
    var next = emptyLine();
    next.html = parts.after;
    stamp(next);
    insertAfter(sec, line.id, next);
    touchLine(sec, next);
    flushSoon(sec.id);
    renderCloud();
    var neu = document.querySelector('.line[data-line="' + next.id + '"]');
    if (neu) { neu.focus(); setCaret(neu, 0); }
    hintSoonSec(sec);
  }
  function textLen(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent.length;
  }
  function tombstone(sec, line) {
    line.deleted = true;
    line.at = Date.now();
    var me = api && api.user();
    if (me) { line.by = me.uid; line.name = me.name; line.color = myColor(); }
    touchLine(sec, line);
    if (!liveLines(sec.lines).length) {
      var blank = emptyLine();
      sec.lines.push(blank);
      touchLine(sec, blank);
    }
  }
  function mergeUp(node) {
    var ids = idsOf(node);
    var sec = sectionById(ids.secId);
    if (!sec) return;
    var live = liveLines(sec.lines);
    var idx = -1;
    for (var i = 0; i < live.length; i++) if (live[i].id === ids.lineId) idx = i;
    if (idx < 0) return;
    if (idx === 0) {
      if (!DOXA.sectionPlain(live[0].html).trim() && live.length > 1) {
        tombstone(sec, live[0]);
        flushSoon(sec.id);
        renderCloud();
      }
      return;
    }
    var prev = live[idx - 1];
    var curLine = live[idx];
    var at = textLen(prev.html);
    prev.html = DOXA.clean((prev.html || '') + (curLine.html || ''));
    stamp(prev);
    touchLine(sec, prev);
    tombstone(sec, curLine);
    flushSoon(sec.id);
    renderCloud();
    var pel = document.querySelector('.line[data-line="' + prev.id + '"]');
    if (pel) { pel.focus(); setCaret(pel, at); }
  }
  function pasteLines(node, text) {
    var ids = idsOf(node);
    var sec = sectionById(ids.secId);
    if (!sec) return;
    var line = null;
    for (var i = 0; i < sec.lines.length; i++) if (sec.lines[i].id === ids.lineId) line = sec.lines[i];
    if (!line) return;
    var parts = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var around = htmlAroundCaret(node);
    line.html = DOXA.clean(around.before + DOXA.esc(parts[0]));
    stamp(line);
    touchLine(sec, line);
    var last = line;
    for (var p = 1; p < parts.length; p++) {
      var n = emptyLine();
      var chunk = DOXA.esc(parts[p]);
      n.html = p === parts.length - 1 ? DOXA.clean(chunk + around.after) : chunk;
      stamp(n);
      insertAfter(sec, last.id, n);
      touchLine(sec, n);
      last = n;
    }
    flushSoon(sec.id);
    renderCloud();
    var eln = document.querySelector('.line[data-line="' + last.id + '"]');
    if (eln) { eln.focus(); setCaret(eln, textLen(eln.innerHTML)); }
  }
  function focusSibling(node, dir) {
    var ids = idsOf(node);
    var sec = sectionById(ids.secId);
    if (!sec) return;
    var live = liveLines(sec.lines);
    var idx = -1;
    for (var i = 0; i < live.length; i++) if (live[i].id === ids.lineId) idx = i;
    var nxt = live[idx + dir];
    if (!nxt) return;
    var eln = document.querySelector('.line[data-line="' + nxt.id + '"]');
    if (!eln) return;
    eln.focus();
    setCaret(eln, dir < 0 ? textLen(nxt.html) : 0);
  }
  function hintSoonSec(sec) {
    if (!DOXA.st.hints) return;
    clearTimeout(sec._ht);
    sec._ht = setTimeout(function () {
      var d = document.querySelector('.sec[data-id="' + sec.id + '"]');
      if (d) DOXA.hints(sec, d);
    }, 1800);
  }
  function clearHintTimers() {
    var cur = DOXA.getCur();
    if (!cur || !cur.secs) return;
    cur.secs.forEach(function (sec) { clearTimeout(sec._ht); });
  }
  function insertHintLine(sec, text) {
    var live = liveLines(sec.lines);
    var last = live[live.length - 1];
    var target;
    if (last && !DOXA.sectionPlain(last.html).trim()) {
      last.html = DOXA.esc(text);
      stamp(last);
      touchLine(sec, last);
      target = last;
    } else {
      target = emptyLine();
      target.html = DOXA.esc(text);
      stamp(target);
      sec.lines.push(target);
      touchLine(sec, target);
    }
    flushSoon(sec.id);
    renderCloud();
    var d = document.querySelector('.sec[data-id="' + sec.id + '"]');
    if (d) DOXA.hints(sec, d);
    var node = document.querySelector('.line[data-line="' + target.id + '"]');
    if (node) { node.focus(); setCaret(node, textLen(target.html)); }
  }
  function lineFromSelection() {
    var sel = getSelection();
    if (!sel.rangeCount) return null;
    var n = sel.getRangeAt(0).startContainer;
    var base = n.nodeType === 1 ? n : n.parentElement;
    return base && base.closest ? base.closest('.line') : null;
  }
  function insertWord(text, kind) {
    var node = lineFromSelection();
    if (!node) return;
    if (kind !== 'rhyme') {
      document.execCommand('insertText', false, text);
      node.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    var sec = sectionById(node.closest('.sec').dataset.id);
    var live = liveLines(sec.lines);
    var idx = -1;
    for (var i = 0; i < live.length; i++) if (live[i].id === node.dataset.line) idx = i;
    var target = live[idx + 1];
    var chunk = DOXA.esc(text);
    if (!target) {
      target = emptyLine();
      target.html = chunk;
      stamp(target);
      insertAfter(sec, node.dataset.line, target);
      touchLine(sec, target);
    } else {
      var plain = DOXA.sectionPlain(target.html);
      var space = plain.trim() && !/\s$/.test(plain) ? ' ' : '';
      target.html = DOXA.clean((target.html || '') + space + chunk);
      stamp(target);
      touchLine(sec, target);
    }
    flushSoon(sec.id);
    renderCloud();
    var tel = document.querySelector('.line[data-line="' + target.id + '"]');
    if (tel) { tel.focus(); setCaret(tel, textLen(target.html)); }
  }
  function moveSec(secId, dir) {
    var cur = DOXA.getCur();
    var i = -1;
    for (var n = 0; n < cur.secs.length; n++) if (cur.secs[n].id === secId) i = n;
    var j = i + dir;
    if (i < 0 || j < 0 || j >= cur.secs.length) return;
    var item = cur.secs.splice(i, 1)[0];
    cur.secs.splice(j, 0, item);
    DOXA.touch();
    renderCloud();
  }
  function sectionMenu(secId) {
    var cur = DOXA.getCur();
    var sec = sectionById(secId);
    var i = -1;
    for (var n = 0; n < cur.secs.length; n++) if (cur.secs[n].id === secId) i = n;
    DOXA.menu([
      ['Change section type', function () { DOXA.typeMenu(sectionById(secId)); }],
      ['Duplicate section', function () { duplicateSec(secId); }],
      ['Delete section', function () { deleteSec(secId); }, 'red']
    ]);
  }
  function duplicateSec(secId) {
    var cur = DOXA.getCur();
    var sec = sectionById(secId);
    if (!sec) return;
    var i = -1;
    for (var n = 0; n < cur.secs.length; n++) if (cur.secs[n].id === secId) i = n;
    var copy = {
      id: DOXA.uid(),
      type: sec.type,
      typeAt: Date.now(),
      lines: liveLines(sec.lines).map(function (l) {
        var c = copyLine(l);
        c.id = DOXA.uid();
        c.at = Date.now();
        return c;
      })
    };
    if (!copy.lines.length) copy.lines.push(emptyLine());
    cur.secs.splice(i + 1, 0, copy);
    pendingCreate.add(copy.id);
    copy.lines.forEach(function (l) { touchLine(copy, l); });
    DOXA.touch();
    flushSoon(copy.id);
    renderCloud();
  }
  function deleteSec(secId) {
    var cur = DOXA.getCur();
    var sec = sectionById(secId);
    if (!sec) return;
    var has = liveLines(sec.lines).some(function (l) { return DOXA.sectionPlain(l.html).trim(); });
    if (has && !window.confirm('Delete this ' + sec.type + '?')) return;
    pendingDelete.add(secId);
    cur.secs = cur.secs.filter(function (s) { return s.id !== secId; });
    if (api) api.deleteSection(cur.id, secId).catch(function (err) { console.warn(err); });
    DOXA.touch();
    renderCloud();
  }
  function addSection(type) {
    var cur = DOXA.getCur();
    var sec = {id: DOXA.uid(), type: type, typeAt: Date.now(), lines: [emptyLine()]};
    cur.secs.push(sec);
    pendingCreate.add(sec.id);
    touchLine(sec, sec.lines[0]);
    DOXA.touch();
    flushSoon(sec.id);
    renderCloud();
    var all = document.querySelectorAll('.line');
    if (all.length) all[all.length - 1].focus();
  }

  function caretOffset(node) {
    var sel = getSelection();
    if (!sel.rangeCount) return 0;
    var r = sel.getRangeAt(0);
    if (!node.contains(r.endContainer) && r.endContainer !== node) return 0;
    return offsetIn(node, r.endContainer, r.endOffset);
  }
  function offsetIn(root, node, offset) {
    if (node === root) {
      var c = 0;
      for (var i = 0; i < offset && i < root.childNodes.length; i++) c += root.childNodes[i].textContent.length;
      return c;
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var count = 0;
    var n = walker.nextNode();
    while (n) {
      if (n === node) return count + offset;
      count += n.textContent.length;
      n = walker.nextNode();
    }
    return count;
  }
  function pointAt(node, pos) {
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    var left = pos;
    var n = walker.nextNode();
    var r = document.createRange();
    if (!n) { r.selectNodeContents(node); r.collapse(true); return r; }
    while (n) {
      if (left <= n.textContent.length) { r.setStart(n, Math.max(0, left)); r.collapse(true); return r; }
      left -= n.textContent.length;
      n = walker.nextNode();
    }
    r.selectNodeContents(node);
    r.collapse(false);
    return r;
  }
  function setCaret(node, pos) {
    var sel = getSelection();
    var range = pointAt(node, pos);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function atStart(node) {
    var sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    if (!node.contains(sel.anchorNode) && sel.anchorNode !== node) return false;
    return caretOffset(node) === 0;
  }
  function atEnd(node) {
    var sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    return caretOffset(node) >= node.textContent.length;
  }
  function activePresence() {
    var cur = DOXA.getCur();
    if (!cur || !cur.presence) return [];
    return cur.presence.filter(function (p) {
      if (!p || !p.at) return false;
      var at = Math.min(p.at, Date.now());
      return Date.now() - at < STALE;
    });
  }
  function paintPeople() {
    var bar = $('#presenceBar');
    var cur = DOXA.getCur();
    if (!bar) return;
    if (!cur || !cur.cloud) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    var live = new Set(activePresence().map(function (p) { return p.uid; }));
    var me = api && api.user();
    (cur.members || []).forEach(function (m) {
      var s = el('span', 'person' + (live.has(m.uid) ? ' live' : ''));
      var dot = el('span', 'dot');
      dot.style.background = safeColor(m.color);
      s.style.color = safeColor(m.color);
      s.appendChild(dot);
      var label = labelFor(m.name) || 'Friend';
      if (me && m.uid === me.uid) label += ' (you)';
      s.appendChild(document.createTextNode(label));
      bar.appendChild(s);
    });
  }
  function paintCarets() {
    document.querySelectorAll('.remote-caret, .caret-name, .remote-sel').forEach(function (n) { n.remove(); });
    var cur = DOXA.getCur();
    var me = api && api.user();
    if (!cur || !cur.cloud) return;
    var lane = 0;
    activePresence().forEach(function (p) {
      if (!p.lineId || (me && p.uid === me.uid)) return;
      var row = document.querySelector('.linerow[data-line="' + p.lineId + '"]');
      if (!row) return;
      var body = row.querySelector('.body');
      var host = row.querySelector('.remote') || row;
      var start = pointAt(body, p.start || 0);
      var endOff = p.end == null ? p.start || 0 : p.end;
      if (endOff !== (p.start || 0)) {
        try {
          var a = pointAt(body, Math.min(p.start || 0, endOff));
          var b = pointAt(body, Math.max(p.start || 0, endOff));
          var range = document.createRange();
          range.setStart(a.startContainer, a.startOffset);
          range.setEnd(b.startContainer, b.startOffset);
          var base = row.getBoundingClientRect();
          Array.prototype.forEach.call(range.getClientRects(), function (rc) {
            var mark = el('div', 'remote-sel');
            mark.style.background = safeColor(p.color);
            mark.style.left = (rc.left - base.left) + 'px';
            mark.style.top = (rc.top - base.top) + 'px';
            mark.style.width = Math.max(2, rc.width) + 'px';
            mark.style.height = Math.max(16, rc.height) + 'px';
            host.appendChild(mark);
          });
        } catch (e) {}
      }
      var rect = start.getClientRects()[0] || start.getBoundingClientRect();
      var rowRect = row.getBoundingClientRect();
      if (!rect || (!rect.height && !rect.width)) {
        var hostRect = body.getBoundingClientRect();
        rect = {left: hostRect.left + 4, top: hostRect.top + 2, height: Math.max(18, hostRect.height - 4), width: 0};
      }
      var caret = el('div', 'remote-caret');
      caret.style.background = safeColor(p.color);
      caret.style.left = (rect.left - rowRect.left) + 'px';
      caret.style.top = (rect.top - rowRect.top) + 'px';
      caret.style.height = Math.max(16, rect.height) + 'px';
      var name = el('div', 'caret-name', labelFor(p.name) || 'Friend');
      name.style.background = safeColor(p.color);
      name.style.left = (rect.left - rowRect.left) + 'px';
      name.style.top = (rect.top - rowRect.top - 18 - lane * 16) + 'px';
      host.appendChild(caret);
      host.appendChild(name);
      lane++;
    });
  }
  function caretPos() {
    var node = document.activeElement;
    if (!node || !node.classList || !node.classList.contains('line')) return null;
    var sec = node.closest('.sec');
    var sel = getSelection();
    var start = 0, end = 0;
    if (sel.rangeCount && (node.contains(sel.anchorNode) || sel.anchorNode === node)) {
      var r = sel.getRangeAt(0);
      start = offsetIn(node, r.startContainer, r.startOffset);
      end = offsetIn(node, r.endContainer, r.endOffset);
    }
    return {sectionId: sec ? sec.dataset.id : '', lineId: node.dataset.line, start: start, end: end};
  }
  function schedulePresence() {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(writePresence, 350);
  }
  function writePresence() {
    var cur = DOXA.getCur();
    var me = api && api.user();
    if (!cur || !cur.cloud || !me || !api) return;
    var pos = caretPos();
    api.setPresence(cur.id, {
      uid: me.uid,
      name: me.name,
      color: myColor(),
      sectionId: pos ? pos.sectionId : '',
      lineId: pos ? pos.lineId : '',
      start: pos ? pos.start : 0,
      end: pos ? pos.end : 0,
      at: Date.now()
    }).catch(function () {});
  }

  function openAccount(note, next) {
    afterAuth = next || '';
    authFormNote = note || '';
    DOXA.closeSheets();
    var m = $('#menuBody');
    m.innerHTML = '';
    $('#menu').classList.add('tall');
    $('#menu').classList.remove('hidden');
    m.appendChild(el('div', 'keytitle', 'Account'));
    if (authFormNote) m.appendChild(el('p', 'formerr', authFormNote));
    if (!configured() && !isDemoConfig()) {
      m.appendChild(el('p', 'keynote', 'Songs on this device stay here, even offline.'));
      m.appendChild(el('p', 'keynote', 'To share a song with the team, connect a free Firebase project and paste the web config into config.js. No paid plan.'));
      var ol = document.createElement('ol');
      ol.className = 'setup';
      ['Create a free Firebase project on the Spark plan.',
        'Add a Web app. Copy apiKey, authDomain, projectId, and appId into config.js.',
        'Turn on Authentication → Email/Password.',
        'Create Firestore in production mode.',
        'Paste firestore.rules and publish.',
        'Add herbwriteswords.github.io as an authorized domain.'
      ].forEach(function (t) { ol.appendChild(el('li', '', t)); });
      m.appendChild(ol);
      m.appendChild(el('p', 'keynote', 'The README has the same steps, click by click. Until then, keep writing — nothing else changes.'));
      m.appendChild(btn('Done', function () { DOXA.closeSheets(); }));
      return;
    }
    if (isDemoConfig() && api && api.mode === 'demo') {
      m.appendChild(el('p', 'keynote', 'On-device preview. A Firebase project is what the team will use.'));
    }
    if (!meUser) {
      m.appendChild(el('p', 'keynote', 'A free account for your worship team. Songs you share are saved online. Songs you don’t share stay on this device.'));
      var form = document.createElement('form');
      form.className = 'authform';
      form.appendChild(field('authName', 'Name', 'text', 'Your name'));
      form.appendChild(field('authEmail', 'Email', 'email', 'you@example.com'));
      form.appendChild(field('authPass', 'Password', 'password', 'At least 6 characters'));
      var err = el('p', 'formerr');
      err.id = 'authError';
      form.appendChild(err);
      var row = el('div', 'rowbtns');
      var up = btn('Create account', function () { submitAuth('up', err); }, 'primary');
      up.id = 'authSignUp';
      var inn = btn('Sign in', function () { submitAuth('in', err); }, 'primary ghosty');
      inn.id = 'authSignIn';
      row.appendChild(up);
      row.appendChild(inn);
      form.appendChild(row);
      form.onsubmit = function (e) { e.preventDefault(); submitAuth('in', err); };
      m.appendChild(form);
      var reset = btn('Email me a reset link', function () {
        var email = ($('#authEmail') && $('#authEmail').value || '').trim();
        api.sendReset(email).then(function () { err.textContent = 'Reset link sent.'; err.style.color = ''; }).catch(function (e2) { err.textContent = niceError(e2); });
      });
      m.appendChild(reset);
    } else {
      var who = el('div', 'memberrow');
      var dot = el('span', 'dot');
      dot.style.background = safeColor(meUser.color);
      who.appendChild(dot);
      who.appendChild(el('div', '', meUser.name + ' · ' + (meUser.email || '')));
      m.appendChild(who);
      m.appendChild(el('p', 'keynote', 'Your color stays on the lines you edit. Everyone on a song gets a different one.'));
      var out = btn('Sign out', function () { api.signOut(); }, 'menuitem');
      out.id = 'authSignOut';
      m.appendChild(out);
    }
    m.appendChild(el('div', 'grp', 'Join a song'));
    var join = document.createElement('input');
    join.id = 'joinCode';
    join.placeholder = 'Invite code';
    join.autocomplete = 'off';
    join.className = 'joininput';
    m.appendChild(join);
    var joinBtn = btn('Join', function () { doJoin(join.value); }, 'primary');
    joinBtn.id = 'joinBtn';
    m.appendChild(joinBtn);
    m.appendChild(btn('Done', function () { DOXA.closeSheets(); }));
    var name = $('#authName');
    if (name) name.focus();
  }
  function field(id, label, type, placeholder) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'fieldlabel', label));
    var input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.placeholder = placeholder || '';
    input.autocomplete = type === 'password' ? 'current-password' : (type === 'email' ? 'username' : 'name');
    if (type === 'password') input.minLength = 6;
    wrap.appendChild(input);
    return wrap;
  }
  function btn(label, fn, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls || 'menuitem';
    b.textContent = label;
    b.onclick = function (e) { e.preventDefault(); fn(); };
    return b;
  }
  function submitAuth(kind, err) {
    err.textContent = '';
    var name = ($('#authName') && $('#authName').value) || '';
    var email = ($('#authEmail') && $('#authEmail').value) || '';
    var pass = ($('#authPass') && $('#authPass').value) || '';
    var p = kind === 'up' ? api.signUp(cleanName(name), email, pass) : api.signIn(email, pass);
    p.catch(function (e) { err.textContent = niceError(e); });
  }
  function doJoin(code) {
    var clean = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    var err = $('#authError') || $('.formerr');
    if (!clean) { if (err) err.textContent = 'Enter the code from the share link.'; return; }
    if (!api || !api.user()) { if (err) err.textContent = 'Sign in first, then join.'; return; }
    api.join(clean).then(function (id) {
      sessionStorage.removeItem(JOIN_KEY);
      DOXA.closeSheets();
      return openCloud(id);
    }).catch(function (e) { if (err) err.textContent = niceError(e); });
  }
  function showWorking(text) {
    DOXA.closeSheets();
    var m = $('#menuBody');
    m.innerHTML = '';
    m.appendChild(el('div', 'keytitle', text));
    $('#menu').classList.add('tall');
    $('#menu').classList.remove('hidden');
  }
  function openShare() {
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud) return;
    DOXA.closeSheets();
    var m = $('#menuBody');
    m.innerHTML = '';
    m.appendChild(el('div', 'keytitle', 'Share this song'));
    m.appendChild(el('p', 'keynote', 'Anyone with the link can edit after they make a free account. Each person keeps their own color.'));
    var code = el('div', 'invite-code', cur.inviteCode || '');
    code.id = 'inviteCode';
    m.appendChild(code);
    var link = document.createElement('input');
    link.id = 'shareLink';
    link.readOnly = true;
    link.className = 'joininput';
    link.value = shareUrl(cur.inviteCode || '');
    m.appendChild(link);
    var copyBtn = btn('Copy link', function () {
      copyText(link.value).then(function () { copyBtn.textContent = 'Copied'; });
    }, 'primary');
    copyBtn.id = 'copyLink';
    m.appendChild(copyBtn);
    m.appendChild(el('div', 'grp', 'Who’s here'));
    (cur.members || []).forEach(function (mem) {
      var row = el('div', 'memberrow');
      var dot = el('span', 'dot');
      dot.style.background = safeColor(mem.color);
      row.appendChild(dot);
      row.appendChild(el('span', '', (mem.name || 'Friend') + (mem.uid === cur.ownerId ? ' · owner' : '')));
      m.appendChild(row);
    });
    m.appendChild(btn('Done', function () { DOXA.closeSheets(); }));
    $('#menu').classList.add('tall');
    $('#menu').classList.remove('hidden');
  }
  function shareFromList(entry) {
    openCloud(entry.id).then(function () { openShare(); }).catch(function (err) { window.alert(niceError(err)); });
  }
  function shareCopy() {
    var local = DOXA.getCur();
    if (!local || local.cloud) return;
    if (!api || !api.user()) { openAccount('Sign in, then you can share a copy of this song.', 'share'); return; }
    var me = api.user();
    var secs = local.secs.map(function (sec) {
      return {id: DOXA.uid(), type: sec.type, typeAt: Date.now(), lines: htmlToLines(sec.html, me)};
    });
    showWorking('Sharing a copy…');
    api.createSong({title: local.title || '', key: local.key || '', secs: secs}).then(function (made) {
      rememberList({
        id: made.id, title: local.title || '', key: local.key || '', secs: secs,
        preview: previewOf({secs: secs}), updatedAt: Date.now(), ownerId: me.uid,
        color: me.color, inviteCode: made.code
      });
      return openCloud(made.id);
    }).then(function () { openShare(); }).catch(function (err) {
      console.warn(err);
      DOXA.closeSheets();
      openAccount(niceError(err));
    });
  }
  function moreItems() {
    var cur = DOXA.getCur();
    if (!cur) return [];
    if (cur.cloud) {
      var me = api && api.user();
      var owner = me && cur.ownerId === me.uid;
      return [
        ['Share song', function () { openShare(); }],
        [owner ? 'Delete shared song' : 'Leave song', function () { owner ? removeSong(cur.id) : leaveSong(cur.id); }, 'red']
      ];
    }
    if (!configured() && !isDemoConfig()) return [['Share…', function () { openAccount(); }]];
    if (!api || !api.user()) return [['Share a copy', function () { openAccount('Sign in, then you can share a copy of this song.', 'share'); }]];
    return [['Share a copy', function () { shareCopy(); }]];
  }
  function removeSong(id) {
    if (!window.confirm('Delete this shared song for everyone?')) return;
    leaving = true;
    var p = api.deleteSong(id).catch(function (err) { window.alert(niceError(err)); });
    p.then(function () {
      cloudSongs = cloudSongs.filter(function (s) { return s.id !== id; });
      leaving = false;
      DOXA.lib();
    }, function () { leaving = false; });
  }
  function leaveSong(id) {
    if (!window.confirm('Leave this song? You can rejoin with the link.')) return;
    leaving = true;
    api.leave(id).then(function () {
      cloudSongs = cloudSongs.filter(function (s) { return s.id !== id; });
      leaving = false;
      DOXA.lib();
    }, function (err) {
      leaving = false;
      window.alert(niceError(err));
    });
  }

  function emptyDb() {
    return {v: 1, users: {}, songs: {}, members: {}, sections: {}, presence: {}, invites: {}, index: {}};
  }
  function createDemoApi() {
    var mem = null;
    var me = null;
    var subs = new Map();
    var bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('doxa-collab-demo') : null;
    function load() {
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { mem = null; }
      if (!mem || mem.v !== 1) mem = emptyDb();
      return mem;
    }
    function commit(mutator) {
      var job = function () {
        try {
          var disk = JSON.parse(localStorage.getItem(STORE) || 'null');
          mem = (disk && disk.v === 1) ? disk : emptyDb();
        } catch (e) { mem = emptyDb(); }
        mutator(mem);
        localStorage.setItem(STORE, JSON.stringify(mem));
        if (bc) bc.postMessage({t: Date.now()});
      };
      if (navigator.locks) return navigator.locks.request('doxa-demo-store', job);
      job();
      return Promise.resolve();
    }
    function emitAll() {
      subs.forEach(function (set) {
        set.forEach(function (fn) { try { fn(); } catch (err) { console.warn(err); } });
      });
    }
    var reloadQueued = false;
    function scheduleReload() {
      if (reloadQueued) return;
      reloadQueued = true;
      queueMicrotask(function () {
        reloadQueued = false;
        mem = null;
        load();
        emitAll();
      });
    }
    if (bc) bc.onmessage = scheduleReload;
    window.addEventListener('storage', function (e) { if (e.key === STORE) scheduleReload(); });
    function on(key, fn) {
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(fn);
      fn();
      return function () { subs.get(key).delete(fn); };
    }
    function publicUser(u) { return {uid: u.uid, name: u.name, email: u.email, color: u.color}; }
    var sid = sessionStorage.getItem(SESSION);
    if (sid && load().users[sid]) me = publicUser(load().users[sid]);
    var listeners = new Set();
    function emitAuth() { listeners.forEach(function (fn) { fn(me); }); }
    function readSong(id) {
      var db = load();
      var song = db.songs[id];
      if (!song) return {song: null, sections: [], members: [], presence: []};
      var sections = Object.keys(db.sections[id] || {}).map(function (sid2) {
        return Object.assign({id: sid2}, db.sections[id][sid2]);
      });
      return {
        song: Object.assign({id: id}, song),
        sections: sections,
        members: Object.keys(db.members[id] || {}).map(function (uid) { return db.members[id][uid]; }),
        presence: Object.keys(db.presence[id] || {}).map(function (uid) { return db.presence[id][uid]; })
      };
    }
    async function digest(pw) {
      var data = new TextEncoder().encode('doxa-demo-v1|' + pw);
      var buf = await crypto.subtle.digest('SHA-256', data);
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return {
      mode: 'demo',
      user: function () { return me; },
      onAuth: function (fn) { listeners.add(fn); fn(me); },
      signUp: async function (name, email, pass) {
        name = cleanName(name);
        email = String(email || '').trim().toLowerCase();
        if (!name) throw Object.assign(new Error('name'), {code: 'doxa/name'});
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('email'), {code: 'auth/invalid-email'});
        if (String(pass || '').length < 6) throw Object.assign(new Error('weak'), {code: 'auth/weak-password'});
        var hash = await digest(pass);
        var user = null;
        var clash = false;
        await commit(function (db) {
          var exists = Object.keys(db.users).some(function (id) { return db.users[id].email === email; });
          if (exists) { clash = true; return; }
          var uid = 'u' + cloudId();
          db.users[uid] = {uid: uid, name: name, email: email, pass: hash, color: pickColor(uid, new Set())};
          user = db.users[uid];
        });
        if (clash) throw Object.assign(new Error('exists'), {code: 'auth/email-already-in-use'});
        me = publicUser(user);
        sessionStorage.setItem(SESSION, me.uid);
        emitAuth();
        return me;
      },
      signIn: async function (email, pass) {
        email = String(email || '').trim().toLowerCase();
        var hash = await digest(pass);
        var db = load();
        var found = null;
        Object.keys(db.users).forEach(function (id) { if (db.users[id].email === email) found = db.users[id]; });
        if (!found || found.pass !== hash) throw Object.assign(new Error('bad'), {code: 'auth/invalid-credential'});
        me = publicUser(found);
        sessionStorage.setItem(SESSION, me.uid);
        emitAuth();
        return me;
      },
      signOut: function () {
        me = null;
        sessionStorage.removeItem(SESSION);
        emitAuth();
        return Promise.resolve();
      },
      sendReset: function () { return Promise.reject(Object.assign(new Error('reset'), {code: 'doxa/reset-demo'})); },
      listenIndex: function (uid, fn) {
        return on('index:' + uid, function () {
          var db = load();
          var bag = db.index[uid] || {};
          fn(Object.keys(bag).map(function (id) { return Object.assign({id: id}, bag[id]); }));
        });
      },
      listenMeta: function (id, fn) {
        return on('song:' + id, function () {
          var song = load().songs[id];
          fn(song ? Object.assign({id: id}, song) : null);
        });
      },
      listenSong: function (id, fn) {
        return on('song:' + id, function () { fn(readSong(id)); });
      },
      createSong: function (song) {
        var id = cloudId();
        var code = inviteCode();
        var now = Date.now();
        return commit(function (db) {
          db.songs[id] = {
            title: song.title || '', key: song.key || '', ownerId: me.uid, inviteCode: code,
            updatedAt: now, createdAt: now, preview: previewOf(song), order: song.secs.map(function (s) { return s.id; })
          };
          db.invites[code] = {songId: id, ownerId: me.uid};
          db.members[id] = {};
          db.members[id][me.uid] = {uid: me.uid, name: me.name, color: me.color, email: me.email || ''};
          db.sections[id] = {};
          song.secs.forEach(function (sec) {
            db.sections[id][sec.id] = {id: sec.id, type: sec.type, typeAt: sec.typeAt || now, lines: (sec.lines || []).map(copyLine)};
          });
          db.presence[id] = {};
          if (!db.index[me.uid]) db.index[me.uid] = {};
          db.index[me.uid][id] = {
            title: song.title || '', key: song.key || '', preview: previewOf(song), updatedAt: now,
            ownerId: me.uid, color: me.color, inviteCode: code
          };
        }).then(function () { return {id: id, code: code}; });
      },
      saveMeta: function (songId, meta) {
        return commit(function (db) {
          var song = db.songs[songId];
          if (!song) return;
          song.title = meta.title || '';
          song.key = meta.key || '';
          song.preview = meta.preview || '';
          song.order = meta.order || [];
          song.updatedAt = meta.updatedAt || Date.now();
          if (!db.index[me.uid]) db.index[me.uid] = {};
          var prev = db.index[me.uid][songId] || {};
          db.index[me.uid][songId] = {
            title: song.title, key: song.key, preview: song.preview, updatedAt: song.updatedAt,
            ownerId: song.ownerId, color: meta.color || prev.color || me.color, inviteCode: song.inviteCode
          };
        });
      },
      saveSection: function (songId, sec, prefer) {
        var merged = null;
        return commit(function (db) {
          if (!db.sections[songId]) db.sections[songId] = {};
          var prev = db.sections[songId][sec.id];
          var remote = prev && prev.lines || [];
          merged = mergeLines(sec.lines, remote, prefer);
          var remoteTypeAt = prev && prev.typeAt || 0;
          var type = (sec.typeAt || 0) >= remoteTypeAt ? sec.type : (prev && prev.type) || sec.type;
          var typeAt = Math.max(sec.typeAt || 0, remoteTypeAt || 0);
          db.sections[songId][sec.id] = {id: sec.id, type: type, typeAt: typeAt, lines: merged.map(copyLine)};
          if (db.songs[songId]) {
            db.songs[songId].updatedAt = Date.now();
            db.songs[songId].preview = previewOf(DOXA.getCur() && DOXA.getCur().id === songId ? DOXA.getCur() : {secs: [{lines: merged}]});
          }
        }).then(function () { return merged; });
      },
      deleteSection: function (songId, secId) {
        return commit(function (db) {
          if (db.sections[songId]) delete db.sections[songId][secId];
        });
      },
      setPresence: function (songId, presence) {
        return commit(function (db) {
          if (!db.presence[songId]) db.presence[songId] = {};
          db.presence[songId][me.uid] = presence;
        });
      },
      clearPresence: function (songId) {
        return commit(function (db) {
          if (db.presence[songId]) delete db.presence[songId][me.uid];
        });
      },
      setMemberColor: function (songId, color) {
        return commit(function (db) {
          if (db.members[songId] && db.members[songId][me.uid]) db.members[songId][me.uid].color = color;
          if (db.index[me.uid] && db.index[me.uid][songId]) db.index[me.uid][songId].color = color;
        });
      },
      join: function (code) {
        code = String(code || '').trim().toLowerCase();
        var db0 = load();
        var inv = db0.invites[code];
        if (!inv) return Promise.reject(Object.assign(new Error('code'), {code: 'doxa/not-found'}));
        var songId = inv.songId;
        return commit(function (db) {
          var song = db.songs[songId];
          if (!song) return;
          if (!db.members[songId]) db.members[songId] = {};
          if (!db.members[songId][me.uid]) {
            var used = new Set(Object.keys(db.members[songId]).map(function (uid) { return String(db.members[songId][uid].color || '').toLowerCase(); }));
            db.members[songId][me.uid] = {uid: me.uid, name: me.name, color: pickColor(me.uid + ':' + songId, used), email: me.email || '', inviteCode: code};
          }
          if (!db.index[me.uid]) db.index[me.uid] = {};
          db.index[me.uid][songId] = {
            title: song.title || '', key: song.key || '', preview: song.preview || '', updatedAt: song.updatedAt || Date.now(),
            ownerId: song.ownerId, color: db.members[songId][me.uid].color, inviteCode: song.inviteCode || code
          };
        }).then(function () {
          if (!load().songs[songId]) throw Object.assign(new Error('missing'), {code: 'doxa/not-found'});
          return songId;
        });
      },
      deleteSong: function (id) {
        return commit(function (db) {
          var song = db.songs[id];
          if (song && song.inviteCode) delete db.invites[song.inviteCode];
          delete db.songs[id];
          delete db.sections[id];
          delete db.members[id];
          delete db.presence[id];
          Object.keys(db.index).forEach(function (uid) { if (db.index[uid]) delete db.index[uid][id]; });
        });
      },
      leave: function (id) {
        return commit(function (db) {
          if (db.members[id]) delete db.members[id][me.uid];
          if (db.presence[id]) delete db.presence[id][me.uid];
          if (db.index[me.uid]) delete db.index[me.uid][id];
        });
      },
      dropIndex: function (id) {
        return commit(function (db) { if (db.index[me.uid]) delete db.index[me.uid][id]; });
      }
    };
  }

  function loadFirebase() {
    var urls = [
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
    ];
    return urls.reduce(function (p, url) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = url;
          s.onload = function () { resolve(); };
          s.onerror = function () { reject(new Error('network')); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
  }
  async function createFirebaseApi() {
    await loadFirebase();
    var fb = root.firebase;
    if (!fb) throw new Error('configuration');
    var c = root.DOXA_CONFIG.firebase;
    if (!fb.apps.length) fb.initializeApp({apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId});
    var auth = fb.auth();
    var db = fb.firestore();
    try { await db.enablePersistence({synchronizeTabs: true}); } catch (e) {}
    var me = null;
    var authReady = false;
    var listeners = new Set();
    function emitAuth() { if (authReady) listeners.forEach(function (fn) { fn(me); }); }
    async function loadProfile(user) {
      if (!user) return null;
      var ref = db.collection('users').doc(user.uid);
      var snap = await ref.get();
      if (!snap.exists) {
        var name = cleanName(user.displayName || (user.email || '').split('@')[0]) || 'Friend';
        var color = pickColor(user.uid, new Set());
        var data = {name: name, email: user.email || '', color: color};
        await ref.set(data);
        return {uid: user.uid, name: name, email: data.email, color: color};
      }
      var d = snap.data() || {};
      return {uid: user.uid, name: d.name || 'Friend', email: d.email || user.email || '', color: d.color || pickColor(user.uid, new Set())};
    }
    auth.onAuthStateChanged(function (user) {
      loadProfile(user).then(function (profile) {
        me = profile;
        authReady = true;
        emitAuth();
      }).catch(function (err) {
        console.warn(err);
        me = user ? {uid: user.uid, name: cleanName(user.displayName || 'Friend'), email: user.email || '', color: pickColor(user.uid, new Set())} : null;
        authReady = true;
        emitAuth();
      });
    });
    function songRef(id) { return db.collection('songs').doc(id); }
    function indexRef(songId) { return db.collection('users').doc(me.uid).collection('songs').doc(songId); }
    function writeIndex(songId, fields) {
      return indexRef(songId).set({
        title: fields.title || '',
        key: fields.key || '',
        preview: String(fields.preview || '').slice(0, 180),
        updatedAt: fields.updatedAt || Date.now(),
        ownerId: fields.ownerId || '',
        color: fields.color || me.color,
        inviteCode: fields.inviteCode || ''
      });
    }
    return {
      mode: 'firebase',
      user: function () { return me; },
      onAuth: function (fn) { listeners.add(fn); if (authReady) fn(me); },
      signUp: async function (name, email, pass) {
        name = cleanName(name);
        email = String(email || '').trim().toLowerCase();
        if (!name) throw Object.assign(new Error('name'), {code: 'doxa/name'});
        if (String(pass || '').length < 6) throw Object.assign(new Error('weak'), {code: 'auth/weak-password'});
        var cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({displayName: name});
        var color = pickColor(cred.user.uid, new Set());
        await db.collection('users').doc(cred.user.uid).set({name: name, email: email, color: color});
        me = {uid: cred.user.uid, name: name, email: email, color: color};
        return me;
      },
      signIn: async function (email, pass) {
        email = String(email || '').trim().toLowerCase();
        await auth.signInWithEmailAndPassword(email, pass);
        return me;
      },
      signOut: function () { return auth.signOut(); },
      sendReset: function (email) {
        email = String(email || '').trim();
        if (!email) return Promise.reject(Object.assign(new Error('email'), {code: 'auth/invalid-email'}));
        return auth.sendPasswordResetEmail(email);
      },
      listenIndex: function (uid, fn) {
        return db.collection('users').doc(uid).collection('songs').onSnapshot(function (snap) {
          fn(snap.docs.map(function (d) { return Object.assign({id: d.id}, d.data()); }));
        }, function (err) { console.warn(err); });
      },
      listenMeta: function (id, fn) {
        return songRef(id).onSnapshot(function (snap) {
          fn(snap.exists ? Object.assign({id: id}, snap.data()) : null);
        }, function () { fn(null); });
      },
      listenSong: function (id, fn) {
        var state = {song: undefined, sections: undefined, members: [], presence: []};
        var sawSong = false, sawSections = false;
        function emit() { if (sawSong && sawSections) fn(state); }
        var u1 = songRef(id).onSnapshot(function (snap) {
          sawSong = true;
          state.song = snap.exists ? Object.assign({id: id}, snap.data()) : null;
          emit();
        }, function () { sawSong = true; state.song = null; emit(); });
        var u2 = songRef(id).collection('sections').onSnapshot(function (snap) {
          sawSections = true;
          state.sections = snap.docs.map(function (d) { return Object.assign({id: d.id}, d.data()); });
          emit();
        }, function () { sawSections = true; state.sections = []; emit(); });
        var u3 = songRef(id).collection('members').onSnapshot(function (snap) {
          state.members = snap.docs.map(function (d) { return Object.assign({uid: d.id}, d.data()); });
          emit();
        }, function () {});
        var u4 = songRef(id).collection('presence').onSnapshot(function (snap) {
          state.presence = snap.docs.map(function (d) { return Object.assign({uid: d.id}, d.data()); });
          emit();
        }, function () {});
        return function () { u1(); u2(); u3(); u4(); };
      },
      createSong: async function (song) {
        var id = cloudId();
        var code = inviteCode();
        var now = Date.now();
        var preview = String(previewOf(song) || '').slice(0, 180);
        await songRef(id).set({
          title: song.title || '', key: song.key || '', ownerId: me.uid, inviteCode: code,
          updatedAt: now, createdAt: now, preview: preview, order: song.secs.map(function (s) { return s.id; })
        });
        await db.collection('invites').doc(code).set({songId: id, ownerId: me.uid});
        await songRef(id).collection('members').doc(me.uid).set({uid: me.uid, name: me.name, color: me.color, email: me.email || ''});
        for (var i = 0; i < song.secs.length; i++) {
          var sec = song.secs[i];
          await songRef(id).collection('sections').doc(sec.id).set({
            id: sec.id, type: sec.type, typeAt: sec.typeAt || now, lines: (sec.lines || []).map(copyLine)
          });
        }
        await writeIndex(id, {title: song.title || '', key: song.key || '', preview: preview, updatedAt: now, ownerId: me.uid, color: me.color, inviteCode: code});
        return {id: id, code: code};
      },
      saveMeta: async function (songId, meta) {
        await songRef(songId).update({
          title: meta.title || '', key: meta.key || '', preview: String(meta.preview || '').slice(0, 180),
          order: meta.order || [], updatedAt: meta.updatedAt || Date.now()
        });
        await writeIndex(songId, meta);
      },
      saveSection: async function (songId, sec, prefer) {
        var ref = songRef(songId).collection('sections').doc(sec.id);
        var merged = null;
        await db.runTransaction(function (tx) {
          return tx.get(ref).then(function (snap) {
            var remote = snap.exists && snap.data().lines || [];
            merged = mergeLines(sec.lines, remote, prefer);
            var remoteTypeAt = snap.exists && snap.data().typeAt || 0;
            var type = (sec.typeAt || 0) >= remoteTypeAt ? sec.type : (snap.exists && snap.data().type) || sec.type;
            var typeAt = Math.max(sec.typeAt || 0, remoteTypeAt || 0);
            tx.set(ref, {id: sec.id, type: type, typeAt: typeAt, lines: merged.map(copyLine)});
          });
        });
        return merged;
      },
      deleteSection: function (songId, secId) {
        return songRef(songId).collection('sections').doc(secId).delete();
      },
      setPresence: function (songId, presence) {
        return songRef(songId).collection('presence').doc(me.uid).set(presence);
      },
      clearPresence: function (songId) {
        return songRef(songId).collection('presence').doc(me.uid).delete().catch(function () {});
      },
      setMemberColor: function (songId, color) {
        return songRef(songId).collection('members').doc(me.uid).update({color: color});
      },
      join: async function (code) {
        code = String(code || '').trim().toLowerCase();
        var inv = await db.collection('invites').doc(code).get();
        if (!inv.exists) throw Object.assign(new Error('code'), {code: 'doxa/not-found'});
        var songId = inv.data().songId;
        var memberRef = songRef(songId).collection('members').doc(me.uid);
        var existing = await memberRef.get();
        if (!existing.exists) {
          await memberRef.set({uid: me.uid, name: me.name, color: me.color, email: me.email || '', inviteCode: code});
        }
        var songSnap = await songRef(songId).get();
        if (!songSnap.exists) throw Object.assign(new Error('missing'), {code: 'doxa/not-found'});
        var song = songSnap.data();
        await writeIndex(songId, {
          title: song.title || '', key: song.key || '', preview: song.preview || '', updatedAt: song.updatedAt || Date.now(),
          ownerId: song.ownerId || '', color: (existing.exists && existing.data().color) || me.color, inviteCode: song.inviteCode || code
        });
        return songId;
      },
      deleteSong: async function (id) {
        async function wipe(sub) {
          var snap = await songRef(id).collection(sub).get();
          if (!snap.size) return;
          var batch = db.batch();
          snap.docs.forEach(function (d) { batch.delete(d.ref); });
          await batch.commit();
        }
        var song = await songRef(id).get();
        await wipe('sections');
        await wipe('presence');
        await wipe('members');
        if (song.exists && song.data().inviteCode) await db.collection('invites').doc(song.data().inviteCode).delete().catch(function () {});
        await songRef(id).delete();
        await indexRef(id).delete().catch(function () {});
      },
      leave: async function (id) {
        await songRef(id).collection('presence').doc(me.uid).delete().catch(function () {});
        await songRef(id).collection('members').doc(me.uid).delete();
        await indexRef(id).delete().catch(function () {});
      },
      dropIndex: function (id) { return indexRef(id).delete().catch(function () {}); }
    };
  }

  function useDemo() {
    demoForced = true;
    try { sessionStorage.setItem('doxa-demo-on', '1'); } catch (e) {}
    if (!demoApi) demoApi = createDemoApi();
    api = demoApi;
    if (!demoApi._bound) {
      demoApi._bound = true;
      demoApi.onAuth(handleAuth);
    } else handleAuth(demoApi.user());
    return true;
  }
  function resetDemo() {
    localStorage.removeItem(STORE);
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem('doxa-demo-on');
    if (demoApi && demoApi.user()) demoApi.signOut();
    cloudSongs = [];
  }

  root.DOXA_CLOUD = {
    get ready() { return readyFlag; },
    useDemo: useDemo,
    resetDemo: resetDemo,
    mergeLines: mergeLines,
    liveLines: liveLines,
    onLeave: onLeave,
    afterLib: function () { paintAccount(); paintCloudList(); },
    onTouch: onTouch,
    onSection: onSection,
    openCloud: openCloud,
    renderCloud: renderCloud,
    addSection: addSection,
    moreItems: moreItems,
    insertHintLine: insertHintLine,
    insertWord: insertWord,
    openAccount: openAccount,
    clearHintTimers: clearHintTimers
  };

  document.addEventListener('selectionchange', function () {
    var cur = DOXA.getCur();
    if (!cur || !cur.cloud) return;
    schedulePresence();
  });
  window.addEventListener('resize', function () { paintCarets(); });
  document.addEventListener('scroll', function () { paintCarets(); }, true);
  setInterval(function () {
    var cur = DOXA.getCur();
    if (cur && cur.cloud) { paintPeople(); paintCarets(); }
  }, 5000);
  setInterval(function () {
    var cur = DOXA.getCur();
    if (cur && cur.cloud && document.activeElement && document.activeElement.classList.contains('line')) writePresence();
  }, HEARTBEAT);
  window.addEventListener('offline', function () { if (DOXA.getCur() && DOXA.getCur().cloud) setSave('Offline'); });
  window.addEventListener('online', function () { if (DOXA.getCur() && DOXA.getCur().cloud) setSave('Saved'); });

  function boot() {
    stashJoin();
    try {
      if (sessionStorage.getItem('doxa-demo-on') === '1') demoForced = true;
      if (new URLSearchParams(location.search).get('demo') === '1') demoForced = true;
    } catch (e) {}
    var account = $('#accountBtn');
    if (account) account.onclick = function () { openAccount(); };
    if (isDemoConfig()) {
      useDemo();
      readyFlag = true;
      return;
    }
    if (!configured()) {
      paintAccount();
      if (DOXA) DOXA.lib();
      readyFlag = true;
      return;
    }
    createFirebaseApi().then(function (firebaseApi) {
      api = firebaseApi;
      firebaseApi._bound = true;
      firebaseApi.onAuth(handleAuth);
      readyFlag = true;
    }).catch(function (err) {
      console.warn(err);
      apiError = 'Could not load sign-in. Songs on this device still work.';
      paintAccount();
      openAccount(apiError);
      readyFlag = true;
    });
  }
  if (DOXA) boot();
  else readyFlag = true;
})(typeof window !== 'undefined' ? window : globalThis);
