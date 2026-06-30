use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UISpec {
    pub unit: String,
    pub poll: u64,
    pub items: Vec<SpecItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SpecItem {
    #[serde(rename = "separator")]
    Separator,
    #[serde(rename = "status")]
    Status { label: String },
    #[serde(rename = "toggle")]
    Toggle {
        label: String,
        #[serde(rename = "labelActive")]
        label_active: String,
        action: Action,
        #[serde(rename = "actionActive")]
        action_active: Action,
        #[serde(skip_serializing_if = "Option::is_none")]
        unit: Option<String>,
    },
    #[serde(rename = "submenu")]
    Submenu {
        label: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        dynamic: Option<String>,
        #[serde(default)]
        items: Vec<SpecItem>,
    },
    #[serde(rename = "action")]
    Action {
        label: String,
        action: Action,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub kind: String,
    pub args: serde_json::Value,
}

pub fn default_ui_spec() -> UISpec {
    UISpec {
        unit: "llama-swap.service".into(),
        poll: 10,
        items: vec![
            SpecItem::Status { label: "LLM: checking…".into() },
            SpecItem::Toggle {
                label: "Start LLM".into(),
                label_active: "Stop LLM".into(),
                action: Action { kind: "http".into(), args: serde_json::json!(["POST", "/api/service/llama-swap.service/start", {}]) },
                action_active: Action { kind: "http".into(), args: serde_json::json!(["POST", "/api/service/llama-swap.service/stop", {}]) },
                unit: None,
            },
            SpecItem::Submenu { label: "Models".into(), dynamic: Some("models".into()), items: vec![] },
            SpecItem::Separator,
            SpecItem::Status { label: "ComfyUI: checking…".into() },
            SpecItem::Toggle {
                label: "Start ComfyUI".into(),
                label_active: "Stop ComfyUI".into(),
                action: Action { kind: "http".into(), args: serde_json::json!(["POST", "/api/comfyui/start", {}]) },
                action_active: Action { kind: "http".into(), args: serde_json::json!(["POST", "/api/comfyui/stop", {}]) },
                unit: Some("comfyui.service".into()),
            },
            SpecItem::Submenu {
                label: "ComfyUI".into(),
                dynamic: None,
                items: vec![
                    SpecItem::Action { label: "Free VRAM".into(), action: Action { kind: "http".into(), args: serde_json::json!(["POST", "/api/comfyui/free", {}]) } },
                    SpecItem::Action { label: "Open ComfyUI ↗".into(), action: Action { kind: "url".into(), args: serde_json::json!(["http://127.0.0.1:8188"]) } },
                ],
            },
            SpecItem::Separator,
            SpecItem::Status { label: "Embeddings: checking…".into() },
            SpecItem::Submenu { label: "Embeddings".into(), dynamic: Some("embeds".into()), items: vec![] },
            SpecItem::Separator,
            SpecItem::Action { label: "Launch chat ↗".into(), action: Action { kind: "url".into(), args: serde_json::json!(["http://localhost:8080"]) } },
            SpecItem::Action { label: "Tail journal".into(), action: Action { kind: "script".into(), args: serde_json::json!(["_journal"]) } },
        ],
    }
}
