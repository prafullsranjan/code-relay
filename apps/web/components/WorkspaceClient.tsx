'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as MonacoEditor from '@monaco-editor/react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { apiUrl, collabBase } from '../lib/api';
import { useTheme } from './ThemeProvider';

const Editor = MonacoEditor.default as any;

// Language catalog — id must match the API enum and executor
const LANGUAGES = [
  { id: 'html',       label: 'HTML',             version: 'HTML5',                monacoId: 'html',       entryFile: 'index.html',   defaultCode: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Hello</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n' },
  { id: 'python',     label: 'Python',            version: 'Python 3.12',          monacoId: 'python',     entryFile: 'main.py',      defaultCode: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("World"))\n' },
  { id: 'javascript', label: 'JavaScript',        version: 'ES2024',               monacoId: 'javascript', entryFile: 'index.js',     defaultCode: 'const greet = (name) => `Hello, ${name}!`;\nconsole.log(greet("World"));\n' },
  { id: 'java',       label: 'Java',              version: 'Java 21 (JDK)',        monacoId: 'java',       entryFile: 'Main.java',    defaultCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n' },
  { id: 'c',          label: 'C',                 version: 'C17 / GCC 14',         monacoId: 'c',          entryFile: 'main.c',       defaultCode: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}\n' },
  { id: 'cpp',        label: 'C++',               version: 'C++23 / GCC 14',       monacoId: 'cpp',        entryFile: 'main.cpp',     defaultCode: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n' },
  { id: 'php',        label: 'PHP',               version: 'PHP 8.3',              monacoId: 'php',        entryFile: 'main.php',     defaultCode: '<?php\n\nfunction greet(string $name): string {\n    return "Hello, $name!";\n}\n\necho greet("World") . PHP_EOL;\n' },
  { id: 'csharp',     label: 'C#',                version: 'C# 12 / .NET 8',       monacoId: 'csharp',     entryFile: 'Program.cs',   defaultCode: 'using System;\n\nclass Program {\n    static void Main(string[] args) {\n        Console.WriteLine("Hello, World!");\n    }\n}\n' },
  { id: 'assembly',   label: 'Assembly',          version: 'NASM 2.16 (x86-64)',   monacoId: 'plaintext',  entryFile: 'main.asm',     defaultCode: 'section .data\n    msg db "Hello, World!", 10\n    len equ $ - msg\n\nsection .text\n    global _start\n\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, len\n    syscall\n    mov rax, 60\n    xor rdi, rdi\n    syscall\n' },
  { id: 'lua',        label: 'Lua',               version: 'Lua 5.4',              monacoId: 'lua',        entryFile: 'main.lua',     defaultCode: 'local function greet(name)\n    return string.format("Hello, %s!", name)\nend\n\nprint(greet("World"))\n' },
  { id: 'nodejs',     label: 'NodeJS',            version: 'Node.js v20 LTS',      monacoId: 'javascript', entryFile: 'index.js',     defaultCode: "const http = require('http');\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'text/plain' });\n  res.end('Hello, World!\\n');\n});\n\nconsole.log('Hello from Node.js!');\n" },
  { id: 'groovy',     label: 'Groovy',            version: 'Apache Groovy 4.0',    monacoId: 'java',       entryFile: 'main.groovy',  defaultCode: 'def greet = { name -> "Hello, ${name}!" }\nprintln greet("World")\n' },
  { id: 'ruby',       label: 'Ruby',              version: 'Ruby 3.3',             monacoId: 'ruby',       entryFile: 'main.rb',      defaultCode: 'def greet(name)\n  "Hello, #{name}!"\nend\n\nputs greet("World")\n' },
  { id: 'json',       label: 'JSON',              version: 'JSON5 / RFC 8259',     monacoId: 'json',       entryFile: 'data.json',    defaultCode: '{\n  "message": "Hello, World!",\n  "items": [1, 2, 3]\n}\n' },
  { id: 'xml',        label: 'XML',               version: 'XML 1.0 / 1.1',        monacoId: 'xml',        entryFile: 'data.xml',     defaultCode: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <message>Hello, World!</message>\n  <items>\n    <item>1</item>\n    <item>2</item>\n  </items>\n</root>\n' },
] as const;

type LangId = typeof LANGUAGES[number]['id'];

const LANG_COLORS: Record<string, string> = {
  html: '#e34f26', python: '#3776ab', javascript: '#f0db4f',
  java: '#f89820', php: '#8892be', nodejs: '#68a063',
  ruby: '#cc342d', c: '#03599c', cpp: '#00599c',
  csharp: '#239120', lua: '#000080', groovy: '#4298b8', assembly: '#5c6bc0',
  json: '#6b7280', xml: '#e44d26',
};

// Module-level flag — Monaco language registrations are module-scoped; register once only
let _formattersRegistered = false;

// ── XML pretty-printer (browser-only: uses DOMParser for validation) ─────────
function prettyXml(xml: string): string | null {
  if (typeof window !== 'undefined') {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
  }
  const INDENT = '  ';
  // Collapse all whitespace between tags so we re-indent cleanly
  const flat = xml.replace(/>\s+</g, '><').replace(/^\s+|\s+$/g, '');
  let result = '';
  let depth  = 0;
  let i      = 0;
  while (i < flat.length) {
    if (flat[i] !== '<') {
      const end  = flat.indexOf('<', i);
      const text = (end === -1 ? flat.slice(i) : flat.slice(i, end)).trim();
      if (text) result += INDENT.repeat(depth) + text + '\n';
      i = end === -1 ? flat.length : end;
      continue;
    }
    const end = flat.indexOf('>', i);
    if (end === -1) { result += flat.slice(i); break; }
    const tag = flat.slice(i, end + 1);
    i = end + 1;
    if (tag.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      result += INDENT.repeat(depth) + tag + '\n';
    } else if (tag.startsWith('<?') || tag.startsWith('<!--') || tag.endsWith('/>')) {
      result += INDENT.repeat(depth) + tag + '\n';
    } else {
      result += INDENT.repeat(depth) + tag + '\n';
      depth++;
    }
  }
  return result.trim() + '\n';
}

// Text color on top of the lang color background (most are dark, JS/PHP need dark text)
const LANG_TEXT: Record<string, string> = {
  javascript: '#1a1200',
  php: '#fff',
};

function getLang(id: LangId) {
  return LANGUAGES.find((l) => l.id === id)!;
}

type Workspace = {
  id: string;
  ownerId: string;
  title: string;
  mode: 'LOCAL' | 'GHE_BOUND';
  createdAt: string;
};

type RunEvent = {
  id: number;
  stream: string;
  chunk: string;
};

export function WorkspaceClient({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { theme } = useTheme();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [lang, setLang] = useState<LangId>('javascript');
  const [files, setFiles] = useState<string[]>(['index.js']);
  const [activeFile, setActiveFile] = useState('index.js');
  const [stdin, setStdin] = useState('');
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [guestLink, setGuestLink] = useState('');
  const [guestLinkError, setGuestLinkError] = useState(false);
  const [copied, setCopied] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionEnding, setSessionEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [wsRenaming, setWsRenaming] = useState(false);
  const [wsRenameVal, setWsRenameVal] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // HTML preview (client-side rendering)
  const [htmlPreview, setHtmlPreview]   = useState<string | null>(null);
  // Track current run for the Stop/cancel button
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  // Duration (ms) of the last completed run — shown in build output header
  const [runDuration, setRunDuration]   = useState<number | null>(null);
  // Resizable panel dimensions — stored in refs and applied directly to DOM
  // (avoids React re-renders on every drag event and inline-style lint warnings)
  const leftPctRef      = useRef(60);
  const buildHRef       = useRef(152);
  const stdinHRef       = useRef(190);
  // Wall-clock start of the current run (ref → stable inside stale closures)
  const runStartTimeRef = useRef<number | null>(null);
  // Hidden <input type="file"> for the Upload button
  const uploadInputRef  = useRef<HTMLInputElement | null>(null);

  const ydoc   = useMemo(() => new Y.Doc(), []);
  // Shared types — observed by all connected clients for live sync
  const yMeta  = useMemo(() => ydoc.getMap<string>('meta'),   [ydoc]);
  const yFiles = useMemo(() => ydoc.getArray<string>('files'), [ydoc]);
  const providerRef   = useRef<HocuspocusProvider | null>(null);
  const bindingRef    = useRef<MonacoBinding | null>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const editorRef     = useRef<any>(null);
  const monacoRef     = useRef<any>(null);
  // Refs keep the latest values accessible inside stale closures (e.g. onMount)
  const langRef       = useRef<LangId>('javascript');
  const activeFileRef = useRef('index.js');
  // Drag-resize refs (avoids stale-closure issues in document event listeners)
  const draggingRef   = useRef<null | 'h-split' | 'build' | 'stdin'>(null);
  const dragOriginRef = useRef({ clientX: 0, clientY: 0, startVal: 0 });
  const bodyRef       = useRef<HTMLDivElement>(null);
  // Per-language code cache — keeps code across language switches (session-scoped only)
  const langCodeCacheRef = useRef<Record<string, string>>({});

  // Keep refs in sync
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

  // Fetch current user identity
  useEffect(() => {
    fetch(apiUrl('/me'), { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.id) setCurrentUserId(data.id); })
      .catch(() => {});
  }, []);

  // Load workspace metadata
  useEffect(() => {
    fetch(apiUrl(`/workspaces/${workspaceId}`), { credentials: 'include' })
      .then((r) => r.json())
      .then(setWorkspace);
  }, [workspaceId]);

  // Bind the Monaco editor to a Y.Text for the given file
  const bindFile = useCallback((filename: string) => {
    if (!editorRef.current || !monacoRef.current) return;

    bindingRef.current?.destroy();
    bindingRef.current = null;

    const meta   = getLang(langRef.current);
    const ytext  = ydoc.getText(`file:${filename}`);

    const uri = monacoRef.current.Uri.parse(
      `inmemory://workspace/${workspaceId}/${filename}`
    );
    let model = monacoRef.current.editor.getModel(uri);
    if (!model) {
      model = monacoRef.current.editor.createModel('', meta.monacoId, uri);
    }
    monacoRef.current.editor.setModelLanguage(model, meta.monacoId);
    editorRef.current.setModel(model);

    // Always create MonacoBinding — awareness is optional (adds cursor sync).
    // Do NOT guard on providerRef.current?.awareness: if the provider isn't ready
    // yet, we pass null and code sync still works; cursor sync upgrades later.
    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editorRef.current]),
      providerRef.current?.awareness ?? null
    );
  }, [ydoc, workspaceId]);

  // Set up collaborative provider + run-event socket
  useEffect(() => {
    // ── Yjs observers: keep React state in sync with remote changes ────────
    function onMetaChange() {
      if (yMeta.get('ended') === '1') {
        router.push('/');
        return;
      }
      const remoteLang = yMeta.get('lang') as LangId | undefined;
      if (remoteLang && LANGUAGES.find((l) => l.id === remoteLang) && remoteLang !== langRef.current) {
        setLang(remoteLang);
        langRef.current = remoteLang;
      }
      const remoteStdin = yMeta.get('stdin');
      if (remoteStdin !== undefined) setStdin(remoteStdin);
    }

    function onFilesChange() {
      const arr = yFiles.toArray();
      if (arr.length === 0) return;
      setFiles(arr);
      // Switch active file if it was removed (e.g. by a lang change on another client)
      if (!arr.includes(activeFileRef.current)) {
        setActiveFile(arr[0]);
        activeFileRef.current = arr[0];
        setTimeout(() => bindFile(arr[0]), 0);
      }
    }

    yMeta.observe(onMetaChange);
    yFiles.observe(onFilesChange);

    providerRef.current = new HocuspocusProvider({
      url: collabBase,
      name: `${workspaceId}:main`,
      document: ydoc,
      connect: true,
      // token is required to trigger the Hocuspocus Auth handshake; without it the
      // server (which has onAuthenticate defined) queues every message indefinitely
      // and onSynced never fires. The server ignores the value and authorises via
      // the HTTP upgrade request headers / cookies instead.
      token: 'cr-auth',
      onSynced() {
        // ── Step 1: Seed shared metadata (lang, files) if this is the first client.
        // Any subsequent client gets the already-synced values and skips this block.
        if (!yMeta.get('lang')) {
          const storedLang = localStorage.getItem(`cr-lang-${workspaceId}`) as LangId | null;
          const seedLang: LangId =
            storedLang && LANGUAGES.find((l) => l.id === storedLang) ? storedLang : 'javascript';
          const meta = getLang(seedLang);
          yMeta.set('lang', seedLang);
          if (yFiles.length === 0) yFiles.insert(0, [meta.entryFile]);
        }
        if (yMeta.get('stdin') === undefined) {
          const storedStdin = localStorage.getItem(`cr-stdin-${workspaceId}`);
          if (storedStdin) yMeta.set('stdin', storedStdin);
        }

        // ── Step 2: Seed code Y.Texts — only for files that are still empty
        // after sync, meaning no other client has written to them yet.
        // For the 2nd+ client the Y.Texts already have content and this is a no-op.
        const activeLang = (yMeta.get('lang') ?? 'javascript') as LangId;
        const validLang  = LANGUAGES.find((l) => l.id === activeLang) ? activeLang : 'javascript';
        const langMeta   = getLang(validLang);
        for (const filename of yFiles.toArray()) {
          const ytext = ydoc.getText(`file:${filename}`);
          if (ytext.toString() === '') {
            const saved = localStorage.getItem(`cr-code-${workspaceId}-${filename}`);
            ytext.insert(0, saved || langMeta.defaultCode);
          }
        }

        // ── Step 3: Rebind the active editor file so it reflects the now-populated
        // (or remotely-synced) Y.Text. This replaces any empty binding set up by
        // onMount before sync completed.
        bindFile(activeFileRef.current);
      },
    });

    wsRef.current = new WebSocket(`${collabBase}/runs?workspaceId=${workspaceId}`);
    wsRef.current.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'run.replay') {
        setEvents(msg.events);
        // Restore running state: if no run_finished in replayed events, still running
        const evts: RunEvent[] = msg.events;
        const lastSys = [...evts].reverse().find((e) => e.stream === 'system');
        if (evts.length === 0 || (lastSys && lastSys.chunk.startsWith('run_finished'))) {
          setIsRunning(false);
        } else if (evts.length > 0 && !evts.some((e) => e.stream === 'system' && e.chunk.startsWith('run_finished'))) {
          // run started but not finished — keep running indicator
          setIsRunning(true);
        }
      }
      if (msg.type === 'run.start') {
        // A new run was submitted — clear stale output and show running indicator
        // for ALL collaborators (including those who didn't click Run).
        setEvents([]);
        setIsRunning(true);
        setRunDuration(null);
        runStartTimeRef.current = Date.now();
        // Capture runId so any collaborator can Stop the run.
        if ((msg as any).runId) setCurrentRunId((msg as any).runId as string);
      }
      if (msg.type === 'run.event') {
        setEvents((prev) => [...prev, msg.event]);
        if (msg.event.stream === 'system' && (msg.event.chunk as string).startsWith('run_finished')) {
          setIsRunning(false);
          if (runStartTimeRef.current !== null) {
            setRunDuration(Date.now() - runStartTimeRef.current);
            runStartTimeRef.current = null;
          }
        } else {
          // Ensure isRunning is true even if run.start was missed (e.g. mid-run join)
          setIsRunning(true);
        }
      }
      if (msg.type === 'run.done') setIsRunning(false);
      if (msg.type === 'editor.update') {
        // Redundant Y.js update channel — apply binary update received from another
        // session. Y.js deduplicates by clientID+clock, so this is a no-op when
        // Hocuspocus has already delivered the same update.
        Y.applyUpdate(ydoc, new Uint8Array(msg.update as number[]), 'remote-ws');
      }
    };

    // Broadcast local Y.Doc changes to all room sessions via the /runs WebSocket
    // (redundant channel alongside Hocuspocus — ensures keystroke-level sync even
    // when the Hocuspocus delivery is delayed or recovering from a reconnect).
    const onYDocUpdate = (update: Uint8Array, origin: unknown) => {
      // Skip updates that originated from Hocuspocus or from this channel itself.
      if (origin === providerRef.current || origin === 'remote-ws') return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: 'editor.update', update: Array.from(update) }));
    };
    ydoc.on('update', onYDocUpdate);

    return () => {
      ydoc.off('update', onYDocUpdate);
      yMeta.unobserve(onMetaChange);
      yFiles.unobserve(onFilesChange);
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      wsRef.current?.close();
      // ydoc is intentionally NOT destroyed here. React Strict Mode double-invokes
      // effects (dev only): the cleanup runs and then the effect runs again using the
      // same useMemo instance. Destroying the ydoc would corrupt it for the second
      // run. The JS GC reclaims it when the component is truly unmounted.
    };
  }, [workspaceId, ydoc, yMeta, yFiles, bindFile]);

  // When the selected language changes, update Monaco's syntax mode for the active file
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const meta  = getLang(lang);
    const model = editorRef.current.getModel();
    if (model) monacoRef.current.editor.setModelLanguage(model, meta.monacoId);
  }, [lang]);

  // Update Monaco editor theme when user toggles dark/light
  useEffect(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
  }, [theme]);

  // Restore panel layout from localStorage and apply to DOM
  // Restore panel layout from localStorage and apply to DOM (scoped per workspace)
  useEffect(() => {
    const l = localStorage.getItem(`cr-layout-${workspaceId}-left`);
    const b = localStorage.getItem(`cr-layout-${workspaceId}-build`);
    const s = localStorage.getItem(`cr-layout-${workspaceId}-stdin`);
    if (l && !Number.isNaN(Number(l))) leftPctRef.current = Number(l);
    if (b && !Number.isNaN(Number(b))) buildHRef.current  = Number(b);
    if (s && !Number.isNaN(Number(s))) stdinHRef.current  = Number(s);
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.style.setProperty('--cr-left-pct', `${leftPctRef.current}%`);
      bodyRef.current.style.setProperty('--cr-build-h',  `${buildHRef.current}px`);
      bodyRef.current.style.setProperty('--cr-stdin-h',  `${stdinHRef.current}px`);
    });
  }, [workspaceId]);


  // Restore HTML preview from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(`cr-html-${workspaceId}`);
    if (saved) setHtmlPreview(saved);
  }, [workspaceId]);

  // Document-level drag handlers for resizable panels (stable — reads from refs only)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const t = draggingRef.current;
      if (!t || !bodyRef.current) return;
      const el = bodyRef.current;
      if (t === 'h-split') {
        const rect = el.getBoundingClientRect();
        const pct  = Math.max(25, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
        leftPctRef.current = pct;
        el.style.setProperty('--cr-left-pct', `${pct}%`);
      } else if (t === 'build') {
        // Build output is at the TOP of ws-right; handle is below → DOWN increases height.
        const dy   = e.clientY - dragOriginRef.current.clientY;
        const maxH = Math.max(100, Math.floor(el.getBoundingClientRect().height * 0.65));
        const h    = Math.max(40, Math.min(maxH, dragOriginRef.current.startVal + dy));
        buildHRef.current = h;
        el.style.setProperty('--cr-build-h', `${h}px`);
      } else if (t === 'stdin') {
        // Handle is ABOVE stdin (mirrors run-output: handle above, drag UP expands, drag DOWN contracts).
        const dy   = dragOriginRef.current.clientY - e.clientY;
        const maxH = Math.max(100, Math.floor(el.getBoundingClientRect().height * 0.65));
        const h    = Math.max(40, Math.min(maxH, dragOriginRef.current.startVal + dy));
        stdinHRef.current = h;
        el.style.setProperty('--cr-stdin-h', `${h}px`);
      }
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      // Persist layout on drag end (scoped per workspace)
      localStorage.setItem(`cr-layout-${workspaceId}-left`,  String(leftPctRef.current));
      localStorage.setItem(`cr-layout-${workspaceId}-build`, String(buildHRef.current));
      localStorage.setItem(`cr-layout-${workspaceId}-stdin`, String(stdinHRef.current));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []); // empty deps — refs are stable

  // ── File management ─────────────────────────────────────────────────────
  function switchFile(name: string) {
    setActiveFile(name);
    activeFileRef.current = name;
    bindFile(name);
  }

  function addFile() {
    const ext  = getLang(langRef.current).entryFile.split('.').pop() ?? 'txt';
    let n = 2;
    let name = `file${n}.${ext}`;
    const current = yFiles.toArray();
    while (current.includes(name)) { n++; name = `file${n}.${ext}`; }
    yFiles.insert(yFiles.length, [name]);
    setActiveFile(name);
    activeFileRef.current = name;
    // Defer so the state update settles before binding
    setTimeout(() => bindFile(name), 0);
  }

  function removeFile(name: string) {
    if (yFiles.length <= 1) return;
    const arr = yFiles.toArray();
    const idx = arr.indexOf(name);
    if (idx !== -1) yFiles.delete(idx, 1);
    const remaining = arr.filter((f) => f !== name);
    if (activeFileRef.current === name && remaining.length > 0) switchFile(remaining[0]);
  }

  // ── File rename ─────────────────────────────────────────────────────────
  function startRenameFile(name: string) {
    setRenamingFile(name);
    setRenameValue(name);
  }

  function commitRenameFile() {
    const oldName = renamingFile;
    if (!oldName) return;
    setRenamingFile(null);
    const newName = renameValue.trim();
    const arr = yFiles.toArray();
    if (!newName || newName === oldName || arr.includes(newName)) return;
    // Copy Y.Text content to new key
    const content = ydoc.getText(`file:${oldName}`).toString();
    const newText = ydoc.getText(`file:${newName}`);
    if (newText.toString() === '') newText.insert(0, content);
    // Copy localStorage
    const saved = localStorage.getItem(`cr-code-${workspaceId}-${oldName}`);
    if (saved) {
      localStorage.setItem(`cr-code-${workspaceId}-${newName}`, saved);
      localStorage.removeItem(`cr-code-${workspaceId}-${oldName}`);
    }
    // Update shared file list atomically
    const idx = arr.indexOf(oldName);
    if (idx !== -1) {
      yFiles.delete(idx, 1);
      yFiles.insert(idx, [newName]);
    }
    if (activeFile === oldName) {
      setActiveFile(newName);
      activeFileRef.current = newName;
      setTimeout(() => bindFile(newName), 0);
    }
  }

  // ── Workspace rename ─────────────────────────────────────────────────────
  async function commitRenameWs() {
    const newTitle = wsRenameVal.trim();
    setWsRenaming(false);
    if (!newTitle || newTitle === workspace?.title) return;
    const res = await fetch(apiUrl(`/workspaces/${workspaceId}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      const updated = await res.json();
      setWorkspace(updated);
    }
  }

  // ── Language change — update Monaco syntax + reset code to starter ────────
  function handleLangChange(newLang: LangId) {
    // Save the current editor content under the old language so we can restore
    // it if the user switches back during the same session.
    const currentCode = ydoc.getText(`file:${activeFileRef.current}`).toString();
    if (currentCode) langCodeCacheRef.current[langRef.current] = currentCode;

    // Clear build output and HTML preview on every language switch
    setEvents([]);
    if (newLang !== 'html') {
      setHtmlPreview(null);
      sessionStorage.removeItem(`cr-html-${workspaceId}`);
    }
    const meta = getLang(newLang);
    langRef.current = newLang;
    setLang(newLang);
    localStorage.setItem(`cr-lang-${workspaceId}`, newLang);

    const entryFile = meta.entryFile;
    setFiles([entryFile]);
    setActiveFile(entryFile);
    activeFileRef.current = entryFile;

    // Broadcast lang + file list change to all collaborators
    yMeta.set('lang', newLang);
    yFiles.delete(0, yFiles.length);
    yFiles.insert(0, [entryFile]);

    // Restore cached code for this language, or fall back to starter code
    const seedCode = langCodeCacheRef.current[newLang] ?? meta.defaultCode;
    const ytext = ydoc.getText(`file:${entryFile}`);
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, seedCode);
    });

    setTimeout(() => bindFile(entryFile), 0);
  }

  // ── Code execution ───────────────────────────────────────────────────────
  async function runCode() {
    const filename = activeFileRef.current;
    const content  = ydoc.getText(`file:${filename}`).toString();

    // HTML: render client-side — no executor call needed
    if (langRef.current === 'html') {
      setHtmlPreview(content);
      sessionStorage.setItem(`cr-html-${workspaceId}`, content);
      return;
    }

    // JSON/XML: handled client-side via Format — never send to executor
    if (langRef.current === 'json') { formatJsonCode(content); return; }
    if (langRef.current === 'xml')  { formatXmlCode(content);  return; }

    setIsRunning(true);
    setEvents([]);
    setRunDuration(null);

    try {
      const res = await fetch(apiUrl(`/workspaces/${workspaceId}/runs`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          language:  langRef.current,
          entryFile: filename,
          content,
          stdin,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentRunId(data.id);
      }
    } catch {
      setIsRunning(false);
    }
  }

  // ── Stop / cancel the active run ─────────────────────────────────────────
  async function stopRun() {
    setIsRunning(false);
    if (currentRunId) {
      try {
        await fetch(apiUrl(`/runs/${currentRunId}/cancel`), {
          method: 'POST',
          credentials: 'include',
        });
      } catch { /* best-effort */ }
      setCurrentRunId(null);
    }
  }

  // ── Beautify using Monaco's built-in document formatter ──────────────────
  async function beautifyCode() {
    const currentLang = langRef.current;
    const content = ydoc.getText(`file:${activeFileRef.current}`).toString();
    // JSON/XML: use dedicated formatters that also validate and report errors
    if (currentLang === 'json') { formatJsonCode(content); return; }
    if (currentLang === 'xml')  { formatXmlCode(content);  return; }
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const monacoLang = getLang(currentLang).monacoId;
    // HTML has an excellent Monaco built-in formatter — use it
    if (monacoLang === 'html') {
      const action = editorRef.current.getAction('editor.action.formatDocument');
      if (action) { await action.run(); return; }
    }
    // For all other languages (Java, Python, C, C++, C#, PHP, Lua, Ruby, Groovy,
    // Assembly, JavaScript) apply normalisation directly via the Monaco model.
    // This is more reliable than editor.action.formatDocument for custom providers.
    const lines = content.split('\n');
    const out: string[] = [];
    let blankRun = 0;
    for (const line of lines) {
      const t = line.replace(/[ \t]+$/, ''); // trim trailing whitespace
      if (t === '') { blankRun++; if (blankRun <= 2) out.push(''); }
      else { blankRun = 0; out.push(t); }
    }
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push(''); // single trailing newline
    const normalized = out.join('\n');
    if (normalized !== content) {
      // pushEditOperations preserves undo history and triggers MonacoBinding sync
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: normalized }],
        () => null
      );
    }
  }

  // ── JSON: pretty-print with validation ───────────────────────────────────
  function formatJsonCode(content?: string) {
    const ytext  = ydoc.getText(`file:${activeFileRef.current}`);
    const source = content ?? ytext.toString();
    try {
      const parsed    = JSON.parse(source);
      const formatted = JSON.stringify(parsed, null, 2) + '\n';
      ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, formatted); });
      setEvents([]);
      setRunDuration(null);
    } catch (e) {
      setEvents([{ id: Date.now(), stream: 'stderr', chunk: `JSON Error: ${(e as Error).message}` }]);
      setRunDuration(null);
    }
  }

  function minifyJsonCode() {
    const ytext  = ydoc.getText(`file:${activeFileRef.current}`);
    const source = ytext.toString();
    try {
      const minified = JSON.stringify(JSON.parse(source));
      ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, minified); });
      setEvents([]);
      setRunDuration(null);
    } catch (e) {
      setEvents([{ id: Date.now(), stream: 'stderr', chunk: `JSON Error: ${(e as Error).message}` }]);
      setRunDuration(null);
    }
  }

  // ── XML: pretty-print with validation ────────────────────────────────────
  function formatXmlCode(content?: string) {
    const ytext  = ydoc.getText(`file:${activeFileRef.current}`);
    const source = content ?? ytext.toString();
    const formatted = prettyXml(source);
    if (formatted === null) {
      setEvents([{ id: Date.now(), stream: 'stderr', chunk: 'XML Error: document is not well-formed' }]);
      setRunDuration(null);
      return;
    }
    ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, formatted); });
    setEvents([]);
    setRunDuration(null);
  }

  function minifyXmlCode() {
    const ytext  = ydoc.getText(`file:${activeFileRef.current}`);
    const source = ytext.toString();
    if (typeof window !== 'undefined') {
      const doc = new DOMParser().parseFromString(source, 'text/xml');
      if (doc.querySelector('parsererror')) {
        setEvents([{ id: Date.now(), stream: 'stderr', chunk: 'XML Error: document is not well-formed' }]);
        setRunDuration(null);
        return;
      }
    }
    const minified = source.replace(/>\s+</g, '><').trim();
    ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, minified); });
    setEvents([]);
    setRunDuration(null);
  }

  // ── Download current file ─────────────────────────────────────────────────
  function downloadCode() {
    const content = ydoc.getText(`file:${activeFileRef.current}`).toString();
    const blob    = new Blob([content], { type: 'text/plain' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = activeFileRef.current;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Upload a file into the active editor slot ─────────────────────────────
  function triggerUpload() { uploadInputRef.current?.click(); }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') return;
      const ytext = ydoc.getText(`file:${activeFileRef.current}`);
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, text);
      });
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-uploading the same file
  }

  // ── Panel resize ───────────────────────────────────────────────────────
  function startDrag(type: 'h-split' | 'build' | 'stdin', e: React.MouseEvent) {
    e.preventDefault();
    const startVal = type === 'h-split' ? leftPctRef.current
                   : type === 'build'   ? buildHRef.current
                   :                      stdinHRef.current;
    draggingRef.current   = type;
    dragOriginRef.current = { clientX: e.clientX, clientY: e.clientY, startVal };
    document.body.style.cursor     = type === 'h-split' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  // ── End workspace session (owner only) ───────────────────────────────────
  function endSession() {
    setShowEndConfirm(true);
  }

  async function confirmEndSession() {
    setShowEndConfirm(false);
    setSessionEnding(true);
    yMeta.set('ended', '1');
    await fetch(apiUrl(`/workspaces/${workspaceId}`), {
      method: 'DELETE',
      credentials: 'include',
    });
    router.push('/');
  }

  // ── Sharing ──────────────────────────────────────────────────────────────
  async function generateGuestLink() {
    setGuestLinkError(false);
    const res = await fetch(apiUrl(`/workspaces/${workspaceId}/invites`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expiresAt:    new Date(Date.now() + 3_600_000).toISOString(),
        capabilities: { edit: true, run: true },
      }),
    });
    if (!res.ok) { setGuestLinkError(true); return; }
    const data = await res.json();
    setGuestLink(`${window.location.origin}${data.url}`);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  const workspaceUrl    = typeof window !== 'undefined' ? window.location.href : '';
  const stdoutEvents    = events.filter((e) => e.stream === 'stdout');
  const buildEvents     = events.filter((e) => e.stream === 'stderr' || e.stream === 'system');
  const stderrEvents    = events.filter((e) => e.stream === 'stderr');
  const isOwner         = workspace !== null && currentUserId !== null && workspace.ownerId === currentUserId;
  const currentLangMeta = getLang(lang);

  return (
    <div className={`ws-root${theme === 'light' ? ' theme-light' : ''}`}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="ws-toolbar">
        <div className="ws-toolbar-left">
          {/* Home — swapped from toolbar-right */}
          <a href="/" className="btn-home" title="Back to Home">
            <i className="fa-solid fa-angle-left" /> Back
          </a>

          {wsRenaming && isOwner ? (
            <input
              className="ws-title-input"
              aria-label="Workspace name"
              value={wsRenameVal}
              autoFocus
              onChange={(e) => setWsRenameVal(e.target.value)}
              onBlur={commitRenameWs}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRenameWs(); }
                if (e.key === 'Escape') setWsRenaming(false);
              }}
            />
          ) : (
            <h1
              className={`ws-title${isOwner ? ' ws-title-editable' : ''}`}
              title={isOwner ? 'Double-click to rename' : undefined}
              onDoubleClick={() => {
                if (!isOwner) return;
                setWsRenameVal(workspace?.title ?? '');
                setWsRenaming(true);
              }}
            >
              {workspace?.title ?? 'Workspace'}
            </h1>
          )}

          {/* Share */}
          <div className="share-wrapper">
            <button className="btn-ghost btn-share" onClick={() => setShareOpen((o) => !o)}>
              <i className="fa-solid fa-share-nodes" /> Share
            </button>

            {shareOpen && (
              <div className="share-dropdown">
                {/* Within org */}
                <p className="share-section-label">Within your organization</p>
                <p className="share-hint">
                  Anyone in your org with this link can open the workspace.
                </p>
                <div className="share-row">
                  <input readOnly className="share-input" title="Workspace link" value={workspaceUrl} />
                  <button className="btn-sm" onClick={() => copy(workspaceUrl)}>
                    {copied === workspaceUrl ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* External guest — only for non-GHE workspaces */}
                {workspace?.mode !== 'GHE_BOUND' && (
                  <>
                    <p className="share-section-label share-guest-label">
                      External guest access
                    </p>
                    <p className="share-hint">
                      Creates a one-hour link for someone outside your organization. They can
                      edit and run code, no account needed.
                    </p>
                    {guestLinkError && (
                      <p className="share-error">
                        Could not create a guest link. Workspace policy may not allow it.
                      </p>
                    )}
                    {guestLink ? (
                      <div className="share-row">
                        <input readOnly className="share-input" title="Guest invite link" value={guestLink} />
                        <button className="btn-sm" onClick={() => copy(guestLink)}>
                          {copied === guestLink ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <button className="btn-sm btn-outline" onClick={generateGuestLink}>
                        Generate guest link
                      </button>
                    )}
                  </>
                )}

                {workspace?.mode === 'GHE_BOUND' && (
                  <p className="share-hint share-hint-indent">
                    This is a team workspace. External guest links are not available.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ws-toolbar-right">
          <span
              className="lang-badge"
              style={{
                '--lang-color': LANG_COLORS[lang] ?? '#475569',
                '--lang-text':  LANG_TEXT[lang]   ?? '#fff',
              } as React.CSSProperties}
            >
              {currentLangMeta.version}
            </span>
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => handleLangChange(e.target.value as LangId)}
            aria-label="Language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {isOwner && (
            <button
              className="btn-end-session"
              onClick={endSession}
              disabled={sessionEnding}
              title="End workspace session"
            >
              <i className="fa-solid fa-power-off" />
              {sessionEnding ? 'Ending…' : 'End Session'}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {/* CSS custom properties on ws-body drive all panel sizes (set via bodyRef.style.setProperty during drag) */}
      <div className="ws-body" ref={bodyRef}>

        {/* Left — editor + build output */}
        <div className="ws-left">
          {/* File tabs */}
          <div className="file-tabs">
            {files.map((name) => (
              <div
                key={name}
                className={`file-tab${name === activeFile ? ' file-tab-active' : ''}`}
                onClick={() => renamingFile !== name && switchFile(name)}
                onDoubleClick={(e) => { e.stopPropagation(); startRenameFile(name); }}
              >
                {renamingFile === name ? (
                  <input
                    className="file-tab-rename"
                    aria-label="File name"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRenameFile}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRenameFile(); }
                      if (e.key === 'Escape') setRenamingFile(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span>{name}</span>
                )}
                {files.length > 1 && renamingFile !== name && (
                  <button
                    className="file-tab-close"
                    title={`Close ${name}`}
                    onClick={(e) => { e.stopPropagation(); removeFile(name); }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button className="file-tab-add" title="New file" onClick={addFile}>+</button>
            {/* Editor action buttons — beautify / upload / download / minify (JSON∕XML only) */}
            <div className="file-tabs-actions">
              <button className="file-tab-action" title="Beautify / Format (Ctrl+Shift+F)" onClick={beautifyCode}>
                <i className="fa-solid fa-wand-magic-sparkles" />
              </button>
              {(lang === 'json' || lang === 'xml') && (
                <button className="file-tab-action" title="Minify" onClick={lang === 'json' ? minifyJsonCode : minifyXmlCode}>
                  <i className="fa-solid fa-compress" />
                </button>
              )}
              <button className="file-tab-action" title="Upload file" onClick={triggerUpload}>
                <i className="fa-solid fa-upload" />
              </button>
              <button className="file-tab-action" title="Download file" onClick={downloadCode}>
                <i className="fa-solid fa-download" />
              </button>
              {isRunning ? (
                <button className="btn-stop-sm" onClick={stopRun}>
                  <i className="fa-solid fa-stop" /> Stop
                </button>
              ) : lang !== 'json' && lang !== 'xml' ? (
                <button className="btn-run-sm" onClick={runCode}>
                  <i className="fa-solid fa-play" /> Run
                </button>
              ) : null}
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              className="file-upload-hidden"
              onChange={handleUpload}
              aria-label="Upload source file"
            />
          </div>

          {/* Monaco editor */}
          <div className="editor-wrap">
            <Editor
              height="100%"
              defaultLanguage={getLang('javascript').monacoId}
              onMount={(editor: any, monaco: any) => {
                editorRef.current  = editor;
                monacoRef.current  = monaco;
                // Bind to whichever file is active at mount time
                bindFile(activeFileRef.current);
                // Persist code to localStorage on every edit (survives server restarts)
                editor.onDidChangeModelContent(() => {
                  const val = editor.getValue();
                  if (val) localStorage.setItem(`cr-code-${workspaceId}-${activeFileRef.current}`, val);
                });
                // Identify this user in the awareness protocol
                providerRef.current?.awareness?.setLocalStateField('user', {
                  name:  `User-${Math.floor(Math.random() * 9000 + 1000)}`,
                  color: '#3b82f6',
                });

                // Register cleanup formatters for languages that Monaco doesn't
                // natively format (Python, Java, C, C++, PHP, C#, Lua, Ruby).
                // Assembly uses 'plaintext', Groovy uses 'java' — both covered.
                // JSON and XML use Monaco's built-in formatters or our dedicated
                // JS functions instead.
                if (!_formattersRegistered) {
                  _formattersRegistered = true;
                  const NEEDS_FORMATTER = [
                    'python', 'java', 'c', 'cpp', 'php', 'csharp',
                    'lua', 'ruby', 'plaintext',
                  ];
                  for (const fmtLang of NEEDS_FORMATTER) {
                    monaco.languages.registerDocumentFormattingEditProvider(fmtLang, {
                      provideDocumentFormattingEdits(model: any) {
                        const lines = model.getValue().split('\n');
                        const out: string[] = [];
                        let blankRun = 0;
                        for (const line of lines) {
                          const t = line.replace(/[ \t]+$/, ''); // trim trailing whitespace
                          if (t === '') {
                            blankRun++;
                            if (blankRun <= 2) out.push(''); // collapse 3+ blank lines to 2
                          } else {
                            blankRun = 0;
                            out.push(t);
                          }
                        }
                        // Ensure single trailing newline
                        while (out.length > 0 && out[out.length - 1] === '') out.pop();
                        out.push('');
                        return [{ range: model.getFullModelRange(), text: out.join('\n') }];
                      },
                    });
                  }
                }
              }}
              options={{
                minimap:              { enabled: false },
                formatOnType:         true,
                formatOnPaste:        true,
                fontSize:             14,
                lineNumbers:          'on',
                scrollBeyondLastLine: false,
                wordWrap:             'on',
                theme:                theme === 'light' ? 'vs' : 'vs-dark',
              }}
            />
          </div>

          {/* Vertical resize handle: editor ↕ stdin */}
          <div
            className="resize-handle resize-handle-v"
            onMouseDown={(e) => startDrag('stdin', e)}
          />

          {/* STDIN — swapped from ws-right */}
          <div className="stdin-panel">
            <div className="panel-header">
              <span>Standard Input (stdin)</span>
            </div>
            <textarea
              className="stdin-textarea"
              value={stdin}
              onChange={(e) => {
                setStdin(e.target.value);
                localStorage.setItem(`cr-stdin-${workspaceId}`, e.target.value);
                yMeta.set('stdin', e.target.value);
              }}
              placeholder="Enter input for your program here…"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Horizontal resize handle: editor ↔ output panel */}
        <div
          className="resize-handle resize-handle-h"
          onMouseDown={(e) => startDrag('h-split', e)}
        />

        {/* Right — build output + run output */}
        <div className="ws-right">
          {/* Build output*/}
          <div className="compiler-output">
            <div className="panel-header">
              <span>Build Output</span>
              {isRunning && <span className="running-badge">
                <i className="fa-solid fa-hourglass-half"></i> Running…</span>
              }
              {runDuration !== null && !isRunning && stderrEvents.length === 0 && (
                <span className="success-badge">
                  <i className="fa-solid fa-circle-check" /> Success
                </span>
              )}
              {stderrEvents.length > 0 && (
                <span className="error-badge">
                  <i className="fa-solid fa-circle-exclamation"></i> {stderrEvents.length} issue{stderrEvents.length !== 1 ? 's' : ''}
                </span>
              )}
              {runDuration !== null && !isRunning && (
                <span className="metrics-badge">
                  <i className="fa-regular fa-clock" />{' '}
                  {runDuration < 1000 ? `${runDuration}ms` : `${(runDuration / 1000).toFixed(1)}s`}
                </span>
              )}
              <span className="panel-header-spacer" />
            </div>
            <pre className="output-pre">
              {buildEvents.length > 0
                ? buildEvents.map((e, i) => (
                    <span key={i} className={e.stream === 'stderr' ? 'out-stderr' : 'out-system'}>
                      {e.chunk.endsWith('\n') ? e.chunk : `${e.chunk}\n`}
                    </span>
                  ))
                : <span className="out-empty">No build issues</span>}
            </pre>
          </div>

          {/* Vertical resize handle: build output ↕ output */}
          <div
            className="resize-handle resize-handle-v"
            onMouseDown={(e) => startDrag('build', e)}
          />

          {/* Output — stdout or HTML preview */}
          <div className="run-output">
            <div className="panel-header">
              <span>Output</span>
            </div>
            {lang === 'html' ? (
              htmlPreview !== null
                ? <iframe
                    key={htmlPreview}
                    srcDoc={htmlPreview}
                    sandbox="allow-scripts"
                    className="html-preview-frame"
                    title="HTML Preview"
                  />
                : <pre className="output-pre"><span className="out-empty">▶ Click Run to preview your HTML</span></pre>
            ) : (
              <pre className="output-pre">
                {stdoutEvents.length > 0
                  ? stdoutEvents.map((e, i) => (
                      <span key={i} className="out-stdout">{e.chunk}</span>
                    ))
                  : <span className="out-empty">Run your code to see the output here</span>}
              </pre>
            )}
          </div>
        </div>

      </div>

      {/* ── End-session confirm modal ────────────────────────────────────── */}
      {showEndConfirm && (
        <div className="confirm-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-icon">
              <i className="fa-solid fa-triangle-exclamation" />
            </div>
            <h3>End Workspace Session?</h3>
            <p>All collaborators will be disconnected and the workspace permanently deleted. This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={() => setShowEndConfirm(false)}>
                Cancel
              </button>
              <button className="btn-confirm-danger" onClick={confirmEndSession} disabled={sessionEnding}>
                {sessionEnding
                  ? <><i className="fa-solid fa-spinner fa-spin" /> Ending…</>
                  : <><i className="fa-solid fa-power-off" /> End Session</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
