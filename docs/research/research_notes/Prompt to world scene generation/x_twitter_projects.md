# X.com (Twitter) Projects and Demos: Prompt-to-World / LLM-Driven 3D Scene Generation

Method note: `site:x.com` searches in standard mode returned no x.com results. Extended-mode web searches did surface x.com status URLs in their titles and snippets, and those are the URLs listed below. X pages were not opened directly, so the post text comes from search-result titles and snippets, Threads mirrors, Hacker News threads that link the posts, and press coverage. Where only a status ID was available, I worked out the approximate post date from the Twitter snowflake ID ("date from ID"). Those dates are approximate to the day.

---

## Q1: Which X posts demo text-to-3D-world, prompt-to-game-world, explorable AI worlds, LLM-built Blender/three.js scenes, Blender MCP, Genie 3, Marble, Gaussian-splat-from-prompt, HunyuanWorld?

### Takeaway
The most-viewed X demos in this space fall into two groups. (a) Lab and startup launches: Genie 3/4 (Google DeepMind), Marble (World Labs), HunyuanWorld 1.0 / HY-World 2.0 (Tencent), and Odyssey's interactive video. (b) Indie "LLM drives a 3D tool" demos: Blender MCP by @sidahuj (about 1.9M views) and @levelsio's vibe-coded three.js/Cursor flight sim. Indie builders now mostly build on top of lab outputs. Examples are Marble splats rendered in three.js/Spark, and Genie 3 frames reconstructed into Gaussian splats.

### Cited Findings

**Catalog of X posts found, with evidence**

| Handle | What | Post URL | Repo / demo | Date | One-liner |
|---|---|---|---|---|---|
| @sidahuj (Siddharth Ahuja), indie | BlenderMCP | https://x.com/sidahuj/status/1899460492999184534 | github.com/ahujasid/blender-mcp | 2025-03-11 | "Built an MCP that lets Claude talk directly to Blender... create beautiful 3D scenes using just prompts", with a low-poly dragon guarding treasure demo; the thread also shows Claude recreating the Blender scene as an interactive three.js page |
| @levelsio (Pieter Levels), indie | fly.pieter.com flight sim (first post) | https://x.com/levelsio/status/1893350391158292550 | fly.pieter.com | ~2025-02-21/22 | Asked Cursor to "make a 3d flying game in browser with skyscrapers"; built in vanilla HTML/JS |
| @levelsio | fly.pieter.com ("it's done") | https://x.com/levelsio/status/1893385114496766155 | fly.pieter.com | ~2025-02-22 | "made my own flight simulator 100% with Cursor in I'd say 3 hours"; he says it was about 80% smooth and he reverted a few times |
| @levelsio | Claude Code: Pieter.com 1990s PC in a three.js 3D space | https://x.com/levelsio/status/1951654552395972778 | — | ~2025-08-02 (date from ID) | Claude Code places a .GLB model of a 1990s PC in three.js, with an iframe inside the screen |
| @rdominguezibar (Ruben), commentator | Post about levelsio's Claude Code GTA:SA mission | https://x.com/rdominguezibar/status/2113001260227985728 | — | ~2026-10 (date from ID) | Says Levels had Claude Code build a GTA: San Andreas mission where CJ vibe-codes a startup. Secondhand; Levels' own post not found |
| @levelsio | 2025 Vibe Coding Game Jam updates | https://x.com/levelsio/status/1904997711201603950 ; https://x.com/levelsio/status/1906650541347717573 ; https://x.com/levelsio/status/1907903828437144026 | vibejam.com/2025 | 2025-03/04 | Jam requiring at least 80% AI-generated browser games; 561 games by day 9 and 1000+ by the end; jury of @karpathy, @mrdoob, @timsoret, @s13k_ |
| @GoogleDeepMind | Genie 3 announcement | https://x.com/GoogleDeepMind/status/1952732150928724043 | deepmind.google/blog/genie-3-a-new-frontier-for-world-models/ | 2025-08-05 | "Genie 3... creates interactive, playable environments from a single text prompt" |
| @GoogleDeepMind | Genie 3 real-time thread item | https://x.com/GoogleDeepMind/status/1952732153852084485 | — | 2025-08-05 | First world model to allow live interaction; 720p at 24 FPS |
| @GoogleAI | Genie 3 announcement | https://x.com/GoogleAI/status/1952787157627662619 | — | 2025-08-05 | "general purpose world model... dynamic, interactive environments with a single text prompt" |
| @tejasdkulkarni (Tejas Kulkarni), researcher / early tester | Genie 3 hands-on review | https://x.com/tejasdkulkarni/status/1952737669894574264 | — | 2025-08-05 | "when it works, it is truly mind blowing", with a detailed list of failures (see Q3) |
| @bilawalsidhu (Bilawal Sidhu), creator | Genie 3 world turned into a 3D Gaussian splat | https://x.com/bilawalsidhu/status/1954229425199034753 | superspl.at/scene/e05e5eb7 | 2025-08-09 | Pipeline: Genie 3 world, inpaint, 4x Topaz upscale, train 3DGS. "step inside a painting of Socrates from 1787"; calls it "the literal holodeck" |
| @XRarchitect (Ian Curtis) | Reply/idea | https://x.com/XRarchitect/status/1954282627428745466 | — | ~2025-08-09 | Proposes a Genie 3 world that is processed live into a Gaussian splat as you move, to get past the one-minute memory limit (speculative idea, not a build) |
| @Google | Genie 4 announcement | https://x.com/Google/status/2115114426827501782 | blog.google/.../introducing-genie-4/ | 2026-10-27 | "introducing Genie 4 — our newest interactive world model" |
| @theworldlabs | Marble launch | https://x.com/theworldlabs/status/1988653082872631738 | marble.worldlabs.ai | 2025-11-12 | "Introducing Marble by World Labs: a foundation for a spatially intelligent future" |
| @theworldlabs | Marble launch thread item | https://x.com/theworldlabs/status/1988653084416074134 | worldlabs.ai/blog/marble-world-model | 2025-11-12 | Persistent 3D worlds from a single image, video, text prompt, or 3D layout |
| @WesRothMoney (Wes Roth), commentator | Marble amplification | https://x.com/WesRothMoney/status/1988955011397607492 | — | ~2025-11-13 | Marble turns text, images, video, or coarse 3D layouts into full scenes that can be refined with AI editing |
| X Trending (auto) | "World Labs Launches Marble" trend | https://x.com/i/trending/1988662612066807852 | — | 2025-11-12 | Marble launch was an X trending topic |
| @theworldlabs | ICARE case study (Marble + Spark 2.0) | https://x.com/theworldlabs/status/2064749936907075638 | worldlabs.ai/blog/spark-2.0 | ~2026-06 (date from ID) | Team designed 7 worlds in Marble and streamed millions of splats in the browser with Spark 2.0 and three.js |
| @isaac_mason_ (Isaac Mason), indie dev | Gaussian-splat game in a Marble world | https://x.com/isaac_mason_/status/2100050524842475874 | GitHub project linked in post (URL not recovered); video on World Labs YouTube | ~2026-09-15 (date from ID) | "little gaussian splat game demo set in a world created in World Labs Marble, using three.js + spark + crashcat + navcat" |
| @TencentHunyuan | HunyuanWorld 1.0 open-source launch | https://x.com/TencentHunyuan/status/1949288986192834718 | github.com/Tencent-Hunyuan/HunyuanWorld-1.0 | 2025-07-26/27 | "generate immersive, explorable, and interactive 3D worlds from just a sentence or an image... first open-source 3D world generation model" |
| @TencentHunyuan | HY-World 2.0 technical highlights | https://x.com/TencentHunyuan/status/2044715706638581872 | github.com/Tencent-Hunyuan/HY-World-2.0 ; huggingface.co/tencent/HY-World-2.0 | 2026-04-16 | "3D-first world modeling", HY-Pano 2.0 panoramas, and WorldMirror 2.0 reconstruction into navigable 3DGS |
| @odysseyml (Odyssey), startup | Interactive video launch | https://x.com/odysseyml/status/1927767196756853179 | odyssey.ml | 2025-05-28 | "AI video you can watch and interact with, in real-time... frames every 40ms... No game engine in sight" |
| @_akhaliq (AK), paper curator | HoloDreamer paper | https://x.com/_akhaliq/status/1815616891022418231 | — | ~2024-07 (date from ID) | "Holistic 3D Panoramic World Generation from Text Descriptions" (older than the 2025–26 focus) |
| @_akhaliq | WorldVLA paper | https://x.com/_akhaliq/status/1938713294115594394 | — | ~2025-06 | Autoregressive action world model (robotics, not 3D scenes) |

Sources for the table rows, in order:
- sidahuj Blender MCP post — [X post](https://x.com/sidahuj/status/1899460492999184534); the three.js follow-up and the demo prompt appear in the repo README — [Glama README](https://glama.ai/mcp/servers/@ahujasid/blender-mcp/blob/7636d13bded82eca58eb93c3f4cd8708dfdfbe8b/README.md)
- The search snippet put the Blender MCP post at about 1.9M views; a third-party gallery calls the dungeon-dragon scene one of the most viral demos — [Blender MCP gallery](https://blendermcp.org/gallery)
- levelsio flight sim posts — [X 1](https://x.com/levelsio/status/1893350391158292550), [X 2](https://x.com/levelsio/status/1893385114496766155); background — [Indie Hackers](https://www.indiehackers.com/post/tech/pieter-levels-used-ai-to-build-a-viral-flight-simulator-in-3-hours-with-no-background-in-game-development-7CPfMr1yRLEwH6cC8xhE)
- levelsio Claude Code three.js PC — [X post](https://x.com/levelsio/status/1951654552395972778)
- Ruben on levelsio GTA mission — [X post](https://x.com/rdominguezibar/status/2113001260227985728)
- Vibe Jam posts — [X day 9](https://x.com/levelsio/status/1904997711201603950?lang=en), [X final days](https://x.com/levelsio/status/1906650541347717573?lang=en), [X judging](https://x.com/levelsio/status/1907903828437144026); winners — [levels.io](https://levels.io/winners-of-the-2025-vibe-code-game-jam)
- Genie 3 — [DeepMind X](https://x.com/GoogleDeepMind/status/1952732150928724043), [DeepMind X real-time](https://x.com/GoogleDeepMind/status/1952732153852084485), [Google AI X](https://x.com/GoogleAI/status/1952787157627662619)
- Tejas Kulkarni — [X post](https://x.com/tejasdkulkarni/status/1952737669894574264)
- Bilawal Sidhu — [X post](https://x.com/bilawalsidhu/status/1954229425199034753); [Threads mirror](https://www.threads.com/@bilawal.ai/post/DNJGgLPvUvS/video-damn-it-worked-genie-3-world-inpaint-ui-4x-topaz-ai-upscale-train-3d-gaussian-sp); [SuperSplat scene](https://superspl.at/scene/e05e5eb7)
- Ian Curtis — [X post](https://x.com/XRarchitect/status/1954282627428745466)
- Genie 4 — [Google X](https://x.com/Google/status/2115114426827501782); [TechCrunch 2026-10-27](https://techcrunch.com/2026/10/27/googles-genie-4-world-model-adds-audio-more-realistic-worlds-and-real-time-steering/); [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/)
- Marble — [World Labs X](https://x.com/theworldlabs/status/1988653082872631738), [X thread item](https://x.com/theworldlabs/status/1988653084416074134), [Wes Roth X](https://x.com/WesRothMoney/status/1988955011397607492), [X trending](https://x.com/i/trending/1988662612066807852), [World Labs blog](https://www.worldlabs.ai/blog/marble-world-model)
- ICARE — [World Labs X](https://x.com/theworldlabs/status/2064749936907075638)
- Isaac Mason — [X post](https://x.com/isaac_mason_/status/2100050524842475874)
- HunyuanWorld — [Tencent X 1.0](https://x.com/TencentHunyuan/status/1949288986192834718), [Tencent X 2.0](https://x.com/TencentHunyuan/status/2044715706638581872), [GitHub 1.0](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0), [HF 2.0](https://huggingface.co/tencent/HY-World-2.0)
- Odyssey — [X post](https://x.com/odysseyml/status/1927767196756853179)
- AK — [HoloDreamer X](https://x.com/_akhaliq/status/1815616891022418231?lang=en), [WorldVLA X](https://x.com/_akhaliq/status/1938713294115594394)

**Supporting facts on the products demoed**
- Genie 3 was announced Aug 5, 2025. Users can insert text prompts that change the world in real time, such as weather or new characters, and environments stay consistent for "several minutes" at 720p — [The Decoder](https://the-decoder.com/google-deepminds-genie-3-generates-interactive-3d-worlds-that-stay-consistent-for-multiple-minutes/); [TechCrunch](https://techcrunch.com/2025/08/05/deepmind-thinks-genie-3-world-model-presents-stepping-stone-towards-agi/)
- Project Genie, the consumer Genie 3 app, launched Jan 29, 2026 for Google AI Ultra subscribers in the US. Sessions are about 60 seconds, and Google says worlds may not always follow prompts or real-world physics — [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/); [9to5Google](https://9to5google.com/2026/01/29/google-project-genie/); worldwide Ultra expansion in May 2026 — [Wikipedia](https://en.wikipedia.org/wiki/Project_Genie_(website))
- Genie 4 (Oct 27, 2026) adds native audio and natural-language steering and is a trusted-tester research preview. TechCrunch says scenes stay consistent for up to 2 minutes; DeepMind's own page says only "several minutes". No benchmarks were published — [TechCrunch](https://techcrunch.com/2026/10/27/googles-genie-4-world-model-adds-audio-more-realistic-worlds-and-real-time-steering/); [DataNorth](https://datanorth.ai/news/google-deepmind-genie-4-world-model)
- Marble: limited beta Sept 16, 2025; general availability Nov 12, 2025. Inputs are text, photos, video, panoramas, or coarse 3D layouts. Exports are Gaussian splats, meshes, or video. It includes the Chisel editor. The free tier covers about 4 worlds — [Radiance Fields](https://radiancefields.com/world-labs-formally-launches-marble-a-generative-world-model); [TechCrunch](https://techcrunch.com/2025/11/12/fei-fei-lis-world-labs-speeds-up-the-world-model-race-with-marble-its-first-commercial-product/). The World API followed on Jan 21, 2026 — [World Labs blog](https://www.worldlabs.ai/blog/announcing-the-world-api). Marble 1.1 shipped around April 2026, with release dates differing by source (Apr 2 vs Apr 8) — [NYU RITS](https://rits.shanghai.nyu.edu/ai/world-labs-releases-marble-1-1-auto-expanding-3d-world-generation); [Product Hunt](https://www.producthunt.com/products/marble-by-world-labs/launches/marble-1-1)
- HunyuanWorld 1.0 (Jul 26, 2025) uses panoramic proxies, semantic layering, and mesh export — [GitHub](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0). Its license is "source available" rather than truly open source, with geographic and user restrictions — [The Neuron](https://www.theneuron.ai/explainer-articles/tencent-just-open-sourced-a-3d-world-generator). Follow-ups: HY-World 1.5 / WorldPlay, a real-time video world model at 24 FPS (Dec 2025) — [GitHub WorldPlay](https://github.com/Tencent-Hunyuan/HY-WorldPlay); HY-World 2.0, staged release Apr 16 to May 18, 2026, under a custom community license — [HY-World 2.0 wiki](https://github.com/Tencent-Hunyuan/HY-World-2.0/wiki)
- fly.pieter.com: Decrypt reported nearly 2,000 players at peak on a Grok-3-written WebSocket server — [Decrypt](https://decrypt.co/307892/ai-gaming-massive-elon-musk-shares-game). Avgeekery reported a 17,000 concurrent-player peak and about $5k/month in ads — [Avgeekery](https://avgeekery.com/new-flight-simulator-made-with-ai-earns-creator-5000-per-month/). The figures conflict.
- Vibe Jam 2025 winners: The Great Taxi Assignment (Tomas Bencko, $10k), Vibeware (Matt Gordon, $5k), Vector Tango (Scoble, $2.5k). There were 1,170 submissions, and the rule was at least 80% AI-generated — [levels.io](https://levels.io/winners-of-the-2025-vibe-code-game-jam)

**Indie / open-source projects found off-X (no X post URL recovered)**
- Athenaion (GitHub Leonxlnx/athenaion): a procedurally generated ancient-Greek three.js world built with Claude Code (Opus 5.5) over about 45 hours wall-clock. Self-reported figures: about 45k lines of JS, 55 subagents, $1.8k–$2.3k API-equivalent cost on a Max subscription, and no external assets — [GitHub wiki](https://github.com/Leonxlnx/athenaion/wiki)
- WorldSplat (timscheuerai/worldsplat): "open-source alternative to World Labs Marble". Pipeline: text, then Wan 2.2 video, MASt3R poses, gsplat 3DGS, and a browser viewer. Apache-2.0; only 6 stars, so not viral — [GitHub](https://github.com/timscheuerai/worldsplat)
- prompt-to-playable (bolajiev): the LLM outputs a JSON game document, and a fixed TypeScript/three.js engine runs it — [GitHub](https://github.com/bolajiev/prompt-to-playable)
- llm-game-engine (tomicz): a Go/raylib engine where an LLM turns natural-language commands into scene actions — [GitHub](https://github.com/tomicz/llm-game-engine)
- vibe-jet (cedrickchee): a three.js multiplayer flying game vibe-coded with Gemini 2.5 Pro, in the fly.pieter.com mold — [GitHub](https://github.com/cedrickchee/vibe-jet)
- A separate "blender-mcp" Show HN by HN user prono (repo pranav-deshmukh/blender-mcp, demo blender-mcp-psi.vercel.app), Jul 20, 2025: 151 points, 61 comments — [HN](https://news.ycombinator.com/item?id=44622374)
- Blender MCP + Picsart MCP workflow: Claude grey-boxes a scene in Blender, then a video model turns the render into a photoreal clip — [Picsart blog](https://picsart.com/blog/create-with-blender-mcp-and-picsart-mcp-in-claude/)
- World Labs' own examples, including a tavern demo, combine Spark splat rendering, Rapier physics, and three.js — [World Labs docs](https://docs.worldlabs.ai/api/interactive-world-examples.md). NVIDIA documents a Marble-to-Isaac Sim pipeline using PLY splats and GLB colliders — [NVIDIA blog](https://developer.nvidia.com/blog/simulate-robotic-environments-faster-with-nvidia-isaac-sim-and-world-labs-marble/)

### Inferences
- The "holodeck" framing and the 1.9M-view Blender MCP post suggest the most viral formats are short screen-recordings of a single prompt producing an inhabitable space.
- Indie work has moved from building generators to composing outputs: Genie to 3DGS (Sidhu), Marble to three.js/Spark games (Mason), Blender MCP to video models (Picsart). The labs' export formats (PLY/GLB splats) make this possible.
- LLM-as-code-author approaches (Claude/Cursor writing three.js, Blender MCP) generate editable, deterministic scenes. Neural world models (Genie, Odyssey) generate pixels. Marble and HY-World 2.0 sit in between, producing static 3DGS/mesh assets.

### Gaps
- Could not recover X posts for Athenaion, WorldSplat, prompt-to-playable, Moonlake AI, SpAItial Echo, Dynamics Lab Mirage 2, Skywork Matrix-Game 2.0/4.0, Meta WorldGen (a Meta-linked tweet of Nov 21, 2025 was reported, but its URL was not found), or Odyssey-3.
- Engagement numbers (views, likes) were only available for the sidahuj post (about 1.9M views, from a search snippet). No other post's reach could be verified.
- No direct X posts were found for "Claude/GPT builds three.js world in one prompt" beyond levelsio. Prompt-gallery pages (tripo3d.ai) cite model names and claims I could not verify.
- Ethan Mollick's reported Genie 4 test (a world from one prompt in about a minute) comes only from a secondary DEV Community post; the X URL was not found — [DEV](https://dev.to/976905690/google-deepminds-genie-4-lets-you-talk-a-playable-3d-world-into-existence-in-about-a-minute-3foh).

---

## Q2: Which researchers announce world/scene-generation papers on X (e.g., AK @_akhaliq, paper authors)?

### Takeaway
@_akhaliq remains the main paper amplifier for world and scene generation, though only older posts (HoloDreamer, WorldVLA) could be recovered as x.com URLs. In 2025–26, most big world-generation announcements came from lab and corporate accounts (@GoogleDeepMind, @theworldlabs, @TencentHunyuan, @odysseyml) plus invited early testers (@tejasdkulkarni, @holynski_), not from individual paper threads.

### Cited Findings
- @_akhaliq posted HoloDreamer ("Holistic 3D Panoramic World Generation from Text Descriptions") — [X](https://x.com/_akhaliq/status/1815616891022418231?lang=en) — and WorldVLA — [X](https://x.com/_akhaliq/status/1938713294115594394).
- AK's Hugging Face activity includes 2026 world-model papers such as Hy-Nomas ("Towards Free-form Interactive World Generation") and WorldCrafter (a camera-controlled video world model with 3D-aware memory). X URLs for these were not found — [HF trending](https://huggingface.co/papers/trending); [AK HF activity](https://huggingface.co/akhaliq/activity/posts)
- Genie 3 early-tester posts linked from HN: @tejasdkulkarni (written review), @holynski_ (live gameplay video, which an HN user used to estimate about 1.1 s keypress-to-photon latency), and a teaser by @demishassabis — [HN thread](https://news.ycombinator.com/item?id=44798166). Only Kulkarni's status URL was recovered — [X](https://x.com/tejasdkulkarni/status/1952737669894574264)
- Notable 2025–26 research for the report writer (found on arXiv and HF, not X):
  - Meta WorldGen (arXiv 2511.16825, CVPR 2026): turns text into traversable 3D worlds with LLM layout planning, procedural blockout, and a navmesh. Scenes reach about 50×50 m and take about 5 minutes to generate — [HF papers](https://huggingface.co/papers/2511.16825); [Meta blog](https://www.meta.com/blog/worldgen-3d-world-generation-reality-labs-generative-ai-research/); [AI News](https://www.artificialintelligence-news.com/news/worldgen-meta-generative-ai-for-interactive-3d-worlds/)
  - WorldClaw (arXiv 2608.05248): agentic coarse-to-fine 3D open-world generation at scale — [arXiv](https://arxiv.org/html/2608.05248v1)
  - WorldExplorer: camera-guided video, then 3DGS, for navigable text-generated scenes — [ACM](https://dl.acm.org/doi/full/10.1145/3757377.3763946)
  - OpenGame (CUHK MMLab, arXiv 2604.18394): agentic prompt-to-web-game with GameCoder-27B — [GitHub](https://github.com/leigest519/OpenGame)
  - Skywork Matrix-Game 4.0 (repo dated Oct 15, 2026): a game engine paired with a causal video model for neural rendering — [GitHub](https://github.com/SkyworkAI/Matrix-Game)

### Inferences
- For a "who announces on X" list, the most reliable handles are @_akhaliq (aggregator), corporate lab accounts, and a small set of invited testers and creators (@tejasdkulkarni, @holynski_, @bilawalsidhu). Individual author threads for WorldGen, WorldClaw, and similar papers were not found in search.

### Gaps
- No X posts were recovered from @_akhaliq for 2025–26 world-generation papers (WorldGen, HY-World 2.0, Hy-Nomas). He very likely posted them, but there is no URL evidence.
- @ylecun-type commentary on world models (e.g., JEPA vs generative world models) was not searched in depth. No X URLs were found.
- @holynski_ and @demishassabis status URLs were not recovered; their existence is known only through HN comments.

---

## Q3: Which indie/hackathon/open-source projects went viral on X, and what is the discourse (impressive vs limitations)?

### Takeaway
The clearest indie viral hits are Blender MCP (@sidahuj, about 1.9M views, the first MCP connecting Claude to Blender) and @levelsio's three-hour Cursor flight sim. The flight sim led to the Vibe Coding Game Jam (1,170 entries, judged by @karpathy and three.js creator @mrdoob). Across Genie and Marble, the discourse praises consistency, lighting, and the "holodeck" feel. Critics point to unreliable physics, failing game logic, short session limits, latency, on-rails camera paths, quality that degrades away from the input image, low-quality meshes, and confusion over what "world model" means.

### Cited Findings
**Viral indie / hackathon projects**
- Blender MCP: the post showed about 1.9M views (search snippet); the project is open source on GitHub — [X](https://x.com/sidahuj/status/1899460492999184534). GitHub star counts vary across directories (about 12k to 21.6k) — [ClaudeLog](https://claudelog.com/addons/blender-mcp); [Glama](https://glama.ai/mcp/servers/ahujasid/blender-mcp)
- fly.pieter.com: built in about 3 hours by someone who had never made a game — [Indie Hackers](https://www.indiehackers.com/post/tech/pieter-levels-used-ai-to-build-a-viral-flight-simulator-in-3-hours-with-no-background-in-game-development-7CPfMr1yRLEwH6cC8xhE). Decrypt reported Elon Musk sharing AI-made games in the same wave ("AI gaming will be massive") — [Decrypt](https://decrypt.co/307892/ai-gaming-massive-elon-musk-shares-game)
- Vibe Coding Game Jam 2025: 1,170 games; jury @karpathy, @mrdoob, @timsoret, @s13k_; sponsors Bolt.new and CodeRabbit; at least 80% AI-generated — [levels.io](https://levels.io/winners-of-the-2025-vibe-code-game-jam); [X](https://x.com/levelsio/status/1904997711201603950?lang=en). A vibecoding.app recap gives conflicting dates (July 2025) and looks unreliable — [vibecoding.app](https://vibecoding.app/events/recap/pieter-levels-vibe-code-game-jam-2025)
- Genie 3 to Gaussian splat (@bilawalsidhu): "Better than any image-to-3d model I've seen"; he also says the radiance field degrades more gracefully than an extracted mesh — [X](https://x.com/bilawalsidhu/status/1954229425199034753); [36Kr coverage](https://eu.36kr.com/en/p/3419098560580994)

**Discourse: impressive**
- Genie 3 HN thread (1,510 points, 490 comments): multi-minute consistency and real-time 720p ("bonkers"); progress faster than expected; possible disruption of game engines — [HN](https://news.ycombinator.com/item?id=44798166)
- Kulkarni: "Global illumination and lighting works surprisingly well". Visual memory keeps objects coherent under occlusion. It appears to learn non-rigid physics without an engine — [X](https://x.com/tejasdkulkarni/status/1952737669894574264)
- Marble HN thread (267 points, 83 comments): "I'm floored"; "worlds better than just doing gaussian splats from images"; static assets are cheaper to reuse than real-time world models; separate collider and detail meshes are useful for engines — [HN](https://news.ycombinator.com/item?id=45907541)

**Discourse: limitations / criticism**
- Kulkarni on Genie 3: "far from being a real game engine". Systematic rigid-body physics failures such as block stacking. "1vs1 combat games do not work". Long instruction following and combinatorial game logic fail. Limited action space — [X](https://x.com/tejasdkulkarni/status/1952737669894574264); [HN](https://news.ycombinator.com/item?id=44798166)
- HN critics of Genie 3: about 1.1 s control latency (ollin); shifting geometry and odd reflections, with no technical report (Vipitis); model-first games can't be tuned with parameters or keep external state (forrestthewoods); compute and energy cost concerns — [HN](https://news.ycombinator.com/item?id=44798166)
- Project Genie criticism: capped at 24 fps with little enjoyable gameplay (Fast Company, via search summary); 60-second generation limit — [Google blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/); critique of reliability for agent training — [TechTalks](https://bdtechtalks.substack.com/p/a-critical-look-at-deepminds-genie)
- HN critics of Marble: quality degrades away from the input image; demos are mostly pans or on-rails (a dolly-zoom feel); low-quality triangle meshes; "a glorified image generator"; "not a true world model", meaning static 3D scenes with no action-conditioned dynamics; some prompts blocked (asteroids, explosions); asking for a CS map produced a "CS-style" map rather than the real one — [HN](https://news.ycombinator.com/item?id=45907541)
- Genie 3 has no export path comparable to Marble, since it is built around live sessions rather than saved assets — [Tech Insider comparison](https://tech-insider.org/genie-3-vs-marble-vs-nvidia-cosmos-world-models-2026/)
- Blender MCP clone Show HN criticism: a stub repo; triangle rather than quad topology is a "dealbreaker" for manual refinement; "MCP server unnecessary, Blender can call LLM APIs directly" — [HN](https://news.ycombinator.com/item?id=44622374)
- Odyssey's early interactive video was blurry with unstable layouts — [Yahoo/TechCrunch syndication](https://ca.finance.yahoo.com/news/odysseys-ai-model-streams-3d-183417090.html). Mirage 2 struggles with precise controls and visual stability — [The Decoder](https://the-decoder.com/mirage-2-allows-users-to-turn-sketches-and-photos-into-interactive-game-worlds/)
- Vibe-coding critics flagged security and scalability problems with levelsio-style games — [ziva.sh](https://ziva.sh/blogs/vibe-coding-games)

### Inferences
- The discourse has two camps. Some see neural world models as a future replacement for game engines; others (game devs, Blender artists) prize editability, quad topology, parameter control, and persistent state. That favors LLM-writes-code approaches (Blender MCP, three.js) and asset-exporting models (Marble, HY-World 2.0) for real production use today.
- "World model" is contested terminology on X and HN. Marble and HY-World produce static 3DGS/meshes, while Genie and Odyssey produce interactive video. The report should keep the two categories apart.

### Gaps
- No Reddit threads (r/singularity, r/StableDiffusion, r/LocalLLaMA, r/blender, r/gamedev) were surfaced by search for Marble, HunyuanWorld, or Blender MCP. Community reaction there is undocumented in these notes.
- No original Show HN for ahujasid/blender-mcp was found; only the later clone by pranav-deshmukh.
- Engagement metrics for Genie and Marble X posts were not available.
- Some 2026 model names in secondary blogs and prompt galleries ("Opus 5.5", "Fable 5", "Sonnet 5.5") come from unverified aggregator pages. Athenaion's README does say "Claude Code (Opus 5.5)", but that is self-reported.
