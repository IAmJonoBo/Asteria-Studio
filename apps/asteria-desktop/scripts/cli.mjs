const supportsColor = Boolean(process.stdout.isTTY);
const colorize = (code) => (value) =>
  supportsColor ? `\u001b[${code}m${value}\u001b[0m` : value;

const dim = colorize("2");
const green = colorize("32");
const yellow = colorize("33");
const red = colorize("31");
const cyan = colorize("36");

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}m ${remainder.toFixed(1)}s`;
};

const timestamp = () => {
  const now = new Date();
  const pad = (value) => value.toString().padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const statusLabel = (status) => {
  if (status === "ok") return green("ok");
  if (status === "warn") return yellow("warn");
  return red("fail");
};

export const section = (title) => {
  const width = Math.max(48, Math.min(80, title.length + 12));
  const rule = "=".repeat(width);
  console.log(`\n${rule}`);
  console.log(cyan(title));
  console.log(rule);
};

export const info = (message) => {
  console.log(`  ${message}`);
};

export const note = (message) => {
  console.log(dim(`  ${message}`));
};

export const startStep = (label) => {
  const startedAt = Date.now();
  console.log(`${dim(timestamp())} [start] ${label}`);
  return (status = "ok", detail) => {
    const duration = formatDuration(Date.now() - startedAt);
    const suffix = detail ? ` - ${detail}` : "";
    console.log(
      `${dim(timestamp())} [${statusLabel(status)}] ${label}${suffix} ${dim(`(${duration})`)}`
    );
  };
};
