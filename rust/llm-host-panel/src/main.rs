use std::collections::hash_map::DefaultHasher;
use std::env;
use std::hash::{Hash, Hasher};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use gtk::prelude::*;
use libappindicator::{AppIndicator, AppIndicatorStatus};
use llm_host_common::spec::{default_ui_spec, Action, SpecItem, UISpec};

const CONTROL_URL: &str = "http://127.0.0.1:3001";
const LLM_POLL_SECS: u64 = 5;
const SPEC_POLL_SECS: u64 = 10;
const MODEL_POLL_SECS: u64 = 10;
const EMBED_POLL_SECS: u64 = 10;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
struct AppState {
    spec: Option<UISpec>,
    spec_hash: u64,
    llm_state: String,
    comfyui_state: String,
    active_model: String,
    models: Vec<ModelInfo>,
    embeds: Vec<EmbedInfo>,
}

#[derive(Debug, Clone)]
struct ModelInfo {
    key: String,
    exists: bool,
}

#[derive(Debug, Clone)]
struct EmbedInfo {
    key: String,
    exists: bool,
    running: bool,
}

#[derive(Debug)]
enum PollMsg {
    RebuildMenu,
    UpdateLlmState,
    UpdateModels,
    UpdateEmbeds,
}

// ---------------------------------------------------------------------------
// Polling threads
// ---------------------------------------------------------------------------

fn spec_poller(state: Arc<Mutex<AppState>>, tx: mpsc::Sender<PollMsg>) {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    loop {
        thread::sleep(Duration::from_secs(SPEC_POLL_SECS));
        match client
            .get(format!("{}/api/ui", CONTROL_URL))
            .send()
            .and_then(|r| r.json::<UISpec>())
        {
            Ok(spec) => {
                let hash = hash_spec(&spec);
                let mut st = state.lock().unwrap();
                if hash != st.spec_hash {
                    st.spec = Some(spec);
                    st.spec_hash = hash;
                    drop(st);
                    let _ = tx.send(PollMsg::RebuildMenu);
                }
            }
            Err(e) => eprintln!("[panel] spec poll: {}", e),
        }
    }
}

fn llm_poller(state: Arc<Mutex<AppState>>, tx: mpsc::Sender<PollMsg>) {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    loop {
        thread::sleep(Duration::from_secs(LLM_POLL_SECS));
        let llm = client
            .get(format!("{}/api/service/llama-swap.service", CONTROL_URL))
            .send()
            .ok()
            .and_then(|r| r.json::<ServiceState>().ok())
            .map(|s| s.state.unwrap_or_default())
            .unwrap_or_else(|| "inactive".into());
        let comfyui = client
            .get(format!("{}/api/service/comfyui.service", CONTROL_URL))
            .send()
            .ok()
            .and_then(|r| r.json::<ServiceState>().ok())
            .map(|s| s.state.unwrap_or_default())
            .unwrap_or_else(|| "inactive".into());
        let mut st = state.lock().unwrap();
        let changed = st.llm_state != llm || st.comfyui_state != comfyui;
        st.llm_state = llm;
        st.comfyui_state = comfyui;
        if changed {
            drop(st);
            let _ = tx.send(PollMsg::UpdateLlmState);
        }
    }
}

fn model_poller(state: Arc<Mutex<AppState>>, tx: mpsc::Sender<PollMsg>) {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    loop {
        thread::sleep(Duration::from_secs(MODEL_POLL_SECS));
        match client
            .get(format!("{}/api/models", CONTROL_URL))
            .send()
            .and_then(|r| r.json::<ModelsResponse>())
        {
            Ok(resp) => {
                let models: Vec<ModelInfo> = resp
                    .models
                    .into_iter()
                    .map(|m| ModelInfo { key: m.key, exists: m.exists })
                    .collect();
                let active = resp.active.unwrap_or_default();
                let mut st = state.lock().unwrap();
                st.models = models;
                st.active_model = active;
                drop(st);
                let _ = tx.send(PollMsg::UpdateModels);
            }
            Err(e) => eprintln!("[panel] model poll: {}", e),
        }
    }
}

fn embed_poller(state: Arc<Mutex<AppState>>, tx: mpsc::Sender<PollMsg>) {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    loop {
        thread::sleep(Duration::from_secs(EMBED_POLL_SECS));
        match client
            .get(format!("{}/api/embeddings", CONTROL_URL))
            .send()
            .and_then(|r| r.json::<EmbedResponse>())
        {
            Ok(resp) => {
                let embeds: Vec<EmbedInfo> = resp
                    .embeds
                    .into_iter()
                    .map(|e| EmbedInfo { key: e.key, exists: e.exists, running: e.running })
                    .collect();
                let mut st = state.lock().unwrap();
                st.embeds = embeds;
                drop(st);
                let _ = tx.send(PollMsg::UpdateEmbeds);
            }
            Err(e) => eprintln!("[panel] embed poll: {}", e),
        }
    }
}

// ---------------------------------------------------------------------------
// Menu builder
// ---------------------------------------------------------------------------

fn build_menu(menu: &gtk::Menu, state: &AppState) {
    // Clear existing items
    let mut children: Vec<gtk::Widget> = Vec::new();
    menu.foreach(|item| children.push(item.clone()));
    for child in &children {
        menu.remove(child);
    }

    let spec = match &state.spec {
        Some(s) => s.clone(),
        None => default_ui_spec(),
    };

    for item in &spec.items {
        append_spec_item(menu, item, &spec, state);
    }

    menu.show_all();
}

fn append_spec_item(menu: &gtk::Menu, item: &SpecItem, spec: &UISpec, state: &AppState) {
    match item {
        SpecItem::Separator => {
            menu.append(&gtk::SeparatorMenuItem::new());
        }
        SpecItem::Status { label } => {
            let resolved = resolve_status_label(label, state);
            let mi = gtk::MenuItem::builder().label(&resolved).sensitive(false).build();
            menu.append(&mi);
        }
        SpecItem::Toggle { label, label_active, action, action_active, unit } => {
            let unit_name = unit.as_deref().unwrap_or(&spec.unit);
            let is_running = is_unit_running(unit_name, state);
            let display_label = if is_running { label_active.as_str() } else { label.as_str() };
            let action_to_use = if is_running { action_active.clone() } else { action.clone() };
            let mi = gtk::MenuItem::builder().label(display_label).build();
            mi.connect_activate(move |_| dispatch_action(&action_to_use));
            menu.append(&mi);
        }
        SpecItem::Submenu { label, dynamic, items } => {
            let sub_menu = gtk::Menu::new();
            let top = gtk::MenuItem::with_label(label);
            top.set_submenu(Some(&sub_menu));
            match dynamic.as_deref() {
                Some("models") => populate_models_menu(&sub_menu, state),
                Some("embeds") => populate_embeds_menu(&sub_menu, state),
                _ => {
                    for child in items {
                        append_spec_item(&sub_menu, child, spec, state);
                    }
                }
            }
            menu.append(&top);
        }
        SpecItem::Action { label, action } => {
            let mi = gtk::MenuItem::builder().label(label).build();
            let a = action.clone();
            mi.connect_activate(move |_| dispatch_action(&a));
            menu.append(&mi);
        }
    }
}

fn populate_models_menu(menu: &gtk::Menu, state: &AppState) {
    if state.models.is_empty() {
        let mi = gtk::MenuItem::builder().label("No models configured").sensitive(false).build();
        menu.append(&mi);
        return;
    }
    for m in &state.models {
        let is_active = m.key == state.active_model;
        let label = if !m.exists {
            format!("{} (missing)", m.key)
        } else if is_active {
            format!("{} ●", m.key)
        } else {
            m.key.clone()
        };
        let mi = gtk::MenuItem::builder().label(&label).sensitive(m.exists && !is_active).build();
        if m.exists && !is_active {
            let key = m.key.clone();
            mi.connect_activate(move |_| switch_model(&key));
        }
        menu.append(&mi);
    }
}

fn populate_embeds_menu(menu: &gtk::Menu, state: &AppState) {
    if state.embeds.is_empty() {
        let mi = gtk::MenuItem::builder().label("No embedding models configured").sensitive(false).build();
        menu.append(&mi);
        return;
    }
    for e in &state.embeds {
        let label = if !e.exists {
            format!("{} (missing)", e.key)
        } else if e.running {
            format!("{} ●", e.key)
        } else {
            e.key.clone()
        };
        let mi = gtk::MenuItem::builder().label(&label).sensitive(false).build();
        menu.append(&mi);
    }
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

fn dispatch_action(action: &Action) {
    match action.kind.as_str() {
        "systemctl" => {
            if let Some(args) = action.args.as_array() {
                let cmd: Vec<&str> = args.iter().filter_map(|v| v.as_str()).collect();
                if !cmd.is_empty() {
                    run_systemctl(&cmd);
                }
            }
        }
        "http" => {
            if let Some(args) = action.args.as_array() {
                let method = args.get(0).and_then(|v| v.as_str()).unwrap_or("POST");
                let path = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
                let body = args.get(2).cloned().unwrap_or(serde_json::json!({}));
                if method == "POST" {
                    run_http_post(path, &body);
                }
            }
        }
        "url" => {
            if let Some(url) = action.args.as_array().and_then(|a| a.first()).and_then(|v| v.as_str()) {
                let _ = std::process::Command::new("xdg-open").arg(url).status();
            }
        }
        "script" => {
            if let Some(name) = action.args.as_array().and_then(|a| a.first()).and_then(|v| v.as_str()) {
                run_script(name);
            }
        }
        _ => eprintln!("[panel] unknown action kind: {}", action.kind),
    }
}

fn run_systemctl(args: &[&str]) {
    let status = std::process::Command::new("systemctl")
        .arg("--user")
        .args(args)
        .status();
    if let Err(e) = status {
        eprintln!("[panel] systemctl failed: {}", e);
    }
}

fn run_http_post(path: &str, body: &serde_json::Value) {
    let url = format!("{}{}", CONTROL_URL, path);
    let path_owned = path.to_string();
    let body = body.clone();
    thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        match client.post(&url).json(&body).send() {
            Ok(resp) => {
                if let Ok(msg) = resp.json::<serde_json::Value>() {
                    eprintln!("[panel] POST {} -> {:?}", path_owned, msg);
                }
            }
            Err(e) => eprintln!("[panel] POST {} failed: {}", path_owned, e),
        }
    });
}

fn run_script(name: &str) {
    if name == "_journal" {
        let _ = std::process::Command::new("gnome-terminal")
            .args(["--", "bash", "-lc", "journalctl --user -u llama-swap.service -f; exec bash"])
            .status();
    } else {
        let home = env::var("HOME").unwrap_or_default();
        let script_path = format!("{}/dev/llm-host/scripts/{}", home, name);
        let _ = std::process::Command::new("gnome-terminal")
            .args(["--", "bash", "-lc", &format!("{}; echo; echo '[done — press Enter to close]'; read", script_path)])
            .status();
    }
}

fn switch_model(key: &str) {
    let url = format!("{}/api/model", CONTROL_URL);
    let body = serde_json::json!({ "model": key });
    thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();
        match client.post(&url).json(&body).send() {
            Ok(resp) => {
                if let Ok(msg) = resp.json::<serde_json::Value>() {
                    eprintln!("[panel] switch model -> {:?}", msg);
                }
            }
            Err(e) => eprintln!("[panel] switch model failed: {}", e),
        }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn is_unit_running(unit: &str, state: &AppState) -> bool {
    let s = match unit {
        "llama-swap.service" => &state.llm_state,
        "comfyui.service" => &state.comfyui_state,
        _ => return false,
    };
    s == "active" || s == "activating" || s == "reloading"
}

fn resolve_status_label(template: &str, state: &AppState) -> String {
    if template.starts_with("LLM:") {
        let dot = match state.llm_state.as_str() {
            "active" => "●",
            "activating" | "reloading" => "●",
            "failed" => "●",
            _ => "○",
        };
        format!("LLM: {} {}", dot, state.llm_state)
    } else if template.starts_with("ComfyUI:") {
        let dot = match state.comfyui_state.as_str() {
            "active" => "●",
            "activating" | "reloading" => "●",
            "failed" => "●",
            _ => "○",
        };
        format!("ComfyUI: {} {}", dot, state.comfyui_state)
    } else if template.starts_with("Embeddings:") {
        let running: Vec<&str> = state.embeds.iter().filter(|e| e.running).map(|e| e.key.as_str()).collect();
        if running.is_empty() {
            "Embeddings: none".into()
        } else if running.len() <= 2 {
            format!("Embeddings: {}", running.join(", "))
        } else {
            format!("Embeddings: {}, {} +{}", running[0], running[1], running.len() - 2)
        }
    } else {
        template.to_string()
    }
}

fn update_indicator(indicator: &mut AppIndicator, state: &AppState) {
    let icon_name = match state.llm_state.as_str() {
        "active" => "network-transmit-receive",
        "activating" | "reloading" => "network-transmit-receive",
        "failed" => "network-offline",
        _ => "network-offline",
    };
    indicator.set_icon(icon_name);
}

fn hash_spec(spec: &UISpec) -> u64 {
    let json = serde_json::to_string(spec).unwrap_or_default();
    let mut hasher = DefaultHasher::new();
    json.hash(&mut hasher);
    hasher.finish()
}

#[derive(serde::Deserialize)]
struct ServiceState {
    #[serde(default)]
    state: Option<String>,
}

#[derive(serde::Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    models: Vec<ApiModelEntry>,
}

#[derive(serde::Deserialize)]
struct ApiModelEntry {
    key: String,
    #[serde(default)]
    exists: bool,
}

#[derive(serde::Deserialize)]
struct EmbedResponse {
    #[serde(default)]
    embeds: Vec<ApiEmbedEntry>,
}

#[derive(serde::Deserialize)]
struct ApiEmbedEntry {
    key: String,
    #[serde(default)]
    exists: bool,
    #[serde(default)]
    running: bool,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    gtk::init().expect("Failed to initialize GTK");

    let state = Arc::new(Mutex::new(AppState::default()));
    let menu = gtk::Menu::new();

    // Indicator — use system icon that definitely exists in the theme
    let mut indicator = AppIndicator::new("llm-host-panel", "dialog-information");
    indicator.set_title("LLM Host");
    indicator.set_status(AppIndicatorStatus::Active);

    // Initial build
    {
        let st = state.lock().unwrap();
        build_menu(&menu, &st);
        update_indicator(&mut indicator, &st);
    }

    // Spawn polling threads — use mpsc + glib::idle_add for thread → GTK communication
    let (tx, rx) = mpsc::channel::<PollMsg>();

    let s1 = state.clone();
    let tx1 = tx.clone();
    thread::spawn(move || spec_poller(s1, tx1));

    let s2 = state.clone();
    let tx2 = tx.clone();
    thread::spawn(move || llm_poller(s2, tx2));

    let s3 = state.clone();
    let tx3 = tx.clone();
    thread::spawn(move || model_poller(s3, tx3));

    let s4 = state.clone();
    let tx4 = tx.clone();
    thread::spawn(move || embed_poller(s4, tx4));

    // Drop our copy so rx only closes when all pollers are done
    drop(tx);

    // Handle messages on GTK main loop via glib::idle_add
    let menu_ref = menu.clone();
    let state_ref = state.clone();
    let mut indicator_ref = indicator;

    // Use a source to check for messages periodically
    glib::source::timeout_add_local(Duration::from_millis(200), move || {
        // Drain all pending messages
        while let Ok(msg) = rx.try_recv() {
            let st = state_ref.lock().unwrap();
            match msg {
                PollMsg::RebuildMenu | PollMsg::UpdateModels | PollMsg::UpdateEmbeds => {
                    build_menu(&menu_ref, &st);
                }
                PollMsg::UpdateLlmState => {
                    update_indicator(&mut indicator_ref, &st);
                    build_menu(&menu_ref, &st);
                }
            }
        }
        glib::ControlFlow::Continue
    });

    gtk::main();
}
