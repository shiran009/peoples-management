const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
function createRepository(tableName = process.env.AUTH_TABLE) {
  if (!tableName) throw new Error('AUTH_TABLE is required');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const get = async (pk) => (await client.send(new GetCommand({
    TableName: tableName, Key: { pk }, ConsistentRead: true,
  }))).Item;
  async function requireImport() {
    if ((await get('MIGRATION#AUTH'))?.status !== 'COMPLETE') {
      const error = new Error('Account migration is not complete');
      error.status = 503;
      throw error;
    }
  }
  return {
    async byId(id) { await requireImport(); return (await get('USER#' + id))?.data; },
    async byEmail(email) {
      await requireImport();
      const lookup = await get('EMAIL#' + email);
      return lookup ? (await get('USER#' + lookup.userId))?.data : undefined;
    },
    async changePassword(id, previousHash, nextHash) {
      await client.send(new UpdateCommand({
        TableName: tableName, Key: { pk: 'USER#' + id },
        ConditionExpression: '#d.#p = :previous AND #d.#a = :active',
        UpdateExpression: 'SET #d.#p = :next, #d.mustChangePassword = :no, #d.updatedAt = :now',
        ExpressionAttributeNames: { '#d': 'data', '#p': 'password', '#a': 'isActive' },
        ExpressionAttributeValues: { ':previous': previousHash, ':next': nextHash,
          ':active': true, ':no': false, ':now': new Date().toISOString() },
      }));
    },
  };
}
module.exports = { createRepository };
