#!/usr/bin/env node
// Unit tests for pure state helpers extracted from the GNOME Shell extension.
// Run: node tests/label-state-test.mjs

let passed = 0;
let failed = 0;

function assert(name, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS: ${name}`);
    } else {
        failed++;
        console.log(`  FAIL: ${name}`);
    }
}

// ---------------------------------------------------------------------------
// Inline copies of the pure helpers (same logic as extension.js)
// ---------------------------------------------------------------------------

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

function computeToggleLabel(state, spec) {
    const activating = state === 'activating' || state === 'reloading';
    const running = state === 'active' || activating;
    return {
        label: running ? (spec.labelActive || '') : (spec.label || ''),
        isRunning: running,
    };
}

// ---------------------------------------------------------------------------
// Tests: computeToggleLabel
// ---------------------------------------------------------------------------

console.log('=== Suite: computeToggleLabel ===');

const llmSpec = { label: 'Start LLM', labelActive: 'Stop LLM' };
const comfySpec = { label: 'Start ComfyUI', labelActive: 'Stop ComfyUI' };

assert('active → Stop LLM',
    computeToggleLabel('active', llmSpec).label === 'Stop LLM');
assert('active → isRunning=true',
    computeToggleLabel('active', llmSpec).isRunning === true);

assert('activating → Stop LLM',
    computeToggleLabel('activating', llmSpec).label === 'Stop LLM');
assert('activating → isRunning=true',
    computeToggleLabel('activating', llmSpec).isRunning === true);

assert('reloading → Stop LLM',
    computeToggleLabel('reloading', llmSpec).label === 'Stop LLM');
assert('reloading → isRunning=true',
    computeToggleLabel('reloading', llmSpec).isRunning === true);

assert('inactive → Start LLM',
    computeToggleLabel('inactive', llmSpec).label === 'Start LLM');
assert('inactive → isRunning=false',
    computeToggleLabel('inactive', llmSpec).isRunning === false);

assert('failed → Start LLM',
    computeToggleLabel('failed', llmSpec).label === 'Start LLM');
assert('failed → isRunning=false',
    computeToggleLabel('failed', llmSpec).isRunning === false);

assert('error → Start LLM',
    computeToggleLabel('error', llmSpec).label === 'Start LLM');
assert('error → isRunning=false',
    computeToggleLabel('error', llmSpec).isRunning === false);

assert('empty string → Start LLM',
    computeToggleLabel('', llmSpec).label === 'Start LLM');
assert('empty string → isRunning=false',
    computeToggleLabel('', llmSpec).isRunning === false);

assert('ComfyUI active → Stop ComfyUI',
    computeToggleLabel('active', comfySpec).label === 'Stop ComfyUI');
assert('ComfyUI inactive → Start ComfyUI',
    computeToggleLabel('inactive', comfySpec).label === 'Start ComfyUI');

assert('missing labelActive falls back to empty',
    computeToggleLabel('active', {}).label === '');
assert('missing label falls back to empty',
    computeToggleLabel('inactive', {}).label === '');

// ---------------------------------------------------------------------------
// Tests: collectUnits
// ---------------------------------------------------------------------------

console.log('\n=== Suite: collectUnits ===');

const specFull = {
    unit: 'llama-swap.service',
    items: [
        { type: 'toggle', unit: 'comfyui.service' },
        { type: 'submenu', items: [
            { type: 'toggle', unit: 'embed.service' },
        ]},
        { type: 'status', label: 'no unit' },
    ],
};

const units = collectUnits(specFull);
assert('collects primary unit', units.has('llama-swap.service'));
assert('collects toggle unit', units.has('comfyui.service'));
assert('collects nested toggle unit', units.has('embed.service'));
assert('3 units total', units.size === 3);

const specMinimal = { items: [] };
const unitsMin = collectUnits(specMinimal);
assert('defaults to llama-swap.service', unitsMin.has('llama-swap.service'));
assert('1 unit for minimal spec', unitsMin.size === 1);

const unitsNull = collectUnits(null);
assert('null spec → llama-swap.service', unitsNull.has('llama-swap.service'));

const specNoToggles = {
    unit: 'custom.service',
    items: [{ type: 'status', label: 'hi' }],
};
const unitsNoToggles = collectUnits(specNoToggles);
assert('primary unit from spec.unit', unitsNoToggles.has('custom.service'));
assert('1 unit when no toggles', unitsNoToggles.size === 1);

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
