export type ParsedArgs = {
  command: string;
  positionals: string[];
  output?: string;
  view?: string;
};

export function parseArgs(raw: string[]): ParsedArgs {
  const [command = "help", ...rest] = raw;
  const positionals: string[] = [];
  let output: string | undefined;
  let view: string | undefined;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--output" || arg === "-o") {
      output = rest[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--view") {
      view = rest[i + 1];
      i += 1;
      continue;
    }
    positionals.push(arg);
  }

  return { command, positionals, output, view };
}
