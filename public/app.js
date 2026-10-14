const queueList = document.querySelector('#queue-list');
const queueCount = document.querySelector('#queue-count');
const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const body = await response.text();
  let result;
  try {
    result = body ? JSON.parse(body) : {};
  } catch {
    const contentType = response.headers.get('content-type') || 'desconhecido';
    throw new Error(`O servidor respondeu com uma página HTML em vez da API (${response.status}, ${contentType}). Abra o painel pelo endereço Cloudflare atual, não por uma página antiga ou hospedagem diferente.`);
  }
  if (!response.ok) throw new Error(result.error || 'Ocorreu um erro.');
  return result;
}

function renderQueue(items) {
  queueCount.textContent = String(items.length).padStart(2, '0');
  if (!items.length) {
    queueList.innerHTML = '<li class="empty-state">Aguardando o primeiro pedido<span>Quando alguém enviar um nome válido, ele aparece aqui.</span></li>';
    return;
  }

  queueList.innerHTML = items.map((item) => {
    const initial = escapeHtml(item.name.slice(0, 1).toUpperCase());
    const status = item.status === 'playing' ? 'NO JOGO' : 'NA FILA';
    const playingClass = item.status === 'playing' ? ' playing' : '';
    return `<li class="queue-item"><div class="player-name"><span class="avatar-mark">${initial}</span><span class="player-label">${escapeHtml(item.displayName)}<span class="player-handle">@${escapeHtml(item.name)}</span></span></div><span class="source-label">${escapeHtml(item.source)}</span><span class="status-pill${playingClass}">${status}</span></li>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function refresh() {
  try {
    const [queueData, status] = await Promise.all([request('/api/queue'), request('/api/status')]);
    renderQueue(queueData.items);
    const liveDot = document.querySelector('#live-dot');
    const liveStatus = document.querySelector('#live-status');
    const connectionLabel = document.querySelector('#connection-label');
    const disconnectButton = document.querySelector('#disconnect-button');
    const connected = status.connected;
    liveDot.classList.toggle('connected', connected);
    liveStatus.textContent = connected
      ? `@${status.creator}`
      : status.connecting
        ? `Conectando @${status.creator}...`
        : status.error
          ? 'Falha na conexão'
          : 'Desconectado';
    connectionLabel.textContent = connected ? 'CONECTADO' : status.connecting ? 'CONECTANDO' : status.error ? 'ERRO' : 'OFFLINE';
    connectionLabel.classList.toggle('online', connected);
    disconnectButton.classList.toggle('hidden', !connected && !status.connecting);
    document.querySelector('#connect-button').textContent = status.connecting ? 'Conectando...' : connected ? 'Trocar live ↗' : 'Conectar ↗';
    document.querySelector('#bridge-dot').classList.toggle('connected', status.bridgeConfigured);
    document.querySelector('#bridge-status').textContent = status.bridgeConfigured
      ? 'Token configurado; aguardando o jogo Roblox'
      : 'Token Roblox não configurado';
    document.querySelector('#connection-help').textContent = status.error
      ? `Falha TikTok: ${status.error}`
      : connected
        ? 'Lendo comentários enviados durante esta live.'
        : status.connecting
          ? 'Aguardando resposta do TikTok...'
          : 'Use o @ da conta que está ao vivo agora.';
  } catch {
    document.querySelector('#bridge-status').textContent = 'Servidor indisponível';
  }
}

document.querySelector('#connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#connect-button');
  button.disabled = true;
  try {
    await request('/api/tiktok/connect', {
      method: 'POST',
      body: JSON.stringify({ uniqueId: document.querySelector('#creator').value })
    });
    showToast('Tentando conectar ao chat da live...');
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#disconnect-button').addEventListener('click', async () => {
  try {
    await request('/api/tiktok/disconnect', { method: 'POST' });
    showToast('Conexão encerrada.');
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#test-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await request('/api/test', {
      method: 'POST',
      body: JSON.stringify({ username: document.querySelector('#roblox-name').value })
    });
    document.querySelector('#roblox-name').value = '';
    showToast(`${result.item.displayName} entrou na fila.`);
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

refresh();
setInterval(refresh, 3000);
