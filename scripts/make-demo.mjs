import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".demo");
const OUT = join(ROOT, "assets");
const STEP = 80;
const FPS = 1000 / STEP;
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf";
const frames = (seconds) => Math.round((seconds * 1000) / STEP);

const CLIPS = [
  {
    name: "dopamine-receptors",
    segments: [
      { caption: "dopamine releases onto D1 and D2 receptors: cAMP up on D1, down on D2", seconds: 3.2, actions: [] },
      { caption: "block the D2 receptor and its brake on cAMP is lost", seconds: 3.2, actions: [["eval", "document.getElementById('anta').click()"]] },
      { caption: "raise dopamine and the D1 signal strengthens", seconds: 2.6, actions: [["eval", "document.getElementById('anta').click();var l=document.getElementById('level');l.value=2;l.dispatchEvent(new Event('input'))"]] },
    ],
  },
  {
    name: "stimulants-dat",
    segments: [
      { caption: "normally the dopamine transporter clears the cleft", seconds: 2.8, actions: [] },
      { caption: "cocaine blocks the transporter: dopamine lingers", seconds: 3.2, actions: [["key", "2"]] },
      { caption: "amphetamine is carried in, leaks vesicles and reverses the transporter", seconds: 3.6, actions: [["key", "3"]] },
    ],
  },
  {
    name: "reward-addiction",
    segments: [
      { caption: "mesolimbic pathway: VTA dopamine neurons project to the nucleus accumbens", seconds: 2.8, actions: [] },
      { caption: "a cue fires amygdala and hippocampus, then VTA, then accumbens", seconds: 4.2, actions: [["click", "#cue-btn"]] },
      { caption: "after repeated exposure (one model): lower D2, sensitised cue response, weaker control", seconds: 3.6, actions: [["key", "2"], ["click", "#cue-btn"]] },
    ],
  },
  {
    name: "semaglutide-glp1",
    segments: [
      { caption: "semaglutide binds the GLP-1 receptor on a pancreatic beta cell", seconds: 3, actions: [] },
      { caption: "low glucose: strong cAMP signal, but insulin release stays negligible", seconds: 3.2, actions: [["eval", "var g=document.getElementById('glu');g.value=10;g.dispatchEvent(new Event('input'))"]] },
      { caption: "high glucose: the same signal now potentiates insulin release", seconds: 3.4, actions: [["eval", "var g=document.getElementById('glu');g.value=95;g.dispatchEvent(new Event('input'))"]] },
    ],
  },
  {
    name: "estrogen-aggression",
    segments: [
      { caption: "testosterone is converted by aromatase, then estradiol binds receptor alpha", seconds: 3.2, actions: [] },
      { caption: "block aromatase and testosterone cannot become estradiol", seconds: 3.4, actions: [["eval", "document.getElementById('block').click()"]] },
    ],
  },
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: ROOT, ...options });
  if (result.status !== 0) throw new Error(`${command} failed`);
};

const drive = (clip, dir) => {
  const actions = [["wait", 1500]];
  let start = 0;
  for (const segment of clip.segments) {
    actions.push(...segment.actions);
    const count = frames(segment.seconds);
    actions.push(["record", dir, count, STEP, ".iso-plate", 1, start]);
    start += count;
  }
  const file = join(WORK, `${clip.name}.json`);
  writeFileSync(file, JSON.stringify(actions));
  const page = join(ROOT, "examples", clip.name, `${clip.name}.html`);
  run(process.execPath, ["--experimental-websocket", join(ROOT, "scripts/drive.mjs"), page, "--actions", file, "--width", "1200", "--height", "1000"]);
};

const encode = (clip, dir, out) => {
  let from = 0;
  const filters = ["scale=960:600:force_original_aspect_ratio=decrease", "pad=960:648:(ow-iw)/2:0:color=0x0b0b0b"];
  for (const segment of clip.segments) {
    const to = from + segment.seconds;
    const text = segment.caption.replaceAll("'", "").replaceAll(":", "\\:").replaceAll(",", "\\,");
    filters.push(`drawtext=fontfile=${FONT}:text='${text}':fontcolor=0xd4d4d4:fontsize=17:x=(w-text_w)/2:y=h-34:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`);
    from = to;
  }
  run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "frame-%05d.jpg"), "-vf", filters.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", out]);
};

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const parts = [];
for (const clip of CLIPS) {
  const dir = join(WORK, clip.name);
  drive(clip, dir);
  const part = join(WORK, `${clip.name}.mp4`);
  encode(clip, dir, part);
  parts.push(part);
}

writeFileSync(join(WORK, "list.txt"), parts.map((part) => `file '${part}'`).join("\n"));
run("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(WORK, "list.txt"), "-c", "copy", join(OUT, "demo.mp4")]);
run("ffmpeg", ["-loglevel", "error", "-y", "-i", join(OUT, "demo.mp4"), "-vf", "fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", join(OUT, "demo.gif")]);
rmSync(WORK, { recursive: true, force: true });
console.log("wrote assets/demo.mp4 and assets/demo.gif");
