/**
 * Shinotbot - Cloudflare Worker Entry Point
 * 
 * Telegram bot for GitHub notifications (stars, forks, followers)
 * Runs as a webhook-based bot with cron polling
 */

import type { Env, ScheduledMessage } from './types';
import { tg, sendMessage } from './telegram';
import { handleMessage } from './router';
import { pollAllUsers, checkScheduledMessages } from './poller';
import { listAllUsers } from './store';

export default {
  // Handle HTTP requests (Telegram webhook + health check + admin endpoints)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Debug endpoint - inspect environment + KV state (no secrets leaked)
    if (url.pathname === '/debug') {
      const list = await env.DB.list({ prefix: 'user:' });
      const snapList = await env.DB.list({ prefix: 'snap:' });
      return Response.json({
        hasToken: !!env.TELEGRAM_BOT_TOKEN,
        tokenLength: env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_BOT_TOKEN.length : 0,
        kvBound: !!env.DB,
        userCount: list.keys.length,
        snapshotCount: snapList.keys.length,
      });
    }

    // Health check endpoint
    if (url.pathname === '/') {
      return new Response('Shinotbot is running!', { status: 200 });
    }

    // Telegram webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        console.log('Webhook received update_id:', (update as Record<string, unknown>).update_id);

        if ((update as Record<string, unknown>).message) {
          await handleMessage(
            env.TELEGRAM_BOT_TOKEN,
            (update as Record<string, unknown>).message as import('./types').TelegramMessage,
            env.DB
          );
        }
        // Always return 200 to Telegram so it doesn't retry/drop the update
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('Webhook error:', err);
        // Still return 200 to avoid Telegram penalizing the webhook
        return new Response('OK', { status: 200 });
      }
    }

    // Setup endpoint - sets webhook + registers commands
    if (url.pathname === '/setup' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { webhook_url?: string };
        const webhookUrl = body.webhook_url;

        if (!webhookUrl) {
          return Response.json({ error: 'Missing webhook_url' }, { status: 400 });
        }

        // Set webhook
        const webhookResult = await tg(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
          url: `${webhookUrl}/webhook`,
          allowed_updates: ['message'],
        });

        // Register commands
        await tg(env.TELEGRAM_BOT_TOKEN, 'setMyCommands', {
          commands: [
            { command: 'start', description: 'Start the bot and see available options' },
            { command: 'connect', description: 'Connect your GitHub account with a PAT' },
            { command: 'status', description: 'Check your connected GitHub account' },
            { command: 'disconnect', description: 'Disconnect your GitHub account' },
            { command: 'help', description: 'Show help text' },
          ],
        });

        return Response.json({
          success: true,
          webhook: webhookResult,
          message: 'Bot configured successfully!',
        });
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 500 });
      }
    }

    // Debug endpoint - test GitHub token
    if (url.pathname === '/test-token') {
      const testToken = url.searchParams.get('token');
      if (!testToken) {
        return Response.json({ error: 'Add ?token=YOUR_TOKEN to URL' });
      }
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `token ${testToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'shinotbot-cloudflare-worker',
          },
        });
        const rawText = await res.text();
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          json = null;
        }
        return Response.json({
          status: res.status,
          isJson: !!json,
          data: json || rawText.substring(0, 200),
        });
      } catch (err) {
        return Response.json({ error: (err as Error).message });
      }
    }

    // Broadcast endpoint - send message to all users
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { message?: string };
        const message = body.message;
        if (!message) {
          return Response.json({ error: 'No message provided' }, { status: 400 });
        }
        const users = await listAllUsers(env.DB);
        let sent = 0;
        let failed = 0;
        for (const user of users) {
          try {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, user.chat_id, message);
            sent++;
          } catch (err) {
            console.error(`Broadcast failed for ${user.chat_id}:`, (err as Error).message);
            failed++;
          }
        }
        return Response.json({ success: true, sent, failed, total: users.length });
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 500 });
      }
    }

    // Schedule endpoint - schedule a broadcast
    if (url.pathname === '/schedule' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { message?: string; sendAt?: string };
        const { message, sendAt } = body;
        if (!message || !sendAt) {
          return Response.json(
            { error: 'Need message and sendAt (ISO timestamp)' },
            { status: 400 }
          );
        }
        const scheduleId = Date.now().toString(36);
        const sched: ScheduledMessage = {
          id: scheduleId,
          message,
          sendAt,
          sent: false,
          created: new Date().toISOString(),
        };
        await env.DB.put(`schedule:${scheduleId}`, JSON.stringify(sched));
        return Response.json({ success: true, id: scheduleId, sendAt });
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 500 });
      }
    }

    // List scheduled messages
    if (url.pathname === '/schedules' && request.method === 'GET') {
      const list = await env.DB.list({ prefix: 'schedule:' });
      const schedules: ScheduledMessage[] = [];
      for (const key of list.keys) {
        const sched = await env.DB.get<ScheduledMessage>(key.name, 'json');
        if (sched) schedules.push(sched);
      }
      return Response.json({ schedules });
    }

    return new Response('Not Found', { status: 404 });
  },

  // Cron trigger - polls GitHub for changes
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered - polling all users');
    await pollAllUsers(env.TELEGRAM_BOT_TOKEN, env.DB);
    await checkScheduledMessages(env.TELEGRAM_BOT_TOKEN, env.DB);
  },
};
