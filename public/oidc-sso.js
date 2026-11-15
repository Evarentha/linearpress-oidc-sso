/*
 * OIDC SSO Admin Script
 *
 * Fills the provider form from an OpenID Connect discovery document.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(() => {
  const box = document.querySelector('[data-sso-discovery]');
  const form = document.querySelector('[data-sso-form]');
  if (!box || !form) return;
  const button = box.querySelector('[data-sso-discover]');
  const status = box.querySelector('[data-sso-status]');
  button.addEventListener('click', async () => {
    const url = box.querySelector('[data-sso-url]').value.trim();
    button.disabled = true; status.textContent = '正在读取…';
    try {
      const { provider } = await window.LinearPress.postJson('/admin/sso/discovery', { url, name: form.elements.name.value });
      for (const key of ['name', 'id', 'scope', 'authorizeUrl', 'tokenUrl', 'userInfoUrl', 'idField', 'usernameField', 'emailField']) {
        const field = form.elements[key];
        if (field && provider[key] && (!field.value || key.endsWith('Url'))) field.value = provider[key];
      }
      form.elements.type.value = 'oidc';
      status.textContent = '已填写端点，请补上 Client ID 和 Secret。';
      form.elements.clientId.focus();
    } catch (error) { status.textContent = `读取失败：${error.message}`; }
    finally { button.disabled = false; }
  });
})();
