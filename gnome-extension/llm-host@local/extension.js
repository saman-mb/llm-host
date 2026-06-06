// GNOME Shell extension — data-driven thin shell.
// All menu structure comes from GET /api/ui on the control server.
// The extension is a generic renderer; it has no hardcoded menu items.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CONTROL_URL = 'http://127.0.0.1:3001';
const SCRIPTS_DIR = GLib.build_filenamev([GLib.get_home_dir(), 'dev', 'llm-host', 'scripts']);

// ---------------------------------------------------------------------------
// Tiny djb2 hash — used to detect spec changes without a deep equality check.
// ---------------------------------------------------------------------------
function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h >>>= 0; // keep uint32
    }
    return h;
}

// ---------------------------------------------------------------------------
// curl helpers (Gio.Subprocess — no external libraries needed in GNOME Shell)
// ---------------------------------------------------------------------------
function curlGet(url, cb) {
    let proc;
    try {
        proc = Gio.Subprocess.new(
            ['curl', '-s', '--max-time', '2', url],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        );
    } catch (e) {
        cb(null);
        return;
    }
    proc.communicate_utf8_async(null, null, (p, res) => {
        let stdout = '';
        try { [, stdout] = p.communicate_utf8_finish(res); } catch { cb(null); return; }
        try { cb(JSON.parse(stdout)); } catch { cb(null); }
    });
}

function curlPost(url, body) {
    try {
        Gio.Subprocess.new(
            ['curl', '-s', '-X', 'POST', url,
             '-H', 'Content-Type: application/json',
             '-d', JSON.stringify(body)],
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
    } catch { /* fire-and-forget */ }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------
function runSystemctl(args) {
    try {
        Gio.Subprocess.new(
            ['systemctl', '--user', ...args],
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
    } catch { /* ignore */ }
}

function runScript(script) {
    // Special token: tail the journal for the unit.
    if (script === '_journal') {
        // unit is not directly accessible here; we use a fixed name that
        // matches DEFAULT_UI_SPEC.unit — the extension stores it on _spec.
        const unit = Indicator._currentUnit || 'llama-swap.service';
        const cmd = `gnome-terminal -- bash -lc "journalctl --user -u ${unit} -f; exec bash"`;
        GLib.spawn_command_line_async(cmd);
        return;
    }
    const cmd = `gnome-terminal -- bash -lc "${SCRIPTS_DIR}/${script}; echo; echo '[done — press Enter to close]'; read"`;
    GLib.spawn_command_line_async(cmd);
}

function dispatchAction(action) {
    if (!action) return;
    const { kind, args } = action;
    switch (kind) {
        case 'systemctl':
            runSystemctl(args);
            break;
        case 'script':
            runScript(args[0]);
            break;
        case 'url':
            GLib.spawn_command_line_async(`xdg-open ${args[0]}`);
            break;
        case 'http': {
            const [method, path, body] = args;
            if (method === 'POST') curlPost(`${CONTROL_URL}${path}`, body || {});
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Menu builder — converts a spec items array into PopupMenu nodes.
// Accepts optional state context (running, activeModelKey) for dynamic items.
// ---------------------------------------------------------------------------
function buildItems(items, ctx, addFn) {
    for (const item of items) {
        switch (item.type) {
            case 'separator':
                addFn(new PopupMenu.PopupSeparatorMenuItem());
                break;

            case 'status': {
                const mi = new PopupMenu.PopupMenuItem(item.label || 'Status: …', {reactive: false});
                ctx.statusItem = mi;
                addFn(mi);
                break;
            }

            case 'model': {
                const mi = new PopupMenu.PopupMenuItem(item.label || 'Model: —', {reactive: false});
                mi.label.style = 'font-size: 11px; color: #94a3b8;';
                ctx.modelItem = mi;
                addFn(mi);
                break;
            }

            case 'toggle': {
                const running = ctx.running;
                const label = running ? (item.labelActive || 'Stop LLM') : (item.label || 'Start LLM');
                const action = running ? (item.actionActive || item.action) : item.action;
                const mi = new PopupMenu.PopupMenuItem(label);
                mi.connect('activate', () => {
                    dispatchAction(action);
                    // Optimistic refresh after systemctl settles
                    ctx.oneShot(1, () => ctx.refreshFn && ctx.refreshFn());
                    ctx.oneShot(4, () => ctx.refreshFn && ctx.refreshFn());
                });
                ctx.toggleItem = mi;
                ctx.toggleItemSpec = item;
                addFn(mi);
                break;
            }

            case 'action': {
                const mi = new PopupMenu.PopupMenuItem(item.label || '');
                mi.connect('activate', () => {
                    dispatchAction(item.action);
                    // Refresh after systemctl actions so state dot updates quickly
                    if (item.action && item.action.kind === 'systemctl') {
                        ctx.oneShot(1, () => ctx.refreshFn && ctx.refreshFn());
                        ctx.oneShot(4, () => ctx.refreshFn && ctx.refreshFn());
                    }
                    if (item.action && item.action.kind === 'http') {
                        ctx.oneShot(2, () => ctx.refreshFn && ctx.refreshFn());
                        ctx.oneShot(5, () => ctx.refreshFn && ctx.refreshFn());
                    }
                });
                addFn(mi);
                break;
            }

            case 'submenu': {
                const sub = new PopupMenu.PopupSubMenuMenuItem(item.label || '');
                if (item.dynamic === 'models') {
                    ctx.modelMenu = sub;
                    ctx.modelMenuSpec = item;
                } else if (item.dynamic === 'embeds') {
                    ctx.embedMenu = sub;
                    ctx.embedMenuSpec = item;
                } else if (item.items && item.items.length) {
                    buildItems(item.items, ctx, (child) => sub.menu.addMenuItem(child));
                }
                addFn(sub);
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Indicator widget
// ---------------------------------------------------------------------------
const Indicator = GObject.registerClass(
class LLMHostIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'LLM Host');

        // Panel button: text label + colored status dot
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._label = new St.Label({
            text: 'LLM',
            y_align: 2,
            style: 'font-weight: 600; padding-right: 4px;',
        });
        this._dot = new St.Label({
            text: '●',
            y_align: 2,
            style: 'color: #888; font-size: 12px;',
        });
        box.add_child(this._label);
        box.add_child(this._dot);
        this.add_child(box);

        // Runtime state
        this._running = false;
        this._spec = null;
        this._specHash = 0;
        this._activeModelKey = null;
        this._ctx = {};

        // Build an empty menu — spec not yet loaded
        this._statusItem = null;
        this._modelItem = null;
        this._toggleItem = null;
        this._modelMenu = null;
        this._embedMenu = null;

        // Bootstrap: fetch spec then start polling
        this._fetchSpec(() => {
            this._refreshUnit();
            this._refreshModels();
        });

        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // -----------------------------------------------------------------------
    // Polling
    // -----------------------------------------------------------------------
    _poll() {
        const pollSeconds = (this._spec && this._spec.poll) || 10;
        this._fetchSpec(null); // fire-and-forget; callback handles rebuild
        this._refreshUnit();
        this._refreshModels();
        // Adjust timer interval if spec.poll differs from default
        // (GLib timers can't be rescheduled easily; the constant 10s is fine
        //  for the default spec; override via spec.poll is advisory only here)
        return;
    }

    // -----------------------------------------------------------------------
    // Spec management
    // -----------------------------------------------------------------------
    _fetchSpec(callback) {
        curlGet(`${CONTROL_URL}/api/ui`, (data) => {
            if (!data || typeof data !== 'object') {
                // Control server unreachable — keep last spec, rely on systemctl for status
                callback && callback();
                return;
            }
            const serialised = JSON.stringify(data);
            const hash = hashString(serialised);
            if (hash !== this._specHash) {
                this._specHash = hash;
                this._spec = data;
                // Store unit for journal tail action
                Indicator._currentUnit = data.unit || 'llama-swap.service';
                this._rebuildMenu();
            }
            callback && callback();
        });
    }

    _rebuildMenu() {
        this.menu.removeAll();
        const ctx = {
            running: this._running,
            refreshFn: () => { this._refreshUnit(); this._refreshModels(); },
            oneShot: (seconds, fn) => this._oneShot(seconds, fn),
        };
        const items = (this._spec && this._spec.items) || [];
        buildItems(items, ctx, (item) => this.menu.addMenuItem(item));

        // Capture references to live nodes for state updates
        this._statusItem = ctx.statusItem || null;
        this._modelItem = ctx.modelItem || null;
        this._toggleItem = ctx.toggleItem || null;
        this._toggleItemSpec = ctx.toggleItemSpec || null;
        this._modelMenu = ctx.modelMenu || null;
        this._ctx = ctx;
    }

    // -----------------------------------------------------------------------
    // Unit state (systemctl is-active)
    // -----------------------------------------------------------------------
    _refreshUnit() {
        const unit = (this._spec && this._spec.unit) || 'llama-swap.service';
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['systemctl', '--user', 'is-active', unit],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this._applyUnitState('error');
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let stdout = '';
            try { [, stdout] = p.communicate_utf8_finish(res); } catch { this._applyUnitState('error'); return; }
            this._applyUnitState((stdout || '').trim());
        });
    }

    _applyUnitState(state) {
        const running = state === 'active';
        const activating = state === 'activating' || state === 'reloading';
        this._running = running;

        let color;
        if (running) color = '#22c55e';
        else if (activating) color = '#f59e0b';
        else if (state === 'failed') color = '#ef4444';
        else color = '#94a3b8';

        this._dot.style = `color: ${color}; font-size: 12px;`;

        if (this._statusItem) {
            this._statusItem.label.text = `Status: ${state || 'unknown'}`;
        }

        // Update toggle label in place (avoids full menu rebuild on every poll)
        if (this._toggleItem && this._toggleItemSpec) {
            const spec = this._toggleItemSpec;
            this._toggleItem.label.text = running
                ? (spec.labelActive || 'Stop LLM')
                : (spec.label || 'Start LLM');
        }

        if (running) this._refreshModel();
        else this._setModel('—');
    }

    // -----------------------------------------------------------------------
    // Running model name (from /v1/models)
    // -----------------------------------------------------------------------
    _refreshModel() {
        curlGet('http://localhost:8080/v1/models', (data) => {
            if (!data) { this._setModel('—'); return; }
            let name = '';
            try {
                const m = (data.models && data.models[0]) || (data.data && data.data[0]) || {};
                name = m.name || m.id || m.model || '';
            } catch { name = ''; }
            if (name.endsWith('.gguf')) name = name.slice(0, -5);
            this._setModel(name || 'unknown');
        });
    }

    _setModel(name) {
        if (this._modelItem) {
            this._modelItem.label.text = `Model: ${name}`;
        }
    }

    // -----------------------------------------------------------------------
    // Dynamic model submenu (from /api/models)
    // -----------------------------------------------------------------------
    _refreshModels() {
        if (!this._modelMenu) return;
        curlGet(`${CONTROL_URL}/api/models`, (data) => {
            if (!data || !Array.isArray(data.models)) return;
            // Skip rebuild when nothing changed
            if (this._modelMenu.menu.numMenuItems > 0 && data.active === this._activeModelKey) return;
            this._activeModelKey = data.active || null;
            this._modelMenu.menu.removeAll();
            for (const m of data.models) {
                const mark = m.key === data.active ? ' ●' : '';
                const label = m.exists ? `${m.key}${mark}` : `${m.key} (missing)`;
                const item = new PopupMenu.PopupMenuItem(label);
                if (!m.exists || m.key === data.active) {
                    item.setSensitive(false);
                } else {
                    item.connect('activate', () => this._switchModel(m.key));
                }
                this._modelMenu.menu.addMenuItem(item);
            }
        });

        // Dynamic embeds submenu — poll /running for embed servers
        this._refreshEmbeds();
    }

    _switchModel(key) {
        curlPost(`${CONTROL_URL}/api/model`, { model: key });
        this._oneShot(2, () => { this._refreshUnit(); this._refreshModels(); });
        this._oneShot(6, () => { this._refreshUnit(); this._refreshModels(); });
    }

    // -----------------------------------------------------------------------
    // Dynamic embeds submenu (from /running)
    // -----------------------------------------------------------------------
    _refreshEmbeds() {
        if (!this._embedMenu) return;
        curlGet('http://localhost:8080/running', (data) => {
            const embeds = Array.isArray(data) ? data.filter(e => e && e.type === 'embed') : [];
            this._embedMenu.menu.removeAll();
            if (embeds.length === 0) {
                const none = new PopupMenu.PopupMenuItem('No embed servers running', {reactive: false});
                this._embedMenu.menu.addMenuItem(none);
                return;
            }
            for (const e of embeds) {
                const item = new PopupMenu.PopupMenuItem(e.name || e.id || 'Embed');
                item.setSensitive(false); // informational only
                this._embedMenu.menu.addMenuItem(item);
            }
        });
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    // Tracked one-shot timer: auto-deregisters on fire, cancelled in destroy().
    _oneShot(seconds, fn) {
        this._oneShots ??= new Set();
        const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._oneShots.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._oneShots.add(id);
        return id;
    }

    destroy() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }
        if (this._oneShots) {
            for (const id of this._oneShots) GLib.source_remove(id);
            this._oneShots.clear();
        }
        super.destroy();
    }
});

export default class LLMHostExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea('llm-host-toggle', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
