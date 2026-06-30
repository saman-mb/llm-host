use anyhow::Result;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ModelEntry {
    pub key: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone)]
pub struct EmbedEntry {
    pub key: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone)]
pub struct Registry {
    pub active: String,
    pub models: Vec<ModelEntry>,
    pub embeds: Vec<EmbedEntry>,
}

// ---------------------------------------------------------------------------
// Regex cache — compiled once, reused across all requests
// ---------------------------------------------------------------------------

fn bash_array_re(var_name: &str) -> &'static Regex {
    Box::leak(Box::new(
        Regex::new(&format!(r"(?ms)^{}\s*=\s*\((.*?)\)", var_name)).unwrap()
    ))
}

fn extract_var_re(var_name: &str) -> &'static Regex {
    Box::leak(Box::new(
        Regex::new(&format!(r#"(?m)^{}\s*=\s*"?(.+?)"?\s*$"#, var_name)).unwrap()
    ))
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

/// Resolve the model state file path from config content.
/// Extracts MODEL_STATE_FILE or falls back to ~/.config/llm-host/model.
fn resolve_state_path(config_content: &str) -> PathBuf {
    let val = extract_var(config_content, "MODEL_STATE_FILE");
    match val {
        Some(p) if !p.contains("${") => PathBuf::from(p),
        _ => {
            let home = std::env::var("HOME").unwrap_or_default();
            PathBuf::from(home).join(".config/llm-host/model")
        }
    }
}

/// Parse config.sh to extract MODELS, EMBED_MODELS, and active model.
pub fn parse_config(config_path: &Path) -> Result<Registry> {
    let content = fs::read_to_string(config_path)?;
    let models = parse_bash_array(&content, "MODELS")?;
    let embeds_raw = parse_bash_array(&content, "EMBED_MODELS")?;

    let state_file = resolve_state_path(&content);
    let active = fs::read_to_string(&state_file)
        .unwrap_or_default()
        .trim()
        .to_string();

    let model_entries: Vec<ModelEntry> = models.iter().filter_map(|entry| {
        let sep = entry.find('|')?;
        let key = entry[..sep].to_string();
        let path = expand_tilde(&entry[sep + 1..]);
        let exists = Path::new(&path).exists();
        Some(ModelEntry { key, path, exists })
    }).collect();

    // H2 fix: If active model not found or empty, fall back to first model
    if active.is_empty() || !model_entries.iter().any(|m| m.key == active) {
        if let Some(first) = model_entries.first() {
            return Ok(Registry {
                active: first.key.clone(),
                models: model_entries,
                embeds: parse_embed_entries(&embeds_raw),
            });
        }
    }

    Ok(Registry {
        active,
        models: model_entries,
        embeds: parse_embed_entries(&embeds_raw),
    })
}

fn parse_embed_entries(raw: &[String]) -> Vec<EmbedEntry> {
    raw.iter().filter_map(|entry| {
        let sep = entry.find('|')?;
        let key = entry[..sep].to_string();
        let path = expand_tilde(&entry[sep + 1..]);
        let exists = Path::new(&path).exists();
        Some(EmbedEntry { key, path, exists })
    }).collect()
}

// ---------------------------------------------------------------------------
// Bash array parser
// ---------------------------------------------------------------------------

/// Parse a bash array declaration like `MODELS=("a|b" "c|d")`.
/// Uses `(?m)` line-anchored match to avoid matching inside comments.
fn parse_bash_array(content: &str, var_name: &str) -> Result<Vec<String>> {
    let re = bash_array_re(var_name);
    let caps = re.captures(content)
        .ok_or_else(|| anyhow::anyhow!("{} not found in config", var_name))?;
    let inner = caps.get(1).unwrap().as_str();

    let mut entries = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in inner.chars() {
        match ch {
            '"' if !in_quotes => { in_quotes = true; current.clear(); }
            '"' if in_quotes => {
                in_quotes = false;
                if !current.is_empty() {
                    entries.push(current.clone());
                }
            }
            _ if in_quotes => current.push(ch),
            _ => {}
        }
    }

    Ok(entries)
}

fn extract_var(content: &str, var_name: &str) -> Option<String> {
    let re = extract_var_re(var_name);
    let caps = re.captures(content)?;
    let val = caps.get(1)?.as_str().trim_matches('"');
    // Handle bash default value syntax: ${VAR:-default}
    if let Some(default) = val.strip_prefix("${").and_then(|s| s.strip_suffix('}')) {
        if let Some((_var, fallback)) = default.split_once(":-") {
            return Some(expand_tilde(fallback));
        }
        return Some(expand_tilde(val));
    }
    Some(expand_tilde(val))
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with('$') {
        let home = std::env::var("HOME").unwrap_or_default();
        if path == "$HOME" || path == "${HOME}" {
            return home;
        }
        if let Some(rest) = path.strip_prefix("$HOME/").or_else(|| path.strip_prefix("${HOME}/")) {
            return format!("{}/{}", home, rest);
        }
    }
    path.to_string()
}

// ---------------------------------------------------------------------------
// Public API — read/write active model
// ---------------------------------------------------------------------------

/// Read the active model key from the state file.
pub fn read_active_model(config_path: &Path) -> String {
    let content = fs::read_to_string(config_path).unwrap_or_default();
    let state_file = resolve_state_path(&content);
    fs::read_to_string(&state_file)
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Persist the active model key.
pub fn set_active_model(config_path: &Path, key: &str) -> Result<()> {
    let content = fs::read_to_string(config_path)?;
    let state_file = resolve_state_path(&content);
    if let Some(parent) = state_file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&state_file, format!("{}\n", key))?;
    Ok(())
}
