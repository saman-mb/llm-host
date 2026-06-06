export const mermaidDiagram = `
flowchart TB
    %% ── Clients ──
    subgraph Clients["Clients"]
        OC["<div style='text-align:left;line-height:1.6'><strong>OpenCode TUI</strong><br/><span style='opacity:.65;font-size:10px'>localhost</span></div>"]
        NAS["<div style='text-align:left;line-height:1.6'><strong>Hermes Agent</strong><br/><span style='opacity:.65;font-size:10px'>NAS &#183; over LAN</span></div>"]
    end

    %% ── Framework Desktop (Fedora 44) ──
    subgraph FD["Framework Desktop &#183; Fedora 44"]
        subgraph FW_SUB["Network Boundary"]
            FW["<div style='text-align:left;line-height:1.6'><strong>firewalld</strong><br/><span style='opacity:.65;font-size:10px'>:8080/tcp &#183; avahi mDNS</span></div>"]
        end

        subgraph SD["systemd &#183; user session (linger=on)"]
            SVC["<div style='text-align:left;line-height:1.6'><strong>llama-swap.service</strong><br/><span style='opacity:.65;font-size:10px'>Restart=always &#183; router</span></div>"]
        end

        subgraph TBX["Toolbx container &#183; podman (rootless)"]
            LS["<div style='text-align:left;line-height:1.6'><strong>llama-server</strong><br/><span style='opacity:.65;font-size:10px'>llama.cpp &#183; OpenAI /v1 API</span></div>"]
        end

        subgraph HW["AMD Strix Halo APU"]
            GPU["<div style='text-align:left;line-height:1.6'><strong>Radeon 8060S</strong><br/><span style='opacity:.65;font-size:10px'>40 CUs &#183; RDNA 3.5</span></div>"]
            MEM["<div style='text-align:left;line-height:1.6'><strong>Unified Memory</strong><br/><span style='opacity:.65;font-size:10px'>125 GB LPDDR5</span></div>"]
            GPU -. shares .-> MEM

            MODEL{{"<div style='text-align:left;line-height:1.6'><strong>Qwen3.6-35B-A3B</strong><br/><span style='opacity:.65;font-size:10px'>UD-Q8_K_XL &#183; GGUF &#183; ~38 GB</span></div>"}}
        end

        SVC -. runs in .-> LS
        LS -- "Vulkan RADV" --> GPU
        MODEL -- "loaded into GTT" --> MEM
    end

    %% Client connections
    OC -- "HTTP :8080" --> FW
    NAS -- "HTTP framework.local:8080" --> FW
    FW --> SVC

    %% ── Class Definitions ──
    classDef cli fill:#1e3a5f,stroke:#60a5fa,color:#f1f5f9,stroke-width:1.5px
    classDef fed fill:#1a2e1a,stroke:#4ade80,color:#f1f5f9,stroke-width:1.5px
    classDef hw fill:#3d2214,stroke:#f59e0b,color:#f1f5f9,stroke-width:2px
    classDef model fill:#3b1f5e,stroke:#a78bfa,color:#f1f5f9,stroke-width:2px
    classDef cluster fill:none,stroke:none,color:#94a3b8
    classDef note fill:none,stroke:none,color:#64748b,font-style:italic,font-size:10px

    class Clients,FW_SUB,SD,TBX,HW cluster
    class OC,NAS cli
    class FW,SVC,LS fed
    class GPU,MEM hw
    class MODEL model
`;
