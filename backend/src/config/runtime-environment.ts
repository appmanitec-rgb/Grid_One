import { isIP } from 'node:net';
import { isAbsolute, relative } from 'node:path';
import { tmpdir } from 'node:os';

type Environment = Record<string, string | undefined>;
const placeholder = /REPLACE_|USER:PASSWORD@HOST|^DB_NAME$|^change_me/i;

function webUrl(name: string, value: string, deployed: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}: URL inválida.`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (deployed && url.protocol !== 'https:' && !loopback)
  ) {
    throw new Error(
      `${name}: use HTTPS no endereço público (HTTP permitido somente em localhost).`,
    );
  }
  return url;
}

/** Shared by startup and env:check; messages never include secrets. */
export function validateRuntimeEnvironment(env: Environment = process.env) {
  const deployed = ['production', 'staging'].includes(env.NODE_ENV || '');
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  if (deployed)
    required.push('CORS_ORIGINS', 'APP_BASE_URL', 'FRONTEND_BASE_URL');
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}.`);
  if (required.some((key) => placeholder.test(env[key] || ''))) {
    throw new Error(
      'Substitua os valores de exemplo das variáveis obrigatórias.',
    );
  }
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL!);
  } catch {
    throw new Error('DATABASE_URL inválida.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !database.hostname ||
    database.pathname === '/'
  ) {
    throw new Error('DATABASE_URL deve identificar um banco PostgreSQL.');
  }
  for (const key of ['DB_NAME', 'EXPECTED_DB_NAME']) {
    if (
      env[key] &&
      decodeURIComponent(database.pathname.slice(1)) !== env[key]
    ) {
      throw new Error(
        `DATABASE_URL difere de ${key}; inicialização cancelada.`,
      );
    }
  }
  if (deployed && env.JWT_SECRET!.length < 32)
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres aleatórios.');
  if (
    deployed &&
    env.MFA_ENCRYPTION_KEY &&
    (env.MFA_ENCRYPTION_KEY.length < 32 ||
      placeholder.test(env.MFA_ENCRYPTION_KEY))
  ) {
    throw new Error(
      'MFA_ENCRYPTION_KEY configurada deve ter pelo menos 32 caracteres aleatórios.',
    );
  }
  for (const key of ['APP_BASE_URL', 'FRONTEND_BASE_URL', 'FRONTEND_URL']) {
    if (env[key]) webUrl(key, env[key], deployed);
  }
  if (env.CORS_ORIGINS) {
    const origins = env.CORS_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origins.length) throw new Error('CORS_ORIGINS não pode ser vazia.');
    for (const value of origins) {
      const origin = webUrl('CORS_ORIGINS', value, deployed);
      if (
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash ||
        origin.hostname.includes('*')
      ) {
        throw new Error(
          'CORS_ORIGINS deve conter origens explícitas, sem caminhos ou curingas.',
        );
      }
    }
  }
  const driver = (env.FILE_STORAGE_DRIVER || 'local').toLowerCase();
  if (!['local', 's3', 'minio', 'supabase'].includes(driver))
    throw new Error('FILE_STORAGE_DRIVER desconhecido.');
  if (driver !== 'local') {
    const storageKeys = [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ];
    if (
      storageKeys.some((key) => !env[key]?.trim() || placeholder.test(env[key]))
    ) {
      throw new Error(
        'Configure as credenciais do armazenamento externo selecionado.',
      );
    }
  } else if (deployed) {
    const directory = env.FILE_STORAGE_LOCAL_PATH || env.FILE_STORAGE_DIR;
    if (!directory || !isAbsolute(directory))
      throw new Error(
        'Configure FILE_STORAGE_LOCAL_PATH com um caminho absoluto permanente.',
      );
    const temporaryRelative = relative(tmpdir(), directory);
    if (
      !temporaryRelative ||
      (!temporaryRelative.startsWith('..') && !isAbsolute(temporaryRelative))
    ) {
      throw new Error(
        'O armazenamento de produção não pode ficar na pasta temporária.',
      );
    }
  }
  if (env.API_TRUST_PROXY) {
    const entries = env.API_TRUST_PROXY.split(',').map((value) => value.trim());
    if (
      entries.some((entry) => {
        if (entry === 'loopback') return false;
        const [ip, prefix, extra] = entry.split('/');
        const version = isIP(ip);
        return (
          !version ||
          !!extra ||
          (prefix !== undefined &&
            (!/^\d+$/.test(prefix) ||
              Number(prefix) > (version === 4 ? 32 : 128)))
        );
      })
    )
      throw new Error(
        'API_TRUST_PROXY aceita somente loopback, IPs ou redes CIDR explícitas.',
      );
  }
  if (
    deployed &&
    ['yes', 'true', '1'].includes((env.ALLOW_DB_RESTORE || '').toLowerCase())
  ) {
    throw new Error(
      'Desative ALLOW_DB_RESTORE antes de iniciar o servidor de produção.',
    );
  }
  return { environment: env.NODE_ENV || 'development', storage: driver };
}
