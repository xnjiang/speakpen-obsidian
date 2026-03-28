// Stub for obsidian module — replaced by vi.mock() in tests
export const requestUrl = async (..._args: any[]) => {
  throw new Error("requestUrl not mocked");
};
