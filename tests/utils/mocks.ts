export function createMockResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const loweredHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => loweredHeaders[name.toLowerCase()] || null,
    },
    json: jest.fn().mockResolvedValue(data),
    text: jest
      .fn()
      .mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data, null, 2)),
  } as unknown as Response;
}
