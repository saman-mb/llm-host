# Agent Instructions

## Model Sync

When adding, removing, or changing models in `config.sh`, always run:

```
scripts/sync-opencode-models.sh
```

This syncs the model registry into `~/.config/opencode/opencode.json` so opencode
picks up the changes. Run it after any edit to the `MODELS` array in `config.sh`.

Use `--dry-run` to preview changes without writing.
