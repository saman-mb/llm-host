export const mermaidDiagram = `
flowchart TB
    subgraph Clients
        OC["OpenCode TUI<br/>(localhost)"]
        NAS["Hermes Agent<br/>(on NAS, over LAN)"]
    end

    subgraph FD["Framework Desktop · Fedora 44"]
        FW["firewalld :8080/tcp<br/>+ avahi (mDNS: framework.local)"]

        subgraph SD["systemd --user (linger=on)"]
            SVC["llama-server.service<br/>Restart=always<br/>ExecStart=bin/serve"]
        end

        subgraph TBX["Toolbx container · podman (rootless)<br/>image: kyuz0/amd-strix-halo-toolboxes:vulkan-radv"]
            LS["llama-server<br/>(llama.cpp HTTP server)<br/>OpenAI-compatible /v1 API"]
        end

        subgraph HW["AMD Strix Halo APU"]
            GPU["Radeon 8060S iGPU<br/>gfx1151 · 40 CUs"]
            MEM["Unified Memory<br/>125 GB LPDDR5<br/>GTT cap: 124 GB"]
            GPU -.shares.-> MEM
        end

        MODEL[("Qwen3.6-35B-A3B<br/>UD-Q8_K_XL · GGUF<br/>~38 GB on NVMe")]

        SVC --> TBX
        TBX --> LS
        LS -- "Vulkan RADV" --> GPU
        MODEL -- "loaded into GTT<br/>(--no-mmap)" --> MEM
    end

    OC -- "HTTP localhost:8080/v1" --> FW
    NAS -- "HTTP framework.local:8080/v1" --> FW
    FW --> SVC

    classDef cli fill:#1e3a5f,stroke:#4a90e2,color:#fff
    classDef fed fill:#2d4a2e,stroke:#5cb85c,color:#fff
    classDef hw fill:#5c3a1e,stroke:#d68910,color:#fff
    classDef model fill:#3b1e5c,stroke:#9b59b6,color:#fff
    class OC,NAS cli
    class FW,SVC,LS,TBX fed
    class GPU,MEM hw
    class MODEL model
`;
