/// <reference lib="webworker" />

type ParserInputMessage = {
  type: 'chunk';
  chunk: string;
  final: boolean;
};

type ParserOutputMessage =
  | {
      type: 'element';
      element: unknown;
    }
  | {
      type: 'done';
    }
  | {
      type: 'error';
      message: string;
    };

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

let buffer = '';
let startedArray = false;
let cursor = 0;

function post(message: ParserOutputMessage): void {
  ctx.postMessage(message);
}

function processBuffer(): void {
  while (true) {
    if (!startedArray) {
      const startIndex = buffer.indexOf('[', cursor);
      if (startIndex === -1) {
        if (buffer.length > 1024) {
          buffer = buffer.slice(-1024);
        }
        cursor = 0;
        return;
      }

      startedArray = true;
      cursor = startIndex + 1;
    }

    while (cursor < buffer.length && /\s|,/.test(buffer[cursor])) {
      cursor += 1;
    }

    if (cursor >= buffer.length) {
      buffer = '';
      cursor = 0;
      return;
    }

    if (buffer[cursor] === ']') {
      post({ type: 'done' });
      return;
    }

    if (buffer[cursor] !== '{') {
      throw new Error('Unexpected JSON token while parsing array element.');
    }

    const start = cursor;
    let index = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;

    while (index < buffer.length) {
      const ch = buffer[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        index += 1;
        continue;
      }

      if (ch === '"') {
        inString = true;
        index += 1;
        continue;
      }

      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      }

      index += 1;

      if (depth === 0) {
        const objectText = buffer.slice(start, index);
        const parsed = JSON.parse(objectText) as unknown;
        post({ type: 'element', element: parsed });

        buffer = buffer.slice(index);
        cursor = 0;
        break;
      }
    }

    if (depth !== 0) {
      if (start > 0) {
        buffer = buffer.slice(start);
      }
      cursor = 0;
      return;
    }
  }
}

ctx.onmessage = (event: MessageEvent<ParserInputMessage>) => {
  try {
    const message = event.data;
    if (message.type !== 'chunk') {
      return;
    }

    buffer += message.chunk;
    processBuffer();

    if (message.final) {
      while (cursor < buffer.length && /\s|,/.test(buffer[cursor])) {
        cursor += 1;
      }

      if (buffer[cursor] !== ']') {
        throw new Error('JSON stream ended before closing array.');
      }

      post({ type: 'done' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', message });
  }
};

export {};
