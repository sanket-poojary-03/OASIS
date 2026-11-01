# Commercial Products, Startups, and Big-Lab Systems for Prompt-to-World Generation and Interactive World Models (state as of 2026-11-01)

Two product families need to be kept apart throughout:
- **(A) Exportable 3D worlds**: output is geometry (Gaussian splats, meshes, panoramas) that you can load into Unity, Unreal, Blender or three.js. Examples: World Labs Marble, Tencent HunyuanWorld 1.0 / HY-World 2.0, Meta WorldGen, NVIDIA Lyra, SpAItial Echo, Blockade Skybox (panorama to GLB).
- **(B) Pixel-based interactive video world models**: a neural network renders every frame in real time from user actions. Nothing is exported except video. Examples: Genie 3/4, Odyssey, Decart Oasis, Dynamics Lab Mirage, Runway GWM-1, Microsoft Muse/WHAMM, Skywork Matrix-Game, Tencent HY-World 1.5 (WorldPlay), Alibaba ABot-World / Happy Oyster.

## Big labs: what each one ships (Google DeepMind, Meta, NVIDIA, Tencent, Microsoft, Alibaba, ByteDance, Skywork, Roblox, Epic, Unity)

### Takeaway
Google DeepMind leads in pixel-based interactive worlds. Genie 3 (Aug 2025) became a paid consumer product, "Project Genie", for AI Ultra subscribers in Jan 2026. Genie 4 was announced Oct 27, 2026 as a trusted-tester research preview, with Gemini API early access "coming soon". Tencent is the most prolific open-weights player in both categories (HunyuanWorld 1.0, Voyager, HY-World 1.5 WorldPlay, HY-World 2.0). NVIDIA (Cosmos 3, Lyra) targets physical AI and robotics under commercially usable open licenses. Meta WorldGen remains research only. Roblox ships production 4D object generation, not full scenes.

### Cited Findings

**Google DeepMind: Genie 3 / Project Genie / Genie 4 (pixel world model, category B)**
- Genie 3, announced Aug 5, 2025: real-time world model at 720p and 24 fps that generates interactive environments from a text prompt and keeps them consistent "over several minutes". It supports "promptable world events" such as changing the weather or adding objects. At launch it was a limited research preview for selected researchers and creators — [CGWorld / summary of announcement](https://cgworld.jp/flashnews/01-202508-Google-Genee3.html); [PetaPixel](https://petapixel.com/2025/08/06/15-mind-blowing-interactive-worlds-googles-genie-3-ai-can-create)
- Visual memory is about one minute according to PetaPixel. A wiki source says Ars Technica called the one-minute claim optimistic; I could not verify that directly — [PetaPixel](https://petapixel.com/2025/08/06/15-mind-blowing-interactive-worlds-googles-genie-3-ai-can-create); [aiwiki](https://www.aiwiki.ai/wiki/genie_3)
- Project Genie launched Jan 29, 2026 via Google Labs as a paid product for Google AI Ultra subscribers — [Wikipedia: Genie (world model)](https://en.wikipedia.org/wiki/Genie_(world_model)); [Wikipedia: Project Genie](https://en.wikipedia.org/wiki/Project_Genie_(website))
- Geographic access is disputed. Wikipedia says Project Genie went to AI Ultra subscribers worldwide in May 2026. A Sept 2026 DataCamp guide says access is US-only, 18+, and that the lower $100/month Ultra tier excludes Genie — [Wikipedia](https://en.wikipedia.org/wiki/Genie_(world_model)); contradicted by [DataCamp](https://www.datacamp.com/tutorial/google-genie-3-guide)
- Genie 3 had no public API. Street View grounding was reportedly added in June 2026, and Waymo built its "Waymo World Model" on Genie 3 for robotaxi edge-case simulation — [Wikipedia](https://en.wikipedia.org/wiki/Genie_(world_model)); [Wikipedia: Waymo World Model](https://en.wikipedia.org/wiki/Waymo_World_Model)
- Genie 4, announced Oct 27, 2026, is described as research and is rolling out to a "limited group of trusted testers". It is coming soon to AI Ultra subscribers in Project Genie and to early-access partners in the Gemini API and AI Studio. Features: native audio generated on the fly (ambient sound, music, interactive dialogue) and real-time natural-language steering (camera, weather, adding characters). Gemini Omni anchors appearance and behavior. Google's post gives no resolution, fps or pricing — [Google blog: Introducing Genie 4](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/); [TechCrunch](https://techcrunch.com/2026/10/27/googles-genie-4-world-model-adds-audio-more-realistic-worlds-and-real-time-steering/)
- Secondary coverage says Genie 4 keeps scenes consistent for up to about 2 minutes (double Genie 3). Output carries a SynthID watermark. As of Oct 28 there were no benchmark tables or third-party evaluations — [Unite.ai](https://www.unite.ai/google-deepmind-rolls-out-genie-4-world-model-in-research-preview/); [datastudios](https://www.datastudios.org/post/google-deepmind-genie-4-real-time-world-model-native-audio-research-preview); [progressiverobot](https://progressiverobot.com/2026/10/31/genie-4-deepmind-world-model)

**Meta: WorldGen (exportable mesh, category A, research only)**
- WorldGen was announced in Nov 2025 by Reality Labs (arXiv 2511.16825). It builds an interactive, navigable 3D world from one text prompt through a pipeline: LLM-driven procedural layout blockout, navmesh, reference image, image-to-3D reconstruction, decomposition into objects, then mesh and texture refinement — [Meta blog](https://www.meta.com/de-de/blog/worldgen-3d-world-generation-reality-labs-generative-ai-research/); [arXiv](https://arxiv.org/html/2511.16825v1)
- Output is triangle meshes that work with standard game engines, plus a navmesh. Scenes are 50x50 m and take about 5 minutes to generate. It is not commercially available, and Meta does not yet consider it ready for Horizon Worlds — [UploadVR](https://uploadvr.com/meta-worldgen-ai-generates-3d-worlds); [AI News](https://www.artificialintelligence-news.com/news/worldgen-meta-generative-ai-for-interactive-3d-worlds/)

**NVIDIA: Lyra / Lyra 2.0 (3DGS, category A) and Cosmos 3 (world foundation model for physical AI)**
- Lyra distills a video diffusion model into a feed-forward 3D Gaussian Splatting generator. It takes single-image or video input, uses the Cosmos tokenizer latent space, and needs no 3D training data. GitHub release 09/23/2025. The HF card says it is ready for commercial use — [HF model card](https://huggingface.co/nvidia/Lyra/blob/refs%2Fpr%2F2/README.md)
- Lyra 2.0 targets persistent, explorable 3D worlds from a single image. A hands-on Japanese review calls it research-oriented and says the output is not directly usable in robot simulators — [Classmethod dev blog](https://dev.classmethod.jp/articles/nvidia-lyra-2-brev/)
- Cosmos 3 was released May 31, 2026 and announced at GTC Taipei/Computex. It is an "omnimodal" mixture-of-transformers model (Reasoner + Generator) that handles text, image, video, audio and actions. It ships as Nano and Super, with Edge coming later. License is the NVIDIA Open Model License (commercial use permitted). NVIDIA claims first place among open models on Physics-IQ, PAI-Bench and others (vendor claim). It also formed a Cosmos Coalition that includes Runway, Black Forest Labs, LTX and Skild AI — [AI Magazine](https://aimagazine.com/news/nvidias-cosmos-3-the-worlds-first-fully-open-ai-omnimodel); [HF Cosmos3-Nano](https://huggingface.co/nvidia/Cosmos3-Nano); [NVIDIA tech report](https://research.nvidia.com/labs/cosmos-lab/cosmos3/technical-report.pdf)

**Tencent Hunyuan: open-weights family across both categories**
- HunyuanWorld 1.0 (late July 2025): text/image to 3D scene, billed as the first open-source world model built for standard graphics pipelines and game engines. 1.0-Lite followed in Aug 2025. Released on GitHub and HF with a sceneTo3D demo. Critics say the license is "source available", with geographic and user limits — [The Decoder](https://the-decoder.com/tencent-releases-hunyuan-world-model-1-0-lite-for-faster-resource-efficient-3d-scene-generation/); [The Neuron](https://www.theneuron.ai/explainer-articles/tencent-just-open-sourced-a-3d-world-generator)
- HunyuanWorld-Voyager (Sept 2025): camera-controlled video model for extending scenes. Weights are on HF under a community license. A secondary source says 540p needs about 80GB of VRAM — [toolnavs](https://toolnavs.com/article/161-new-breakthrough-in-ai-world-model-hunyuanworld-voyager-open-source-reshaping-vr)
- HY-World 1.5 "WorldPlay" (Dec 17, 2025): open-source streaming video diffusion world model at 24 fps with keyboard/mouse and camera-pose control and long-term geometric consistency. A 5B variant for low-VRAM GPUs followed Jan 6, 2026. Repo: github.com/Tencent-Hunyuan/HY-WorldPlay — [HF card mirror](https://huggingface.co/Cccccz/HY); [aifilms](https://studio.aifilms.ai/blog/hunyuan-world)
- HY-World 2.0 (Apr 16, 2026): multimodal input (text, single image, multi-view, video) to meshes or Gaussian splats. Four-stage pipeline: panorama, trajectory planning, world expansion, composition. Released in phases: tech report and WorldMirror 2.0 at launch, HY-Pano 2.0 on May 11, full world-generation inference code on May 18, 2026. Tencent claims results comparable to Marble. The license is not clearly stated — [GitHub wiki](https://github.com/Tencent-Hunyuan/HY-World-2.0/wiki); [KrASIA](https://kr-asia.com/tencents-hy-world-2-0-moves-ai-beyond-video-into-editable-3d-worlds); [tech report PDF](https://3d-models.hunyuan.tencent.com/world/world2_0/HY_World_2_0.pdf)

**Microsoft: Muse / WHAM / WHAMM (category B, research demo)**
- In April 2025, Copilot Labs released a browser Quake II demo built on WHAMM (World and Human Action MaskGIT Model), part of Microsoft's "Muse" family of game world models. Sessions are time-limited. Reviewers found it rough (objects vanish, scene changes after looking away). The research model is available to developers in Azure AI Foundry — [TechCrunch](https://techcrunch.com/2025/04/06/microsoft-releases-ai-generated-quake-ii-demo-but-admits-limitations); [Microsoft Research blog](https://www.microsoft.com/en-us/research/?p=1135867); [Copilot Labs](https://copilotlabs.microsoft.com/experiment/)

**Alibaba (category B)**
- AMAP CV Lab's ABot-World-0 is an open 5B interactive world model: 720p, about 1.2 s latency, about 19GB VRAM, on GitHub and HF — [aifilms](https://studio.aifilms.ai/blog/abot-world-0-alibaba-interactive-world-model)
- "Happy Oyster" from Alibaba's ATH AI Innovation Unit is a closed, early-access "real-time interactive generative world model". Alibaba also open-sourced a model trained on more than 10M interaction trajectories, plus AgentWorldBench (June 2026). These come from secondary sources — [buildfastwithai](https://www.buildfastwithai.com/blogs/tencent-alibaba-world-models-april-2026); [KuCoin news](https://www.kucoin.com/news/flash/chinese-tech-giants-and-automakers-expand-world-model-capabilities-in-2026)

**ByteDance**
- Bloomberg reported (Sept 7, 2026) that ByteDance is preparing a real-time spatial video world model built on Seedance and aimed at Pico headsets, possibly launching in October, with Zhang Yiming involved. I found no confirmed release — [The Next Web](https://thenextweb.com/news/bytedance-spatial-video-world-model-zhang-yiming); [BigGo Finance](https://finance.biggo.com/news/dbfb825f-aa8a-470d-9063-fb4a0af2a4b9)

**Skywork: Matrix-Game (category B, open weights)**
- Matrix-Game 2.0 (Aug 2025): open-source real-time interactive world model, 1.8B parameters, 25 FPS, minute-long sequences. Weights on HF — [HF](https://huggingface.co/Skywork/Matrix-Game-2.0); [arXiv 2508.13009](https://arxiv.org/html/2508.13009v1); [PR Newswire](https://www.prnewswire.com/news-releases/matrix-game-2-0-launches-as-a-powerful-open-source-alternative-to-genie-3--302527562.html)
- Matrix-Game 3.0 (Mar 27, 2026) adds long-horizon memory. Matrix-Game 4.0 ("Streaming Neural Rendering for Playable Games") pairs an executable game engine (gameplay, physics, input) with a causal video model that does the rendering. It ships Medieval Castle, Ancient Egypt and City Racing scenes — [arXiv 2604.08995](https://arxiv.org/pdf/2604.08995); [GitHub](https://github.com/SkyworkAI/Matrix-Game)

**Roblox: Cube 3D / 4D generation (objects, not full scenes)**
- Cube 3D was open-sourced in March 2025 and has generated more than 1.8M 3D objects. 4D generation entered open beta Feb 4-5, 2026: players type prompts to generate functional, interactive objects in-experience. Two schemas at launch, "Car-5" (5 parts) and "Body-1" (single mesh). Full-scene generation is a stated future goal, not shipped. One developer's showcase game reported 160k objects generated and +64% playtime — [Roblox newsroom](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model); [TechCrunch](https://techcrunch.com/2026/02/04/robloxs-4d-creation-feature-is-now-available-in-open-beta/)

**Epic / Unity**
- Epic's Unreal Engine 6, revealed June 2026, makes AI model integration one of three headline features. Demos showed prompt-based scene generation and Claude Code inside UE building a city. Early access is targeted around end of 2027 — [GamingOnLinux](https://www.gamingonlinux.com/2026/06/unreal-engine-6-is-all-about-generative-ai-fortnite-and-the-verse/); [VGC](https://www.videogameschronicle.com/news/epic-reveals-unreal-engine-6-is-integrating-ai-models-so-developers-can-reduce-tedious-work/); [Engadget](https://www.engadget.com/2196807/epic-games-details-how-its-embracing-gen-ai-in-unreal-engine/)
- Unity has an in-editor assistant (Unity AI, beta). Its 2026 report says 95% of respondents use AI. I found no Unity first-party prompt-to-world generator — [Innovecs](https://www.innovecsgames.com/blog/ai-in-game-development-is-changing-everything/); [PC Gamer](https://www.pcgamer.com/gaming-industry/game-development/unity-demonstrates-an-unreal-character-running-through-a-unity-world-for-the-first-time/)

### Inferences
- Big labs are splitting into two camps. Google and Microsoft pursue pixel-rendered "simulated worlds" for consumers and agent training. Tencent, Meta and NVIDIA (Lyra) pursue exportable geometry for existing engines. Tencent alone ships open weights in both.
- Genie remains the quality benchmark, but it is still not a developer platform: no general API as of Nov 2026, only Gemini API "early access partners" for Genie 4.
- Matrix-Game 4.0 (an engine handling logic with a neural renderer) hints at hybrid architectures that make pixel world models more controllable and game-like.

### Gaps
- Genie 2 (announced Dec 2024) details were not retrieved in this pass. Genie 4 resolution, fps and pricing are unpublished.
- NVIDIA Edify 3D status (it was offered via Shutterstock/Getty APIs in 2024) was not checked for 2025-2026 updates.
- I did not check whether Microsoft Muse/WHAMM has a newer version after April 2025 or whether the Quake II demo is still live.
- Exact license terms for HY-World 2.0 and the full text of the Tencent community license were not verified.
- No confirmation of an actual ByteDance release in October 2026.

## Startups: who actually generates worlds or scenes, and who only makes single objects

### Takeaway
Startups that make full worlds or scenes: World Labs (Marble; being acquired by AMD for about $8.2B, announced Sept 28, 2026), SpAItial (Echo), and Blockade Labs (360 panoramas with experimental GLB). Startups with pixel-based interactive worlds: Odyssey, Decart, Dynamics Lab (Mirage 2), Runway (GWM-1), General Intuition (action/world models, mostly for agents). Meshy and Tripo remain single-asset generators. Tripo's "Project Eden" world model is a research preview. Luma has moved toward physical-AI world models but has no public world product.

### Cited Findings

**World Labs: Marble (category A, exportable)**
- Marble launched commercially Nov 12, 2025. It takes text, image, panorama, multi-image or video input. Launch tiers: Free (4 generations), Standard $20/mo (12), Pro $35/mo (25, commercial rights), Max $95/mo (75) — [TechCrunch](https://techcrunch.com/2025/11/12/fei-fei-lis-world-labs-speeds-up-the-world-model-race-with-marble-its-first-commercial-product/); [World Labs blog](https://www.worldlabs.ai/blog/marble-world-model)
- Exports: Gaussian splats (highest fidelity), low-fidelity collider meshes for physics, and high-quality meshes. Splats come as .spz (native and default since Dec 2025) or .ply; meshes as GLB. A review says high-resolution textured mesh export needs Pro. Editing tool: "Chisel" — [World Labs blog](https://www.worldlabs.ai/blog/marble-world-model); [invideo review](https://invideo.io/blog/world-labs-marble-3d-worlds/); [The Batch](https://www.deeplearning.ai/the-batch/world-labs-makes-its-marble-generative-world-model-public-adds-chisel-editing-tool)
- World API launched Jan 21, 2026. Marble 1.1 became the default on Apr 2, 2026; "1.1 Plus" auto-expands worlds. API model IDs: marble-1.1, marble-1.1-plus — [latent.space wiki](https://latent.space/wiki/world-labs/); [NYU RITS](https://rits.shanghai.nyu.edu/ai/world-labs-releases-marble-1-1-auto-expanding-3d-world-generation); [TanStack adapter docs](https://tanstack.com/ai/latest/docs/adapters/worldlabs.md); [World Labs: Bigger, better worlds](https://worldlabs.ai/blog/bigger-better-worlds)
- API pricing from secondary sources: marble-1.1 world 1,500 credits (about $1.20); 1.0-draft 150 credits (about $0.12); mesh export 3,500 credits (about $2.80); PLY splat export free. Atlas splat conversion beta: $5 refined or $0.50 draft — [invideo](https://invideo.io/blog/world-labs-marble-3d-worlds/); [Spatial Insiders](https://spatialinsiders.com/stories/world-labs-atlas-gaussian-splats)
- AMD agreed to acquire World Labs in an all-stock deal worth about $8.2B (announced Sept 28, 2026, expected to close by end of 2026). Fei-Fei Li becomes AMD EVP and Chief Scientist. Neither release addresses Marble or World API continuity — [AMD IR](https://ir.amd.com/news-events/press-releases/detail/1299/amd-to-acquire-world-labs-to-advance-the-future-of-ai-compute); [CNBC](https://www.cnbc.com/2026/09/28/amd-fei-fei-li-world-labs.html); [beri.net](https://www.beri.net/article/amd-world-labs-acquisition-marble-world-api-continuity-world-model-hardware-lock-in)

**Odyssey (category B)**
- Odyssey-1 ("playable world model") was followed by Odyssey-2 (Oct 2025), then Odyssey-2 Pro with a new developer API (Jan 23, 2026), then Odyssey-2 Max (Apr 27, 2026) — [Odyssey: Introducing Odyssey-2](https://odyssey.ml/introducing-odyssey-2); [Odyssey: GPT-2 moment](https://odyssey.ml/the-gpt-2-moment-for-world-models); [Product Hunt](https://www.producthunt.com/products/odyssey-5/launches/odyssey-2-3)
- Odyssey-3 was reportedly released Oct 8, 2026 as a free research preview with first- and third-person navigation. Commercial API access goes through a contact form. No weights or license published (secondary sources only) — [TechTimes](https://www.techtimes.com/articles/328905/20261013/world-model-odyssey-3-drives-cars-india-after-just-20-hours-simulation.htm); [orcarouter](https://www.orcarouter.ai/blog/odyssey-3)
- Funding: $310M Series B (June 2026) at a $1.45B valuation, led by Natural Capital with Amazon, AMD Ventures and GV. $337M raised in total. AWS is the preferred cloud, with models optimized for Trainium — [TechCrunch](https://techcrunch.com/2026/06/17/world-model-maker-odyssey-nabs-1-45b-valuation-backed-by-amazon-and-other-big-names/); [AI Business](https://aibusiness.com/generative-ai/world-model-ai-lab-odyssey-valued-at-1-45-billion)

**Decart: Oasis, Mirage (category B)**
- Oasis is a real-time generative Minecraft-like world where every pixel is model-generated. It was co-developed with chip startup Etched and criticized for incoherence. Mirage is Decart's real-time video-to-video model. Oasis 3 launched via API as a driving-simulation world model in 2026 — [Wikipedia: Oasis](https://en.wikipedia.org/wiki/Oasis_(Minecraft_clone)); [Contrary Research](https://research.contrary.com/company/decart); [Crypto Briefing](https://cryptobriefing.com/decart-oasis-3-driving-simulation-api/)
- Funding: $100M at a $3.1B valuation (Aug 2025; Sequoia, Benchmark). $300M Series B at about $4B (May 2026, led by Radical Ventures, NVIDIA investing, Amazon as a strategic customer). An unverified report cites WSJ saying Amazon is in talks to acquire Decart for about $7B — [Fortune](https://dc.fortune.com/2025/08/07/exclusive-decart-raises-100-million-at-a-3-1-billion-valuation-chasing-the-future-of-real-time-creative-ai); [Calcalist](https://www.calcalistech.com/ctechnews/article/m7yk4c4e3); [bitsminds](https://www.bitsminds.com/news/decart-300m-nvidia-world-models-amazon-chips-2026); [ai2.work](https://ai2.work/blog/decart-raises-300m-at-4b-valuation-to-power-real-time-world-models)

**Dynamics Lab: Mirage 2 (category B)**
- Released Aug 21, 2025 as a browser-based "generative world engine". Images, sketches or text become playable worlds that can be changed in real time by typed commands. About 200 ms latency, 10+ minute sessions, free demo. Known issues: poor character control and sudden scene changes — [The Decoder](https://the-decoder.com/mirage-2-allows-users-to-turn-sketches-and-photos-into-interactive-game-worlds/); [Gigazine](https://www.gigazine.net/gsc_news/en/20250825-ai-generative-world-mirage-2)

**Runway: GWM-1 (category B)**
- GWM-1 launched Dec 11, 2025. It is an autoregressive model built on Gen-4.5, in three variants: GWM Worlds (explorable environments), GWM Avatars and GWM Robotics. Runway is in talks with robotics firms and enterprises. Runway reportedly raised $315M and is pivoting toward world models — [Runway Research](https://runway.com/research/introducing-runway-gwm-1); [TechCrunch](https://techcrunch.com/2025/12/11/runway-releases-its-first-world-model-adds-native-audio-to-latest-video-model); [The Decoder](https://the-decoder.com/runway-unveils-first-general-world-model-alongside-major-gen-4-5-upgrades/); [AI Business](https://aibusiness.com/generative-ai/ai-startup-runway-raises-315m-for-world-models)

**General Intuition (world/action models for agents; not a prompt-to-world consumer product)**
- Trains on video-game clips to build action models for agents and robots. Newest model MIRA (June 2026). Funding: $133.7M seed (Oct 2025), $320M Series A at $2.3B, then $220M at $6.2B (Sept 29, 2026; Valor, Khosla, General Catalyst and others) — [SiliconANGLE](https://siliconangle.com/2026/09/29/world-model-startup-general-intuition-closes-220m-investment/); [WOWTALE](https://en.wowtale.net/2026/10/01/235314/); [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/general-intuition-turning-video-game-150000525.html)

**SpAItial: Echo (category A, Munich/London)**
- Emerged from stealth with a $13M seed (May 2025). CEO is Matthias Niessner (TUM, Synthesia co-founder). Echo turns text or images into explorable, metric-scale 3D scenes with editing (materials, adding or removing objects) — [Maginative](https://www.maginative.com/article/synthesia-co-founder-raises-13m-to-build-the-holy-grail-of-ai-interactive-3d-worlds-from-text/); [Creative Bloq](https://creativebloq.com/ai/ai-art/this-ai-model-can-turn-2d-images-into-editable-3d-worlds)
- Echo-2 reportedly launched Apr 28, 2026 (single image to spatially persistent 3D scene). Echo-3 reportedly launched Oct 27, 2026: an iOS app that turns iPhone captures into metric-scale Gaussian-splat worlds, with an enterprise API. Single, weaker sources — [runtimewire](https://runtimewire.com/article/spaitial-echo-3-iphone-3d-world-capture); [neuronfeed](https://neuronfeed.com/startups/spaitial)

**Blockade Labs: Skybox AI (360 panoramas; experimental mesh)**
- Skybox AI turns 360 skyboxes into GLB meshes (experimental). Three mesh quality levels plus depth control. Meshes are made for visual parallax, not physics or collision. The API has an export endpoint, and a community UE5 plugin exists — [Blockade help](https://support.blockadelabs.com/hc/en-us/articles/31649281677074-Export-3D-Models-from-Skybox-AI); [API docs](https://api-documentation.blockadelabs.com/api/skybox-exports.html); [UE5 plugin](https://github.com/odinn1984/UE5-Skybox-AI-Plugin)
- Model 4 was added Feb 20, 2026 (4K default). A third-party source says Model 4 does not support GLB or cube-map export; unconfirmed — [renderu / comparateur](https://renderu.com/en/news/post/25375)

**Luma AI**
- Raised a $900M Series C led by HUMAIN (Saudi), including a 2GW supercluster. Launched the Open Physical AI Lab (June 1, 2026) to develop world models for robotics. Core products are still video models (Ray). I found no public interactive or 3D world product — [PR Newswire](https://www.prnewswire.com/news-releases/luma-ai-raises-900-million-series-c-led-by-humain-and-partners-on-2-gigawatt-ai-supercluster-in-saudi-arabia-302620697.html); [Luma: Open Physical AI Lab](https://lumalabs.ai/news/luma-open-physical-ai-lab); [Luma About](https://lumalabs.ai/about)

**Meshy / Tripo (single objects, not worlds)**
- Both are mainly single-asset generators. Meshy 6 became GA Jan 18, 2026. Tripo's "Project Eden" is a research preview of physics-aware environment world models aimed at robotics. Tripo funding reports conflict ($150M in July 2026 vs. $50M in March 2026) — [Tripo review](https://pasqualepillitteri.it/en/news/7811/tripo-ai-review-3d-model-generator); [SelfCAD Meshy vs Tripo](https://www.selfcad.com/blog/meshy-vs-tripo)

**Other open/independent**
- AlayaWorld is an open-source interactive world model sustaining play past one minute (July 2026) — [TechTimes](https://www.techtimes.com/articles/319980/20260709/open-source-world-model-alayaworld-sustains-interactive-play-past-one-minute-mark.htm)

### Inferences
- World-model valuations climbed steeply in 2026: General Intuition $6.2B, Decart about $4B, Odyssey $1.45B, World Labs acquired for $8.2B. Strategic money comes from chip and cloud companies (AMD, NVIDIA, Amazon/AWS), which suggests these companies are seen as compute-demand drivers.
- Etched's role appears limited to Oasis 1 co-development (hardware partner). I saw no evidence it ships its own world product.
- "World model" is used loosely. General Intuition and Luma mean agent/robotics simulation, not prompt-to-scene tools for creators.

### Gaps
- No information found on Wayfarer Labs. Not researched in this pass: Moonvalley (video model; no world product found), Promethean AI, Kaedim, Common Sense Machines (CSM), Spline AI, Rosebud AI, Scenario, Layer, Inworld. From prior knowledge these are mostly asset, character or game-creation tools rather than world models, but that is unverified here and should not be stated as fact without sources.
- Official Odyssey-3 launch post and API pricing not verified on odyssey.ml. Odyssey API pricing unknown.
- Decart API pricing and the reported Amazon acquisition talks are unverified.
- Runway GWM-1 access tier and pricing (GWM Worlds availability to paid users vs. enterprise) not confirmed.
- Current official Marble subscription prices (post-Marble 1.1) not verified against marble.worldlabs.ai.
- Dynamics Lab funding not found.

## Major launches and news, 2025-2026 (chronological)

### Takeaway
The core timeline: Genie 3 (Aug 2025) triggered a wave of open interactive models (Matrix-Game 2.0, Mirage 2, HY-World 1.5). Marble (Nov 2025) became the first major commercial exportable-world product. 2026 brought productization (Project Genie, World API, Odyssey API), mega-rounds, and consolidation (AMD-World Labs), and ended with Genie 4 (Oct 27, 2026).

### Cited Findings
- Mar 2025: Roblox open-sources Cube 3D — [Roblox newsroom](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model)
- Apr 2025: Microsoft WHAMM Quake II demo in Copilot Labs — [TechCrunch](https://techcrunch.com/2025/04/06/microsoft-releases-ai-generated-quake-ii-demo-but-admits-limitations)
- May 2025: SpAItial $13M seed — [Maginative](https://www.maginative.com/article/synthesia-co-founder-raises-13m-to-build-the-holy-grail-of-ai-interactive-3d-worlds-from-text/)
- Late Jul 2025: Tencent HunyuanWorld 1.0 open source; Lite in Aug — [The Decoder](https://the-decoder.com/tencent-releases-hunyuan-world-model-1-0-lite-for-faster-resource-efficient-3d-scene-generation/)
- Aug 5, 2025: Genie 3 (720p/24fps, research preview) — [PetaPixel](https://petapixel.com/2025/08/06/15-mind-blowing-interactive-worlds-googles-genie-3-ai-can-create)
- Aug 2025: Decart $100M at $3.1B — [Fortune](https://dc.fortune.com/2025/08/07/exclusive-decart-raises-100-million-at-a-3-1-billion-valuation-chasing-the-future-of-real-time-creative-ai)
- Aug 2025: Skywork Matrix-Game 2.0 (open, 25 fps) — [PR Newswire](https://www.prnewswire.com/news-releases/matrix-game-2-0-launches-as-a-powerful-open-source-alternative-to-genie-3--302527562.html)
- Aug 21, 2025: Dynamics Lab Mirage 2 — [The Decoder](https://the-decoder.com/mirage-2-allows-users-to-turn-sketches-and-photos-into-interactive-game-worlds/)
- Sept 2025: NVIDIA Lyra released (09/23/2025); Tencent HunyuanWorld-Voyager — [HF Lyra](https://huggingface.co/nvidia/Lyra/blob/refs%2Fpr%2F2/README.md); [toolnavs](https://toolnavs.com/article/161-new-breakthrough-in-ai-world-model-hunyuanworld-voyager-open-source-reshaping-vr)
- Oct 2025: Odyssey-2 — [Odyssey](https://odyssey.ml/introducing-odyssey-2)
- Nov 12, 2025: World Labs Marble launches commercially — [TechCrunch](https://techcrunch.com/2025/11/12/fei-fei-lis-world-labs-speeds-up-the-world-model-race-with-marble-its-first-commercial-product/)
- Nov 2025: Meta WorldGen research — [UploadVR](https://uploadvr.com/meta-worldgen-ai-generates-3d-worlds)
- Dec 11, 2025: Runway GWM-1 — [TechCrunch](https://techcrunch.com/2025/12/11/runway-releases-its-first-world-model-adds-native-audio-to-latest-video-model)
- Dec 17, 2025: Tencent HY-World 1.5 (WorldPlay), open — [HF](https://huggingface.co/Cccccz/HY)
- Jan 21, 2026: World Labs World API — [latent.space](https://latent.space/wiki/world-labs/)
- Jan 23, 2026: Odyssey-2 Pro plus developer API — [Odyssey](https://odyssey.ml/the-gpt-2-moment-for-world-models)
- Jan 29, 2026: Project Genie (Genie 3 for AI Ultra subscribers) — [Wikipedia](https://en.wikipedia.org/wiki/Project_Genie_(website))
- Feb 2026: Roblox 4D generation open beta; Blockade Skybox Model 4 — [TechCrunch](https://techcrunch.com/2026/02/04/robloxs-4d-creation-feature-is-now-available-in-open-beta/); [renderu](https://renderu.com/en/news/post/25375)
- Mar 27, 2026: Matrix-Game 3.0 — [arXiv](https://arxiv.org/pdf/2604.08995)
- Apr 2, 2026: Marble 1.1 default; Apr 14 Spark 2.0 — [NYU RITS](https://rits.shanghai.nyu.edu/ai/world-labs-releases-marble-1-1-auto-expanding-3d-world-generation); [latent.space](https://latent.space/wiki/world-labs/)
- Apr 16, 2026: Tencent HY-World 2.0 (full inference code May 18) — [GitHub wiki](https://github.com/Tencent-Hunyuan/HY-World-2.0/wiki)
- Apr 27, 2026: Odyssey-2 Max — [Product Hunt](https://www.producthunt.com/products/odyssey-5/launches/odyssey-2-3)
- May 2026: Decart $300M at about $4B — [Calcalist](https://www.calcalistech.com/ctechnews/article/m7yk4c4e3)
- May 31 / Jun 1, 2026: NVIDIA Cosmos 3 (open, commercial) — [AI Magazine](https://aimagazine.com/news/nvidias-cosmos-3-the-worlds-first-fully-open-ai-omnimodel)
- Jun 2026: Odyssey $310M Series B at $1.45B; Luma Open Physical AI Lab; Epic reveals UE6 with generative AI; Genie Street View grounding (reported) — [TechCrunch](https://techcrunch.com/2026/06/17/world-model-maker-odyssey-nabs-1-45b-valuation-backed-by-amazon-and-other-big-names/); [Luma](https://lumalabs.ai/news/luma-open-physical-ai-lab); [VGC](https://www.videogameschronicle.com/news/epic-reveals-unreal-engine-6-is-integrating-ai-models-so-developers-can-reduce-tedious-work/)
- Sept 28, 2026: AMD to acquire World Labs (about $8.2B) — [AMD IR](https://ir.amd.com/news-events/press-releases/detail/1299/amd-to-acquire-world-labs-to-advance-the-future-of-ai-compute)
- Sept 29, 2026: General Intuition $220M at $6.2B — [SiliconANGLE](https://siliconangle.com/2026/09/29/world-model-startup-general-intuition-closes-220m-investment/)
- Oct 8, 2026: Odyssey-3 research preview (secondary) — [TechTimes](https://www.techtimes.com/articles/328905/20261013/world-model-odyssey-3-drives-cars-india-after-just-20-hours-simulation.htm)
- Oct 27, 2026: Genie 4 (trusted testers); SpAItial Echo-3 (reported) — [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/); [runtimewire](https://runtimewire.com/article/spaitial-echo-3-iphone-3d-world-capture)

### Inferences
- About 3 months after each Genie release, Chinese labs shipped open "Genie alternatives" (Matrix-Game 2.0, WorldPlay). Expect a similar open response to Genie 4.
- 2026 is the year world models became APIs (World API, Odyssey API, Decart Oasis 3 API, Gemini API early access for Genie 4).

### Gaps
- Exact Genie 2 date and details not retrieved. Exact Matrix-Game 4.0 release date not found.

## Which offer APIs or exports developers can use (Unity / Unreal / three.js)

### Takeaway
For engine-ready assets, the most mature options are World Labs Marble: World API plus splat (.spz/.ply) and GLB mesh/collider export, plus the open-source Spark three.js splat renderer, though AMD acquisition continuity is unclear. Open-weights options are Tencent HunyuanWorld 1.0 / HY-World 2.0 (mesh or 3DGS) and NVIDIA Lyra (3DGS). Blockade Skybox has an API with experimental GLB export. Pixel world models (Odyssey, Decart, Genie 4 early access) offer streaming APIs but produce video, not engine assets. Open interactive models (Matrix-Game, WorldPlay, ABot-World) can be self-hosted.

### Cited Findings
- **World Labs**: World API (Jan 2026; model IDs marble-1.1 / marble-1.1-plus). Exports splats (.spz/.ply), GLB high-quality and collider meshes, panoramas, video. Used with Unreal, Unity, Blender and Houdini; Pixomondo used Marble splats in Unreal for an LED volume. Spark is World Labs' open-source three.js Gaussian-splat renderer (Spark 2.0 adds LoD and streaming). No official Unity or Unreal plugin found — [TanStack adapter](https://tanstack.com/ai/latest/docs/adapters/worldlabs.md); [Contrary](https://research.contrary.com/company/world-labs); [Sacra](https://sacra.com/chat/h/fa2973ec-933c-499c-9da1-ab84a5b3a823/); [latent.space](https://latent.space/wiki/world-labs/)
- **Tencent HunyuanWorld 1.0 / HY-World 2.0**: open code and weights. Output is meshes or Gaussian splats aimed at standard graphics pipelines and game engines. License restrictions apply — [The Neuron](https://www.theneuron.ai/explainer-articles/tencent-just-open-sourced-a-3d-world-generator); [KrASIA](https://kr-asia.com/tencents-hy-world-2-0-moves-ai-beyond-video-into-editable-3d-worlds)
- **NVIDIA Lyra**: open 3DGS output, commercial use per the HF card. Cosmos 3 is under the NVIDIA Open Model License (commercial) but is a video/world foundation model, not an asset exporter — [HF Lyra](https://huggingface.co/nvidia/Lyra/blob/refs%2Fpr%2F2/README.md); [AI Magazine](https://aimagazine.com/news/nvidias-cosmos-3-the-worlds-first-fully-open-ai-omnimodel)
- **Meta WorldGen**: produces game-engine-compatible meshes and navmesh, but it is unreleased research — [UploadVR](https://uploadvr.com/meta-worldgen-ai-generates-3d-worlds)
- **Blockade Labs**: REST API with a skybox export endpoint (GLB, cube map). Updates via webhooks, Pusher or polling. Community UE5 plugin — [API docs](https://api-documentation.blockadelabs.com/api/skybox-exports.html); [GitHub UE5 plugin](https://github.com/odinn1984/UE5-Skybox-AI-Plugin)
- **SpAItial Echo-3**: enterprise API for splat worlds (reported) — [runtimewire](https://runtimewire.com/article/spaitial-echo-3-iphone-3d-world-capture)
- **Odyssey**: developer API since Jan 2026 (Odyssey-2 Pro, then Max). Odyssey-3 API via contact form — [Odyssey](https://odyssey.ml/the-gpt-2-moment-for-world-models); [orcarouter](https://www.orcarouter.ai/blog/odyssey-3)
- **Decart**: Oasis 3 driving-simulation world model via API — [Crypto Briefing](https://cryptobriefing.com/decart-oasis-3-driving-simulation-api/)
- **Google Genie 4**: Gemini API / AI Studio for early-access partners only ("coming soon"). Genie 3 had no public API — [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/); [DataCamp](https://www.datacamp.com/tutorial/google-genie-3-guide)
- **Microsoft WHAMM/Muse**: research model available in Azure AI Foundry — [Microsoft Research blog](https://www.microsoft.com/en-us/research/?p=1135867)
- **Open self-hostable interactive models**: Matrix-Game 2.0/3.0/4.0 (HF/GitHub), HY-World 1.5 WorldPlay (including a 5B low-VRAM variant), Alibaba ABot-World-0 (about 19GB VRAM) — [HF Matrix-Game](https://huggingface.co/Skywork/Matrix-Game-2.0); [HF HY](https://huggingface.co/Cccccz/HY); [aifilms ABot](https://studio.aifilms.ai/blog/abot-world-0-alibaba-interactive-world-model)
- **Roblox 4D**: in-platform only (Roblox Studio and experiences), not exportable to other engines — [Roblox newsroom](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model)

### Inferences
- A developer building a Unity, Unreal or three.js game today would most likely pair Marble (or HY-World 2.0 self-hosted) for splat/mesh environments with Spark or an engine splat plugin, and use collider meshes for physics. Pixel world models cannot yet feed engine pipelines.
- The AMD acquisition creates vendor risk for Marble API users until AMD clarifies product continuity.

### Gaps
- No official World Labs Unity or Unreal plugin was found. Engine integration likely relies on third-party splat plugins (not researched).
- Odyssey, Decart and Runway API pricing were not found. Genie 4 API pricing is unpublished.
- Whether Blockade Model 4 supports GLB export is unresolved (sources conflict).
