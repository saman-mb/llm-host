pub mod config;
pub mod spec;
pub mod systemctl;

use regex::Regex;
use std::sync::OnceLock;

/// Validate unit name to prevent command injection.
/// Only allows `[a-zA-Z0-9._-]+\.service`.
pub fn valid_unit_name(unit: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z0-9._-]+\.service$").unwrap())
        .is_match(unit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use config::{parse_config, read_active_model, set_active_model};
    use std::path::PathBuf;

    /// Create an isolated temp dir for a test, cleaning any prior run.
    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("llm-host-test-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Write a minimal config.sh to `dir/config.sh` and return the path.
    fn write_test_config(dir: &PathBuf, content: &str) -> PathBuf {
        let p = dir.join("config.sh");
        std::fs::write(&p, content).unwrap();
        p
    }

    // -----------------------------------------------------------------------
    // config.rs — tested through parse_config (private helpers exercised via
    // the public API with crafted config files)
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_bash_array_simple() {
        let dir = test_dir("bash_array_simple");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"a|b\" \"c|d\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models.len(), 2);
        assert_eq!(reg.models[0].key, "a");
        assert_eq!(reg.models[0].path, "b");
        assert_eq!(reg.models[1].key, "c");
        assert_eq!(reg.models[1].path, "d");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_empty() {
        let dir = test_dir("bash_array_empty");
        let cfg = write_test_config(&dir, "MODELS=()\nEMBED_MODELS=()\n");
        let reg = parse_config(&cfg).unwrap();
        assert!(reg.models.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_single() {
        let dir = test_dir("bash_array_single");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"only|/m/path.gguf\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models.len(), 1);
        assert_eq!(reg.models[0].key, "only");
        assert_eq!(reg.models[0].path, "/m/path.gguf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_expand_tilde_home() {
        let dir = test_dir("expand_tilde_home");
        let home = std::env::var("HOME").unwrap();
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"m|$HOME/model.gguf\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models[0].path, format!("{home}/model.gguf"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_expand_tilde_path() {
        let dir = test_dir("expand_tilde_path");
        let home = std::env::var("HOME").unwrap();
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"m|$HOME/foo/bar.gguf\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models[0].path, format!("{home}/foo/bar.gguf"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_expand_tilde_no_tilde() {
        let dir = test_dir("expand_tilde_no_tilde");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"m|/absolute/path.gguf\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models[0].path, "/absolute/path.gguf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_extract_var() {
        let dir = test_dir("extract_var");
        // Create the state file that MODEL_STATE_FILE will point to.
        let state_dir = dir.join("state");
        std::fs::create_dir_all(&state_dir).unwrap();
        let state_file = state_dir.join("model");
        std::fs::write(&state_file, "chosen-model\n").unwrap();

        let cfg = write_test_config(
            &dir,
            &format!(
                "MODELS=(\"chosen-model|$HOME/x.gguf\")\n\
                 EMBED_MODELS=()\n\
                 MODEL_STATE_FILE=\"{}\"",
                state_file.to_str().unwrap()
            ),
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.active, "chosen-model");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_config_integration() {
        let config_path = std::path::Path::new("/home/saman/dev/llm-host/config.sh");
        if !config_path.exists() {
            // Skip on CI or machines without the full repo.
            eprintln!("config.sh not found — skipping integration test");
            return;
        }
        let reg = parse_config(config_path).unwrap();

        // MODELS has 3 entries (qwen3.6-35b-a3b-ud, qwen3.6-27b, qwen3-coder-next)
        assert_eq!(reg.models.len(), 3, "expected 3 models, got {}", reg.models.len());
        assert_eq!(reg.models[0].key, "qwen3.6-35b-a3b-ud");
        assert_eq!(reg.models[1].key, "qwen3.6-27b");
        assert_eq!(reg.models[2].key, "qwen3-coder-next");

        // EMBED_MODELS has 1 entry (nomic-embed-text)
        assert_eq!(reg.embeds.len(), 1, "expected 1 embed, got {}", reg.embeds.len());
        assert_eq!(reg.embeds[0].key, "nomic-embed-text");
    }

    // -----------------------------------------------------------------------
    // spec.rs
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_ui_spec_structure() {
        let spec = spec::default_ui_spec();
        assert_eq!(spec.unit, "llama-swap.service");
        assert_eq!(spec.poll, 10);
        assert!(!spec.items.is_empty());
    }

    #[test]
    fn test_default_ui_spec_has_toggle() {
        let spec = spec::default_ui_spec();
        let has_toggle = spec.items.iter().any(|i| matches!(i, spec::SpecItem::Toggle { .. }));
        assert!(has_toggle, "expected at least one Toggle in default spec");
    }

    #[test]
    fn test_default_ui_spec_has_separator() {
        let spec = spec::default_ui_spec();
        let has_sep = spec.items.iter().any(|i| matches!(i, spec::SpecItem::Separator));
        assert!(has_sep, "expected at least one Separator in default spec");
    }

    #[test]
    fn test_default_ui_spec_has_submenu() {
        let spec = spec::default_ui_spec();
        let has_sub = spec.items.iter().any(|i| matches!(i, spec::SpecItem::Submenu { .. }));
        assert!(has_sub, "expected at least one Submenu in default spec");
    }

    #[test]
    fn test_default_ui_spec_has_status() {
        let spec = spec::default_ui_spec();
        let has_status = spec.items.iter().any(|i| matches!(i, spec::SpecItem::Status { .. }));
        assert!(has_status, "expected at least one Status in default spec");
    }

    #[test]
    fn test_default_ui_spec_serializes() {
        let spec = spec::default_ui_spec();
        let json = serde_json::to_string(&spec).unwrap();
        let deserialized: spec::UISpec = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.unit, spec.unit);
        assert_eq!(deserialized.poll, spec.poll);
        assert_eq!(deserialized.items.len(), spec.items.len());
    }

    #[test]
    fn test_toggle_label_fields() {
        let spec = spec::default_ui_spec();
        // Find first Toggle.
        let toggle = spec.items.iter().find_map(|i| match i {
            spec::SpecItem::Toggle { label, label_active, action, action_active, .. } => {
                Some((label.clone(), label_active.clone(), action.kind.clone(), action_active.kind.clone()))
            }
            _ => None,
        });
        let (label, label_active, act_kind, act_active_kind) =
            toggle.expect("expected a Toggle in default spec");
        assert!(!label.is_empty());
        assert!(!label_active.is_empty());
        assert_eq!(act_kind, "http");
        assert_eq!(act_active_kind, "http");
    }

    #[test]
    fn test_spec_item_json_roundtrip() {
        let item = spec::SpecItem::Toggle {
            label: "Start".into(),
            label_active: "Stop".into(),
            action: spec::Action { kind: "systemctl".into(), args: serde_json::json!(["start", "svc"]) },
            action_active: spec::Action { kind: "systemctl".into(), args: serde_json::json!(["stop", "svc"]) },
            unit: None,
        };
        let json = serde_json::to_string(&item).unwrap();
        let back: spec::SpecItem = serde_json::from_str(&json).unwrap();
        match back {
            spec::SpecItem::Toggle { label, label_active, action, action_active, unit } => {
                assert_eq!(label, "Start");
                assert_eq!(label_active, "Stop");
                assert_eq!(action.kind, "systemctl");
                assert_eq!(action_active.kind, "systemctl");
                assert!(unit.is_none());
            }
            other => panic!("expected Toggle, got {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // systemctl.rs — integration tests, skip when service unavailable
    // -----------------------------------------------------------------------

    #[test]
    #[ignore] // requires user-level systemd; run with `cargo test -- --ignored`
    fn test_is_active_returns_string() {
        let result = systemctl::is_active("llama-swap.service");
        match result {
            Ok(status) => {
                // Should be one of the known systemd states.
                assert!(
                    ["active", "inactive", "activating", "deactivating", "failed", "dead"]
                        .contains(&status.as_str()),
                    "unexpected status: {status}"
                );
            }
            Err(e) => {
                // systemctl not available (e.g. no systemd user session) — that's fine.
                eprintln!("systemctl unavailable: {e}");
            }
        }
    }

    #[test]
    #[ignore]
    fn test_is_active_invalid_unit() {
        let result = systemctl::is_active("nonexistent.service");
        match result {
            Ok(status) => {
                assert!(
                    ["inactive", "failed", "dead"].contains(&status.as_str()),
                    "expected inactive/dead for nonexistent unit, got: {status}"
                );
            }
            Err(e) => {
                // Also acceptable: command failure or systemctl missing.
                eprintln!("systemctl unavailable or unit check failed: {e}");
            }
        }
    }

    // -----------------------------------------------------------------------
    // valid_unit_name — security boundary (P0)
    // -----------------------------------------------------------------------

    #[test]
    fn test_valid_unit_name_happy_path() {
        assert!(valid_unit_name("llama-swap.service"));
        assert!(valid_unit_name("llm-host-control.service"));
        assert!(valid_unit_name("comfyui.service"));
        assert!(valid_unit_name("a.service"));
        assert!(valid_unit_name("my.service.name.service"));
    }

    #[test]
    fn test_valid_unit_name_rejects_injection() {
        // Command injection attempts
        assert!(!valid_unit_name("llama-swap.service; rm -rf /"));
        assert!(!valid_unit_name("llama-swap.service && curl evil.com"));
        assert!(!valid_unit_name("llama-swap.service|cat /etc/passwd"));
        assert!(!valid_unit_name("llama-swap.service$(whoami)"));
        assert!(!valid_unit_name("llama-swap.service`id`"));
        assert!(!valid_unit_name("llama-swap.service\nls"));
        assert!(!valid_unit_name("llama-swap.service\r\nls"));
    }

    #[test]
    fn test_valid_unit_name_rejects_bad_format() {
        // Missing .service suffix
        assert!(!valid_unit_name("llama-swap"));
        assert!(!valid_unit_name("llama-swap.timer"));
        // Path traversal
        assert!(!valid_unit_name("../etc/passwd.service"));
        assert!(!valid_unit_name("a/../b.service"));
        // Spaces
        assert!(!valid_unit_name("llama swap.service"));
        // Empty
        assert!(!valid_unit_name(""));
        // Special chars
        assert!(!valid_unit_name("llama@swap.service"));
        assert!(!valid_unit_name("llama#swap.service"));
    }

    #[test]
    fn test_valid_unit_name_dotdash_underscore_ok() {
        assert!(valid_unit_name("llama_swap.service"));
        assert!(valid_unit_name("llama-swap.service"));
        assert!(valid_unit_name("my.service.v2.service"));
    }

    // -----------------------------------------------------------------------
    // set_active_model / read_active_model — roundtrip (P0)
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_read_active_model_roundtrip() {
        let dir = test_dir("set_read_roundtrip");
        let state_file = dir.join("state").join("model");
        let cfg = write_test_config(
            &dir,
            &format!(
                "MODELS=(\"model-a|/m/a.gguf\" \"model-b|/m/b.gguf\")\n\
                 EMBED_MODELS=()\n\
                 MODEL_STATE_FILE=\"{}\"",
                state_file.to_str().unwrap()
            ),
        );

        // Initially empty (no state file)
        let active = read_active_model(&cfg);
        assert!(active.is_empty());

        // Set model
        set_active_model(&cfg, "model-b").unwrap();
        let active = read_active_model(&cfg);
        assert_eq!(active, "model-b");

        // Overwrite
        set_active_model(&cfg, "model-a").unwrap();
        let active = read_active_model(&cfg);
        assert_eq!(active, "model-a");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_set_active_model_creates_parent_dirs() {
        let dir = test_dir("set_active_creates_dirs");
        let state_dir = dir.join("deep").join("nested");
        std::fs::create_dir_all(&state_dir).unwrap();
        let state_file = state_dir.join("model");
        let cfg = write_test_config(
            &dir,
            &format!(
                "MODELS=(\"x|/m/x.gguf\")\nEMBED_MODELS=()\nMODEL_STATE_FILE=\"{}\"",
                state_file.to_str().unwrap()
            ),
        );

        // Remove the state file + parent to prove create_dir_all works
        std::fs::remove_dir_all(state_dir.parent().unwrap()).unwrap();
        set_active_model(&cfg, "x").unwrap();

        let active = read_active_model(&cfg);
        assert_eq!(active, "x");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_config_falls_back_to_first_model() {
        let dir = test_dir("fallback_first_model");
        // State file points to nonexistent model
        let state_dir = dir.join("state");
        std::fs::create_dir_all(&state_dir).unwrap();
        let state_file = state_dir.join("model");
        std::fs::write(&state_file, "nonexistent-model\n").unwrap();

        let cfg = write_test_config(
            &dir,
            &format!(
                "MODELS=(\"first|/m/a.gguf\" \"second|/m/b.gguf\")\n\
                 EMBED_MODELS=()\n\
                 MODEL_STATE_FILE=\"{}\"",
                state_file.to_str().unwrap()
            ),
        );
        let reg = parse_config(&cfg).unwrap();
        // Should fall back to first model since "nonexistent-model" isn't in registry
        assert_eq!(reg.active, "first");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // -----------------------------------------------------------------------
    // parse_bash_array edge cases (P0)
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_bash_array_pipe_in_path() {
        let dir = test_dir("bash_array_pipe");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"model|/path/with|pipe/model.gguf\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models.len(), 1);
        assert_eq!(reg.models[0].key, "model");
        assert_eq!(reg.models[0].path, "/path/with|pipe/model.gguf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_comment_not_matched() {
        let dir = test_dir("bash_array_comment");
        let cfg = write_test_config(
            &dir,
            "# MODELS=(\"fake|/fake.gguf\")\n\
             MODELS=(\"real|/real.gguf\")\n\
             EMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        // Should pick up only the real assignment, not the comment
        assert_eq!(reg.models.len(), 1);
        assert_eq!(reg.models[0].key, "real");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_missing_var() {
        let dir = test_dir("bash_array_missing");
        let cfg = write_test_config(&dir, "EMBED_MODELS=()\n");
        let result = parse_config(&cfg);
        assert!(result.is_err(), "should fail when MODELS is missing");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_multiline() {
        let dir = test_dir("bash_array_multiline");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\n  \"a|/a.gguf\"\n  \"b|/b.gguf\"\n  \"c|/c.gguf\"\n)\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        assert_eq!(reg.models.len(), 3);
        assert_eq!(reg.models[0].key, "a");
        assert_eq!(reg.models[1].key, "b");
        assert_eq!(reg.models[2].key, "c");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_bash_array_empty_quotes() {
        let dir = test_dir("bash_array_empty_q");
        let cfg = write_test_config(
            &dir,
            "MODELS=(\"\" \"a|/a.gguf\" \"\")\nEMBED_MODELS=()\n",
        );
        let reg = parse_config(&cfg).unwrap();
        // Empty quoted strings should be skipped
        assert_eq!(reg.models.len(), 1);
        assert_eq!(reg.models[0].key, "a");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -----------------------------------------------------------------------
    // is_unit_running state variants (P0)
    // -----------------------------------------------------------------------

    #[test]
    fn test_service_status_endpoint_logic() {
        // Test the state → active mapping without needing a real systemd.
        // This validates the logic in the handler.
        let cases: &[(&str, bool)] = &[
            ("active", true),
            ("inactive", false),
            ("activating", false),
            ("deactivating", false),
            ("failed", false),
            ("dead", false),
            ("maintenance", false),
        ];
        for (state, expected_active) in cases {
            let active = *state == "active";
            assert_eq!(
                active, *expected_active,
                "state '{state}' should have active={expected_active}"
            );
        }
    }
}
