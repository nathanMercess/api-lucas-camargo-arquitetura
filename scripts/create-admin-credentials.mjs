import { randomBytes, randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { stdin, stderr, stdout } from 'node:process';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { argon2id } from 'hash-wasm';

const defaultUsername = 'nathanMercess';
const defaultEmail = 'nathan66merces@gmail.com';
const minimumPasswordLength = 12;

const prompt = createInterface({ input: stdin, output: stderr });
const username = (await prompt.question(`Usuário [${defaultUsername}]: `)).trim() || defaultUsername;
const email = (await prompt.question(`E-mail [${defaultEmail}]: `)).trim() || defaultEmail;
prompt.close();

const password = await readSecret('Senha (mínimo de 12 caracteres): ');
const passwordConfirmation = await readSecret('Confirme a senha: ');

if (password.length < minimumPasswordLength)
  fail(`A senha deve ter pelo menos ${minimumPasswordLength} caracteres.`);

if (password !== passwordConfirmation)
  fail('As senhas não coincidem.');

if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/.test(username))
  fail('O usuário deve ter entre 3 e 80 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  fail('Informe um e-mail válido.');

const passwordHash = await argon2id({
  password,
  salt: randomBytes(16),
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
  outputType: 'encoded',
});
const credentials = JSON.stringify({
  version: 1,
  users: [
    {
      id: randomUUID(),
      username,
      email: email.toLowerCase(),
      passwordHash,
      role: 'owner',
      active: true,
    },
  ],
}, null, 2);
const outputPath = readOutputPath(process.argv.slice(2));

if (outputPath) {
  await assertFileDoesNotExist(outputPath);
  await writeFile(outputPath, `${credentials}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  stderr.write(`Credenciais gravadas em ${outputPath}.\n`);
} else {
  stdout.write(`${credentials}\n`);
}

function readSecret(label) {
  if (!stdin.isTTY)
    fail('A geração de senha exige um terminal interativo.');

  readline.emitKeypressEvents(stdin);
  const previousRawMode = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  stderr.write(label);

  return new Promise((resolve) => {
    const characters = [];
    const onKeypress = (character, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        fail('Operação cancelada.');
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(characters.join(''));
        return;
      }

      if (key.name === 'backspace') {
        characters.pop();
        return;
      }

      if (!key.ctrl && !key.meta && character)
        characters.push(character);
    };
    const cleanup = () => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(previousRawMode);
      stderr.write('\n');
    };

    stdin.on('keypress', onKeypress);
  });
}

function readOutputPath(argumentsList) {
  if (argumentsList.length === 0)
    return undefined;

  if (argumentsList.length === 2 && argumentsList[0] === '--output' && argumentsList[1])
    return argumentsList[1];

  fail('Uso: yarn credentials:create [--output admin-credentials.json]');
}

async function assertFileDoesNotExist(path) {
  try {
    await access(path);
    fail(`O arquivo ${path} já existe. Remova-o ou escolha outro destino.`);
  } catch (error) {
    if (error && error.code === 'ENOENT')
      return;

    throw error;
  }
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}
