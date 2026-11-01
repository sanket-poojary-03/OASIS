# Engine / DCC Agent Tools for LLM-Driven 3D Scene & World Building (catalog, as of 2026-11-01)

Note on star counts: unless stated otherwise, stars / created / last-push dates were pulled live from the GitHub REST API (api.github.com/repos/{owner}/{repo}) on 2026-11-01 and are cited to the repo URL. The API rate limit ran out partway through, so some repos (marked "stars n/a") have no verified count.

## Q1. MCP servers and plugins per engine (Blender, Unity, Unreal, Godot, Roblox, three.js, Omniverse/USD)

### Takeaway
The MCP "editor bridge" pattern is now the main way LLMs build scenes inside engines. An in-editor plugin or addon opens a socket or WebSocket, and an MCP server exposes tools such as create/transform objects, run arbitrary scripts, take screenshots and import assets. blender-mcp (~32.9k stars) and CoplayDev unity-mcp (~15.6k stars) lead by a wide margin. Unreal and Godot are crowded and fragmented, with many forks. Roblox and NVIDIA (Omniverse) now ship official MCP servers.

### Cited Findings

**Blender**
- **blender-mcp / "MCP for Blender"**: author Siddharth Ahuja (ahujasid). The repo has been renamed to `ahujasid/mcp-for-blender` (the old URL redirects). 32,939 stars, created 2025-03-07, last push 2026-10-29. "Community plugin to control Blender 3D with any LLM of your choice", MIT license — [GitHub](https://github.com/ahujasid/blender-mcp)
  - How it works: a Blender addon (`addon.py`) runs a socket server inside Blender. A separate MCP server (`src/blender_mcp/server.py`) talks to it with JSON over TCP — [GitHub](https://github.com/ahujasid/blender-mcp)
  - Tools: `get_scene_info`, `execute_blender_code` (runs arbitrary Python in the live session), a `look` tool (viewport, camera, multi-angle and wireframe renders), Poly Haven HDRI/texture/model import, Sketchfab search/import, Poly Pizza low-poly models, and AI asset generation through Hyper3D Rodin, Hunyuan3D, Meshy and Tripo. There is an optional "safe mode" that screens scripts before they run — [GitHub](https://github.com/ahujasid/blender-mcp)
  - Can generate: full scenes by composing primitives, code, downloaded assets and AI-generated meshes. It is the most complete "generate an asset, then place it" loop found.
- **BlenderGPT (gd3kr)**: 4,998 stars, created 2023-03-21, last push 2024-06-05 (dormant). "Use commands in English to control Blender with OpenAI's GPT-4". It generates and runs Blender Python — [GitHub](https://github.com/gd3kr/BlenderGPT)
- **Blender Copilot (pramishp)**: a BlenderGPT fork with prompt engineering for color and material fixes. The README still describes GPT-3, so it is likely dated — [GitHub](https://github.com/pramishp/BlenderCopilot)
- **Blend(AI)r (MATJAM16/blender-ai-addon)**: sends prompts to an LLM and runs the returned Blender Python. Supports OpenAI, Anthropic, Ollama and LM Studio, with optional BlenderMCP integration — [GitHub](https://github.com/MATJAM16/blender-ai-addon)
- **AI Copilot for Blender (BlenderGPT3D/blender-ai-addon)**: a sidebar panel backed by a local `opencode` agent server. Shell access is blocked, Ollama local models and vision input are supported, and the wiki is in Russian — [GitHub wiki](https://github.com/BlenderGPT3D/blender-ai-addon/wiki)
- **blender-llm-addin (mac999)**: text-to-3D-model addin using Ollama (Gemma, Phi, Qwen2.5) or OpenAI GPT — [GitHub](https://github.com/mac999/blender-llm-addin)

**Unity**
- **MCP for Unity (CoplayDev/unity-mcp)**: 15,600 stars, created 2025-03-18, last push 2026-10-30. "Bridge between AI assistants and your Unity Editor... manage assets, control scenes, edit scripts" — [GitHub](https://github.com/CoplayDev/unity-mcp)
  - Has "50 focused MCP tool entrypoints": scene and GameObject creation, C# script editing, assets, tests, profiling, builds, plus tool groups for vfx, animation and UI. Architecture is a Unity package (`MCPForUnity`, installed via git URL or OpenUPM) plus a Python server run with `uv` (Python 3.10+). Supports Unity 2021.3 LTS through 6.x. MIT license. Latest version v10.3.0, dated 2026-10-04. "Sponsored and maintained by" Aura. The citation block lists Shutong Wu and Justin P. Barnett as paper authors — [GitHub](https://github.com/CoplayDev/unity-mcp)
- **Unity-MCP (IvanMurzak)**: 4,562 stars, created 2025-04-02, last push 2026-10-31. Offers "AI Skills, MCP Tools, and CLI for Unity Engine... Any C# method may be turned into a tool by a single line." Free — [GitHub](https://github.com/IvanMurzak/Unity-MCP)
- **mcp-unity (CoderGamester)**: 2,011 stars, created 2025-03-13, last push 2026-10-11. An MCP plugin for the Unity Editor aimed at Cursor, Claude Code, Codex and Windsurf — [GitHub](https://github.com/CoderGamester/mcp-unity)

**Unreal Engine**
- **unreal-mcp (chongdashu)**: 2,109 stars, created 2025-03-28, last push 2025-04-22 (stale since spring 2025). Natural-language control of UE through MCP — [GitHub](https://github.com/chongdashu/unreal-mcp)
- **unreal-engine-mcp (flopperam)**: 1,115 stars, created 2025-08-06, last push 2026-06-26. The README says "This MCP is now owned by Aura." Forks of it describe level-design tools (maze generator, pyramid, wall builder, town and house construction) for UE 5.5+, with prompts like "Create entire towns, medieval castles, modern mansions" — [GitHub](https://github.com/flopperam/unreal-engine-mcp); [fork egraika](https://github.com/egraika/unreal-engine-mcp); [fork 18163623522](https://github.com/18163623522/unreal-engine-mcp); [fork unknown-sh (example "Build a massive futuristic city")](https://github.com/unknown-sh/unreal-engine-mcp)
- **Unreal_mcp (ChiR24)**: 1,000 stars, created 2025-09-07, last push 2026-10-30. Uses a native C++ "Automation Bridge" plugin. The wiki claims coverage of UE 5.0–5.8, including levels, Blueprints, UI and materials, and it ships as an npm package — [GitHub](https://github.com/ChiR24/Unreal_mcp); [wiki](https://github.com/ChiR24/Unreal_mcp/wiki/Home)
- **ue-mcp (db-lyon)**: 462 stars, created 2026-02-24, last push 2026-10-31. "Complete Unreal Engine development toolkit exposed as MCP tools" (levels, Blueprints, materials, landscape) — [GitHub](https://github.com/db-lyon/ue-mcp)
- **UnrealMCP (kvick-games)**: 613 stars, created 2025-03-12, last push 2025-06-22 — [GitHub](https://github.com/kvick-games/UnrealMCP)
- **unreal-mcp (runreal)**: 117 stars, built on Unreal Python Remote Execution, last push 2025-06-06 — [GitHub](https://github.com/runreal/unreal-mcp)
- **GenOrca/unreal-mcp**: tools for actors, Blueprints, Behavior Trees and level management, with Python and C++ custom tools (stars n/a) — [GitHub](https://github.com/GenOrca/unreal-mcp)
- **Deepesh70/Unreal-MCP**: "AI-powered real-time level editing, material generation, and scene orchestration" over the Web Remote Control API, UE 5.0–5.6+. Documented in a research paper (stars n/a) — [GitHub](https://github.com/Deepesh70/Unreal-MCP)
- **vhcilab-unreal-engine-mcp (gingerol)**: "MCP server for natural language scene building in Unreal Engine" — [GitHub](https://github.com/gingerol/vhcilab-unreal-engine-mcp)

**Godot**
- **godot-mcp (Coding-Solo)**: 6,460 stars, created 2025-02-26, last push 2026-04-16. Launches the editor, runs projects, captures debug output, creates scenes with a chosen root node type and adds nodes — [GitHub](https://github.com/Coding-Solo/godot-mcp); [3daistudio guide](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/godot-mcp)
- **Godot-MCP (ee0pdt)**: 621 stars, created 2025-02-27, last push 2025-03-19 (stale). "Create and edit games in Godot with tools like Claude" — [GitHub](https://github.com/ee0pdt/Godot-MCP)
- **Godot MCP Pro**: WebSocket bridge into the Godot 4 editor with 162 tools (scene creation, scripts, input simulation, screenshots, play-testing). Needs Godot 4.4+ and Node 18+ — [Godot Forum](https://forum.godotengine.org/t/godot-mcp-pro-162-tools-for-ai-powered-godot-development/135467)
- **Godot AI (dlight)**: plugin with 46 tools and 120+ operations (build scenes, edit nodes and scripts, wire signals). Requires Godot 4.7+ — [Godot Asset Store](https://store.godotengine.org/asset/dlight/godot-ai/)
- **Godot-MCP (PurpleJelly)**: 84 tools in 16 categories, Godot 4.3–4.7 — [itch.io](https://purplejelly.itch.io/godot-mcp)
- **Godot MCP Toolkit (npgamedev)**: Godot 4.2–4.7, Node 22+ bridge — [Godot Asset Store](https://store.godotengine.org/asset/npgamedev/godot-mcp-toolkit/)
- **Godot-MCP (IvanMurzak)**: C# addon that needs the Godot 4.3+ mono build — [wiki](https://github.com/IvanMurzak/Godot-MCP/wiki)
- Other repos found: [invokable/godot-mcp](https://github.com/invokable/godot-mcp), [hybridindie/godot-mcp](https://github.com/hybridindie/godot-mcp)
- A third-party 2026 guide says the Godot Foundation does not publish an official MCP server (unverified claim) — [3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/godot-mcp)

**Roblox**
- **studio-rust-mcp-server (Roblox, official)**: 499 stars, created 2025-05-09, last push 2026-04-03. "Standalone Roblox Studio MCP Server" — [GitHub](https://github.com/Roblox/studio-rust-mcp-server)
- Roblox Studio now has a **built-in MCP server** plus playtest automation. Roblox calls it the recommended route, and the open-source server stays available for people who want to customize it — [Roblox DevForum](https://devforum.roblox.com/t/assistant-updates-studio-built-in-mcp-server-and-playtest-automation/4474643)
- **Roblox Assistant** is getting a planning mode, procedural models ("3D objects defined by code rather than static meshes", described as arriving soon), mesh generation, self-correcting agent loops, and MCP integration with Claude, Cursor and Codex — [The Next Web](https://thenextweb.com/news/roblox-ai-assistant-agentic-tools-planning-procedural-models); [GamesHub](https://www.gameshub.com/news/article/roblox-ai-assistant-procedural-creation-tools-developers-2867293/)
- **Cube 3D**: Roblox foundation model announced and open-sourced in March 2025. "4D" interactive generation followed in February 2026 — [Wikipedia](https://en.wikipedia.org/wiki/Cube_3D). Secondary sources say the weights are under a research-only license (unverified) — [npcmotion](https://www.npcmotion.com/blog/roblox-ai-tools)
- **robloxstudio-mcp (boshyxd)**: 499 stars, created 2025-06-07, last push 2026-06-06. "Create agentic AI workflows in ROBLOX Studio" — [GitHub](https://github.com/boshyxd/robloxstudio-mcp)
- **rbx-studio-mcp (EL4CTEO)**: free and MIT-licensed, with 35 tools, a console panel that runs coding agents, and editor-safe script edits — [GitHub](https://github.com/EL4CTEO/rbx-studio-mcp)
- **BloxBot**: free open-source desktop app that connects any LLM to the official Roblox Studio MCP — [bloxbot.ai](https://bloxbot.ai/)

**three.js / web**
- **scene-mcp (nirholas, `@three-ws/scene-mcp`)**: `compose_scene` turns one sentence into a placed diorama plan (mood, palette, and single-object "forge" prompts). `build_world` runs the full pipeline server-side, and `export_scene` merges the result into one glTF — [GitHub](https://github.com/nirholas/scene-mcp)
- **threejs-devtools-mcp (DmitriyGolub)**: inspects and edits a live three.js scene (materials, shaders, lights) over a WebSocket bridge — [GitHub](https://github.com/DmitriyGolub/threejs-devtools-mcp)
- **modelcontextprotocol/ext-apps threejs-server**: official MCP Apps example that renders three.js code the model writes, with a streaming preview — [GitHub](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/threejs-server)
- **three-js-mcp (locchung)**: 29 stars, created and last pushed 2025-03-23. "Only basic function" — [GitHub](https://github.com/locchung/three-js-mcp)
- **mcp-threejs (baryhuang)**: finds pre-built models through the Sketchfab API — [GitHub](https://github.com/baryhuang/mcp-threejs)
- Glama also lists [CharlieKerfoot/threejs-mcp](https://glama.ai/mcp/servers/CharlieKerfoot/threejs-mcp)

**Omniverse / OpenUSD**
- **kit-usd-agents (NVIDIA-Omniverse)**: 116 stars, created 2025-08-06, last push 2026-10-13. "The base repository to build OmniverseKit USD agents" — [GitHub](https://github.com/NVIDIA-Omniverse/kit-usd-agents)
  - **Chat USD**: an assistant inside Omniverse Kit that generates and runs USD Python from natural language, plus asset search, scene analysis and real-time editing. It is built on the LC Agent multi-agent framework — [Chat USD README](https://github.com/NVIDIA-Omniverse/kit-usd-agents/blob/main/source/extensions/omni.ai.chat_usd.bundle/docs/README.md)
  - Four standalone MCP servers (Kit, USD Code, OmniUI and others) for Claude and Cursor: API browsing, method signatures, code examples and semantic search — [kit_mcp README](https://github.com/NVIDIA-Omniverse/kit-usd-agents/blob/main/source/mcp/kit_mcp/README.md); [NVIDIA dev blog](https://developer.nvidia.com/blog/integrate-physical-ai-capabilities-into-existing-apps-with-nvidia-omniverse-libraries/)
- **usd-content-agents (NVIDIA-Omniverse)**: VLM agents for material assignment, physics-property classification and texture generation on USD files. These enrich content rather than lay out scenes — [GitHub](https://github.com/NVIDIA-Omniverse/usd-content-agents)

### Inferences
- Nearly every editor MCP has an "execute arbitrary script" escape hatch (Blender Python, Unity C#, Unreal Python/C++, USD Python, Luau). In practice, scene generation means the LLM writes code against the engine API and checks the result with screenshots. Purpose-built level tools (the flopperam maze, town and castle builders) are the exception.
- Aura (tryaura.dev) now owns or sponsors both the top Unity MCP (CoplayDev) and the flopperam Unreal MCP. That suggests commercial consolidation of the leading open-source engine bridges.
- Several early-2025 repos (chongdashu/unreal-mcp, ee0pdt/Godot-MCP, locchung three.js, BlenderGPT) are popular but inactive. Activity in 2026 has moved to ChiR24, db-lyon, IvanMurzak, CoplayDev and the official Roblox and NVIDIA servers.

### Gaps
- No verified star counts for GenOrca, Deepesh70, EL4CTEO, scene-mcp, threejs-devtools-mcp or IvanMurzak/Godot-MCP (API rate limit).
- Registry listings (mcp.so, smithery) were not checked directly. Only Glama, PulseMCP and LobeHub listings appeared in search results.
- No official Unity Technologies MCP and no official Epic MCP server were confirmed in this session.

## Q2. LLM-based procedural world / level generators (Minecraft, 2D levels, 3D scene layout, Infinigen-style)

### Takeaway
Academic text-to-scene work mostly has Blender as its target or renderer (SceneCraft, LayoutGPT, Holodeck, 3D-GPT, SAGE). Minecraft has the most hobbyist "text to build" agents, built on Mineflayer bots, mods or MCP. Classic LLM level generators (MarioGPT, Word2World) are 2D and from 2023–2024. NVIDIA's SAGE (2026) is the most current released agentic indoor-scene generator found.

### Cited Findings

**3D scene layout / procedural (research code)**
- **Infinigen (princeton-vl)**: 7,372 stars, created 2023-06-17, last push 2026-10-14. "Infinite Photorealistic Worlds using Procedural Generation" (Blender-based) — [GitHub](https://github.com/princeton-vl/infinigen)
- **3D-GPT (Chuny1/3DGPT)**: 853 stars, created 2023-10-20, last push 2025-03-05. Cited as 3DV 2025 in a scene-generation survey — [GitHub](https://github.com/Chuny1/3DGPT); [Survey arXiv 2505.05474](https://arxiv.org/pdf/2505.05474)
- A 2025 Stanford CS231N project, "Language-Driven Primitive-Based 3D Scene Generation with Infinigen", runs all LLM reasoning across agents inside Blender — [PDF](https://cs231n.stanford.edu/2025/papers/text_file_840589358-CS231N_Final_Paper.pdf)
- **Holodeck (allenai)**: 580 stars, created 2023-12-08, last push 2025-04-02. "CVPR 2024: Language Guided Generation of 3D Embodied AI Environments" — [GitHub](https://github.com/allenai/Holodeck). It generates environments through multi-round LLM conversation, covering floor and wall texturing, doors and windows, and object selection and placement — [Survey](https://arxiv.org/pdf/2505.05474)
- **SceneCraft (Google, arXiv 2403.01248)**: an LLM agent that turns text into Blender Python, using a scene graph as a spatial blueprint. No official code repo was found — [arXiv](https://arxiv.org/abs/2403.01248)
- **LayoutGPT (UCSB-AI, NeurIPS 2023)**: 2D and 3D indoor layouts on 3D-FRONT, with an added Blender rendering script. The 3D pipeline makes one GPT-4 call (~25–30 s per scene) — [GitHub](https://github.com/UCSB-AI/LayoutGPT)
- **SAGE (NVlabs, 2026)**: "official code release" of an agentic indoor scene generator for embodied AI. It combines LLMs and VLMs with TRELLIS asset generation and comes with the SAGE-10k dataset. NVIDIA license, with some components under MIT — [GitHub](https://github.com/NVlabs/sage)
- **InteriorAgent (3DV 2026)**: an LLM agent that writes programs in an interior-design-aware scene description language. Code is "will be released" and is unconfirmed — [3DV 2026](https://www.computer.org/csdl/proceedings-article/3dv/2026/731200b436/2gPu1Aw1wbu); [PDF](https://cseweb.ucsd.edu/~ravir/kunal_3dv.pdf)
- **Code4Scene (arXiv 2026)**: a benchmark for coding agents that build and edit 3D scenes. Release planned — [arXiv](https://arxiv.org/html/2609.36777v1)
- **EZBlender (arXiv 2601.07143)**: a Plan-and-ReAct agent for 3D editing in Blender — [arXiv](https://arxiv.org/pdf/2601.07143)

**2D / tile level generation**
- **MarioGPT (shyamsn97)**: 1,155 stars, NeurIPS 2023, last push 2024-07-22. Generates Mario levels with a fine-tuned GPT-2 — [GitHub](https://github.com/shyamsn97/mario-gpt)
- **Word2World (umair-nasir14; Nasir, James, Togelius, May 2024)**: an LLM writes a story, extracts goals and tiles, and generates a 2D tile world as alphanumeric characters with a feedback loop. Supports OpenAI only (gpt-4-turbo recommended). No Unity or Blender integration — [arXiv](https://arxiv.org/abs/2405.06686v1); [GitHub](https://github.com/umair-nasir14/Word2World)
- **Word2Minecraft (JMZ-kk)**: a follow-up that turns stories into 3D Minecraft levels — [GitHub](https://github.com/JMZ-kk/Word2Minecraft); [arXiv 2503.16536](https://export.arxiv.org/pdf/2503.16536)

**Minecraft builders**
- **minecraftlm (mattzh72)**: "Generate minecraft worlds via natural language". The agent writes code, validates it and generates the structure in real time. GPLv3 — [GitHub](https://github.com/mattzh72/minecraftlm)
- **APT: Architectural Planning LLM Agent (spearsheep)**: chain-of-thought decomposition into layouts and blueprints. The paper claims complex builds including Redstone systems — [GitHub](https://github.com/spearsheep/APT-Architectural-Planning-LLM-Agent)
- **minecraft-agentic (NoblerWorks-HQ)**: a multi-agent LLM crew (Claude, Gemini or GPT) designs a build and four Mineflayer bots construct it while you watch in the browser. No Minecraft account needed — [GitHub](https://github.com/NoblerWorks-HQ/minecraft-agentic)
- **mcbuilder (lzif)**: Python builder DSL, block validator against the real registry, multi-format export and preview renderer for AI agents — [GitHub](https://github.com/lzif/mcbuilder)
- **Steve (YuvDwi)**: "Cursor for Minecraft", a Forge mod where multiple agents turn natural language into actions — [GitHub](https://github.com/YuvDwi/Steve)
- **moling-minecraft (gojue)**: Minecraft MCP server for "intelligent construction, building, and game control" — [GitHub](https://github.com/gojue/moling-minecraft)
- **BuilderGPT (CyniaAI)**: development paused, and the author points to the successor MineClawd — [GitHub](https://github.com/CyniaAI/BuilderGPT)
- **minecraft-use (okyssta)**: connects any LLM to any server — [GitHub](https://github.com/okyssta/minecraft-use)
- **Voyager (MineDojo)**: 7,304 stars, last push 2024-04-03. An open-ended embodied LLM agent for exploration and skills, not a structure builder — [GitHub](https://github.com/MineDojo/Voyager). GITM (OpenGVLab) is a related agent — [GitHub](https://github.com/opengvlab/gitm)

### Inferences
- From background knowledge (not re-verified this session), 3D-GPT uses multiple LLM agents to choose and parameterize Infinigen's procedural functions. That would make it the "LLM plus Infinigen" reference design the CS231N project follows.
- For Minecraft, there are two working approaches: (a) the LLM writes a build script or DSL that is validated and pasted in (minecraftlm, mcbuilder), and (b) the LLM plans while bots or mods place blocks (minecraft-agentic, Steve, mindcraft-style agents).

### Gaps
- No sources were retrieved for WorldSmith, GameGen/GameGen-X, Promptcraft, "Dream Machine" voxel tools, Dreamtopia or Rosebud, or LLM-driven procedural city generators. These remain uncovered.
- Code availability for SceneCraft, LayoutVLM and SceneSmith was not confirmed.
- kolbytn/mindcraft (a popular Minecraft LLM agent) was not verified (rate limit).

## Q3. Web three.js / WebGPU "prompt to world" demos and Gaussian-splat viewers

### Takeaway
No mature open-source project was found that turns one prompt into a playable three.js world end to end. The open stack is pieced together from Spark (World Labs' MIT three.js 3DGS renderer), proprietary world generators (World Labs Marble), community FPS demos, and MCP servers like scene-mcp.

### Cited Findings
- **Spark (sparkjs.dev, World Labs)**: a dynamic 3D Gaussian splatting renderer for THREE.js and WebGL2 that runs in any browser. With a few lines, splats can be added "even by vibe coding" — [Spark docs](https://sparkjs.dev/docs/overview/). Spark 2.0 adds streaming 3DGS worlds on the web — [World Labs blog](https://www.worldlabs.ai/blog/spark-2.0)
- **worldsplats (philchacko)**: Spark, three.js, React Three Fiber and Rapier physics with FPS controls. World generation depends on World Labs' beta generator — [GitHub](https://github.com/philchacko/worldsplats)
- A tutorial shows turning a World Labs splat into a first-person game with Spark and three.js, vibe-coded in Cursor — [YouTube](https://www.youtube.com/watch?v=d96QVyOjwZs); World Labs API examples — [docs](https://docs.worldlabs.ai/api/examples)
- **Promptable World (Pran-Ker/Hackathon)**: a hackathon prototype that builds an editable splat scene with a Spark.js viewer. It lists its own failure modes, such as narrow-baseline frames and diffusion's lack of hard 3D consistency — [GitHub](https://github.com/Pran-Ker/Hackathon)
- **scene-mcp / three.ws**: sentence to diorama plan to per-object generation to glTF (see Q1) — [GitHub](https://github.com/nirholas/scene-mcp)
- An X roundup lists "25 open source repos for vibe coding games". The search summary flagged it as unreliable because it mislabels three.js as a game generator — [X](https://x.com/meta_alchemist/article/2113952206546219207)

### Inferences
- The practical web pattern in 2026: generate a world (splat or mesh) with a proprietary or open model, render it with Spark/three.js, then have a coding agent add gameplay, colliders and controls. "Prompt to world" here means a world model plus vibe-coding, not a single repo.

### Gaps
- No verified data on open-source WebGPU-native prompt-to-world projects or Babylon.js MCP servers. Babylon.js was not found in any result.
- HunyuanWorld-1.0 (Tencent's open panorama-to-world model) was not verified this session (rate limit).

## Q4. Pipelines combining text→image→3D asset generation with automated scene placement

### Takeaway
The asset-generation half is mature and open (TRELLIS, TRELLIS.2, Hunyuan3D-2/2.1, TripoSR). Automated placement mostly happens through editor agents that call those generators as tools: blender-mcp (Hunyuan3D, Rodin, Meshy, Tripo), SAGE (TRELLIS), NVIDIA's 3D Object Generation Blueprint (TRELLIS into Blender) and scene-mcp. Standalone asset pipelines (AssetFurnace and others) stop at the asset and do not lay out scenes.

### Cited Findings
- **TRELLIS (Microsoft)**: 14,163 stars, created 2024-12-02, last push 2026-10-27. CVPR'25 Spotlight "Structured 3D Latents" — [GitHub](https://github.com/microsoft/TRELLIS). Text-to-3D is recommended via text-to-image first — [PyPI trellis-3d-ms](https://pypi.org/project/trellis-3d-ms/)
- **Hunyuan3D-2 (Tencent)**: 15,271 stars, created 2025-01-21, last push 2025-10-28 — [GitHub](https://github.com/Tencent-Hunyuan/Hunyuan3D-2). **Hunyuan3D-2.1** adds production-ready PBR materials — [GitHub](https://github.com/tencent-hunyuan/hunyuan3d-2.1)
- **TripoSR (VAST / Stability)**: 7,272 stars, created 2024-02-07, last push 2026-06-04. Fast single-image 3D reconstruction — [GitHub](https://github.com/VAST-AI-Research/TripoSR)
- **blender-mcp** integrates Hyper3D Rodin, Hunyuan3D, Meshy and Tripo generation alongside Poly Haven and Sketchfab import, so the LLM can generate an asset and place it in the same Blender session — [GitHub](https://github.com/ahujasid/blender-mcp)
- **NVIDIA AI Blueprint: 3D Object Generation**: Llama 3.1 8B plus TRELLIS, with Blender import of the generated assets. It produces objects, not full layouts — [GitHub](https://github.com/NVIDIA-AI-Blueprints/3d-object-generation)
- **SAGE (NVlabs)**: an agentic indoor-scene generator that integrates TRELLIS for assets — [GitHub](https://github.com/NVlabs/sage)
- **AssetFurnace (Bingeljell/image-to-3dlab)**: a local pipeline (README says Oct 2026) going from prompt or image to Qwen-Image to Pixal3D, TRELLIS.2, Hunyuan3D or SF3D, then auto-rig and 21 animations. Apache-2.0. Game characters, no scene layout — [GitHub](https://github.com/Bingeljell/image-to-3dlab)
- **TRELLIS.2-Text-to-3D-FA3 (PRITHIVSAKTHIUR)**: Z-Image-Turbo text-to-image, then TRELLIS.2 to GLB, as a Gradio app — [GitHub](https://github.com/PRITHIVSAKTHIUR/TRELLIS.2-Text-to-3D-FA3)
- Roblox Assistant is adding mesh generation and procedural models inside Studio (first-party, not open source) — [The Next Web](https://thenextweb.com/news/roblox-ai-assistant-agentic-tools-planning-procedural-models)

### Inferences
- The common "generate and place" design is: an LLM plans a scene graph or layout, calls an image-to-3D tool per object, then places the GLB/USD in an editor through MCP and checks the result visually. blender-mcp is the most widely adopted open implementation. SAGE is the research-grade one.
- Meshy, Rodin and Tripo are commercial APIs, so the fully open path is TRELLIS or Hunyuan3D run locally, wired into Blender (blender-mcp's Hunyuan3D option, the NVIDIA Blueprint) or a custom agent.

### Gaps
- No open-source tool was found that does automated generate-and-place directly inside Unity, Unreal or Godot (outside Blender and three.js). It may exist but did not appear in searches.
- Star counts for TRELLIS.2, Hunyuan3D-2.1, SAGE and the NVIDIA Blueprint were not verified (rate limit).
