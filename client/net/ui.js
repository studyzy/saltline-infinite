// Co-op connection panel. It lives beside the existing menu system instead of
// being folded into pM, so the single-player markup stays untouched.

import { t as tr, applyI18n } from "../../js/i18n.js";

export class NetUI {
  constructor(net) {
    this.net = net;
    this.statusKey = "";
    this.statusVars = null;
    this.statusKind = "";
    this.roomCode = "";
    this.build();
  }

  build() {
    const root = document.createElement("div");
    root.className = "mp";
    root.hidden = true;
    root.innerHTML = `
      <div class="mp-veil"></div>
      <section class="mp-card" role="dialog" aria-modal="true">
        <div class="mp-k">CO-OP LINK</div>
        <h2 data-i18n="mp_title"></h2>
        <p class="mp-sub" data-i18n="mp_sub"></p>
        <label class="mp-label" data-i18n="mp_room"></label>
        <input class="mp-code" maxlength="5" autocomplete="off" spellcheck="false" data-i18n-ph="mp_room_ph" />
        <button class="mp-btn mp-primary mp-connect" data-i18n="mp_connect"></button>
        <p class="mp-status" role="status"></p>
        <div class="mp-wait" hidden>
          <span data-i18n="mp_waiting"></span>
          <code class="mp-room"></code>
          <button class="mp-btn mp-copy" data-i18n="mp_copy"></button>
        </div>
        <button class="mp-btn mp-close" data-i18n="mp_close"></button>
      </section>`;
    document.getElementById("ui").appendChild(root);
    this.root = root;
    this.input = root.querySelector(".mp-code");
    this.connectBtn = root.querySelector(".mp-connect");
    this.statusEl = root.querySelector(".mp-status");
    this.waitEl = root.querySelector(".mp-wait");
    this.roomEl = root.querySelector(".mp-room");
    this.copyBtn = root.querySelector(".mp-copy");
    this.closeBtn = root.querySelector(".mp-close");

    this.connectBtn.addEventListener("click", () => this.connect());
    this.closeBtn.addEventListener("click", () => this.close());
    this.copyBtn.addEventListener("click", () => this.copy());
    this.input.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "NumpadEnter") this.connect();
      e.stopPropagation();
    });
    this.input.addEventListener("input", () => {
      this.input.value = this.input.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
    });

    const params = new URLSearchParams(location.search);
    const room = params.get("room");
    if (room) this.input.value = room.toUpperCase().slice(0, 5);

    this.net.game.events.on("lang:change", () => {
      applyI18n(this.root);
      this.renderStatus();
    });
  }

  show() {
    this.root.hidden = false;
    applyI18n(this.root);
    this.connectBtn.disabled = false;
    this.input.focus({ preventScroll: true });
  }

  hide() {
    this.root.hidden = true;
  }

  close() {
    if (!this.net.started) this.net.disconnect();
    this.hide();
  }

  connect() {
    const code = this.input.value.trim().toUpperCase();
    this.connectBtn.disabled = true;
    this.waitEl.hidden = true;
    this.setStatus("mp_connecting");
    this.net.connect(code);
  }

  copy() {
    const code = this.roomCode;
    if (!code) return;
    const link = `${location.origin}${location.pathname}?room=${code}`;
    const done = () => this.setStatus("mp_copied");
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(link).then(done, done);
    else done();
  }

  setRoom(code) {
    this.roomCode = code || "";
    this.roomEl.textContent = this.roomCode;
    this.waitEl.hidden = !this.roomCode;
  }

  setStatus(key, vars = null, kind = "") {
    this.statusKey = key;
    this.statusVars = vars;
    this.statusKind = kind;
    this.renderStatus();
  }

  renderStatus() {
    if (!this.statusEl) return;
    this.statusEl.textContent = this.statusKey
      ? tr(this.statusKey, this.statusVars)
      : "";
    this.statusEl.dataset.kind = this.statusKind;
  }

  error(code) {
    const key =
      code === 4001
        ? "mp_err_version"
        : code === 4002
          ? "mp_err_full"
          : code === 4003
            ? "mp_err_world"
            : "mp_err_closed";
    this.connectBtn.disabled = false;
    this.setStatus(key, null, "error");
  }
}