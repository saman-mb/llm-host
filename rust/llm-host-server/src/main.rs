use anyhow::{Context, Result};
use axum::extract::{Json, Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use llm_host_common::config::{parse_config, set_active_model};
use llm_host_common::spec::default_ui_spec;
use llm_host_common::systemctl;
use llm_host_common::valid_unit_name;
use serde::{Deserialize, Serialize};
use std::path::{Path as StdPath, PathBuf};
use std::sync::Arc;
use tokio::process::Command as TokioCommand;
use tracing::info;

// ---------------------------------------------------------------------------
// Shared app state
// ---------------------------------------------------------------------------

struct AppState {
    config_path: PathBuf,
    scripts_dir: PathBuf,
    http: reqwest::Client,
}

// ---------------------------------------------------------------------------
// Response types — matched to the existing Node.js contract
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct HealthResponse {
    server: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct ModelsResponse {
    active: String,
    models: Vec<ModelView>,
    embeds: Vec<EmbedView>,
}

#[derive(Serialize)]
struct ModelView {
    key: String,
    file: String,
    exists: bool,
}

#[derive(Serialize)]
struct EmbedView {
    key: String,
    exists: bool,
}

#[derive(Serialize)]
struct EmbeddingsResponse {
    embeds: Vec<EmbedStatusView>,
}

#[derive(Serialize)]
struct EmbedStatusView {
    key: String,
    exists: bool,
    running: bool,
}

#[derive(Deserialize)]
struct ModelSwitchBody {
    model: String,
}

#[derive(Serialize)]
struct SuccessResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Serialize)]
struct ModelSwitchResponse {
    success: bool,
    model: String,
    message: String,
}

#[derive(Serialize)]
struct ComfyFreeResponse {
    success: bool,
    freed: bool,
    message: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

#[derive(Serialize)]
struct ServiceStatusResponse {
    active: bool,
    state: String,
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

fn resolve_config_path() -> PathBuf {
    // 1. Explicit env var wins.
    if let Ok(p) = std::env::var("LLM_HOST_CONFIG") {
        return PathBuf::from(p);
    }

    // 2. config.sh next to the binary (for dev builds where CWD ≠ repo root).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("config.sh");
            if p.exists() {
                return p;
            }
        }
    }

    // 3. Default: ~/dev/llm-host/config.sh
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(format!("{}/dev/llm-host/config.sh", home))
}

fn resolve_scripts_dir(config_path: &StdPath) -> PathBuf {
    config_path
        .parent()
        .unwrap_or(StdPath::new("."))
        .join("scripts")
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

fn err_response(code: StatusCode, msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        code,
        Json(ErrorResponse {
            success: false,
            error: msg.to_string(),
        }),
    )
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        server: "llm-host-control",
        version: "1.0.0",
    })
}

async fn ui_spec() -> Json<llm_host_common::spec::UISpec> {
    Json(default_ui_spec())
}

async fn models(State(state): State<Arc<AppState>>) -> Result<Json<ModelsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let reg = parse_config(&state.config_path)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let model_views: Vec<ModelView> = reg
        .models
        .iter()
        .map(|m| ModelView {
            key: m.key.clone(),
            file: basename_without_gguf(&m.path),
            exists: m.exists,
        })
        .collect();

    let embed_views: Vec<EmbedView> = reg
        .embeds
        .iter()
        .map(|e| EmbedView {
            key: e.key.clone(),
            exists: e.exists,
        })
        .collect();

    Ok(Json(ModelsResponse {
        active: reg.active,
        models: model_views,
        embeds: embed_views,
    }))
}

async fn switch_model(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ModelSwitchBody>,
) -> Result<Json<ModelSwitchResponse>, (StatusCode, Json<ErrorResponse>)> {
    let reg = parse_config(&state.config_path)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    if !reg.models.iter().any(|m| m.key == body.model) {
        return Err(err_response(
            StatusCode::BAD_REQUEST,
            &format!("Unknown model: {}", body.model),
        ));
    }

    set_active_model(&state.config_path, &body.model)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let script = state.scripts_dir.join("set-model.sh");
    let output = TokioCommand::new("bash")
        .arg(&script)
        .arg(&body.model)
        .output()
        .await
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(err_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("set-model.sh failed: {}", stderr.trim()),
        ));
    }

    Ok(Json(ModelSwitchResponse {
        success: true,
        model: body.model.clone(),
        message: format!("Switching to {} — model is loading.", body.model),
    }))
}

async fn comfyui_start() -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    systemctl::start("comfyui.service")
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(SuccessResponse {
        success: true,
        message: Some("ComfyUI started.".into()),
    }))
}

async fn comfyui_stop() -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    systemctl::stop("comfyui.service")
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(SuccessResponse {
        success: true,
        message: Some("ComfyUI stopped.".into()),
    }))
}

async fn service_start(
    Path(unit): Path<String>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    if !valid_unit_name(&unit) {
        return Err(err_response(StatusCode::BAD_REQUEST, "Invalid unit name"));
    }
    systemctl::start(&unit)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(SuccessResponse {
        success: true,
        message: Some(format!("{} started.", unit)),
    }))
}

async fn service_stop(
    Path(unit): Path<String>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    if !valid_unit_name(&unit) {
        return Err(err_response(StatusCode::BAD_REQUEST, "Invalid unit name"));
    }
    systemctl::stop(&unit)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(SuccessResponse {
        success: true,
        message: Some(format!("{} stopped.", unit)),
    }))
}

async fn comfyui_free(
    State(state): State<Arc<AppState>>,
) -> Json<ComfyFreeResponse> {
    let resp = state
        .http
        .post("http://127.0.0.1:8188/free")
        .json(&serde_json::json!({
            "unload_models": true,
            "free_memory": true,
        }))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await;

    let freed = resp.is_ok();
    Json(ComfyFreeResponse {
        success: true,
        freed,
        message: if freed {
            "ComfyUI VRAM freed — iGPU reclaimed.".into()
        } else {
            "ComfyUI not running or unreachable — nothing to free.".into()
        },
    })
}

/// Validate unit name to prevent injection: only `[a-zA-Z0-9._-]+\.service`.
async fn service_status(
    Path(unit): Path<String>,
) -> Result<Json<ServiceStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    if !valid_unit_name(&unit) {
        return Err(err_response(StatusCode::BAD_REQUEST, "Invalid unit name"));
    }

    let state = systemctl::is_active(&unit).unwrap_or_else(|_| "inactive".into());
    let active = state == "active";

    Ok(Json(ServiceStatusResponse { active, state }))
}

async fn embeddings(
    State(state): State<Arc<AppState>>,
) -> Result<Json<EmbeddingsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let reg = parse_config(&state.config_path)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    // Fetch running models from llama-server at :8080/running.
    let running_keys: Vec<String> = match state
        .http
        .get("http://localhost:8080/running")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(val) => {
                let running = val.get("running").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                running
                    .iter()
                    .filter(|e| {
                        e.get("cmd")
                            .and_then(|v| v.as_str())
                            .map(|cmd| cmd.contains("--embedding"))
                            .unwrap_or(false)
                    })
                    .filter_map(|e| {
                        e.get("model")
                            .or_else(|| e.get("name"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .collect()
            }
            Err(_) => vec![],
        },
        Err(_) => vec![],
    };

    let running_set: std::collections::HashSet<&str> =
        running_keys.iter().map(|s| s.as_str()).collect();

    let embed_views: Vec<EmbedStatusView> = reg
        .embeds
        .iter()
        .map(|e| EmbedStatusView {
            key: e.key.clone(),
            exists: e.exists,
            running: running_set.contains(e.key.as_str()),
        })
        .collect();

    Ok(Json(EmbeddingsResponse { embeds: embed_views }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn basename_without_gguf(path: &str) -> String {
    let name = std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    if name.ends_with(".gguf") {
        name[..name.len() - 5].to_string()
    } else {
        name
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config_path = resolve_config_path();
    let scripts_dir = resolve_scripts_dir(&config_path);
    info!(config = %config_path.display(), "starting llm-host-server");

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .context("building reqwest client")?;

    let state = Arc::new(AppState {
        config_path,
        scripts_dir,
        http,
    });

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/ui", get(ui_spec))
        .route("/api/models", get(models))
        .route("/api/model", post(switch_model))
        .route("/api/comfyui/start", post(comfyui_start))
        .route("/api/comfyui/stop", post(comfyui_stop))
        .route("/api/comfyui/free", post(comfyui_free))
        .route("/api/service/:unit", get(service_status))
        .route("/api/service/:unit/start", post(service_start))
        .route("/api/service/:unit/stop", post(service_stop))
        .route("/api/embeddings", get(embeddings))
        .with_state(state);

    let addr = "127.0.0.1:3001";
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("binding to {}", addr))?;

    info!("llm-host-server listening on http://{}", addr);
    axum::serve(listener, app).await.context("server error")?;

    Ok(())
}
