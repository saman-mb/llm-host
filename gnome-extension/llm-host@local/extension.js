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
// Pure helpers — extractable for unit testing outside GNOME Shell.
// ---------------------------------------------------------------------------

/** Collect all unit names from a spec (primary + toggle units). */
function collectUnits(spec) {
    const units = new Set([spec?.unit || 'llama-swap.service']);
    const items = spec?.items || [];
    for (const item of items) {
        if (item.type === 'toggle' && item.unit) units.add(item.unit);
        if (item.type === 'submenu' && item.items) {
            for (const child of item.items) {
                if (child.type === 'toggle' && child.unit) units.add(child.unit);
            }
        }
    }
    return units;
}

/**
 * Derive toggle label from unit state.
 * Returns { label: string, isRunning: boolean }.
 */
function computeToggleLabel(state, spec) {
    const activating = state === 'activating' || state === 'reloading';
    const running = state === 'active' || activating;
    return {
        label: running ? (spec.labelActive || '') : (spec.label || ''),
        isRunning: running,
    };
}

// ---------------------------------------------------------------------------
// HTTP helpers — Gio.Subprocess with curl, ref stored to prevent GC killing it
// ---------------------------------------------------------------------------
const _procs = [];

function httpGet(url, cb) {
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
    _procs.push(proc);
    proc.communicate_utf8_async(null, null, (p, res) => {
        try {
            const [, stdout] = p.communicate_utf8_finish(res);
            cb(JSON.parse(stdout));
        } catch {
            cb(null);
        }
        const idx = _procs.indexOf(proc);
        if (idx >= 0) _procs.splice(idx, 1);
    });
}

function httpPost(url, body) {
    try {
        const proc = Gio.Subprocess.new(
            ['curl', '-s', '--max-time', '3', '-X', 'POST', url,
             '-H', 'Content-Type: application/json',
             '-d', JSON.stringify(body)],
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        _procs.push(proc);
    } catch { /* fire-and-forget */ }
}

function httpPostAsync(url, body, cb) {
    let proc;
    try {
        proc = Gio.Subprocess.new(
            ['curl', '-s', '--max-time', '5', '-X', 'POST', url,
             '-H', 'Content-Type: application/json',
             '-d', JSON.stringify(body)],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        );
    } catch (e) {
        cb(null);
        return;
    }
    _procs.push(proc);
    proc.communicate_utf8_async(null, null, (p, res) => {
        try {
            const [, stdout] = p.communicate_utf8_finish(res);
            cb(JSON.parse(stdout));
        } catch {
            cb(null);
        }
        const idx = _procs.indexOf(proc);
        if (idx >= 0) _procs.splice(idx, 1);
    });
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
    } catch (e) {
        log(`[llm-host] runSystemctl failed: ${e.message}`);
    }
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

function dispatchAction(action, httpCallback) {
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
            if (method === 'POST') {
                if (httpCallback) {
                    httpPostAsync(`${CONTROL_URL}${path}`, body || {}, httpCallback);
                } else {
                    httpPost(`${CONTROL_URL}${path}`, body || {});
                }
            }
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
                // Detect service-specific status lines for independent refresh
                if (item.label && item.label.startsWith('ComfyUI:')) {
                    ctx.comfyuiStatusItem = mi;
                } else if (item.label && item.label.startsWith('Embeddings:')) {
                    ctx.embedStatusItem = mi;
                } else {
                    ctx.statusItem = mi;
                }
                addFn(mi);
                break;
            }

            case 'model': {
                // Kept for backwards compatibility — not used in current spec
                const mi = new PopupMenu.PopupMenuItem(item.label || 'Model: —', {reactive: false});
                mi.label.style = 'font-size: 11px; color: #94a3b8;';
                ctx.modelItem = mi;
                addFn(mi);
                break;
            }

            case 'toggle': {
                const unit = item.unit || ctx.unit;
                // Check running state for this specific unit (from ctx.runningUnits map)
                const isRunning = ctx.runningUnits ? (ctx.runningUnits.get(unit) === 'active') : false;
                const label = isRunning ? (item.labelActive || '') : (item.label || '');
                const mi = new PopupMenu.PopupMenuItem(label);
                mi.connect('activate', () => {
                    // Resolve action from CURRENT state at click time. The label is updated
                    // live by _applyUnitState on every poll, so a build-time snapshot of the
                    // action would go stale (e.g. show "Stop" but still fire "start").
                    const state = ctx.currentState ? ctx.currentState(unit) : null;
                    // Same running test as computeToggleLabel — keeps label and action in sync
                    // (activating/reloading count as running, so the click fires actionActive).
                    const runningNow = computeToggleLabel(state, item).isRunning;
                    const action = runningNow ? (item.actionActive || item.action) : item.action;
                    log(`[llm-host] toggle activate: unit=${unit} running=${runningNow} action=${JSON.stringify(action)}`);
                    dispatchAction(action, ctx.httpCallback || null);
                    ctx.oneShot(1, () => ctx.refreshFn && ctx.refreshFn());
                    ctx.oneShot(4, () => ctx.refreshFn && ctx.refreshFn());
                });
                ctx.toggles.set(unit, { item: mi, spec: item });
                addFn(mi);
                break;
            }

            case 'action': {
                const mi = new PopupMenu.PopupMenuItem(item.label || '');
                mi.connect('activate', () => {
                    const httpCb = ctx.httpCallback || null;
                    dispatchAction(item.action, httpCb);
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
        this._generation = 0;
        this._activeModelKey = null;
        this._unitStates = new Map();
        this._ctx = {};

        // Build an empty menu — spec not yet loaded
        this._statusItem = null;
        this._modelItem = null;
        this._toggles = new Map();
        this._modelMenu = null;
        this._embedMenu = null;
        this._embedStatusItem = null;
        this._comfyuiStatusItem = null;

        // Bootstrap: fetch spec then start polling
        this._fetchSpec(() => {
            this._refreshUnit();
            this._refreshModels();
            this._refreshEmbedStatus();
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
        this._fetchSpec(() => {
            this._refreshUnit();
            this._refreshModels();
            this._refreshEmbedStatus();
        });
        return;
    }

    // -----------------------------------------------------------------------
    // Spec management
    // -----------------------------------------------------------------------
    _fetchSpec(callback) {
        httpGet(`${CONTROL_URL}/api/ui`, (data) => {
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
        this._generation++;
        const gen = this._generation;
        const ctx = {
            running: this._running,
            unit: this._spec?.unit || 'llama-swap.service',
            toggles: new Map(),
            runningUnits: new Map(this._unitStates),
            // Live unit-state lookup — read at click time, not snapshotted at build.
            currentState: (u) => this._unitStates.get(u),
            refreshFn: () => {
                this._refreshUnit();
                this._refreshModels();
                this._refreshEmbedStatus();
            },
            oneShot: (seconds, fn) => this._oneShot(seconds, fn),
            httpCallback: (response) => {
                if (this._statusItem && response && response.message) {
                    this._statusItem.label.text = response.message;
                    this._oneShot(5, () => {
                        this._refreshUnit();
                    });
                }
            },
        };
        const items = (this._spec && this._spec.items) || [];
        buildItems(items, ctx, (item) => this.menu.addMenuItem(item));

        this._statusItem = ctx.statusItem || null;
        this._modelItem = ctx.modelItem || null;
        this._toggles = ctx.toggles;
        this._modelMenu = ctx.modelMenu || null;
        this._embedMenu = ctx.embedMenu || null;
        this._embedStatusItem = ctx.embedStatusItem || null;
        this._comfyuiStatusItem = ctx.comfyuiStatusItem || null;
        this._ctx = ctx;
    }

    // -----------------------------------------------------------------------
    // Unit state (systemctl is-active)
    // -----------------------------------------------------------------------
    _refreshUnit() {
        for (const unit of collectUnits(this._spec)) {
            this._checkUnit(unit);
        }
    }

    _checkUnit(unit) {
        const gen = this._generation;
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['systemctl', '--user', 'is-active', unit],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this._applyUnitState(unit, 'error', gen);
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            if (gen !== this._generation) return;
            let stdout = '';
            try { [, stdout] = p.communicate_utf8_finish(res); } catch { this._applyUnitState(unit, 'error', gen); return; }
            this._applyUnitState(unit, (stdout || '').trim(), gen);
        });
    }

    _applyUnitState(unit, state, gen) {
        if (gen !== undefined && gen !== this._generation) return;
        this._unitStates.set(unit, state);
        const activating = state === 'activating' || state === 'reloading';

        // For the primary unit, update global dot + panel state
        const primaryUnit = this._spec?.unit || 'llama-swap.service';
        if (unit === primaryUnit) {
            this._running = state === 'active';

            let color;
            if (state === 'active') color = '#22c55e';
            else if (activating) color = '#f59e0b';
            else if (state === 'failed') color = '#ef4444';
            else color = '#94a3b8';

            this._dot.style = `color: ${color}; font-size: 12px;`;

            // Update status label — preserve service-scoped prefix from spec
            if (this._statusItem) {
                try {
                    const prefix = this._statusItem.label.text.split(':')[0];
                    this._statusItem.label.text = `${prefix}: ${state || 'unknown'}`;
                } catch { /* object disposed */ }
            }
        }

        // Update ComfyUI status label (routed through _applyUnitState, not a separate async call)
        if (unit === 'comfyui.service' && this._comfyuiStatusItem) {
            try {
                const prefix = this._comfyuiStatusItem.label.text.split(':')[0];
                this._comfyuiStatusItem.label.text = `${prefix}: ${state || 'unknown'}`;
            } catch { /* object disposed */ }
        }

        // Update the specific toggle for this unit
        if (this._toggles) {
            const entry = this._toggles.get(unit);
            if (entry) {
                try {
                    const { label } = computeToggleLabel(state, entry.spec);
                    entry.item.label.text = label;
                } catch { /* object disposed */ }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Embedding status (from /api/embeddings via control server)
    // -----------------------------------------------------------------------
    _refreshEmbedStatus() {
        const item = this._embedStatusItem;
        if (!item) return;
        const gen = this._generation;
        httpGet(`${CONTROL_URL}/api/embeddings`, (data) => {
            if (gen !== this._generation) return;
            try {
                if (!data || !Array.isArray(data.embeds)) {
                    item.label.text = 'Embeddings: unknown';
                    return;
                }
                const running = data.embeds.filter(e => e.running);
                if (running.length === 0) {
                    item.label.text = 'Embeddings: inactive';
                    return;
                }
                const names = running.map(e => {
                    let name = e.key || 'embed';
                    if (name.endsWith('.gguf')) name = name.slice(0, -5);
                    return name;
                });
                const label = names.length > 2
                    ? `${names[0]}, ${names[1]} +${names.length - 2}`
                    : names.join(', ');
                item.label.text = `Embeddings: ${label}`;
            } catch {
                try { item.label.text = 'Embeddings: error'; } catch {}
            }
        });
    }

    // -----------------------------------------------------------------------
    // Dynamic model submenu (from /api/models)
    // -----------------------------------------------------------------------
    _refreshModels() {
        const modelMenu = this._modelMenu;
        if (modelMenu) {
            httpGet(`${CONTROL_URL}/api/models`, (data) => {
                if (modelMenu !== this._modelMenu) return;
                if (!data || !Array.isArray(data.models)) return;
                // Skip rebuild when nothing changed
                if (modelMenu.menu.numMenuItems > 0 && data.active === this._activeModelKey) return;
                this._activeModelKey = data.active || null;
                modelMenu.menu.removeAll();
                for (const m of data.models) {
                    const mark = m.key === data.active ? ' ●' : '';
                    const label = m.exists ? `${m.key}${mark}` : `${m.key} (missing)`;
                    const item = new PopupMenu.PopupMenuItem(label);
                    if (!m.exists || m.key === data.active) {
                        item.setSensitive(false);
                    } else {
                        item.connect('activate', () => this._switchModel(m.key));
                    }
                    modelMenu.menu.addMenuItem(item);
                }
            });
        }

        // Embeds are an independent dynamic submenu — refresh regardless of
        // whether the model submenu is present.
        this._refreshEmbeds();
    }

    _switchModel(key) {
        httpPost(`${CONTROL_URL}/api/model`, { model: key });
        this._oneShot(2, () => { this._refreshUnit(); this._refreshModels(); });
        this._oneShot(6, () => { this._refreshUnit(); this._refreshModels(); });
    }

    // -----------------------------------------------------------------------
    // Dynamic embeds submenu (from /api/embeddings)
    // -----------------------------------------------------------------------
    _refreshEmbeds() {
        const embedMenu = this._embedMenu;
        if (!embedMenu) return;
        httpGet(`${CONTROL_URL}/api/embeddings`, (data) => {
            if (embedMenu !== this._embedMenu) return;
            if (!data || !Array.isArray(data.embeds)) return;
            embedMenu.menu.removeAll();
            if (data.embeds.length === 0) {
                const none = new PopupMenu.PopupMenuItem('No embedding models configured', {reactive: false});
                embedMenu.menu.addMenuItem(none);
                return;
            }
            for (const e of data.embeds) {
                const mark = e.running ? ' ●' : '';
                const label = e.exists ? `${e.key}${mark}` : `${e.key} (missing)`;
                const item = new PopupMenu.PopupMenuItem(label);
                item.setSensitive(false);
                embedMenu.menu.addMenuItem(item);
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
