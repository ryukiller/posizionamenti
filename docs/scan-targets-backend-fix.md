# Backend fix: filter scan-targets by keywordGroupId

Your Next.js `scan-targets` API currently ignores the `keywordGroupId` query parameter. The desktop app sends it when you select a group, but the backend returns all groups for the client/contract.

## Change in your scan-targets route

In your application (where you have the scan-targets GET handler), do the following:

1. **Read the `keywordGroupId` query parameter** (same way you read `clienteId` and `contrattoId`).

2. **If `keywordGroupId` is present, add it to the MongoDB `match`** so only that group is returned. The desktop app sends `keywordGroupId` as the group's `_id` (string), so match on `_id: new ObjectId(keywordGroupId)`.

## Example patch

Replace the section that builds the match and fetches groups with:

```ts
const url = new URL(request.url);
const clienteIdParam = url.searchParams.get("clienteId");
const contrattoIdParam = url.searchParams.get("contrattoId");
const keywordGroupIdParam = url.searchParams.get("keywordGroupId"); // ADD THIS

// ...

const match: Record<string, unknown> = { isActive: true };

if (clienteIdParam) {
  match.clienteId = new ObjectId(clienteIdParam);
}

if (contrattoIdParam) {
  match.contrattoId = new ObjectId(contrattoIdParam);
}

// ADD THIS: when the desktop app selects a specific group, return only that group
if (keywordGroupIdParam) {
  match._id = new ObjectId(keywordGroupIdParam);
}

const groups = await groupsCollection.find(match);
// ...
```

With this change, when you select a group in the desktop app it will send e.g. `?clienteId=...&contrattoId=...&keywordGroupId=69b7e55669558cfe04e86dbc`, and the API will return only that one group, so the scan runs for the correct keywords and domain.
