// Conversation history for session resumption, stored directly via the AWS
// SDK document client — no ElectroDB (the reference implementation uses it,
// but it's an extra dependency/abstraction this simple key schema doesn't
// need: pk = `SESSION#<id>`, sk = `MSG#<timestamp>#<uuid>`).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;
const HISTORY_TTL_SECONDS = 60 * 60 * 24; // 1 day — conversation history is transient, not business data

export class MessageRepository {
  async saveMessage(sessionId: string, message: { role: string; content: string }): Promise<void> {
    const now = Date.now();
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `SESSION#${sessionId}`,
        sk: `MSG#${now}#${randomUUID()}`,
        role: message.role,
        content: message.content,
        createdAt: now,
        ttl: Math.floor(now / 1000) + HISTORY_TTL_SECONDS,
      },
    }));
  }

  async getMessages(sessionId: string): Promise<{ role: string; content: string }[]> {
    const res = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
      ScanIndexForward: true, // ascending by sk (== chronological, since sk starts with the timestamp)
    }));
    return (res.Items ?? []).map((item) => ({ role: item.role, content: item.content }));
  }
}
