import * as k8s from '@kubernetes/client-node';

export interface RunJobInput {
  runId: string;
  workspaceId: string;
  language: string;
  version?: string;
  entryFile?: string;
  content?: string;
  runtimeClassName: string;
  timeoutMs: number;
  namespace: string;
}

interface CatalogEntry {
  image: string;
  /** Returns the sh -lc script given base64-encoded content (always provided now) */
  getScript: (codeB64: string) => string;
  /** Whether the container needs a writable /tmp (compiled languages) */
  needsTmpVolume?: boolean;
}

// Non-executable languages — handled before K8s job creation
export const NON_EXECUTABLE_LANGS = new Set(['html', 'json', 'xml', 'mysql', 'postgresql', 'plsql', 'mongodb']);

const languageCatalog: Record<string, CatalogEntry> = {
  // ── Interpreted: pipe base64 content directly to interpreter stdin ──────────
  node:       { image: 'node:20-alpine',                          getScript: (b) => `echo "${b}" | base64 -d | node -` },
  javascript: { image: 'node:20-alpine',                          getScript: (b) => `echo "${b}" | base64 -d | node -` },
  nodejs:     { image: 'node:20-alpine',                          getScript: (b) => `echo "${b}" | base64 -d | node -` },
  react:      { image: 'node:20-alpine',                          getScript: (b) => `echo "${b}" | base64 -d | node -` },
  python:     { image: 'python:3.12-alpine',                      getScript: (b) => `echo "${b}" | base64 -d | python3 -` },
  ruby:       { image: 'ruby:3.3-alpine',                         getScript: (b) => `echo "${b}" | base64 -d | ruby` },
  php:        { image: 'php:8.3-alpine',                          getScript: (b) => `echo "${b}" | base64 -d | php` },
  lua:        { image: 'nickblah/lua:5.4-alpine',  needsTmpVolume: true, getScript: (b) => `echo "${b}" | base64 -d > /tmp/m.lua && lua /tmp/m.lua` },
  groovy:     { image: 'groovy:4.0-jdk21',         needsTmpVolume: true, getScript: (b) => `echo "${b}" | base64 -d > /tmp/m.groovy && groovy /tmp/m.groovy` },

  // ── Compiled: write to /tmp, compile, then run ───────────────────────────────
  c:          { image: 'gcc:14',                   needsTmpVolume: true, getScript: (b) => `echo "${b}" | base64 -d > /tmp/m.c && gcc -O2 -o /tmp/m /tmp/m.c && /tmp/m` },
  cpp:        { image: 'gcc:14',                   needsTmpVolume: true, getScript: (b) => `echo "${b}" | base64 -d > /tmp/m.cpp && g++ -O2 -o /tmp/m /tmp/m.cpp && /tmp/m` },
  java:       { image: 'eclipse-temurin:21-alpine', needsTmpVolume: true, getScript: (b) => `echo "${b}" | base64 -d > /tmp/Main.java && javac /tmp/Main.java -d /tmp && java -cp /tmp Main` },
  csharp:     { image: 'mcr.microsoft.com/dotnet/sdk:8.0-alpine', needsTmpVolume: true,
                getScript: (b) => `mkdir -p /tmp/app && echo "${b}" | base64 -d > /tmp/app/Program.cs && printf '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>' > /tmp/app/app.csproj && cd /tmp/app && dotnet run` },
  assembly:   { image: 'debian:12-slim',           needsTmpVolume: true,
                getScript: (b) => `apt-get install -y -qq nasm binutils 2>/dev/null && echo "${b}" | base64 -d > /tmp/m.asm && nasm -f elf64 /tmp/m.asm -o /tmp/m.o && ld /tmp/m.o -o /tmp/m && /tmp/m` },
};

export function buildRunnerJobSpec(input: RunJobInput): k8s.V1Job {
  const entry = languageCatalog[input.language];
  if (!entry) throw new Error(`Unsupported language: ${input.language}`);

  const codeB64 = input.content
    ? Buffer.from(input.content).toString('base64')
    : '';

  const runScript = entry.getScript(codeB64);

  const volumes: k8s.V1Volume[] = entry.needsTmpVolume
    ? [{ name: 'tmp', emptyDir: { medium: 'Memory' } }]
    : [];

  const volumeMounts: k8s.V1VolumeMount[] = entry.needsTmpVolume
    ? [{ name: 'tmp', mountPath: '/tmp' }]
    : [];

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `run-${input.runId}`,
      namespace: input.namespace,
      labels: {
        app: 'code-relay-runner',
        workspaceId: input.workspaceId,
        runId: input.runId
      }
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 300,
      activeDeadlineSeconds: Math.ceil(input.timeoutMs / 1000),
      template: {
        metadata: {
          labels: {
            app: 'code-relay-runner',
            workspaceId: input.workspaceId,
            runId: input.runId
          }
        },
        spec: {
          runtimeClassName: input.runtimeClassName,
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          securityContext: {
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' }
          },
          containers: [
            {
              name: 'runner',
              image: entry.image,
              command: ['sh', '-lc'],
              args: [runScript],
              env: [{ name: 'ENTRY_FILE', value: input.entryFile ?? '' }],
              resources: {
                requests: { cpu: '250m', memory: '128Mi' },
                limits: { cpu: '500m', memory: '256Mi' }
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] },
                readOnlyRootFilesystem: !entry.needsTmpVolume
              },
              volumeMounts: volumeMounts.length ? volumeMounts : undefined
            }
          ],
          volumes: volumes.length ? volumes : undefined
        }
      }
    }
  };
}

export function getBatchClient() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.BatchV1Api);
}
