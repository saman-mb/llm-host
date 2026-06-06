import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const UNIT = 'llama-swap';
const POLL_SECONDS = 10;
const WEB_URL = 'http://localhost:8081';
const SERVER_URL = 'http://localhost:8080';
const COMFYUI_URL = 'http://127.0.0.1:8188';
const CONTROL_URL = 'http://127.0.0.1:3001';
const SCRIPTS_DIR = GLib.build_filenamev([GLib.get_home_dir(), 'dev', 'llm-host', 'scripts']);

const Indicator = GObject.registerClass(
class LLMHostIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'LLM Host');

        // --- panel button: brain/chip glyph + colored status dot ---
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._label = new St.Label({
            text: 'LLM',
            y_align: 2,
            style: 'font-weight: 600; padding-right: 4px;',
        });
        this._dot = new St.Label({
            text: '●', // ●
            y_align: 2,
            style: 'color: #888; font-size: 12px;',
        });
        box.add_child(this._label);
        box.add_child(this._dot);
        this.add_child(box);

        // --- dropdown menu ---
        this._statusItem = new PopupMenu.PopupMenuItem('Checking…', {reactive: false});
        this.menu.addMenuItem(this._statusItem);

        this._modelItem = new PopupMenu.PopupMenuItem('Model: —', {reactive: false});
        this._modelItem.label.style = 'font-size: 11px; color: #94a3b8;';
        this.menu.addMenuItem(this._modelItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._toggleItem = new PopupMenu.PopupMenuItem('Start LLM');
        this._toggleItem.connect('activate', () => this._toggle());
        this.menu.addMenuItem(this._toggleItem);

        const restartItem = new PopupMenu.PopupMenuItem('Restart');
        restartItem.connect('activate', () => this._control('restart'));
        this.menu.addMenuItem(restartItem);

        // Quick script shortcuts — each opens in a terminal so output is visible.
        const scriptsMenu = new PopupMenu.PopupSubMenuMenuItem('Scripts');
        const addScript = (label, script) => {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => {
                const cmd = `gnome-terminal -- bash -lc "${SCRIPTS_DIR}/${script}; echo; echo '[done — press Enter to close]'; read"`;
                GLib.spawn_command_line_async(cmd);
            });
            scriptsMenu.menu.addMenuItem(item);
        };
        addScript('Sync model → Hermes/OpenCode', 'sync-model.sh');
        addScript('Benchmark', 'benchmark.sh');
        addScript('Test API', 'test-api.sh');
        addScript('Status', 'status.sh');
        this.menu.addMenuItem(scriptsMenu);

        // Switch model — populated from the control server's registry.
        this._modelMenu = new PopupMenu.PopupSubMenuMenuItem('Switch model');
        this.menu.addMenuItem(this._modelMenu);
        this._activeModelKey = null;
        this._refreshModels();

        // Embeddings — always-on models; click to warm-load via a 1-token probe.
        this._embedMenu = new PopupMenu.PopupSubMenuMenuItem('Embeddings');
        this.menu.addMenuItem(this._embedMenu);
        this._refreshEmbeds();

        // GPU mode — Qwen and ComfyUI share one iGPU; hand it to one or the other.
        const gpuMenu = new PopupMenu.PopupSubMenuMenuItem('GPU mode');
        const llmModeItem = new PopupMenu.PopupMenuItem('LLM mode (Qwen)');
        llmModeItem.connect('activate', () => this._gpuMode('llm'));
        gpuMenu.menu.addMenuItem(llmModeItem);
        const imgModeItem = new PopupMenu.PopupMenuItem('Image mode (ComfyUI)');
        imgModeItem.connect('activate', () => this._gpuMode('image'));
        gpuMenu.menu.addMenuItem(imgModeItem);
        this.menu.addMenuItem(gpuMenu);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const comfyItem = new PopupMenu.PopupMenuItem('Open ComfyUI ↗');
        comfyItem.connect('activate', () => {
            GLib.spawn_command_line_async(`xdg-open ${COMFYUI_URL}`);
        });
        this.menu.addMenuItem(comfyItem);

        const chatItem = new PopupMenu.PopupMenuItem('Launch llama chat ↗');
        chatItem.connect('activate', () => {
            GLib.spawn_command_line_async(`xdg-open ${SERVER_URL}`);
        });
        this.menu.addMenuItem(chatItem);

        const webItem = new PopupMenu.PopupMenuItem('Open web control ↗');
        webItem.connect('activate', () => {
            GLib.spawn_command_line_async(`xdg-open ${WEB_URL}`);
        });
        this.menu.addMenuItem(webItem);

        const logItem = new PopupMenu.PopupMenuItem('Tail journal');
        logItem.connect('activate', () => {
            const cmd = `gnome-terminal -- bash -lc "journalctl --user -u ${UNIT} -f; exec bash"`;
            GLib.spawn_command_line_async(cmd);
        });
        this.menu.addMenuItem(logItem);

        // --- state + polling ---
        this._running = false;
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._refresh();
            this._refreshModels();
            this._refreshEmbeds();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _refresh() {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['systemctl', '--user', 'is-active', UNIT],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this._setState('error');
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let stdout = '';
            try {
                [, stdout] = p.communicate_utf8_finish(res);
            } catch (e) {
                this._setState('error');
                return;
            }
            this._setState((stdout || '').trim());
        });
    }

    _setState(state) {
        // systemctl is-active prints: active | inactive | activating | deactivating | failed | unknown
        const running = state === 'active';
        const activating = state === 'activating' || state === 'reloading';
        this._running = running;

        let color;
        if (running) color = '#22c55e';
        else if (activating) color = '#f59e0b';
        else if (state === 'failed') color = '#ef4444';
        else color = '#94a3b8';

        this._dot.style = `color: ${color}; font-size: 12px;`;
        this._statusItem.label.text = `Status: ${state || 'unknown'}`;
        this._toggleItem.label.text = running ? 'Stop LLM' : 'Start LLM';

        if (running) this._refreshModel();
        else this._setModel('—');
    }

    _setModel(name) {
        this._modelItem.label.text = `Model: ${name}`;
    }

    _gpuMode(mode) {
        // POST to the control server so the web UI and taskbar share one code path.
        try {
            Gio.Subprocess.new(
                ['curl', '-s', '-X', 'POST', `${CONTROL_URL}/api/gpu-mode`,
                 '-H', 'Content-Type: application/json',
                 '-d', `{"mode":"${mode}"}`],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            // ignore
        }
        // Reflect the new state once systemd settles.
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => { this._refresh(); return GLib.SOURCE_REMOVE; });
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => { this._refresh(); return GLib.SOURCE_REMOVE; });
    }

    // Pull the model registry from the control server and rebuild the submenu.
    _refreshModels() {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['curl', '-s', '--max-time', '2', `${CONTROL_URL}/api/models`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let stdout = '';
            try {
                [, stdout] = p.communicate_utf8_finish(res);
            } catch (e) {
                return;
            }
            let data;
            try {
                data = JSON.parse(stdout);
            } catch (e) {
                return;
            }
            if (!data || !Array.isArray(data.models)) return;
            // Skip the rebuild when nothing changed — avoids collapsing the
            // submenu if it happens to be open during a poll.
            const built = this._modelMenu.menu.numMenuItems > 0;
            if (built && data.active === this._activeModelKey) return;
            this._activeModelKey = data.active || null;
            this._modelMenu.menu.removeAll();
            for (const m of data.models) {
                const mark = m.key === data.active ? ' ●' : '';
                const label = m.exists ? `${m.key}${mark}` : `${m.key} (missing)`;
                const item = new PopupMenu.PopupMenuItem(label);
                if (!m.exists || m.key === data.active) {
                    item.setSensitive(false);
                } else {
                    item.connect('activate', () => this._setModelChoice(m.key));
                }
                this._modelMenu.menu.addMenuItem(item);
            }
        });
    }

    // Ask the control server to switch models (it persists + restarts).
    _setModelChoice(key) {
        try {
            Gio.Subprocess.new(
                ['curl', '-s', '-X', 'POST', `${CONTROL_URL}/api/model`,
                 '-H', 'Content-Type: application/json',
                 '-d', `{"model":"${key}"}`],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            // ignore
        }
        // Reflect the new selection + loading state once systemd settles.
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => { this._refresh(); this._refreshModels(); return GLib.SOURCE_REMOVE; });
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 6, () => { this._refresh(); this._refreshModels(); return GLib.SOURCE_REMOVE; });
    }

    // Populate the Embeddings submenu from /api/models embeds[], with live dot
    // from /running (llama-swap reports which models are currently loaded).
    _refreshEmbeds() {
        // Fetch /api/models to get embed list, then /running for load status.
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['curl', '-s', '--max-time', '2', `${CONTROL_URL}/api/models`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let stdout = '';
            try { [, stdout] = p.communicate_utf8_finish(res); } catch (e) { return; }
            let data;
            try { data = JSON.parse(stdout); } catch (e) { return; }
            const embeds = Array.isArray(data.embeds) ? data.embeds : [];
            if (embeds.length === 0) return;

            // Fetch /running to check which models llama-swap has warm.
            let proc2;
            try {
                proc2 = Gio.Subprocess.new(
                    ['curl', '-s', '--max-time', '2', `${SERVER_URL}/running`],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
                );
            } catch (e) {
                this._buildEmbedMenu(embeds, []);
                return;
            }
            proc2.communicate_utf8_async(null, null, (p2, res2) => {
                let running = [];
                let raw2 = '';
                try { [, raw2] = p2.communicate_utf8_finish(res2); } catch (e) {}
                try { running = JSON.parse(raw2) || []; } catch (e) {}
                this._buildEmbedMenu(embeds, running);
            });
        });
    }

    _buildEmbedMenu(embeds, running) {
        this._embedMenu.menu.removeAll();
        for (const em of embeds) {
            const loaded = Array.isArray(running) && running.includes(em.key);
            const mark = loaded ? ' ●' : '';
            const label = em.exists ? `${em.key}${mark}` : `${em.key} (missing)`;
            const item = new PopupMenu.PopupMenuItem(label);
            if (em.exists) {
                item.connect('activate', () => this._loadEmbed(em.key));
            } else {
                item.setSensitive(false);
            }
            this._embedMenu.menu.addMenuItem(item);
        }
    }

    // Warm-load an embed model by sending a 1-token embeddings request.
    _loadEmbed(key) {
        try {
            Gio.Subprocess.new(
                ['curl', '-s', '-X', 'POST', `${SERVER_URL}/v1/embeddings`,
                 '-H', 'Content-Type: application/json',
                 '-d', `{"model":"${key}","input":"."}`],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            // ignore
        }
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => { this._refreshEmbeds(); return GLib.SOURCE_REMOVE; });
    }

    _refreshModel() {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['curl', '-s', '--max-time', '2', `${SERVER_URL}/v1/models`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this._setModel('—');
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let stdout = '';
            try {
                [, stdout] = p.communicate_utf8_finish(res);
            } catch (e) {
                this._setModel('—');
                return;
            }
            let name = '';
            try {
                const j = JSON.parse(stdout);
                const m = (j.models && j.models[0]) || (j.data && j.data[0]) || {};
                name = m.name || m.id || m.model || '';
            } catch (e) {
                name = '';
            }
            if (name.endsWith('.gguf')) name = name.slice(0, -5);
            this._setModel(name || 'unknown');
        });
    }

    _toggle() {
        this._control(this._running ? 'stop' : 'start');
    }

    _runSystemctl(args) {
        try {
            Gio.Subprocess.new(
                ['systemctl', '--user', ...args],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            // ignore
        }
    }

    _control(action) {
        if (action === 'stop') {
            this._runSystemctl(['disable', '--now', `${UNIT}.service`]);
        } else if (action === 'start') {
            this._runSystemctl(['enable', '--now', `${UNIT}.service`]);
        } else if (action === 'restart') {
            this._runSystemctl(['enable', '--now', `${UNIT}.service`]);
            this._runSystemctl(['restart', `${UNIT}.service`]);
        }

        // Optimistic refresh — show transition fast, then settle.
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
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
