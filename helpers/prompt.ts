import * as readline from "readline";

/**
 * Minimal terminal prompt helpers - no extra dependencies.
 * Used only for the one-time interactive credential entry fallback,
 * never during normal CI/headless runs.
 */

export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts for input without echoing it to the terminal (for passwords).
 * Falls back to a visible prompt if stdin isn't a TTY (can't mask there anyway).
 */
export function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return ask(question);
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    let input = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (char: string) => {
      switch (char) {
        case "\n":
        case "\r":
        case "": // Ctrl-D
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input.trim());
          break;
        case "": // Ctrl-C
          process.stdout.write("\n");
          process.exit(1);
          break;
        case "": // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
          break;
        default:
          input += char;
          process.stdout.write("*");
          break;
      }
    };

    stdin.on("data", onData);
  });
}

export async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const answer = (await ask(question + suffix)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith("y");
}
