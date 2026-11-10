// Allowlist per plan §5 on EZF-43: nothing else from the host environment reaches the shell.
const DEFAULT_PATH = '/usr/local/bin:/usr/bin:/bin';

export function scrubbedEnv(source: NodeJS.ProcessEnv, home: string): Record<string, string> {
  return {
    PATH: source.PATH || DEFAULT_PATH,
    TERM: 'xterm-256color',
    LANG: source.LANG || 'C.UTF-8',
    HOME: home,
    SHELL: '/bin/bash',
  };
}
