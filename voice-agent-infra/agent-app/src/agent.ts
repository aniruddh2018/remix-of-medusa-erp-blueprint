// Adapted from aws-samples/sample-serverless-nova-sonic-chat
// (app/src/agent/index.ts) — MCP tool loading removed.
import type { EventsChannel } from 'aws-amplify/data';
import { MessageRepository } from './message-repository.js';
import { NovaStream } from './nova-stream.js';
import './amplify.js';
import { dispatchEvent, processResponseStream, initializeSubscription } from './events.js';
import { erpTools } from './tools/erp-tools.js';

const ERP_SYSTEM_PROMPT = `You are a helpful voice assistant for an ERP system (pharmacy/retail
business management). You can look up customers, products, invoices, and outstanding balances,
and you can propose creating customers, products, sales, inventory adjustments, and payments.
Every action you propose requires human approval before anything is actually changed — always
tell the user this when you queue an action. For record_sale specifically, ask the user for every
line item (product, quantity) and the customer name through conversation before calling the tool —
never guess quantities or invent items. Keep responses brief and conversational, as this is a
spoken interface.`;

export const main = async (sessionId: string, userId: string, voiceId: string) => {
  let channel: EventsChannel | undefined = undefined;
  const context: { stream?: NovaStream } = {};
  const messageRepository = new MessageRepository();
  let endReason = '';

  try {
    console.log(`session ${sessionId} initialized for user ${userId}`);

    const channelPath = `/voice-agent/user/${userId}/${sessionId}`;
    channel = await initializeSubscription(channelPath, context);
    console.log('Subscribed to the channel');

    // Without this delay, "Subscription has not been initialized" sometimes fires.
    await new Promise((s) => setTimeout(s, 1000));

    while (true) {
      console.log('starting/resuming session');
      const chatHistory = await messageRepository.getMessages(sessionId);
      const stream = new NovaStream(sessionId, userId, voiceId, ERP_SYSTEM_PROMPT, erpTools);
      context.stream = stream;
      await stream.open(chatHistory);
      const res = await processResponseStream(channel, stream, sessionId, Date.now());
      stream.close();
      if (res.state === 'success') {
        console.log(`session finished with state ${res.state}`);
        break;
      }
      // otherwise resume in the next loop iteration
    }
  } catch (e) {
    console.error('Error in main process', e);
    endReason = (e as Error)?.message ?? 'Internal Server Error';
  } finally {
    try {
      if (channel) {
        await dispatchEvent(channel, { event: 'end', data: { reason: endReason } });
        channel.close();
      }
      console.log('Session ended.');
    } catch (e) {
      console.error('Error during finalization', e);
    }
  }
};
