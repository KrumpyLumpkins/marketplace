import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function unsafeReleasePaths(paths) {
  return paths.filter(path => {
    const name = path.split('/').at(-1);
    return (name.startsWith('.env') && !name.endsWith('.example'))
      || /(^|\/)(node_modules|\.context|\.next|coverage|storybook-static|test-results|playwright-report|\.playwright-cli)(\/|$)/.test(path)
      || /\.(sqlite(?:\.app)?(?:-wal|-shm)?|pem|key|tsbuildinfo)$/.test(name);
  });
}

export function checkRepository() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
  const unsafe = unsafeReleasePaths(files);
  if (unsafe.length) {
    console.error('Remove local configuration/generated state from the release tree:\n' + unsafe.join('\n'));
    return false;
  }
  console.log('Release tree hygiene passed. This does not validate deployment inputs or launch gates.');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = checkRepository() ? 0 : 1;
