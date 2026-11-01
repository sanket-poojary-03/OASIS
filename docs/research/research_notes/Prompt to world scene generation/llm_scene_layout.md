# Intelligent Scene Generation: LLM/VLM/Agent-Driven 3D Scene Layout, Composition and Arrangement

Notes compiled 2026-11-01. Sources were checked in three ways. Paper titles, first authors, dates and venue comments come from the arXiv API, queried by ID ([arXiv API batch query](https://export.arxiv.org/api/query)). Each arXiv link below goes to the abs page. GitHub star counts come from the GitHub REST API, queried on 2026-11-01; after about 35 repos the API hit its unauthenticated rate limit, so many newer repos have no star count ("stars n/a"). The 2025–2026 entries come mainly from the survey-linked awesome list [hzxie/Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation).

## Which projects use LLMs/VLMs/agents to plan or compose 3D scenes?

### Takeaway
More than 60 projects since 2023 use LLMs/VLMs/agents to plan or compose 3D scenes. They fall into a few families:
- (a) An LLM writes a scene graph or constraints, a solver places retrieved assets. Examples: Holodeck, I-Design, AnyHome, Open-Universe, LayoutVLM.
- (b) An LLM writes Blender or procedural code. Examples: 3D-GPT, SceneCraft, SceneX/CityX, WorldCraft, Scene Language, SceneCode, Code-as-Room.
- (c) A VLM renders the scene, critiques it and refines it in a loop. Examples: BlenderAlchemy, Scenethesis, SceneWeaver, SceneSmith, SAGE, SceneAssistant.
- (d) Fine-tuned or RL-trained LLMs output layouts directly. Examples: LLplace, MetaSpatial, DirectLayout, OptiScene, ReSpace, SceneReVis, NaLA.

These sit alongside non-LLM learned layout generators: ATISS, DiffuScene, CommonScenes, InstructScene, PhyScene, SceneFactor. In 2026 the frontier is hierarchical multi-agent, simulation-ready generation (SceneSmith, ICML 2026; SAGE, CVPR 2026; WorldClaw) and efficiency work that replaces slow generate-critique loops (SceneOrchestra, FuncRoom-Agent).

### Cited Findings

#### A. Foundational / pre-LLM learned layout generators (baselines everyone compares against)
- **ATISS** (NVIDIA Toronto / Paschalidou et al., NeurIPS 2021, 2021-10). An autoregressive transformer generates a room as an unordered set of objects, conditioned on room type and floor plan. Trained on 3D-FRONT, it retrieves 3D-FUTURE meshes. Code: nv-tlabs/ATISS, 343 stars, last pushed 2023. — [arXiv 2110.03675](https://arxiv.org/abs/2110.03675); [GitHub](https://github.com/nv-tlabs/ATISS)
- **DiffuScene** (Tang et al., CVPR 2024, 2023-03). A denoising diffusion model over unordered object attributes (location, size, orientation, semantics, shape features), followed by shape retrieval. Code: tangjiapeng/DiffuScene, 353 stars. — [arXiv 2303.14207](https://arxiv.org/abs/2303.14207); [GitHub](https://github.com/tangjiapeng/DiffuScene)
- **CommonScenes** (Zhai et al., TUM, NeurIPS 2023). Scene-graph diffusion converts a scene graph into a controllable 3D scene with generated shapes. It introduces the SG-FRONT dataset. Code: ymxlzgy/commonscenes, 96 stars. — [arXiv 2305.16283](https://arxiv.org/abs/2305.16283); [GitHub](https://github.com/ymxlzgy/commonscenes)
- **InstructScene** (Lin et al., ICLR 2024 spotlight). A semantic graph prior plus a layout decoder for instruction-driven indoor synthesis. Code: chenguolin/InstructScene, 157 stars. — [arXiv 2402.04717](https://arxiv.org/abs/2402.04717); [GitHub](https://github.com/chenguolin/InstructScene)
- **PhyScene** (Yang et al., BIGAI, CVPR 2024 Highlight). Conditional diffusion with physics and interactivity guidance, plus articulated objects, for embodied AI. Code: PhyScene/PhyScene, 215 stars. — [arXiv 2404.09465](https://arxiv.org/abs/2404.09465); [GitHub](https://github.com/PhyScene/PhyScene)
- **SceneFactor** (Bokhovkin et al., CVPR 2025). Factored latent 3D diffusion: text produces a semantic box proxy, then geometry, which allows localized editing. Code: alexeybokhovkin/SceneFactor. — [arXiv 2412.01801](https://arxiv.org/abs/2412.01801)
- More 2025–26 scene-graph and diffusion layout work: MMGDreamer (AAAI 2025), FreeScene (CVPR 2025), CASAGPT (CVPR 2025), Steerable Scene Generation (CoRL 2025, nepfaff), SemLayoutDiff (3DV 2026), CasLayout (TOG 2026), LaviGen (CVPR 2026, repurposes a 3D generative model for autoregressive layout). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### B. LLM → layout / scene graph / constraints → solver → asset retrieval
- **LayoutGPT** (Feng et al., UCSB, NeurIPS 2023, 2023-05). In-context demonstrations written in a CSS-like "style sheet language" let an LLM act as a visual planner. It produces 2D image layouts and 3D indoor layouts on 3D-FRONT. Code: weixi-feng/LayoutGPT; the API reports the repo was moved/renamed, and its star count was not retrieved. — [arXiv 2305.15393](https://arxiv.org/abs/2305.15393)
- **Holodeck** (Yang et al., UPenn + AllenAI, CVPR 2024, 2023-12). GPT-4 supplies common-sense knowledge and spatial relational constraints. Assets are retrieved from Objaverse (through the objathor asset pack), and the layout is optimized to satisfy the constraints. The README recommends the DFS solver; an earlier MILP solver can be enabled with `--use_milp`. Output is AI2-THOR scene JSON loaded in Unity 2020.3.25f1. The current code needs an OpenAI key and `gpt-4o-2024-05-13`. Licence Apache-2.0; 580 stars. In a human study, annotators preferred it over procedural baselines for residential scenes, and it was used to train navigation agents for novel scene types (music rooms, daycares) without human-built training data. — [arXiv 2312.09067](https://arxiv.org/abs/2312.09067); [GitHub](https://github.com/allenai/Holodeck)
- **AnyHome** (Fu et al., Brown, ECCV 2024). An LLM turns text narratives into amodal structured representations (house layout plus templates), which constrain mesh synthesis. SDS then refines the geometry, and egocentric inpainting adds textures. Code: FreddieRao/anyhome_github, 79 stars. — [arXiv 2312.06644](https://arxiv.org/abs/2312.06644); [GitHub](https://github.com/FreddieRao/anyhome_github)
- **I-Design** (Çelen et al., ETH Zürich, 2024-04). A team of LLM agents talks through a design and produces a scene graph. Placement is then solved and Objaverse assets retrieved. Code: atcelen/IDesign, 106 stars. — [arXiv 2404.02838](https://arxiv.org/abs/2404.02838); [GitHub](https://github.com/atcelen/IDesign)
- **Open-Universe Indoor Scene Generation** (Aguina-Kang et al., Brown/Adobe, 2024-02). An LLM synthesizes programs in a domain-specific layout language (objects plus spatial relations). Executing a program yields constraints, which are solved, and objects are retrieved from uncurated databases. No training scene dataset is needed. Code availability: not verified. — [arXiv 2403.09675](https://arxiv.org/abs/2403.09675)
- **LayoutVLM** (Sun et al., Stanford, CVPR 2025). A VLM produces both initial numeric poses and differentiable spatial-relation objectives. Joint differentiable optimization then ensures physical plausibility. Code: sunfanyunn/LayoutVLM, 179 stars. — [arXiv 2412.02193](https://arxiv.org/abs/2412.02193); [GitHub](https://github.com/sunfanyunn/LayoutVLM)
- **FirePlace** (Huang et al., Stanford/Google, 2025-03). An MLLM extracts geometric details from the scene, then builds and solves geometric constraints for object placement, pruned by common-sense reasoning. — [arXiv 2503.04919](https://arxiv.org/abs/2503.04919)
- **Chat2Layout** (Wang et al., 2024-07). An interactive MLLM furniture-layout system with a vision-question in-context paradigm and feedback-driven refinement. — [arXiv 2407.21333](https://arxiv.org/abs/2407.21333)
- **Hierarchically-Structured Open-Vocabulary Indoor Scene Synthesis** (AAAI 2025); **Global-Local Tree Search in VLMs** (CVPR 2025, dw-dengwei/TreeSearchGen); **DisCo-Layout** (multi-agent, 2025); **HOG-Layout** (CVPR 2026); **ZoneMaestro / Zone-Graph** (ICML 2026); **R³L** (ICML 2026, relative spatial relations); **Function2Scene** (2026); **LabBuilder** (ICML 2026, protocol-grounded lab layouts); **Global Graph-Validated Optimization for VLM-based indoor scene generation** (ECCV 2026). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### C. LLM writes Blender / procedural / DSL code ("code-as-scene")
- **3D-GPT** (Sun et al., ANU/Oxford, 3DV 2025, 2023-10). Three LLM agents (task dispatch, conceptualization, modeling) drive procedural generation; it builds on Infinigen's Blender procedural generators. Code: Chuny1/3DGPT, 853 stars. — [arXiv 2310.12945](https://arxiv.org/abs/2310.12945); [GitHub](https://github.com/Chuny1/3DGPT)
- **SceneCraft (LLM agent)** (Hu et al., 2024-03; ICML 2024 per common citation, not stated in the arXiv comment). It first models a scene graph as a blueprint, then writes Blender Python that turns relations into numeric layout constraints. A VLM (GPT-V) critiques the renders, and a "library learning" step accumulates reusable functions. I could not verify an official code release. — [arXiv 2403.01248](https://arxiv.org/abs/2403.01248)
  - Name collision: **SceneCraft (NeurIPS 2024)** by Yang et al. is a different work, layout-guided 3DGS room generation (OrangeSodahub/SceneCraft, 247 stars). — [GitHub](https://github.com/OrangeSodahub/SceneCraft)
- **BlenderAlchemy** (Huang et al., Stanford, ECCV 2024 per common citation, 2024-04). GPT-4V searches the Blender edit-action space: it edits material and lighting programs, renders them, and compares against the user's intent through a visual "imagination". The guessed repo path `ianhuang0630/BlenderAlchemy` returned 404, so the code location was not verified. — [arXiv 2404.17672](https://arxiv.org/abs/2404.17672)
- **SceneX** (Zhou et al., AAAI 2025, 2024-03). An LLM maps designer text to procedural (PCG) Blender models for large-scale scenes. Code: zhouzq1/SceneX. **CityX** (Zhang et al., 2024-07) extends this to controllable PCG of unbounded, simulation-ready cities. — [arXiv 2403.15698](https://arxiv.org/abs/2403.15698); [arXiv 2407.17572](https://arxiv.org/abs/2407.17572)
- **WorldCraft** (Liu et al., 2025-02). A coordinator agent plus specialized LLM agents use procedural generation for indoor and outdoor scenes, with natural-language control over individual objects and the layout. — [arXiv 2502.15601](https://arxiv.org/abs/2502.15601)
- **The Scene Language** (Zhang et al., Stanford, CVPR 2025). Represents a scene as a program (hierarchy and relations), words (semantics) and embeddings (identity), inferred training-free from LLMs. It renders with traditional, neural or mixed renderers. Code: zzyunzhi/scene-language. — [arXiv 2410.16770](https://arxiv.org/abs/2410.16770)
- **SceneMotifCoder (SMC)** (Tam et al., SFU 3DLG, 3DV 2025 Oral). An LLM learns visual programs from example arrangements, generalizes them into meta-programs, and combines them with retrieval and geometry-aware optimization. Code: 3dlg-hcvc/smc, 47 stars. — [arXiv 2408.02211](https://arxiv.org/abs/2408.02211); [GitHub](https://github.com/3dlg-hcvc/smc)
- **HSM: Hierarchical Scene Motifs** (Pun et al., SFU, 3DV 2026). A hierarchical framework that places dense small objects on supporting surfaces across scales. Code: 3dlg-hcvc/hsm, 43 stars. — [arXiv 2503.16848](https://arxiv.org/abs/2503.16848); [GitHub](https://github.com/3dlg-hcvc/hsm)
- **LL3M** (Lu et al., UChicago 3DL, 2025-08). LLM agents plan, retrieve, write, debug and refine Blender scripts. This is asset-level rather than layout, but it is the same code-as-3D pattern. — [arXiv 2508.08228](https://arxiv.org/abs/2508.08228)
- 2026 code/DSL wave:
  - **SceneCode** (2026-05) compiles natural language into executable world programs, including articulated objects generated on demand.
  - **Code-as-Room** (2026-05) does agentic code synthesis from top-down images.
  - **SpatialGrammar** (2026) is a DSL for LLM indoor generation.
  - **FuncRoom-Agent** (2026-08) uses a learned generator for a recursive DSL, executed deterministically with no generate-evaluate-revise loop.
  - **Code2Worlds** (ICML 2026) uses coding LLMs for 4D worlds.
  - **4DSynth** (2026) does procedural synthesis for dynamic embodied simulation.
  - Sources: [arXiv 2605.19587](https://arxiv.org/abs/2605.19587); [arXiv 2608.29519](https://arxiv.org/abs/2608.29519); [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### D. VLM-in-the-loop / agentic frameworks
- **Scenethesis** (Ling et al., NVIDIA, ICLR 2026, 2025-05). Training-free and agentic: an LLM drafts a coarse layout, vision perception (image generation plus guidance) refines it, an optimization step enforces physical plausibility, and a judge verifies the result. Project page: research.nvidia.com/labs/dir/scenethesis. No code found. — [arXiv 2505.02836](https://arxiv.org/abs/2505.02836)
- **Agentic 3D Scene Generation with Spatially Contextualized VLMs** (Liu et al., 2025-05). Injects an evolving spatial context into the VLM so it can generate, understand and edit 3D environments: a scene portrait, a semantically labeled point cloud and a scene hypergraph. — [arXiv 2505.20129](https://arxiv.org/abs/2505.20129)
- **SceneWeaver** (Yang et al., BIGAI, NeurIPS 2025). A reflective LLM planner unifies diverse synthesis tools (data-driven, LLM-based and procedural generators such as Infinigen) in a reason-act-reflect loop. Code: Scene-Weaver/SceneWeaver, 174 stars. — [arXiv 2509.20414](https://arxiv.org/abs/2509.20414); [GitHub](https://github.com/Scene-Weaver/SceneWeaver)
- **3D-Generalist** (Sun et al., Stanford, 3DV 2026). Recasts environment building as sequential decision-making with VLMs taking code actions, made self-improving through training. Repo sunfanyunn/3D-Generalist exists but had 6 stars and only an initial push (2025-07), so the release looks minimal. — [arXiv 2507.06484](https://arxiv.org/abs/2507.06484); [GitHub](https://github.com/sunfanyunn/3D-Generalist)
- **SceneSmith** (Pfaff, Cohn, Zakharov, Cory, Tedrake; MIT + TRI per author list; ICML 2026 Spotlight, 2026-02). Builds scenes hierarchically: architecture, then furniture, then small objects. Each stage is a designer/critic/orchestrator VLM-agent interaction. Assets come from text-to-3D for static objects, dataset retrieval for articulated objects, and physical-property estimation. Reported results:
  - 3–6x more objects than prior methods
  - under 2% inter-object collisions
  - 96% of objects stable in physics simulation
  - 92% realism and 91% prompt-faithfulness win rates in a 205-participant user study
  - an end-to-end pipeline for automatic robot policy evaluation

  Code: nepfaff/scenesmith (listed on the awesome list; the arXiv page itself links only a project page). — [arXiv 2602.09153](https://arxiv.org/abs/2602.09153)
- **SAGE: Scalable Agentic 3D Scene Generation for Embodied AI** (Xia et al., NVIDIA + UIUC/Columbia per authors; CVPR 2026). Takes an embodied task and generates simulation-ready scenes. Multiple generators handle layout and object composition; critics check semantic plausibility, visual realism and physical stability, and the agent picks tools adaptively. It releases the SAGE-10k dataset, and policies trained only on its data show scaling trends and generalize to unseen layouts. Code: NVlabs/sage. — [arXiv 2602.10116](https://arxiv.org/abs/2602.10116)
- **SceneAssistant** (Luo et al., 2026-03). Visual-feedback agent: a VLM with a toolset of action APIs composes a 3D-generated, open-vocabulary asset set. Code: ROUJINN/SceneAssistant. — [arXiv 2603.12238](https://arxiv.org/abs/2603.12238)
- **SceneOrchestra** (He et al., ECCV 2026). Criticizes the execute-review-reflect loop as heuristic and wasteful. It generates the full tool-call trajectory up front with a trained orchestrator. — [arXiv 2604.19907](https://arxiv.org/abs/2604.19907)
- **SceneBloom** (Liu et al., 2026-10-23, newest found). A VLM plans functional zones, diffusion priors sample furniture arrangements within each zone, a contract-guided compiler turns the sample into a valid 3D scene, and a final VLM pass adds wall-mounted and small objects. Aimed at embodied learning. — [arXiv 2610.32978](https://arxiv.org/abs/2610.32978)
- **WorldClaw** (Tencent Hunyuan, 2026-08). A fully agentic, coarse-to-fine open-world generator: planning agents produce a structured spec of regions, terrain, assets, materials and relations, followed by terrain from semantic layouts, procedural/generative materials and a region-aware height field. Code: Tencent-Hunyuan/Hunyuan3D-WorldClaw. — [arXiv 2608.05248](https://arxiv.org/abs/2608.05248)
- Other 2025–26 agentic entries: ScenePilot (grow-and-repair policy), SceneMosaic (sim-ready, hybrid agentic layout evolution), MANSION (multi-floor; AgibotGeneral), HomeWorld (floorplan to furnished home), Text2Villa, SceneFoundry, SceneConductor (single image to scene via multi-agent orchestration), ImmerseGen (TVCG 2026), GardenDesigner (CVPR 2026), Imaginarium (TOG 2025), Reason-3D (AAAI 2026, large reasoning models), iARCS (iterative agentic RL). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### E. Trained / fine-tuned / RL LLMs for layout
- **LLplace** (Yang et al., 2024-06). Fine-tunes Llama-3 for layout generation and editing instead of prompting proprietary LLMs. — [arXiv 2406.03866](https://arxiv.org/abs/2406.03866)
- **MetaSpatial** (Pan et al., Northwestern, ICLR 2026 per repo). Multi-turn RL with physics-aware constraints and rendered-image evaluation, to internalize 3D spatial reasoning in VLMs for layout. Code: PzySeere/MetaSpatial, 321 stars. — [arXiv 2503.18470](https://arxiv.org/abs/2503.18470); [GitHub](https://github.com/PzySeere/MetaSpatial)
- **SpatialLM** (Mao et al., Manycore/Qunhe, NeurIPS 2025). A standard MLLM fine-tuned to output structured indoor layouts (walls, doors, windows, oriented object boxes) from point clouds. Trained on 12,328 synthetic scenes (54,778 rooms). This is scene understanding / reverse layout rather than generation. Code: manycore-research/SpatialLM, 5,112 stars, the most-starred LLM-layout repo checked. — [arXiv 2506.07491](https://arxiv.org/abs/2506.07491); [GitHub](https://github.com/manycore-research/SpatialLM)
- **SceneScript** (Meta Reality Labs, 2024-03). An autoregressive structured-language model that infers scene commands from visual data. It releases the Aria Synthetic Environments dataset. Code: facebookresearch/scenescript, 388 stars. — [arXiv 2403.13064](https://arxiv.org/abs/2403.13064); [GitHub](https://github.com/facebookresearch/scenescript)
- **SceneReVis** (Zhao et al., ACM MM 2026 Oral). A diagnose-and-act self-reflection loop trained with SFT and then agentic RL on SceneChain-12k, a set of construction trajectories. — [arXiv 2602.09432](https://arxiv.org/abs/2602.09432)
- **NaLA** (Wan et al., ECCV 2026). A "native 3D" LLM layout agent that encodes scene boundaries and 3D assets directly as LLM inputs instead of text descriptions, to avoid the information lost between text and 3D. — [arXiv 2606.29395](https://arxiv.org/abs/2606.29395)
- **DirectLayout** (NeurIPS 2025), **OptiScene** (NeurIPS 2025), **ReSpace** (ICLR 2026, preference alignment, GradientSpaces/respace), **SceneLM** (ACL Findings 2026), **CausalStruct** (2025). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### F. LLM layout → neural/generative scene representation (3DGS / SDS)
- **GALA3D** (Zhou et al., PKU, ICML 2024). An LLM extracts a coarse layout prior, which drives layout-guided generative Gaussian splatting with instance-scene compositional optimization; the layout itself is also adjusted during optimization. Code: VDIGPKU/GALA3D, 307 stars. — [arXiv 2402.07207](https://arxiv.org/abs/2402.07207); [GitHub](https://github.com/VDIGPKU/GALA3D)
- **GraphDreamer** (Gao et al., MPI/Tübingen, CVPR 2024). Generates compositional 3D scenes from scene graphs (which can come from an LLM) via SDS. Code: GGGHSL/GraphDreamer, 201 stars. — [arXiv 2312.00093](https://arxiv.org/abs/2312.00093); [GitHub](https://github.com/GGGHSL/GraphDreamer)
- **LayoutDreamer** (Zhou et al., 2025-02). Physics-guided layout for 3DGS compositional text-to-3D scenes. — [arXiv 2502.01949](https://arxiv.org/abs/2502.01949)
- **SceneTeller** (Öcal et al., ECCV 2024). Text describing object placement becomes a layout, then a 3DGS room, which can be edited stylistically. — [arXiv 2407.20727](https://arxiv.org/abs/2407.20727)
- **Architect** (Wang et al., 2024-11). Argues that 2D image generators capture scene configuration better than LLMs. Uses hierarchical 2D inpainting, lifted to 3D, to place assets in interactive embodied scenes. Code: wangyian-me/architect_official_code, 37 stars. — [arXiv 2411.09823](https://arxiv.org/abs/2411.09823); [GitHub](https://github.com/wangyian-me/architect_official_code)

#### G. Outdoor / urban / world-scale
- **Urban Architect** (Lu et al., 2024-04). A compositional 3D layout prior of semantic primitives for text-to-3D urban scenes. — [arXiv 2404.06780](https://arxiv.org/abs/2404.06780)
- **Text2Street** (Su et al., 2024-02). Controllable text-to-image generation of street views, using a lane-aware road topology (text to map) generator. It is 2D image generation, not 3D layout, so it falls outside "3D scene" despite often appearing in such lists. — [arXiv 2402.04504](https://arxiv.org/abs/2402.04504)
- **WorldGen** (Meta Reality Labs, 2025-11). An LLM does scene-layout reasoning, followed by procedural generation, image generation, image-to-3D reconstruction, object-aware decomposition and refinement. Produces traversable, textured worlds of about 50×50 m in about 5 minutes. Meta says the output works in standard game engines, but it is research-only and not released. Quality drops away from the central viewpoint. — [arXiv 2511.16825](https://arxiv.org/abs/2511.16825); [Meta blog](https://www.meta.com/es-es/blog/worldgen-3d-world-generation-reality-labs-generative-ai-research/); [AI News](https://www.artificialintelligence-news.com/news/worldgen-meta-generative-ai-for-interactive-3d-worlds/)
- 2025–26 urban/landscape LLM entries: RAISECity (CVPR 2026), Yo'City (CVPR 2026), MajutsuCity (CVPR 2026), LandCraft (AAAI 2026), LatticeWorld (MLLM-driven, 2025), UnrealLLM (ACL Findings 2025), SynCity (ICCV 2025, training-free), BuildingBlock (Tencent, SIGGRAPH 2025). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

#### H. Procedural engines that LLM systems build on
- **Infinigen** (Princeton VL, CVPR 2023): procedural generation of natural worlds in Blender, 7,372 stars, actively pushed (Oct 2026). **Infinigen Indoors** (CVPR 2024) adds procedural indoor assets plus a constraint DSL and a solver for scene composition, and can export to simulators. — [arXiv 2306.09310](https://arxiv.org/abs/2306.09310); [arXiv 2406.11824](https://arxiv.org/abs/2406.11824); [GitHub](https://github.com/princeton-vl/infinigen)
- **Procedural Generation of Articulated Simulation-Ready Assets** (Joshi et al., 2025-05; the Infinigen articulated-asset work, often called "Infinigen-Sim"). Procedural articulated-object generators with export to robotics simulators, used for policy learning and sim-to-real. The `princeton-vl/infinigen-sim` path redirects ("moved permanently"); the final repo location was not confirmed. — [arXiv 2505.10755](https://arxiv.org/abs/2505.10755)
- Blender-MCP and game-engine plugins are out of scope here (another researcher covers them). Note only that they let a general LLM drive Blender/Unity interactively; the research systems above mostly embed this same "LLM writes Blender Python" pattern.

### Inferences
- The field's main tension is LLMs' semantic and common-sense knowledge against their weak metric 3D grounding. Almost every system adds a geometric back-end to compensate: a constraint solver (Holodeck, Open-Universe, Infinigen Indoors), differentiable optimization (LayoutVLM), visual priors (Architect, Scenethesis, SceneBloom), or physics simulation checks (SceneSmith, SAGE).
- There is a clear progression: one-shot LLM prompting (LayoutGPT, 2023), then LLM plus solver (Holodeck/I-Design, 2024), then VLM render-critique loops (SceneCraft/BlenderAlchemy, then Scenethesis/SceneWeaver, 2025), then hierarchical multi-agent sim-ready systems (SceneSmith/SAGE, 2026), and in parallel a trend to amortize or replace loops with trained policies (SceneOrchestra, FuncRoom-Agent, SceneReVis, MetaSpatial).
- Star counts suggest research adoption is concentrated in infrastructure (Infinigen 7.4k, SpatialLM 5.1k, RoboCasa 1.9k, RoboGen 1.2k) rather than in individual LLM-layout methods. Most of those sit at roughly 40–850 stars.

### Gaps
- Star counts for most 2025–26 repos (SceneSmith, SAGE, WorldClaw, Scene Language, MesaTask, ReSpace, etc.) could not be retrieved because of the GitHub API rate limit.
- Official code for SceneCraft (Hu et al.) and the BlenderAlchemy repo location were not verified. Code for Scenethesis, Open-Universe, FirePlace, SceneTeller, LLplace and LayoutDreamer was not checked.
- Venue claims taken only from the awesome list (rather than arXiv comments) are not independently verified, notably the ICML 2026 / ECCV 2026 / CVPR 2026 tags on many 2026 entries.
- Affiliations for SceneSmith and SAGE are inferred from author names and project hosting, not stated on the arXiv pages.

## Which are used for embodied AI / robotics simulation environment generation?

### Takeaway
Embodied-AI scene generation has moved from procedural houses (ProcTHOR, 2022) to LLM-planned AI2-THOR scenes (Holodeck, 2024), LLM-generated tasks plus scenes (RoboGen, GenSim/GenSim2), and in 2026 agentic, physics-validated, simulator-ready scene factories with datasets of 10k+ scenes (SceneSmith, SAGE/SAGE-10k, SceneBloom, MesaTask, InternScenes).

### Cited Findings
- **ProcTHOR** (AllenAI, NeurIPS 2022): procedural generation of interactive, customizable houses for navigation, interaction and manipulation, shown with 10,000 generated houses. Repo allenai/procthor, 481 stars, last pushed 2023. — [arXiv 2206.06994](https://arxiv.org/abs/2206.06994); [GitHub](https://github.com/allenai/procthor)
- **Holodeck**: output loads into AI2-THOR/Unity, and it was used to train ObjectNav agents for novel scene types without human-built data. — [arXiv 2312.09067](https://arxiv.org/abs/2312.09067); [GitHub](https://github.com/allenai/Holodeck)
- **RoboGen** (Wang et al., CMU/MIT-IBM et al., ICML 2024): a self-guided propose-generate-learn cycle in which foundation models generate tasks, scenes and training supervision. 1,230 stars, last pushed 2024-05. — [arXiv 2311.01455](https://arxiv.org/abs/2311.01455); [GitHub](https://github.com/Genesis-Embodied-AI/RoboGen)
- **GenSim** (Wang et al., MIT, ICLR 2024): an LLM writes simulation tasks and expert demonstrations as code to get task-level diversity. 360 stars. **GenSim2** (CoRL 2024) adds multimodal and reasoning LLMs, articulated objects, long-horizon tasks, and planning/RL solvers. — [arXiv 2310.01361](https://arxiv.org/abs/2310.01361); [GitHub](https://github.com/liruiw/GenSim); [arXiv 2410.03645](https://arxiv.org/abs/2410.03645)
- **RoboCasa** (Nasiriany et al., UT Austin/NVIDIA, RSS 2024): a large kitchen simulation framework with thousands of assets across 150+ categories, using generative AI (text-to-3D, text-to-image textures) for diversity. 1,855 stars, pushed Oct 2026. — [arXiv 2406.02523](https://arxiv.org/abs/2406.02523); [GitHub](https://github.com/robocasa/robocasa)
- **PhyScene** (CVPR 2024): physically interactable scenes with articulated objects for embodied agents. — [arXiv 2404.09465](https://arxiv.org/abs/2404.09465)
- **Architect** (2024): interactive embodied scenes via hierarchical 2D inpainting. — [arXiv 2411.09823](https://arxiv.org/abs/2411.09823)
- **SceneSmith** (2026): simulation-ready scenes (under 2% collisions, 96% stable) with a pipeline for automatic robot policy evaluation. — [arXiv 2602.09153](https://arxiv.org/abs/2602.09153)
- **SAGE** (NVIDIA, CVPR 2026): task-conditioned sim-ready scenes plus the SAGE-10k dataset; policies trained only on generated data scale and generalize. — [arXiv 2602.10116](https://arxiv.org/abs/2602.10116)
- **SceneBloom** (2026-10): agentic indoor environments "for embodied learning". — [arXiv 2610.32978](https://arxiv.org/abs/2610.32978)
- **Steerable Scene Generation** (Pfaff et al., CoRL 2025): diffusion over objects and SE(3) poses from a fixed asset library, trained on procedural robot-manipulation scenes and steered with RL post-training and inference-time MCTS. — [arXiv 2505.04831](https://arxiv.org/abs/2505.04831)
- **Infinigen articulated assets** ("Infinigen-Sim", 2025): procedural articulated assets with simulator export, for sim-to-real. — [arXiv 2505.10755](https://arxiv.org/abs/2505.10755)
- **AllenAI MolmoSpaces** (repo created 2026-02, 509 stars): described as "an end-to-end open ecosystem for robot learning". Its scene-generation specifics were not checked. — [GitHub](https://github.com/allenai/molmospaces)
- Other embodied entries:
  - MesaTask (NeurIPS 2025, task-driven tabletop scenes, InternRobotics)
  - EmbodiedGen (Horizon Robotics, 2025, generative 3D world engine for embodied AI)
  - MarketGen (supermarket environments, 2025)
  - WorldComposer (digital cousins for robot learning, 2026)
  - 4DSynth (dynamic embodied simulation, 2026)
  - "Beyond Placement and Articulation: Usage-Driven Code Scenes for Embodied Interaction" (arXiv 2608.18840; title only seen)
  - Sources: [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation); [arXiv 2608.18840](https://arxiv.org/pdf/2608.18840)

### Inferences
- The 2026 bar for embodied scene generators is "simulation-ready": collision-free, physically stable, articulated and with physical properties. Systems are judged by downstream policy training and evaluation, not only by realism.
- NVIDIA (Scenethesis, SAGE), TRI/MIT (Steerable Scene Gen, SceneSmith), AllenAI (ProcTHOR, Holodeck, MolmoSpaces), BIGAI (PhyScene, SceneWeaver) and Shanghai AI Lab/InternRobotics (MesaTask, InternScenes) are the recurring institutional players.

### Gaps
- Which simulators each 2026 system exports to (Isaac Sim, MuJoCo, Drake, Genesis, etc.) was not checked, except Holodeck (AI2-THOR/Unity). SAGE's abstract says only "modern simulators".
- I found no head-to-head comparison of policy-learning value across Holodeck, SceneSmith and SAGE scenes.

## What benchmarks and datasets exist?

### Takeaway
3D-FRONT/3D-FUTURE is still the default training and evaluation corpus for learned layout methods. Since 2025, evaluation has shifted toward text-faithfulness and physical-plausibility benchmarks (SceneEval-500, SceneCritic, SceneTeract) and large simulatable datasets (InternScenes, SAGE-10k, SceneChain-12k).

### Cited Findings
- **3D-FRONT** (Alibaba, 2020): 18,968 diversely furnished rooms and 13,151 textured furniture objects (3D-FUTURE). Freely available to academia. Used by ATISS, DiffuScene, LayoutGPT, InstructScene and others. — [arXiv 2011.09127](https://arxiv.org/abs/2011.09127)
- **SG-FRONT** (from CommonScenes): scene-graph annotations on 3D-FRONT. — [arXiv 2305.16283](https://arxiv.org/abs/2305.16283)
- **InternScenes** (NeurIPS 2025): about 40,000 simulatable scenes and 1.96M objects across 15 scene types, merging real scans, procedural scenes and designer-created scenes. It targets the small-item scarcity and collisions of earlier datasets. — [arXiv 2509.10813](https://arxiv.org/abs/2509.10813)
- **SceneEval** (SFU 3DLG; WACV 2026 oral): scores explicit requirements (object counts, attributes, spatial relations) and implicit ones (support, collisions, navigability). It started as SceneEval-100 and grew to SceneEval-500 annotated descriptions. Evaluating six recent methods showed consistent failures on detailed constraints and physical plausibility. HSM adopted its metrics. — [arXiv 2503.14756](https://arxiv.org/abs/2503.14756); [WACV 2026](https://wacv.thecvf.com/virtual/2026/oral/1161)
- **SceneCritic** (2026-04): a symbolic floor-plan-level evaluator. It is motivated by the instability of VLM judges, which are sensitive to viewpoint, prompt phrasing and hallucination. — [arXiv 2604.13035](https://arxiv.org/abs/2604.13035)
- **SceneTeract** (2026-03): probes agent-aware activity feasibility (reach, clearance, navigable space). It shows that VLMs used to reason about scenes miss these geometric constraints. — [arXiv 2603.29798](https://arxiv.org/abs/2603.29798)
- **BlenderGym** (CVPR 2025): the first benchmark for VLM systems doing Blender graphics editing. Relevant to code-as-scene agents. — [arXiv 2504.01786](https://arxiv.org/abs/2504.01786)
- **SpatialLM synthetic dataset**: 12,328 scenes and 54,778 rooms with ground-truth 3D annotations. **Aria Synthetic Environments** comes from SceneScript. — [arXiv 2506.07491](https://arxiv.org/abs/2506.07491); [arXiv 2403.13064](https://arxiv.org/abs/2403.13064)
- **SAGE-10k** (agentic-generated sim-ready scenes) and **SceneChain-12k** (construction trajectories for RL training). — [arXiv 2602.10116](https://arxiv.org/abs/2602.10116); [arXiv 2602.09432](https://arxiv.org/abs/2602.09432)
- **ProcTHOR-10k** houses and **Objaverse** (via objathor) as the open-vocabulary asset pool for Holodeck-style retrieval. — [arXiv 2206.06994](https://arxiv.org/abs/2206.06994); [Holodeck GitHub](https://github.com/allenai/Holodeck)
- Urban: CityTopia (CityDreamer4D) and OSM/GoogleEarth (CityDreamer). — [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)

### Inferences
- Evaluation is a recognized weak point. LLM/VLM-judge scoring is common (for example, VLM render judges in Scenethesis-style pipelines), but 2026 papers explicitly push back with symbolic and geometry-grounded evaluators (SceneCritic, SceneTeract).

### Gaps
- No single agreed leaderboard for text-to-3D-scene layout exists. Papers use different metrics (FID/KID on top-down renders, CLIP score, collision rate, user studies, SceneEval).
- Licence terms for 3D-FRONT commercial use were not checked.

## What is state of the art as of late 2026, and what are the trends?

### Takeaway
As of November 2026, the SOTA is hierarchical, multi-agent, VLM-critiqued generation of physically validated, simulation-ready scenes, with SceneSmith (ICML 2026 Spotlight) and NVIDIA SAGE (CVPR 2026) as flagships and WorldClaw for open worlds. Four trends stand out: (1) agentic tool-orchestration, (2) VLM-in-the-loop visual feedback plus physics checks, (3) code/DSL-as-scene for editability, and (4) training LLMs and VLMs with RL or on trajectories to cut the cost of iterative loops.

### Cited Findings
- **Agentic, hierarchical, sim-ready**: SceneSmith stages architecture → furniture → small objects with designer/critic/orchestrator agents and reports 3–6x more objects, under 2% collisions and 96% stability. — [arXiv 2602.09153](https://arxiv.org/abs/2602.09153)
- **Generator plus critic ensembles with adaptive tool selection**: SAGE. — [arXiv 2602.10116](https://arxiv.org/abs/2602.10116)
- **Reflective tool-unifying agents**: SceneWeaver (NeurIPS 2025) unifies data-driven, LLM and procedural tools in a reflect loop. — [arXiv 2509.20414](https://arxiv.org/abs/2509.20414)
- **Backlash against slow loops / efficiency**: SceneOrchestra says execute-review-reflect loops lead to "suboptimal execution flows" and unnecessary tool invocations, and generates full trajectories instead. FuncRoom-Agent says agentic methods "depend on costly test-time generate–evaluate–revise loops". — [arXiv 2604.19907](https://arxiv.org/abs/2604.19907); [arXiv 2608.29519](https://arxiv.org/abs/2608.29519)
- **Visual priors over LLM priors**: Architect, Scenethesis and SceneBloom argue that image and diffusion models capture spatial arrangement better than LLMs, and use them as the layout source. — [arXiv 2411.09823](https://arxiv.org/abs/2411.09823); [arXiv 2505.02836](https://arxiv.org/abs/2505.02836); [arXiv 2610.32978](https://arxiv.org/abs/2610.32978)
- **RL-trained spatial reasoning**: MetaSpatial (multi-turn RL), SceneReVis (SFT followed by agentic RL), iARCS (iterative agentic RL), Steerable Scene Gen (RL post-training plus MCTS). — [arXiv 2503.18470](https://arxiv.org/abs/2503.18470); [arXiv 2602.09432](https://arxiv.org/abs/2602.09432); [arXiv 2505.04831](https://arxiv.org/abs/2505.04831)
- **Native-3D LLM inputs** to close the text-to-3D modality gap: NaLA (ECCV 2026). — [arXiv 2606.29395](https://arxiv.org/abs/2606.29395)
- **Code-as-scene for editability and interactivity**: Scene Language (CVPR 2025), SceneCode (articulated objects on demand), Code-as-Room, FuncRoom-Agent (recursive DSL), LL3M (Blender code). — [arXiv 2410.16770](https://arxiv.org/abs/2410.16770); [arXiv 2605.19587](https://arxiv.org/abs/2605.19587); [arXiv 2508.08228](https://arxiv.org/abs/2508.08228)
- **Asset source shift**: from retrieval (3D-FUTURE, then Objaverse) to on-demand generative 3D assets inside scene agents. SceneSmith uses text-to-3D for static objects, and SceneAssistant uses "modern 3D object generation models". — [arXiv 2602.09153](https://arxiv.org/abs/2602.09153); [arXiv 2603.12238](https://arxiv.org/abs/2603.12238)
- **Scale-up beyond rooms**: multi-floor (MANSION), whole homes (HomeWorld), open worlds (WorldClaw; Meta WorldGen at 50×50 m), cities (RAISECity, Yo'City, MajutsuCity at CVPR 2026). — [arXiv 2608.05248](https://arxiv.org/abs/2608.05248); [Meta blog](https://www.meta.com/es-es/blog/worldgen-3d-world-generation-reality-labs-generative-ai-research/); [Awesome-3D-Scene-Generation](https://github.com/hzxie/Awesome-3D-Scene-Generation)
- **Evaluation critique**: SceneEval found consistent failures on detailed constraints and physical plausibility across six methods. SceneCritic and SceneTeract show that VLM judges are unstable and miss agent-specific geometry. — [arXiv 2503.14756](https://arxiv.org/abs/2503.14756); [arXiv 2604.13035](https://arxiv.org/abs/2604.13035); [arXiv 2603.29798](https://arxiv.org/abs/2603.29798)

### Inferences
- Recurring limitations across the catalog:
  - reliance on proprietary LLM/VLM APIs (Holodeck needs `gpt-4o-2024-05-13`)
  - high latency and cost of iterative render-critique loops
  - empty scenes with few small objects (motivating HSM, SceneSmith and InternScenes)
  - weak metric grounding, giving collisions and floating objects (motivating solvers and physics checks)
  - asset-library dependence (closed vocabulary and style mismatch)
  - unreliable automatic evaluation
- Likely direction from late-2026 trends: trained agentic policies (RL on construction trajectories) that keep the planning/critic structure but run in one pass, plus generative assets and a physics-validated export to robotics simulators. This is an inference, not a cited claim.
- Output formats are converging on Blender scenes (Infinigen, SceneCraft, 3D-GPT, SceneWeaver), simulator scene specs (AI2-THOR JSON for Holodeck; simulator-ready exports for SceneSmith/SAGE) and game-engine-compatible meshes (WorldGen). USD output was not explicitly confirmed for any system checked.

### Gaps
- I found no reliable cross-paper quantitative comparison establishing a single "best" 2026 system on a shared benchmark. SOTA claims are per-paper.
- Output formats (USD vs. GLB vs. MJCF/URDF) for SceneSmith, SAGE and WorldClaw were not verified.
- Some 2026 items (SceneBloom, FuncRoom-Agent, "Usage-Driven Code Scenes") were read only from abstracts or titles; their results are unverified.
