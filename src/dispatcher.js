import { cloneJson } from './json.js';

export function createMockDispatcher(tools) {
  return {
    dispatch(call) {
      const def = tools[call.tool];
      if (!def) throw new Error(`mock tool "${call.tool}" is not declared`);
      const record = {
        tool: call.tool,
        arguments: cloneJson(call.arguments === undefined ? {} : call.arguments),
      };
      if (Object.hasOwn(def, 'throws')) {
        record.error = {
          message: def.throws.message,
          ...(def.throws.code === undefined ? {} : { code: def.throws.code }),
        };
      } else {
        record.result = cloneJson(def.result);
      }
      return record;
    },
  };
}
