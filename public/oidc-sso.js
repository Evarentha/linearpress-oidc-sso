/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });

  // ------------------------------------------------------------ 登录页：顶部注入 SSO 登录按钮
  // 按钮位于登录页上方；未配置平台（providers 为空）时不渲染任何按钮。
  if (window.location.pathname === '/login' && document.querySelector('.auth')) {
    fetch('/sso/providers', { headers: { accept: 'application/json' } })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok || !data.providers.length) return;
        const section = document.querySelector('.auth');
        const list = document.createElement('div');
        list.className = 'sso-login-buttons';
        data.providers.forEach((provider) => {
          const link = document.createElement('a');
          link.className = 'sso-login-button';
          link.href = `/sso/login/${encodeURIComponent(provider.id)}`;
          link.textContent = `${provider.icon ? `${provider.icon} ` : ''}通过 ${provider.name} 登录`;
          list.append(link);
        });
        const divider = document.createElement('div');
        divider.className = 'sso-divider';
        divider.textContent = '或使用账号密码登录';
        section.insertBefore(list, section.firstChild);
        section.insertBefore(divider, section.firstChild);
      })
      .catch(() => { /* 平台未配置等场景静默 */ });
  }

  // ------------------------------------------------------------ 资料编辑页 / 仪表盘：绑定面板
  const profileForm = document.querySelector('#cf-profile-form');
  const onDashboard = window.location.pathname === '/admin' && !profileForm;
  const target = profileForm ? profileForm.closest('.cf-page') : onDashboard ? document.querySelector('.admin-center') : null;
  if (target) renderBindPanel(target, profileForm ? '/profile/edit' : '/admin');

  async function renderBindPanel(container, returnTo) {
    try {
      const response = await fetch('/sso/bindings', { headers: { accept: 'application/json' } });
      const data = await response.json();
      if (!data.ok) return;
      const panel = document.createElement('section');
      panel.className = 'sso-bind-panel';
      const head = document.createElement('h2');
      head.className = 'sso-bind-title';
      head.textContent = '单点登录账号';
      panel.append(head);
      if (!data.providers.length) {
        const empty = document.createElement('p');
        empty.className = 'sso-bind-empty';
        empty.textContent = '站点尚未配置单点登录平台，可在后台「单点登录」设置中添加。';
        panel.append(empty);
      }
      const bound = new Map(data.bindings.map((item) => [item.provider, item]));
      data.providers.forEach((provider) => {
        const row = document.createElement('div');
        row.className = 'sso-bind-row';
        const name = document.createElement('span');
        name.className = 'sso-bind-name';
        name.textContent = `${provider.icon ? `${provider.icon} ` : ''}${provider.name}`;
        const state = bound.get(provider.id);
        if (state) {
          const info = document.createElement('span');
          info.className = 'sso-bind-state';
          info.textContent = `已绑定${state.username ? `（${state.username} · id …${state.subTail}）` : `（id …${state.subTail}）`}`;
          const form = document.createElement('form');
          form.method = 'post';
          form.action = `/sso/disconnect/${encodeURIComponent(provider.id)}`;
          form.innerHTML = `<input type="hidden" name="return_to" value="${esc(returnTo)}"><button type="submit" class="sso-bind-unbind">解绑</button>`;
          row.append(name, info, form);
        } else {
          const form = document.createElement('form');
          form.method = 'post';
          form.action = `/sso/connect/${encodeURIComponent(provider.id)}`;
          form.innerHTML = `<input type="hidden" name="return_to" value="${esc(returnTo)}"><button type="submit" class="sso-bind-bind">绑定</button>`;
          row.append(name, form);
        }
        panel.append(row);
      });
      const hint = document.createElement('p');
      hint.className = 'sso-bind-hint';
      hint.textContent = '绑定后即可使用平台账号一键登录本站；解绑不影响账号密码登录。';
      panel.append(hint);
      const editAnchor = profileForm ? null : document.querySelector('[data-sso-bind-anchor]');
      if (editAnchor) panel.appendChild(editAnchor);
      const anchorNode = profileForm ? container.querySelector('.cf-edit-footer') : container.querySelector('.stats');
      if (anchorNode) container.insertBefore(panel, anchorNode);
      else container.appendChild(panel);
    } catch { /* 未登录/接口异常静默 */ }
  }

  // ------------------------------------------------------------ 设置页：模板 / Discovery / 回调预览
  const settingsForm = document.querySelector('[data-sso-settings]');
  if (!settingsForm) return;
  const textarea = settingsForm.querySelector('[data-sso-providers-json]');
  const callbackInput = settingsForm.querySelector('[data-sso-callback-path]');
  const callbackPreview = document.querySelector('[data-sso-callback-url]');
  const templates = {
    oidc: [{ id: 'my-oidc', name: '我的 OIDC 平台', enabled: true, type: 'oidc', icon: '🔐', clientId: '', clientSecret: '', scope: 'openid profile email', authorizeUrl: 'https://idp.example.com/oauth2/authorize', tokenUrl: 'https://idp.example.com/oauth2/token', userInfoUrl: 'https://idp.example.com/oauth2/userinfo', idField: 'sub', usernameField: 'preferred_username', emailField: 'email', usePkce: false }],
    oauth2: [{ id: 'my-oauth2', name: '我的 OAuth2 平台', enabled: true, type: 'oauth2', icon: '🔑', clientId: '', clientSecret: '', scope: 'user:read', authorizeUrl: 'https://api.example.com/oauth/authorize', tokenUrl: 'https://api.example.com/oauth/token', userInfoUrl: 'https://api.example.com/api/me', idField: 'id', usernameField: 'name', emailField: 'email', usePkce: false }]
  };
  function readProviders() {
    try { const parsed = JSON.parse(textarea.value); return Array.isArray(parsed) ? parsed : []; } catch { return null; }
  }
  function writeProviders(providers) { textarea.value = JSON.stringify(providers, null, 2); }
  settingsForm.querySelectorAll('[data-sso-insert]').forEach((button) => {
    button.addEventListener('click', () => {
      const providers = readProviders() ?? [];
      const next = providers.concat(JSON.parse(JSON.stringify(templates[button.dataset.ssoInsert] || templates.oidc)));
      writeProviders(next);
    });
  });
  const discoveryStatus = settingsForm.querySelector('[data-sso-discovery-status]');
  settingsForm.querySelector('[data-sso-discovery]').addEventListener('click', async () => {
    const fields = {
      discovery_url: settingsForm.querySelector('[data-sso-discovery-url]').value.trim(),
      name: settingsForm.querySelector('[data-sso-discovery-name]').value.trim(),
      client_id: settingsForm.querySelector('[data-sso-discovery-cid]').value.trim(),
      client_secret: settingsForm.querySelector('[data-sso-discovery-secret]').value.trim()
    };
    if (!fields.discovery_url) { if (discoveryStatus) discoveryStatus.textContent = '请先填写 Discovery 地址。'; return; }
    if (discoveryStatus) discoveryStatus.textContent = '正在获取…';
    try {
      const response = await post('/admin/oidc-sso/settings/discovery', fields);
      const data = await response.json();
      if (!data.ok) throw new Error(data.message || 'Discovery 失败');
      const providers = readProviders() ?? [];
      delete data.provider.id; // 加入后由服务端统一生成唯一 id
      providers.push(data.provider);
      writeProviders(providers);
      if (discoveryStatus) discoveryStatus.textContent = `已根据 ${data.provider.name} 生成平台配置，请补充 Client ID/Secret 后保存。`;
    } catch (error) {
      if (discoveryStatus) discoveryStatus.textContent = error.message || 'Discovery 失败';
    }
  });
  callbackInput?.addEventListener('input', () => {
    let path = callbackInput.value.trim();
    if (path && !path.startsWith('/')) path = `/${path}`;
    if (callbackPreview && callbackPreview.dataset.origin) callbackPreview.textContent = `${callbackPreview.dataset.origin}${path}`;
  });
  if (callbackPreview) callbackPreview.dataset.origin = callbackPreview.textContent.split(callbackInput.value)[0] || callbackPreview.textContent;
})();