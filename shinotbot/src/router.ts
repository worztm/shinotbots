/**
 * Shinotbot - Message Router
 */

import type { TelegramMessage } from './types';
import {
  handleStart,
  handleConnect,
  handleStatus,
  handleDisconnect,
  handleHelp,
  handlePatSubmission,
} from './handlers';

/**
 * Route incoming Telegram messages to the appropriate handler
 */
export async function handleMessage(
  token: string,
  message: TelegramMessage,
  kv: KVNamespace
): Promise<void> {
  const chatId = String(message.chat.id);
  const text = message.text || '';

  // Log incoming message
  console.log(`Message from chat ${chatId}: ${text.substring(0, 50)}`);

  // Strip bot username from commands (e.g., /start@shinotbot -> /start)
  const cleanText = text.replace(/@\w+$/, '');

  if (cleanText === '/start') {
    await handleStart(token, chatId);
  } else if (cleanText === '/connect') {
    await handleConnect(token, chatId, kv);
  } else if (cleanText === '/status') {
    await handleStatus(token, chatId, kv);
  } else if (cleanText === '/disconnect') {
    await handleDisconnect(token, chatId, kv);
  } else if (cleanText === '/help') {
    await handleHelp(token, chatId);
  } else if (text && !text.startsWith('/')) {
    // Non-command text = potential PAT submission
    await handlePatSubmission(token, chatId, text, kv);
  }
}
