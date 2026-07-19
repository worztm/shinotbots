/**
 * Shinotbot - Telegram API Helpers
 */

import type { TelegramApiResponse } from './types';

/**
 * Escape characters that have special meaning in Telegram's legacy Markdown
 * parser (_ * ` [). Without this, repo names / usernames containing underscores
 * (e.g. "user/my_repo") break entity parsing and the message fails to send.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

/**
 * Call a Telegram Bot API method
 */
export async function tg<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown> = {}
): Promise<TelegramApiResponse<T>> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json() as TelegramApiResponse<T>;

  if (!res.ok || !data.ok) {
    const desc = data.description || 'Unknown error';
    throw new Error(`Telegram API ${method} failed (${res.status}): ${desc}`);
  }

  return data;
}

/**
 * Send a text message to a chat with Markdown parsing (safe: retries
 * as plain text if Markdown entity parsing fails).
 */
export async function sendMessage(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {}
): Promise<TelegramApiResponse<{ message_id: number }>> {
  try {
    return await tg<{ message_id: number }>(token, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...extra,
    });
  } catch (err) {
    // If Markdown parsing failed, retry as plain text so the message is never lost
    const msg = (err as Error).message;
    if (msg.includes('can\'t parse entities') || msg.includes('parse')) {
      console.warn('Markdown parse failed, retrying as plain text:', msg);
      return tg<{ message_id: number }>(token, 'sendMessage', {
        chat_id: chatId,
        text,
        ...extra,
      });
    }
    throw err;
  }
}

/**
 * Send a plain text message to a chat (no Markdown parsing, always safe
 * regardless of message content like repo names with underscores).
 * Use this for messages with dynamic content that might contain
 * characters special to Telegram's Markdown parser.
 */
export async function sendPlainMessage(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {}
): Promise<TelegramApiResponse<{ message_id: number }>> {
  return tg<{ message_id: number }>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

/**
 * Edit an existing text message
 */
export async function editMessage(
  token: string,
  chatId: string | number,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {}
): Promise<TelegramApiResponse> {
  return tg(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}
